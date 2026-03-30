import type { EditorView } from "@milkdown/prose/view";
import { notifyOpenUrl, notifyOpenFile } from "../../messaging";
import { IconCheck, IconLink, IconX } from "../../ui/icons";
import { t } from "../../i18n";

interface LinkInfo {
    href: string;
    text: string;
    from: number;
    to: number;
}

function isRelativePath(href: string): boolean {
    return !href.match(/^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\//) && !href.startsWith("#");
}

function findLinkAt(view: EditorView, anchor: Element): LinkInfo | null {
    const href = anchor.getAttribute("href") ?? "";
    const text = anchor.textContent ?? "";

    let domPos: number;
    try {
        domPos = view.posAtDOM(anchor, 0);
    } catch {
        return null;
    }

    const { state } = view;
    const docSize = state.doc.content.size;
    const pos = Math.min(domPos, docSize - 1);
    const linkType = state.schema.marks["link"];
    if (!linkType) return null;

    let from = pos;
    let to = pos;
    const nodeAt = state.doc.nodeAt(pos);
    if (nodeAt && linkType.isInSet(nodeAt.marks)) {
        while (
            from > 0 &&
            (() => {
                const n = state.doc.nodeAt(from - 1);
                return n && linkType.isInSet(n.marks);
            })()
        ) from--;
        while (
            to < docSize &&
            (() => {
                const n = state.doc.nodeAt(to);
                return n && linkType.isInSet(n.marks);
            })()
        ) to++;
    }

    if (from === to) {
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
    const isMac = window.__i18n?.isMac ?? false;

    // ── 快捷键提示徽章（独立于弹框，出现在链接上方） ──────────────
    const hintBadge = document.createElement("div");
    hintBadge.className = "link-hint-badge";
    hintBadge.textContent = isMac ? "⌘ Click" : "Ctrl+Click";
    document.body.appendChild(hintBadge);

    // ── 编辑弹框 ─────────────────────────────────────────────────
    const popup = document.createElement("div");
    popup.className = "link-popup";
    popup.style.display = "none";
    document.body.appendChild(popup);

    // Header：链接图标 + URL 预览
    const popupHeader = document.createElement("div");
    popupHeader.className = "link-popup-header";

    const headerIcon = document.createElement("span");
    headerIcon.className = "link-popup-header-icon";
    headerIcon.innerHTML = IconLink;

    const urlDisplay = document.createElement("span");
    urlDisplay.className = "link-popup-url-display";

    popupHeader.appendChild(headerIcon);
    popupHeader.appendChild(urlDisplay);

    // 分隔线
    const divider = document.createElement("div");
    divider.className = "link-popup-divider";

    // Body：编辑区
    const popupBody = document.createElement("div");
    popupBody.className = "link-popup-body";

    const inputText = document.createElement("input");
    inputText.type = "text";
    inputText.className = "link-popup-text";
    inputText.placeholder = t("Link text");

    const inputUrl = document.createElement("input");
    inputUrl.type = "text";
    inputUrl.className = "link-popup-url";
    inputUrl.placeholder = "URL https://...";

    const fieldsDiv = document.createElement("div");
    fieldsDiv.className = "link-popup-fields";
    fieldsDiv.appendChild(inputText);
    fieldsDiv.appendChild(inputUrl);

    const actionsDiv = document.createElement("div");
    actionsDiv.className = "link-popup-actions";

    const btnConfirm = document.createElement("button");
    btnConfirm.className = "link-popup-confirm";
    btnConfirm.title = t("Confirm");
    btnConfirm.innerHTML = IconCheck;

    const btnRemove = document.createElement("button");
    btnRemove.className = "link-popup-remove";
    btnRemove.title = t("Remove Link");
    btnRemove.innerHTML = IconX;

    actionsDiv.appendChild(btnConfirm);
    actionsDiv.appendChild(btnRemove);

    popupBody.appendChild(fieldsDiv);
    popupBody.appendChild(actionsDiv);

    popup.appendChild(popupHeader);
    popup.appendChild(divider);
    popup.appendChild(popupBody);

    // ── 状态 ──────────────────────────────────────────────────────
    let hoverTimer: ReturnType<typeof setTimeout> | null = null;
    let hideTimer: ReturnType<typeof setTimeout> | null = null;
    let currentLink: LinkInfo | null = null;

    function clearHoverTimer(): void {
        if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
    }
    function clearHideTimer(): void {
        if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    }

    function positionHintBadge(anchorEl: Element): void {
        const rect = anchorEl.getBoundingClientRect();
        const badgeH = 20;
        const topAbove = rect.top + window.scrollY - badgeH - 4;
        // 上方空间不足时改为贴右下
        if (topAbove < window.scrollY) {
            hintBadge.style.left = `${rect.right + window.scrollX + 4}px`;
            hintBadge.style.top = `${rect.top + window.scrollY}px`;
        } else {
            hintBadge.style.left = `${rect.left + window.scrollX}px`;
            hintBadge.style.top = `${topAbove}px`;
        }
    }

    function showHintBadge(anchorEl: Element): void {
        positionHintBadge(anchorEl);
        hintBadge.classList.add("link-hint-badge--visible");
    }

    function hideHintBadge(): void {
        hintBadge.classList.remove("link-hint-badge--visible");
    }

    function showPopup(link: LinkInfo, anchorEl: Element): void {
        clearHideTimer();
        currentLink = link;
        inputText.value = link.text;
        inputUrl.value = link.href;
        urlDisplay.textContent = link.href;
        urlDisplay.title = link.href;

        const rect = anchorEl.getBoundingClientRect();
        popup.style.display = "flex";
        popup.style.left = `${rect.left + window.scrollX}px`;
        popup.style.top = `${rect.bottom + window.scrollY + 6}px`;
    }

    function hidePopup(): void {
        clearHideTimer();
        clearHoverTimer();
        popup.style.display = "none";
        currentLink = null;
        hideHintBadge();
    }

    function scheduleHide(delay = 180): void {
        clearHideTimer();
        hideTimer = setTimeout(hidePopup, delay);
    }

    // ── 事件：鼠标进入链接 ──────────────────────────────────────
    container.addEventListener("mouseover", (e) => {
        const anchor = (e.target as Element).closest("a");
        if (!anchor) return;

        clearHoverTimer();
        clearHideTimer();
        showHintBadge(anchor);

        hoverTimer = setTimeout(() => {
            hoverTimer = null;
            const view = getView();
            if (!view) return;
            const link = findLinkAt(view, anchor);
            if (link) showPopup(link, anchor);
        }, 500);
    });

    container.addEventListener("mouseout", (e) => {
        if (!(e.target as Element).closest("a")) return;
        clearHoverTimer();
    });

    container.addEventListener("mouseleave", () => {
        clearHoverTimer();
        hideHintBadge();
        scheduleHide(180);
    });

    popup.addEventListener("mouseenter", () => clearHideTimer());
    popup.addEventListener("mouseleave", () => hidePopup());

    // ── 捕获阶段拦截链接点击 ──────────────────────────────────────
    container.addEventListener(
        "click",
        (e) => {
            const anchor = (e.target as Element).closest("a");
            if (!anchor) return;
            e.stopPropagation();
            e.preventDefault();

            if ((e as MouseEvent).metaKey || (e as MouseEvent).ctrlKey) {
                const href = anchor.getAttribute("href");
                if (href) {
                    if (isRelativePath(href)) {
                        notifyOpenFile(href);
                    } else {
                        notifyOpenUrl(href);
                    }
                }
            }
        },
        true,
    );

    // ── 确认按钮 ──────────────────────────────────────────────────
    btnConfirm.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const view = getView();
        if (!view || !currentLink) { hidePopup(); return; }

        const { state } = view;
        const linkType = state.schema.marks["link"];
        if (!linkType) { hidePopup(); return; }

        const newHref = inputUrl.value.trim();
        const newText = inputText.value;
        const { from, to } = currentLink;
        let tr = state.tr;

        if (newText && newText !== currentLink.text) {
            tr = tr.replaceWith(from, to, state.schema.text(newText));
            if (newHref) {
                tr = tr.addMark(from, from + newText.length, linkType.create({ href: newHref, title: null }));
            }
        } else {
            tr = tr.removeMark(from, to, linkType);
            if (newHref) {
                tr = tr.addMark(from, to, linkType.create({ href: newHref, title: null }));
            }
        }

        view.dispatch(tr);
        view.focus();
        hidePopup();
    });

    // ── 移除按钮 ──────────────────────────────────────────────────
    btnRemove.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const view = getView();
        if (!view || !currentLink) { hidePopup(); return; }

        const { state } = view;
        const linkType = state.schema.marks["link"];
        if (!linkType) { hidePopup(); return; }

        const { from, to } = currentLink;
        view.dispatch(state.tr.removeMark(from, to, linkType));
        view.focus();
        hidePopup();
    });

    // ── 阻止输入框事件冒泡 ──────────────────────────────────────
    [inputText, inputUrl].forEach((inp) => {
        inp.addEventListener("keydown", (e) => e.stopPropagation());
        inp.addEventListener("mousedown", (e) => e.stopPropagation());
    });

    // ── 点击弹框外部关闭 ─────────────────────────────────────────
    document.addEventListener("mousedown", (e) => {
        if (!popup.contains(e.target as Node)) hidePopup();
    });
}
