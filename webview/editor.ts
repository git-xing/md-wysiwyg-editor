import { commandsCtx, defaultValueCtx, Editor, editorViewCtx, nodeViewCtx, rootCtx, schemaCtx } from '@milkdown/core';
import {
  toggleStrongCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
} from '@milkdown/preset-commonmark';
import { toggleStrikethroughCommand } from '@milkdown/preset-gfm';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import { prism, prismConfig } from '@milkdown/plugin-prism';
import { commonmark } from '@milkdown/preset-commonmark';
import { gfm } from '@milkdown/preset-gfm';
import type { EditorView } from '@milkdown/prose/view';
import { history, undo, redo } from '@milkdown/prose/history';
import { keymap } from '@milkdown/prose/keymap';
import { Plugin, NodeSelection, TextSelection } from '@milkdown/prose/state';
import { CellSelection } from '@milkdown/prose/tables';
import { liftListItem } from '@milkdown/prose/schema-list';
import { $prose } from '@milkdown/utils';

// 注册 ProseMirror history 插件（支持 undo/redo）
const historyPlugin = $prose(() => history());
// 注册快捷键：Mod-z = undo，Mod-Shift-z / Mod-y = redo
const historyKeymapPlugin = $prose(() => keymap({
  'Mod-z': undo,
  'Mod-y': redo,
  'Mod-Shift-z': redo,
}));

// 列表 Backspace：光标在行首时，层级 ≥2 → 上升一级；层级 1 → 同样上升（变为普通段落）
const listLiftPlugin = $prose((ctx) => {
  const schema = ctx.get(schemaCtx);
  const listItemType = schema.nodes['list_item'];
  if (!listItemType) { return new Plugin({}); }
  const doLift = liftListItem(listItemType);
  return keymap({
    'Backspace': (state, dispatch) => {
      const { selection } = state;
      if (!selection.empty) { return false; }
      const { $from } = selection;
      // 仅当光标在段落行首时触发
      if ($from.parentOffset !== 0) { return false; }
      // 确认当前在 list_item 内
      let inList = false;
      for (let d = $from.depth; d >= 0; d--) {
        if ($from.node(d).type === listItemType) { inList = true; break; }
      }
      if (!inList) { return false; }
      return doLift(state, dispatch);
    },
  });
});

// 代码块 Backspace：光标在代码块后的段落行首时，选中代码块而非进入其内部
const codeBlockBackspacePlugin = $prose(() => keymap({
  'Backspace': (state, dispatch) => {
    const { selection } = state;
    if (!selection.empty || selection.$from.parentOffset !== 0) { return false; }
    const $from = selection.$from;
    const startOfBlock = $from.before($from.depth);
    if (startOfBlock === 0) { return false; }
    const nodeBefore = state.doc.resolve(startOfBlock).nodeBefore;
    if (!nodeBefore || nodeBefore.type.name !== 'code_block') { return false; }
    if (dispatch) {
      dispatch(state.tr.setSelection(
        NodeSelection.create(state.doc, startOfBlock - nodeBefore.nodeSize),
      ));
    }
    return true;
  },
}));

// 格式化快捷键：Mod-b 粗体、Mod-i 斜体、Mod-Shift-s 删除线、Mod-e 行内代码
// return true 使 ProseMirror 调用 preventDefault，阻止 VSCode 快捷键（如 Cmd+B 侧栏切换）冒泡
const formatKeymapPlugin = $prose((ctx) => keymap({
  'Mod-b': () => { ctx.get(commandsCtx).call(toggleStrongCommand.key); return true; },
  'Mod-i': () => { ctx.get(commandsCtx).call(toggleEmphasisCommand.key); return true; },
  'Mod-Shift-x': () => { ctx.get(commandsCtx).call(toggleStrikethroughCommand.key); return true; },
  'Mod-e': () => { ctx.get(commandsCtx).call(toggleInlineCodeCommand.key); return true; },
}));

// 选区变更回调（由 index.ts 注入，用于驱动浮动工具栏）
let _onSelectionChange: ((view: EditorView) => void) | null = null;

export function registerSelectionChangeHandler(cb: (view: EditorView) => void): void {
  _onSelectionChange = cb;
}

