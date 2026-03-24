import { commandsCtx, editorViewCtx } from '@milkdown/core';
import {
  createCodeBlockCommand,
  insertHrCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleStrongCommand,
  turnIntoTextCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInHeadingCommand,
  wrapInOrderedListCommand,
} from '@milkdown/preset-commonmark';
import { insertTableCommand, toggleStrikethroughCommand } from '@milkdown/preset-gfm';
import { undo, redo } from '@milkdown/prose/history';
import { lift } from '@milkdown/prose/commands';
import type { Editor } from '@milkdown/core';
import type { EditorView } from '@milkdown/prose/view';
import {
  IconBold, IconItalic, IconStrikethrough, IconCode,
  IconLink, IconImage, IconTable, IconQuote, IconTerminal, IconMinus,
  IconList, IconListOrdered, IconCheckSquare,
  IconUndo, IconRedo, IconCheck, IconX, IconToc,
  IconHeading, IconChevronDown, IconEraser,
} from './icons';
import { applyTooltip } from './tooltip';
import { t, kbd } from './i18n';

type GetEditor = () => Editor | null;

function sep(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'tb-sep';
  return el;
}

function btn(
  icon: string,
  title: string,
  onClick: () => void,
  extraClass = '',
): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = `tb-btn${extraClass ? ' ' + extraClass : ''}`;
  b.innerHTML = icon;
  applyTooltip(b, title);
  b.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation(); // 防止 ProseMirror 检测到编辑器外 mousedown 导致选区丢失
    onClick();
  });
  return b;
}

// 调用 Milkdown 命令：传 command.key（CmdKey），而非 command 本身
function callCmd<T>(getEditor: GetEditor, command: { key: unknown }, payload?: T): void {
  const editor = getEditor();
  if (!editor) { return; }
  editor.action((ctx) => {
    const mgr = ctx.get(commandsCtx);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mgr.call(command.key as any, payload as any);
  });
}

// 检查光标是否在指定节点类型内
function isInNode(view: EditorView, typeName: string): boolean {
  const { $from } = view.state.selection;
  for (let depth = $from.depth; depth >= 0; depth--) {
    if ($from.node(depth).type.name === typeName) { return true; }
  }
  return false;
}

// 自定义内联链接输入框（文本 + URL 两个输入框）
function showInlineLinkPrompt(
  near: HTMLElement,
  defaultText: string,
  defaultHref: string,
  onConfirm: (text: string, href: string) => void,
): void {
  const overlay = document.createElement('div');
  overlay.className = 'tb-prompt-overlay';
  overlay.addEventListener('mousedown', (e) => e.stopPropagation());

  const textInput = document.createElement('input');
  textInput.type = 'text';
  textInput.className = 'tb-prompt-input tb-prompt-input--short';
  textInput.placeholder = t('Link text');
  textInput.value = defaultText;

  const urlInput = document.createElement('input');
  urlInput.type = 'text';
  urlInput.className = 'tb-prompt-input';
  urlInput.placeholder = 'https://...';
  urlInput.value = defaultHref;

  const okBtn = document.createElement('button');
  okBtn.className = 'tb-prompt-ok';
  okBtn.innerHTML = IconCheck;
  okBtn.title = t('Confirm');

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'tb-prompt-cancel';
  cancelBtn.innerHTML = IconX;
  cancelBtn.title = t('Cancel');

  overlay.appendChild(textInput);
  overlay.appendChild(urlInput);
  overlay.appendChild(okBtn);
  overlay.appendChild(cancelBtn);
  document.body.appendChild(overlay);

  // 定位到按钮下方
  const rect = near.getBoundingClientRect();
  overlay.style.top = `${rect.bottom + 4}px`;
  overlay.style.left = `${rect.left}px`;

  // 有预填文字则聚焦 URL，否则聚焦文字框
  if (defaultText) {
    urlInput.focus();
    urlInput.select();
  } else {
    textInput.focus();
  }

  function confirm(): void {
    const text = textInput.value.trim();
    const href = urlInput.value.trim();
    cleanup();
    onConfirm(text, href);
  }

  function cleanup(): void {
    if (document.body.contains(overlay)) { document.body.removeChild(overlay); }
    document.removeEventListener('mousedown', outsideClick);
  }

  function outsideClick(e: MouseEvent): void {
    const active = document.activeElement;
    if (!overlay.contains(e.target as Node) && active !== textInput && active !== urlInput) {
      cleanup();
    }
  }

  okBtn.addEventListener('mousedown', (e) => { e.preventDefault(); confirm(); });
  cancelBtn.addEventListener('mousedown', (e) => { e.preventDefault(); cleanup(); });
  [textInput, urlInput].forEach((inp) => {
    inp.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); confirm(); }
      if (e.key === 'Escape') { e.preventDefault(); cleanup(); }
    });
  });

  setTimeout(() => { document.addEventListener('mousedown', outsideClick); }, 0);
}

