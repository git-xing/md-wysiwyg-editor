import type { EditorView } from '@milkdown/prose/view';
import { notifyOpenUrl } from './messaging';
import { IconCheck, IconX } from './icons';
import { t } from './i18n';

// ── 图片节点信息 ────────────────────────────────────────
interface ImageInfo {
  src: string;
  alt: string;
  pos: number;
}

function findImageAt(view: EditorView, imgEl: Element): ImageInfo | null {
  let pos: number;
  try {
    pos = view.posAtDOM(imgEl, 0);
  } catch {
    return null;
  }
  const { state } = view;
  const node = state.doc.nodeAt(pos);
  if (!node || node.type.name !== 'image') { return null; }
  return {
    src: (node.attrs['src'] as string) ?? '',
    alt: (node.attrs['alt'] as string) ?? '',
    pos,
  };
}

interface LinkInfo {
  href: string;
  text: string;
  from: number;
  to: number;
}

function findLinkAt(view: EditorView, anchor: Element): LinkInfo | null {
  const href = anchor.getAttribute('href') ?? '';
  const text = anchor.textContent ?? '';

  // 通过 DOM 节点反查 ProseMirror 位置
  let domPos: number;
  try {
    domPos = view.posAtDOM(anchor, 0);
  } catch {
    return null;
  }

  const { state } = view;
  const docSize = state.doc.content.size;
  const pos = Math.min(domPos, docSize - 1);
  const linkType = state.schema.marks['link'];
  if (!linkType) { return null; }

  // 向前/向后扩展找整个 link mark 范围
  let from = pos;
  let to = pos;
  const nodeAt = state.doc.nodeAt(pos);
  if (nodeAt && linkType.isInSet(nodeAt.marks)) {
    while (from > 0 && (() => { const n = state.doc.nodeAt(from - 1); return n && linkType.isInSet(n.marks); })()) { from--; }
    while (to < docSize && (() => { const n = state.doc.nodeAt(to); return n && linkType.isInSet(n.marks); })()) { to++; }
  }

  if (from === to) {
    // 退回：用段落范围
    const $p = state.doc.resolve(pos);
    from = $p.start();
    to = $p.end();
  }

  return { href, text, from, to };
}