// 单击表格单元格：将单格 CellSelection 转为 TextSelection，光标定位到点击位置
// 用 appendTransaction 确保修正在首次渲染前同步完成（无绿色闪烁）
// 格内文字拖拽：从点击位到当前鼠标位构造 TextSelection，恢复正常选区
const cellClickFixPlugin = $prose(() => {
  let pendingClickPos: number | null = null;
  let clickIsPlain = true;    // mousedown 后未移动 > 4px 时为 true
  let lastMouseX = 0;
  let lastMouseY = 0;
  let capturedView: EditorView | null = null;

  return new Plugin({
    view(editorView) {
      capturedView = editorView;
      return { destroy() { capturedView = null; } };
    },
    props: {
      handleDOMEvents: {
        mousedown: (view, event) => {
          if (event.button !== 0 || event.detail !== 1 ||
              event.shiftKey || event.ctrlKey || event.metaKey) {
            pendingClickPos = null;
            return false;
          }
          const cell = (event.target as Element).closest('td, th');
          if (!cell) { pendingClickPos = null; return false; }
          const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });
          pendingClickPos = pos ? pos.pos : null;
          clickIsPlain = true;
          lastMouseX = event.clientX;
          lastMouseY = event.clientY;

          // capture-phase mousemove：在 ProseMirror 处理之前更新鼠标位置
          const onMove = (mv: MouseEvent) => {
            lastMouseX = mv.clientX;
            lastMouseY = mv.clientY;
            const dx = mv.clientX - event.clientX;
            const dy = mv.clientY - event.clientY;
            if (Math.sqrt(dx * dx + dy * dy) > 4) { clickIsPlain = false; }
          };
          document.addEventListener('mousemove', onMove, true);

          const cleanup = () => {
            document.removeEventListener('mouseup', cleanup, true);
            document.removeEventListener('mousemove', onMove, true);
            Promise.resolve().then(() => { pendingClickPos = null; clickIsPlain = true; });
          };
          document.addEventListener('mouseup', cleanup, true);
          return false;
        },
      },
    },
    appendTransaction(_trs, _oldState, newState) {
      if (pendingClickPos === null) return null;
      const sel = newState.selection;
      if (!(sel instanceof CellSelection) || sel.isRowSelection() || sel.isColSelection()) {
        return null;
      }
      // 多格跨格拖拽（anchor ≠ head）：保留 CellSelection
      if (sel.$anchorCell.pos !== sel.$headCell.pos) { return null; }
      try {
        if (!clickIsPlain && capturedView) {
          // 格内拖拽：TextSelection 从原点击位到当前鼠标位
          const toCoords = capturedView.posAtCoords({ left: lastMouseX, top: lastMouseY });
          if (toCoords) {
            const anchor = Math.min(pendingClickPos, newState.doc.content.size);
            const head   = Math.min(toCoords.pos,    newState.doc.content.size);
            return newState.tr.setSelection(TextSelection.create(newState.doc, anchor, head));
          }
        }
        // 单击：TextSelection 定位到点击位
        const $pos = newState.doc.resolve(Math.min(pendingClickPos, newState.doc.content.size));
        return newState.tr.setSelection(TextSelection.near($pos));
      } catch { return null; }
    },
  });
});

const selectionPlugin = $prose(() => new Plugin({
  view: () => ({
    update(view, prevState) {
      if (_onSelectionChange && !view.state.selection.eq(prevState.selection)) {
        _onSelectionChange(view);
      }
    },
  }),
}));

// refractor exports map: "./*" → "./lang/*.js"，所以导入路径不带 "lang/"
import { refractor } from 'refractor/core';
import bash from 'refractor/bash';
import c from 'refractor/c';
import cpp from 'refractor/cpp';
import csharp from 'refractor/csharp';
import css from 'refractor/css';
import go from 'refractor/go';
import markup from 'refractor/markup'; // html
import java from 'refractor/java';
import javascript from 'refractor/javascript';
import json from 'refractor/json';
import markdown from 'refractor/markdown';
import php from 'refractor/php';
import python from 'refractor/python';
import ruby from 'refractor/ruby';
import rust from 'refractor/rust';
import sql from 'refractor/sql';
import swift from 'refractor/swift';
import typescript from 'refractor/typescript';
import yaml from 'refractor/yaml';

[bash, c, cpp, csharp, css, go, markup, java, javascript, json,
  markdown, php, python, ruby, rust, sql, swift, typescript, yaml,
].forEach((lang) => refractor.register(lang));

import { createCodeBlockView } from './codeBlockView';

let _editor: Editor | null = null;

export function getEditorView(): EditorView | null {
  if (!_editor) { return null; }
  return _editor.action((ctx) => ctx.get(editorViewCtx));
}

export async function createEditor(
  container: HTMLElement,
  initialMarkdown: string,
  onUpdate: (markdown: string) => void,
): Promise<Editor> {
  let debounceTimer: ReturnType<typeof setTimeout>;
  const debouncedUpdate = (md: string) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => onUpdate(md), 300);
  };

  _editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, container);
      ctx.set(defaultValueCtx, initialMarkdown);
      ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
        debouncedUpdate(markdown);
      });
      // 配置 prism：使用我们已注册语言的 refractor 实例
      ctx.set(prismConfig.key, {
        configureRefractor: () => refractor,
      });
      // 注册 code_block NodeView（顶部语言选择 + 复制按钮）
      ctx.set(nodeViewCtx, [
        ['code_block', createCodeBlockView],
      ]);
    })
    .use(commonmark)
    .use(gfm)
    .use(listener)
    .use(prism)
    .use(historyPlugin)
    .use(historyKeymapPlugin)
    .use(listLiftPlugin)
    .use(codeBlockBackspacePlugin)
    .use(selectionPlugin)
    .use(formatKeymapPlugin)
    .use(cellClickFixPlugin)
    .create();

  return _editor;
}