// 图片插入：只需 alt + src 两个输入框
function showImagePrompt(
  near: HTMLElement,
  onConfirm: (alt: string, src: string) => void,
): void {
  const overlay = document.createElement('div');
  overlay.className = 'tb-prompt-overlay';
  overlay.addEventListener('mousedown', (e) => e.stopPropagation());

  const altInput = document.createElement('input');
  altInput.type = 'text';
  altInput.className = 'tb-prompt-input tb-prompt-input--short';
  altInput.placeholder = t('Alt text (alt)');

  const srcInput = document.createElement('input');
  srcInput.type = 'text';
  srcInput.className = 'tb-prompt-input';
  srcInput.placeholder = t('Image URL https://...');

  const okBtn = document.createElement('button');
  okBtn.className = 'tb-prompt-ok';
  okBtn.innerHTML = IconCheck;
  okBtn.title = t('Confirm');

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'tb-prompt-cancel';
  cancelBtn.innerHTML = IconX;
  cancelBtn.title = t('Cancel');

  overlay.appendChild(altInput);
  overlay.appendChild(srcInput);
  overlay.appendChild(okBtn);
  overlay.appendChild(cancelBtn);
  document.body.appendChild(overlay);

  const rect = near.getBoundingClientRect();
  overlay.style.top = `${rect.bottom + 4}px`;
  overlay.style.left = `${rect.left}px`;
  srcInput.focus();

  function confirm(): void {
    const alt = altInput.value.trim();
    const src = srcInput.value.trim();
    cleanup();
    if (src) { onConfirm(alt, src); }
  }

  function cleanup(): void {
    if (document.body.contains(overlay)) { document.body.removeChild(overlay); }
    document.removeEventListener('mousedown', outsideClick);
  }

  function outsideClick(e: MouseEvent): void {
    if (!overlay.contains(e.target as Node)) { cleanup(); }
  }

  okBtn.addEventListener('mousedown', (e) => { e.preventDefault(); confirm(); });
  cancelBtn.addEventListener('mousedown', (e) => { e.preventDefault(); cleanup(); });
  [altInput, srcInput].forEach((inp) => {
    inp.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); confirm(); }
      if (e.key === 'Escape') { e.preventDefault(); cleanup(); }
    });
  });

  setTimeout(() => { document.addEventListener('mousedown', outsideClick); }, 0);
}