export function setupLinkPopup(
  container: HTMLElement,
  getView: () => EditorView | null,
): void {
  const popup = document.createElement('div');
  popup.className = 'link-popup';
  popup.style.display = 'none';
  document.body.appendChild(popup);

  const inputText = document.createElement('input');
  inputText.type = 'text';
  inputText.className = 'link-popup-text';
  inputText.placeholder = t('Link text');

  const inputUrl = document.createElement('input');
  inputUrl.type = 'text';
  inputUrl.className = 'link-popup-url';
  inputUrl.placeholder = 'URL https://...';

  const btnConfirm = document.createElement('button');
  btnConfirm.className = 'link-popup-confirm';
  btnConfirm.title = t('Confirm');
  btnConfirm.innerHTML = IconCheck;

  const btnRemove = document.createElement('button');
  btnRemove.className = 'link-popup-remove';
  btnRemove.title = t('Remove Link');
  btnRemove.innerHTML = IconX;

  popup.appendChild(inputText);
  popup.appendChild(inputUrl);
  popup.appendChild(btnConfirm);
  popup.appendChild(btnRemove);

  let hoverTimer: ReturnType<typeof setTimeout> | null = null;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  let currentLink: LinkInfo | null = null;

  function clearHoverTimer(): void {
    if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
  }

  function clearHideTimer(): void {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  }

  function showPopup(link: LinkInfo, anchorEl: Element): void {
    clearHideTimer();
    currentLink = link;
    inputText.value = link.text;
    inputUrl.value = link.href;

    const rect = anchorEl.getBoundingClientRect();
    popup.style.display = 'flex';
    popup.style.left = `${rect.left + window.scrollX}px`;
    popup.style.top = `${rect.bottom + window.scrollY + 4}px`;
  }

  function hidePopup(): void {
    clearHideTimer();
    clearHoverTimer();
    popup.style.display = 'none';
    currentLink = null;
  }

  function scheduleHide(delay = 180): void {
    clearHideTimer();
    hideTimer = setTimeout(() => { hidePopup(); }, delay);
  }

  // 鼠标进入链接 → 500ms 后显示弹框
  container.addEventListener('mouseover', (e) => {
    const target = e.target as Element;
    const anchor = target.closest('a');
    if (!anchor) { return; }

    clearHoverTimer();
    clearHideTimer();  // 重新悬停时取消隐藏
    hoverTimer = setTimeout(() => {
      hoverTimer = null;
      const view = getView();
      if (!view) { return; }
      const link = findLinkAt(view, anchor);
      if (link) { showPopup(link, anchor); }
    }, 500);
  });

  // 鼠标离开链接但仍在容器内 → 取消 hover 计时
  container.addEventListener('mouseout', (e) => {
    const target = e.target as Element;
    if (!target.closest('a')) { return; }
    // 移出了链接元素，清除 hover 计时
    clearHoverTimer();
  });

  // 鼠标离开整个编辑器容器（mouseleave 不冒泡，只在真正离开容器时触发）
  container.addEventListener('mouseleave', () => {
    clearHoverTimer();
    // 给用户 180ms 移动到弹框，不立即隐藏
    scheduleHide(180);
  });

  // 鼠标进入弹框 → 取消隐藏计时
  popup.addEventListener('mouseenter', () => {
    clearHideTimer();
  });

  // 鼠标离开弹框 → 立即隐藏
  popup.addEventListener('mouseleave', () => {
    hidePopup();
  });

  // 点击事件：普通点击阻止跳转；Cmd/Ctrl+点击 → 外部浏览器打开
  container.addEventListener('click', (e) => {
    const target = e.target as Element;
    const anchor = target.closest('a');
    if (!anchor) { return; }
    e.preventDefault();

    if ((e as MouseEvent).metaKey || (e as MouseEvent).ctrlKey) {
      const href = anchor.getAttribute('href');
      if (href) { notifyOpenUrl(href); }
    }
  }, true);

  // 确认按钮：更新链接的 href（和可选的文本）
  btnConfirm.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const view = getView();
    if (!view || !currentLink) { hidePopup(); return; }

    const { state } = view;
    const linkType = state.schema.marks['link'];
    if (!linkType) { hidePopup(); return; }

    const newHref = inputUrl.value.trim();
    const newText = inputText.value;
    const { from, to } = currentLink;

    let tr = state.tr;

    if (newText && newText !== currentLink.text) {
      // 文本变了：先替换文本内容再加 mark
      tr = tr.replaceWith(from, to, state.schema.text(newText));
      if (newHref) {
        tr = tr.addMark(from, from + newText.length, linkType.create({ href: newHref, title: null }));
      }
    } else {
      // 只更新 href
      tr = tr.removeMark(from, to, linkType);
      if (newHref) {
        tr = tr.addMark(from, to, linkType.create({ href: newHref, title: null }));
      }
    }

    view.dispatch(tr);
    view.focus();
    hidePopup();
  });

  // 移除按钮：删除 link mark
  btnRemove.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const view = getView();
    if (!view || !currentLink) { hidePopup(); return; }

    const { state } = view;
    const linkType = state.schema.marks['link'];
    if (!linkType) { hidePopup(); return; }

    const { from, to } = currentLink;
    view.dispatch(state.tr.removeMark(from, to, linkType));
    view.focus();
    hidePopup();
  });

  // 阻止弹框内输入框事件冒泡到 ProseMirror
  [inputText, inputUrl].forEach((inp) => {
    inp.addEventListener('keydown', (e) => e.stopPropagation());
    inp.addEventListener('mousedown', (e) => e.stopPropagation());
  });

  // 点击弹框外部 → 关闭
  document.addEventListener('mousedown', (e) => {
    if (!popup.contains(e.target as Node) && !imgPopup.contains(e.target as Node)) {
      hidePopup();
      hideImgPopup();
    }
  });

  // ── 图片悬浮弹框 ──────────────────────────────────────

  const imgPopup = document.createElement('div');
  imgPopup.className = 'link-popup img-popup';
  imgPopup.style.display = 'none';
  document.body.appendChild(imgPopup);

  const imgPreview = document.createElement('img');
  imgPreview.className = 'img-popup-preview';
  imgPreview.alt = '';

  const imgAltInput = document.createElement('input');
  imgAltInput.type = 'text';
  imgAltInput.className = 'link-popup-text';
  imgAltInput.placeholder = t('Alt text (alt)');

  const imgSrcInput = document.createElement('input');
  imgSrcInput.type = 'text';
  imgSrcInput.className = 'link-popup-url img-popup-src';
  imgSrcInput.placeholder = t('Image URL https://...');

  const imgBtnConfirm = document.createElement('button');
  imgBtnConfirm.className = 'link-popup-confirm';
  imgBtnConfirm.title = t('Confirm');
  imgBtnConfirm.innerHTML = IconCheck;

  imgPopup.appendChild(imgPreview);
  imgPopup.appendChild(imgAltInput);
  imgPopup.appendChild(imgSrcInput);
  imgPopup.appendChild(imgBtnConfirm);

  let imgHoverTimer: ReturnType<typeof setTimeout> | null = null;
  let imgHideTimer: ReturnType<typeof setTimeout> | null = null;
  let currentImage: ImageInfo | null = null;

  function clearImgHoverTimer(): void {
    if (imgHoverTimer) { clearTimeout(imgHoverTimer); imgHoverTimer = null; }
  }
  function clearImgHideTimer(): void {
    if (imgHideTimer) { clearTimeout(imgHideTimer); imgHideTimer = null; }
  }

  function showImgPopup(info: ImageInfo, imgEl: Element): void {
    clearImgHideTimer();
    currentImage = info;
    imgPreview.src = info.src;
    imgAltInput.value = info.alt;
    imgSrcInput.value = info.src;

    const rect = imgEl.getBoundingClientRect();
    imgPopup.style.display = 'flex';
    // 弹框优先显示在图片下方；若图片在视口上半部则显示在下方，否则显示在上方
    const popupH = imgPopup.offsetHeight || 46;
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow >= popupH + 8 || spaceBelow >= rect.top) {
      imgPopup.style.top = `${rect.bottom + window.scrollY + 4}px`;
    } else {
      imgPopup.style.top = `${rect.top + window.scrollY - popupH - 4}px`;
    }
    imgPopup.style.left = `${rect.left + window.scrollX}px`;
  }

  function hideImgPopup(): void {
    clearImgHideTimer();
    clearImgHoverTimer();
    imgPopup.style.display = 'none';
    currentImage = null;
  }

  function scheduleImgHide(delay = 180): void {
    clearImgHideTimer();
    imgHideTimer = setTimeout(() => { hideImgPopup(); }, delay);
  }

  // 悬停图片 → 500ms 后显示弹框
  container.addEventListener('mouseover', (e) => {
    const target = e.target as Element;
    const img = target.closest('img');
    if (!img) { return; }

    clearImgHoverTimer();
    clearImgHideTimer();
    imgHoverTimer = setTimeout(() => {
      imgHoverTimer = null;
      const view = getView();
      if (!view) { return; }
      const info = findImageAt(view, img);
      if (info) { showImgPopup(info, img); }
    }, 500);
  });

  container.addEventListener('mouseout', (e) => {
    if (!(e.target as Element).closest('img')) { return; }
    clearImgHoverTimer();
  });

  container.addEventListener('mouseleave', () => {
    clearImgHoverTimer();
    scheduleImgHide(180);
  });

  imgPopup.addEventListener('mouseenter', () => clearImgHideTimer());
  imgPopup.addEventListener('mouseleave', () => hideImgPopup());

  // 确认：更新图片 src / alt
  imgBtnConfirm.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const view = getView();
    if (!view || !currentImage) { hideImgPopup(); return; }

    const newSrc = imgSrcInput.value.trim();
    const newAlt = imgAltInput.value;
    const { pos } = currentImage;
    const node = view.state.doc.nodeAt(pos);
    if (!node || node.type.name !== 'image') { hideImgPopup(); return; }

    view.dispatch(
      view.state.tr.setNodeMarkup(pos, null, { ...node.attrs, src: newSrc, alt: newAlt }),
    );
    view.focus();
    hideImgPopup();
  });

  // 阻止输入框事件冒泡到 ProseMirror
  [imgAltInput, imgSrcInput].forEach((inp) => {
    inp.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { imgBtnConfirm.dispatchEvent(new MouseEvent('mousedown')); }
      if (e.key === 'Escape') { hideImgPopup(); }
    });
    inp.addEventListener('mousedown', (e) => e.stopPropagation());
  });
}
