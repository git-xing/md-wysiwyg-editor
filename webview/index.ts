import './style.css';
import { createEditor, getEditorView, registerSelectionChangeHandler, setLogTableSel } from './editor';
import { notifyReady, notifyUpdate, onMessage, notifySendToClaudeChat, notifySwitchToTextEditor } from './messaging';
import { setupLinkPopup } from './linkPopup';
import { setupTableAddButtons, setDebugMode } from './tableAddButtons';
import { setupTableHandles } from './tableHandles';
import { initToolbar } from './toolbar';
import { initToc } from './toc';
import { setupSelectionToolbar } from './selectionToolbar';
import { setupTableToolbar } from './tableToolbar';
import type { Editor } from '@milkdown/core';

let currentEditor: Editor | null = null;
let currentLineMap: number[] = [];
export function getLineMap(): number[] { return currentLineMap; }

// 存储原始 markdown 内容（来自 init/revert 消息，未经 Milkdown 序列化）
let markdownSource = '';
export function getMarkdownSource(): string { return markdownSource; }

// 初始化目录面板
const toc = initToc(() => getEditorView());
document.body.appendChild(toc.panel);

async function initEditor(container: HTMLElement, markdown: string): Promise<void> {
  // 销毁旧编辑器（revert 时使用）
  if (currentEditor) {
    currentEditor.destroy();
    currentEditor = null;
    container.innerHTML = '';
  }

  currentEditor = await createEditor(container, markdown, (updated) => {
    notifyUpdate(updated);
    toc.refresh(); // 内容变化时刷新目录（面板关闭时是 no-op）
  });
  toc.refresh(); // 编辑器初始化完成后刷新一次
}

// 工具栏（传入 TOC 切换回调）
const topbar = document.querySelector<HTMLElement>('.editor-topbar');
const topbarTb = topbar ? initToolbar(topbar, () => currentEditor, () => toc.toggle()) : null;

// 链接 Hover 弹框 + 表格行列添加按钮（在 #editor 容器上监听）
const editorContainer = document.getElementById('editor');
if (editorContainer) {
  setupLinkPopup(editorContainer, () => getEditorView());
  setupTableAddButtons(editorContainer, () => getEditorView());
  setupTableHandles(editorContainer, () => getEditorView());
}

// 选中文字浮动工具栏 + 表格工具栏（共享同一个 selectionChange 事件）
const selTb   = setupSelectionToolbar(() => getEditorView(), () => currentEditor, getLineMap, getMarkdownSource);
const tableTb = setupTableToolbar(() => getEditorView());
registerSelectionChangeHandler((view) => {
  selTb.onSelectionChange(view);
  tableTb.onSelectionChange(view);
  topbarTb?.onSelectionChange(view);
});

// Checkbox toggle：点击任务列表项左侧的伪元素复选框区域
document.addEventListener('click', (e) => {
  const target = e.target as Element;
  const taskItem = target.closest('li[data-item-type="task"]') as HTMLElement | null;
  if (!taskItem) { return; }

  // 只响应点击最左边 24px（checkbox 伪元素区域）
  const rect = taskItem.getBoundingClientRect();
  if ((e as MouseEvent).clientX - rect.left > 24) { return; }

  const view = getEditorView();
  if (!view) { return; }

  // 用 posAtDOM 从 DOM 节点直接反查 ProseMirror 位置（比 posAtCoords 精确）
  let domPos: number;
  try {
    domPos = view.posAtDOM(taskItem, 0);
  } catch {
    return;
  }

  const { state } = view;
  const $pos = state.doc.resolve(Math.min(domPos, state.doc.content.size));

  // 沿 $pos 的祖先链找到 task_list_item 节点
  for (let d = $pos.depth; d >= 0; d--) {
    const node = $pos.node(d);
    if (node.type.name === 'task_list_item' || node.type.name === 'list_item') {
      const nodePos = $pos.before(d);
      const checked = node.attrs.checked as boolean;
      view.dispatch(
        state.tr.setNodeMarkup(nodePos, null, { ...node.attrs, checked: !checked }),
      );
      return;
    }
  }
}, true);

// Cmd/Ctrl+Shift+M：切换到文本编辑器（WebView 捕获键盘事件，需在此转发给 Extension）
window.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === 'KeyM') {
    e.preventDefault();
    notifySwitchToTextEditor();
  }
});

// Option+K 快捷键：把光标所在顶层块发送给 Claude
// 有文字选区时发送选中文字 + 精确行号；无选区时发送整个顶层块
window.addEventListener('keydown', (e) => {
  if (e.altKey && e.code === 'KeyK') {
    e.preventDefault();
    const view = getEditorView();
    if (!view) { return; }
    const { selection } = view.state;
    const $from = view.state.doc.resolve(selection.from);
    const topBlockIdx    = $from.index(0);
    const topBlock       = view.state.doc.child(topBlockIdx);
    const map            = currentLineMap;
    const textBefore     = view.state.doc.textBetween(0, $from.before(1), '\n');
    const fallbackStart  = (textBefore.match(/\n/g) ?? []).length + 1;
    const blockStartLine = map[topBlockIdx] ?? fallbackStart;

    if (!selection.empty) {
      // 有文字选区：发送选中文字 + 精确行号
      const text = view.state.doc.textBetween(selection.from, selection.to, '\n');
      if (!text.trim()) { return; }
      const isFenced = topBlock.type.name === 'code_block';
      const blockContentStart = $from.before(1) + 1;
      const textBeforeInBlock = view.state.doc.textBetween(blockContentStart, selection.from, '\n');
      const linesIntoBlock = (textBeforeInBlock.match(/\n/g) ?? []).length;
      const startLine = blockStartLine + (isFenced ? 1 : 0) + linesIntoBlock;
      const endLine   = startLine + (text.match(/\n/g) ?? []).length;
      notifySendToClaudeChat(text, startLine, endLine);
    } else {
      // 无选区：发送整个顶层块（原有行为）
      const text = topBlock.textContent;
      if (!text.trim()) { return; }
      const endLine = blockStartLine + text.split('\n').length - 1;
      notifySendToClaudeChat(text, blockStartLine, endLine);
    }
  }
});

// WebView 加载完成，通知 Extension 侧发送初始内容
notifyReady();

// 监听来自 Extension 侧的消息
onMessage(async (msg) => {
  const container = document.getElementById('editor');
  if (!container) { return; }

  if (msg.type === 'init' || msg.type === 'revert') {
    markdownSource = msg.content;   // 保存原始内容，供行号搜索使用
    currentLineMap = msg.lineMap ?? [];
    await initEditor(container, msg.content);
  } else if (msg.type === 'lineMapUpdate') {
    currentLineMap = msg.lineMap;
  } else if (msg.type === 'setDebugMode') {
    setDebugMode(msg.enabled);
    setLogTableSel(msg.enabled);
  }
});