export function initToolbar(
  topbar: HTMLElement,
  getEditor: GetEditor,
  onTocToggle?: () => void,
): { onSelectionChange: (view: EditorView) => void } {
  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';

  // ── 目录导航（可选，位于工具栏最左侧）─────────────
  if (onTocToggle) {
    toolbar.appendChild(btn(IconToc, t('Table of Contents'), onTocToggle));
    toolbar.appendChild(sep());
  }

  // ── 撤销 / 重做（直接调 ProseMirror history）────────
  toolbar.appendChild(
    btn(IconUndo, t('Undo') + ' ' + kbd('Mod-z'), () => {
      const editor = getEditor();
      if (!editor) { return; }
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        undo(view.state, view.dispatch);
      });
    }),
  );
  toolbar.appendChild(
    btn(IconRedo, t('Redo') + ' ' + kbd('Mod-Shift-z'), () => {
      const editor = getEditor();
      if (!editor) { return; }
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        redo(view.state, view.dispatch);
      });
    }),
  );

  toolbar.appendChild(sep());

  // ── 块类型下拉（hover 展开，与浮动工具栏风格一致）──
  const fmtWrap = document.createElement('div');
  fmtWrap.className = 'tb-fmt-wrap';

  const fmtBtn = document.createElement('button');
  fmtBtn.className = 'tb-btn tb-fmt-btn';
  fmtBtn.innerHTML = IconHeading + IconChevronDown;
  fmtBtn.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });

  const fmtMenu = document.createElement('div');
  fmtMenu.className = 'tb-fmt-menu';
  fmtMenu.style.display = 'none';

  const formats: [string, () => void][] = [
    ['P',  () => callCmd(getEditor, turnIntoTextCommand)],
    ['H1', () => callCmd(getEditor, wrapInHeadingCommand, 1)],
    ['H2', () => callCmd(getEditor, wrapInHeadingCommand, 2)],
    ['H3', () => callCmd(getEditor, wrapInHeadingCommand, 3)],
    ['H4', () => callCmd(getEditor, wrapInHeadingCommand, 4)],
    ['H5', () => callCmd(getEditor, wrapInHeadingCommand, 5)],
    ['H6', () => callCmd(getEditor, wrapInHeadingCommand, 6)],
  ];

  const fmtItems: HTMLElement[] = [];
  formats.forEach(([label, action]) => {
    const item = document.createElement('div');
    item.className = 'tb-fmt-item';
    item.textContent = label;
    item.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      action();
      fmtMenu.style.display = 'none';
    });
    fmtMenu.appendChild(item);
    fmtItems.push(item);
  });

  let fmtHideTimer: ReturnType<typeof setTimeout> | null = null;

  function positionFmtMenu(): void {
    const rect = fmtBtn.getBoundingClientRect();
    const approxMenuH = formats.length * 30;
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow < approxMenuH + 8) {
      fmtMenu.style.top = 'auto';
      fmtMenu.style.bottom = 'calc(100% + 6px)';
    } else {
      fmtMenu.style.bottom = 'auto';
      fmtMenu.style.top = 'calc(100% + 6px)';
    }
  }

  fmtWrap.addEventListener('mouseenter', () => {
    if (fmtHideTimer) { clearTimeout(fmtHideTimer); fmtHideTimer = null; }
    positionFmtMenu();
    fmtMenu.style.display = 'flex';
  });
  fmtWrap.addEventListener('mouseleave', () => {
    fmtHideTimer = setTimeout(() => { fmtMenu.style.display = 'none'; }, 100);
  });
  fmtMenu.addEventListener('mouseenter', () => {
    if (fmtHideTimer) { clearTimeout(fmtHideTimer); fmtHideTimer = null; }
  });

  fmtWrap.appendChild(fmtBtn);
  fmtWrap.appendChild(fmtMenu);
  toolbar.appendChild(fmtWrap);

  toolbar.appendChild(sep());

  // ── 内联格式 ──────────────────────────────────────
  toolbar.appendChild(btn(IconBold, t('Bold') + ' ' + kbd('Mod-b'), () => callCmd(getEditor, toggleStrongCommand)));
  toolbar.appendChild(btn(IconItalic, t('Italic') + ' ' + kbd('Mod-i'), () => callCmd(getEditor, toggleEmphasisCommand)));
  toolbar.appendChild(btn(IconStrikethrough, t('Strikethrough') + ' ' + kbd('Mod-Shift-x'), () => callCmd(getEditor, toggleStrikethroughCommand)));
  toolbar.appendChild(btn(IconCode, t('Inline Code') + ' ' + kbd('Mod-e'), () => callCmd(getEditor, toggleInlineCodeCommand)));
  toolbar.appendChild(btn(IconEraser, t('Clear Formatting'), () => {
    const editor = getEditor();
    if (!editor) { return; }
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const { state } = view;
      const { from, to, empty } = state.selection;
      if (empty) { return; }
      let tr = state.tr;
      Object.values(state.schema.marks).forEach((markType) => {
        tr = tr.removeMark(from, to, markType);
      });
      view.dispatch(tr);
      view.focus();
    });
  }));

  toolbar.appendChild(sep());

  // ── 插入 ──────────────────────────────────────────
  // 链接：先捕获当前选区文字和已有链接，再通过双输入框获取文本和 URL
  let linkBtnEl: HTMLButtonElement;
  linkBtnEl = btn(IconLink, t('Insert/Edit Link'), () => {
    const editor = getEditor();
    if (!editor) { return; }

    let capturedFrom = 0;
    let capturedTo = 0;
    let existingHref = '';
    let selectedText = '';

    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const { state } = view;
      const linkType = state.schema.marks['link'];
      if (!linkType) { return; }
      capturedFrom = state.selection.from;
      capturedTo = state.selection.to;
      if (capturedFrom !== capturedTo) {
        selectedText = state.doc.textBetween(capturedFrom, capturedTo);
      }
      state.doc.nodesBetween(capturedFrom, capturedTo, (node) => {
        const mark = linkType.isInSet(node.marks);
        if (mark) { existingHref = (mark.attrs as Record<string, string>)['href'] ?? ''; }
      });
    });

    showInlineLinkPrompt(linkBtnEl, selectedText, existingHref, (text, href) => {
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const { state } = view;
        const lType = state.schema.marks['link'];
        if (!lType) { return; }
        let tr = state.tr;
        if (capturedFrom === capturedTo) {
          // 无选区：插入新文字并加链接
          const insertText = text || href;
          if (!insertText) { return; }
          tr = tr.insertText(insertText, capturedFrom);
          if (href) {
            tr = tr.addMark(capturedFrom, capturedFrom + insertText.length, lType.create({ href, title: null }));
          }
        } else {
          // 有选区：替换文字并更新链接
          const newText = text || selectedText;
          tr = tr.removeMark(capturedFrom, capturedTo, lType);
          tr = tr.insertText(newText, capturedFrom, capturedTo);
          if (href && newText) {
            tr = tr.addMark(capturedFrom, capturedFrom + newText.length, lType.create({ href, title: null }));
          }
        }
        view.dispatch(tr);
        view.focus();
      });
    });
  });
  toolbar.appendChild(linkBtnEl);

  // 图片：弹出 alt + src 输入框后插入 image 节点
  let imgBtnEl: HTMLButtonElement;
  imgBtnEl = btn(IconImage, t('Insert Image'), () => {
    showImagePrompt(imgBtnEl, (alt, src) => {
      const editor = getEditor();
      if (!editor) { return; }
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const { state } = view;
        const imageType = state.schema.nodes['image'];
        if (!imageType) { return; }
        const node = imageType.create({ src, alt, title: '' });
        view.dispatch(state.tr.replaceSelectionWith(node));
        view.focus();
      });
    });
  });
  toolbar.appendChild(imgBtnEl);

  toolbar.appendChild(btn(IconTable, t('Insert Table'), () => callCmd(getEditor, insertTableCommand, { row: 3, col: 3 })));

  toolbar.appendChild(sep());

  // ── 列表（支持切换：再次点击取消） ──────────────────
  toolbar.appendChild(btn(IconList, t('Bullet List'), () => {
    const editor = getEditor();
    if (!editor) { return; }
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      if (isInNode(view, 'bullet_list')) {
        // 已在无序列表中：lift 取消
        lift(view.state, view.dispatch);
      } else {
        ctx.get(commandsCtx).call(wrapInBulletListCommand.key as any);
      }
    });
  }));

  toolbar.appendChild(btn(IconListOrdered, t('Ordered List'), () => {
    const editor = getEditor();
    if (!editor) { return; }
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      if (isInNode(view, 'ordered_list')) {
        lift(view.state, view.dispatch);
      } else {
        ctx.get(commandsCtx).call(wrapInOrderedListCommand.key as any);
      }
    });
  }));

  // 任务列表：检测是否已是任务项，若是则 lift 取消
  toolbar.appendChild(btn(IconCheckSquare, t('Task List'), () => {
    const editor = getEditor();
    if (!editor) { return; }
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const { state } = view;

      // 检查是否已在 bullet_list 且有 checked 属性（任务列表）
      const { $from } = state.selection;
      let isTaskList = false;
      for (let depth = $from.depth; depth >= 0; depth--) {
        const node = $from.node(depth);
        if (node.type.name === 'list_item' && node.attrs['checked'] != null) {
          isTaskList = true;
          break;
        }
      }

      if (isTaskList) {
        lift(state, view.dispatch);
      } else {
        // 先包裹为 bullet_list，再将 list_item 设为任务项
        const mgr = ctx.get(commandsCtx);
        mgr.call(wrapInBulletListCommand.key as any);

        const { state: newState, dispatch } = view;
        const { from, to } = newState.selection;
        let tr = newState.tr;
        let changed = false;
        newState.doc.nodesBetween(from, to, (node, pos) => {
          if (node.type.name === 'list_item' && node.attrs['checked'] == null) {
            tr = tr.setNodeMarkup(pos, null, { ...node.attrs, checked: false });
            changed = true;
          }
        });
        if (changed) { dispatch(tr); }
      }
    });
  }));

  toolbar.appendChild(sep());

  // ── 块（支持切换） ──────────────────────────────────
  toolbar.appendChild(btn(IconQuote, t('Blockquote'), () => {
    const editor = getEditor();
    if (!editor) { return; }
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      if (isInNode(view, 'blockquote')) {
        lift(view.state, view.dispatch);
      } else {
        ctx.get(commandsCtx).call(wrapInBlockquoteCommand.key as any);
      }
    });
  }));
  toolbar.appendChild(btn(IconTerminal, t('Code Block'), () => callCmd(getEditor, createCodeBlockCommand)));
  toolbar.appendChild(btn(IconMinus, t('Horizontal Rule'), () => callCmd(getEditor, insertHrCommand)));

  topbar.appendChild(toolbar);

  return {
    onSelectionChange(view: EditorView): void {
      const { $from } = view.state.selection;
      let activeLevel = 0; // 0 = paragraph
      for (let d = $from.depth; d >= 0; d--) {
        const n = $from.node(d);
        if (n.type.name === 'heading') { activeLevel = n.attrs['level'] as number; break; }
        if (n.type.name === 'code_block') { activeLevel = -1; break; }
      }
      fmtItems.forEach((item, i) => {
        // i=0 → P (activeLevel===0), i=1..6 → H1..H6 (activeLevel===i)
        item.classList.toggle('tb-fmt-item--active', i === 0 ? activeLevel === 0 : i === activeLevel);
      });
    },
  };
}
