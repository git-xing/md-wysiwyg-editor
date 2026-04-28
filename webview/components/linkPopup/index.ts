import "./linkPopup.css";
import type { EditorView } from "@milkdown/prose/view";
import { notifyOpenUrl, notifyOpenFile } from "@/messaging";
import {
    IconCheck,
    IconExternalLink,
    IconFileText,
    IconHash,
    IconLink,
    IconPencil,
    IconTrash2,
} from "@/ui/icons";
import { t } from "@/i18n";
import { applyTooltip } from "@/ui/tooltip";
import { slugify } from "@/utils/slug";

// ── 类型 ──────────────────────────────────────────────────────────────

interface LinkInfo {
    href: string;
    text: string;
    from: number;
    to: number;
}

type LinkKind = "anchor" | "file" | "external";

// ── 辅助函数 ──────────────────────────────────────────────────────────

function getLinkKind(href: string): LinkKind {
    if (href.startsWith("#")) return "anchor";
    if (href.match(/^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\//)) return "external";
    return "file";
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
    if (domPos < 0) return null;

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

/**
 * 按 slug 在容器内查找标题元素。
 * 优先 getElementById（headingIds 已赋值），失败时 fallback：
 * 扫描所有 h1–h6，按 slug + 重复计数匹配。
 * ProseMirror reconcile 可能清除 id 属性，fallback 确保始终能找到目标。
 */
function findHeadingElement(id: string, container: HTMLElement): HTMLElement | null {
    const direct = document.getElementById(id);
    if (direct) return direct;

    // Fallback：重新 slug 扫描（ProseMirror 可能清除了 id 属性）
    const headings = container.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6");
    const counts = new Map<string, number>();
    for (const h of Array.from(headings)) {
        const base = slugify(h.textContent ?? "");
        if (!base) continue;
        const count = counts.get(base) ?? 0;
        const slug = count === 0 ? base : `${base}-${count}`;
        counts.set(base, count + 1);
        if (slug === id) return h;
    }
    return null;
}

// ── 主函数 ────────────────────────────────────────────────────────────

export function setupLinkPopup(
    container: HTMLElement,
    getView: () => EditorView | null,
): void {
    const isMac = window.__i18n?.isMac ?? false;
    const openHint = isMac ? t("⌘ Click to open") : t("Ctrl+Click to open");

    function resolveAnchorTitle(id: string): string | null {
        const el = findHeadingElement(id, container);
        return el ? (el.textContent?.trim() ?? null) : null;
    }

    function scrollToAnchor(id: string): void {
        const target = findHeadingElement(id, container);
        if (!target) return;
        const topbar = document.querySelector(".editor-topbar") as HTMLElement | null;
        const topbarH = topbar?.getBoundingClientRect().height ?? 40;
        const top = target.getBoundingClientRect().top + window.scrollY - topbarH - 8;
        window.scrollTo({ top, behavior: "smooth" });
    }

    // ── 构建 popup DOM ─────────────────────────────────────────────

    const popup = document.createElement("div");
    popup.className = "lp-root";
    popup.style.display = "none";
    document.body.appendChild(popup);

    // Header
    const header = document.createElement("div");
    header.className = "lp-header";

    const iconEl = document.createElement("span");
    iconEl.className = "lp-icon";

    const urlEl = document.createElement("span");
    urlEl.className = "lp-url";

    const headerActions = document.createElement("div");
    headerActions.className = "lp-header-actions";

    const btnOpen = document.createElement("button");
    btnOpen.className = "lp-btn lp-btn-open";
    btnOpen.innerHTML = IconExternalLink;
    const btnOpenTooltip = applyTooltip(btnOpen, openHint, { placement: "above" });

    const btnEdit = document.createElement("button");
    btnEdit.className = "lp-btn lp-btn-edit";
    btnEdit.innerHTML = IconPencil;
    applyTooltip(btnEdit, t("Edit link"), { placement: "above" });

    headerActions.appendChild(btnOpen);
    headerActions.appendChild(btnEdit);

    header.appendChild(iconEl);
    header.appendChild(urlEl);
    header.appendChild(headerActions);

    // Anchor hint（仅锚点类型时有内容）
    const anchorHint = document.createElement("div");
    anchorHint.className = "lp-anchor-hint";

    // Body（编辑模式，默认折叠）
    const body = document.createElement("div");
    body.className = "lp-body";

    const divider = document.createElement("div");
    divider.className = "lp-divider";

    const inputText = document.createElement("input");
    inputText.type = "text";
    inputText.className = "lp-input lp-text-input";
    inputText.placeholder = t("Link text");

    const inputUrl = document.createElement("input");
    inputUrl.type = "text";
    inputUrl.className = "lp-input lp-url-input";
    inputUrl.placeholder = t("URL https://...");

    const bodyActions = document.createElement("div");
    bodyActions.className = "lp-body-actions";

    const btnConfirm = document.createElement("button");
    btnConfirm.className = "lp-btn lp-btn-confirm";
    btnConfirm.title = t("Confirm");
    btnConfirm.innerHTML = IconCheck;

    const btnRemove = document.createElement("button");
    btnRemove.className = "lp-btn lp-btn-remove";
    btnRemove.title = t("Remove Link");
    btnRemove.innerHTML = IconTrash2;

    bodyActions.appendChild(btnConfirm);
    bodyActions.appendChild(btnRemove);

    body.appendChild(divider);
    body.appendChild(inputText);
    body.appendChild(inputUrl);
    body.appendChild(bodyActions);

    popup.appendChild(header);
    popup.appendChild(anchorHint);
    popup.appendChild(body);

    // ── 状态 ──────────────────────────────────────────────────────────

    let hoverTimer: ReturnType<typeof setTimeout> | null = null;
    let hideTimer: ReturnType<typeof setTimeout> | null = null;
    let currentLink: LinkInfo | null = null;
    let isEditMode = false;

    function clearHoverTimer(): void {
        if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
    }
    function clearHideTimer(): void {
        if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    }

    function setEditMode(on: boolean): void {
        isEditMode = on;
        body.classList.toggle("expanded", on);
        btnEdit.classList.toggle("lp-btn-active", on);
        if (on) {
            requestAnimationFrame(() => inputText.focus());
        }
    }

    function updatePopupContent(link: LinkInfo): void {
        const kind = getLinkKind(link.href);

        // 图标
        if (kind === "anchor") {
            iconEl.innerHTML = IconHash;
        } else if (kind === "file") {
            iconEl.innerHTML = IconFileText;
        } else {
            iconEl.innerHTML = IconLink;
        }

        // URL 显示
        urlEl.textContent = link.href;
        urlEl.title = link.href;

        // 锚点 hint + Open 按钮 tooltip
        if (kind === "anchor") {
            const id = link.href.slice(1);
            const title = resolveAnchorTitle(id);
            anchorHint.textContent = title ? `→ ${title}` : "";
            anchorHint.style.display = title ? "" : "none";
            btnOpenTooltip.setText(t("Jump to section"));
        } else {
            anchorHint.style.display = "none";
            btnOpenTooltip.setText(openHint);
        }

        // 编辑字段预填
        inputText.value = link.text;
        inputUrl.value = link.href;
    }

    function showPopup(link: LinkInfo, anchorEl: Element): void {
        clearHideTimer();
        currentLink = link;
        isEditMode = false;
        body.classList.remove("expanded");
        btnEdit.classList.remove("lp-btn-active");

        updatePopupContent(link);

        // 定位
        const rect = anchorEl.getBoundingClientRect();
        popup.style.display = "flex";

        // 先显示以便取到 popup 高度
        requestAnimationFrame(() => {
            const popupH = popup.offsetHeight;
            const spaceBelow = window.innerHeight - rect.bottom;
            const spaceAbove = rect.top;

            let top: number;
            if (spaceBelow >= popupH + 8 || spaceBelow >= spaceAbove) {
                top = rect.bottom + window.scrollY + 6;
            } else {
                top = rect.top + window.scrollY - popupH - 6;
            }

            let left = rect.left + window.scrollX;
            const popupW = popup.offsetWidth;
            if (left + popupW > window.innerWidth - 8) {
                left = window.innerWidth - popupW - 8;
            }
            if (left < 8) left = 8;

            popup.style.top = `${top}px`;
            popup.style.left = `${left}px`;
        });
    }

    function hidePopup(): void {
        clearHideTimer();
        clearHoverTimer();
        popup.style.display = "none";
        currentLink = null;
        isEditMode = false;
        body.classList.remove("expanded");
        btnEdit.classList.remove("lp-btn-active");
    }

    function scheduleHide(delay = 180): void {
        clearHideTimer();
        hideTimer = setTimeout(hidePopup, delay);
    }

    // ── 鼠标悬浮：显示 popup ─────────────────────────────────────

    container.addEventListener("mouseover", (e) => {
        const anchor = (e.target as Element).closest("a");
        if (!anchor) return;

        clearHoverTimer();
        clearHideTimer();

        hoverTimer = setTimeout(() => {
            hoverTimer = null;
            const view = getView();
            if (!view) return;
            const link = findLinkAt(view, anchor);
            if (link) showPopup(link, anchor);
        }, 200);
    });

    container.addEventListener("mouseout", (e) => {
        if (!(e.target as Element).closest("a")) return;
        clearHoverTimer();
    });

    container.addEventListener("mouseleave", () => {
        clearHoverTimer();
        if (!popup.contains(document.activeElement)) {
            scheduleHide(200);
        }
    });

    popup.addEventListener("mouseenter", () => clearHideTimer());
    popup.addEventListener("mouseleave", () => {
        if (popup.contains(document.activeElement)) return;
        hidePopup();
    });

    // ── 链接点击（capture 阶段）──────────────────────────────────

    // mousedown capture：处理 modifier+click（不 preventDefault，避免 B086 焦点问题）
    container.addEventListener(
        "mousedown",
        (e) => {
            const me = e as MouseEvent;
            if (!me.metaKey && !me.ctrlKey) return;
            const anchor = (me.target as Element).closest("a");
            if (!anchor) return;
            const href = anchor.getAttribute("href") ?? "";
            if (href.startsWith("#")) return; // 锚点由 click 处理
            e.stopPropagation();
            const cleanHref = href.split("#")[0];
            if (getLinkKind(cleanHref) === "external") {
                notifyOpenUrl(cleanHref);
            } else {
                notifyOpenFile(cleanHref);
            }
            scheduleHide(50);
        },
        true,
    );

    // click capture：仅处理锚点跳转（外部/文件已在 mousedown 中处理）
    container.addEventListener(
        "click",
        (e) => {
            const anchor = (e.target as Element).closest("a");
            if (!anchor) return;
            e.preventDefault();
            e.stopPropagation();

            const href = anchor.getAttribute("href") ?? "";

            if (href.startsWith("#")) {
                // 页内锚点：直接跳转，无需修饰键
                scrollToAnchor(href.slice(1));
                scheduleHide(50);
            }
        },
        true,
    );

    // ── Open 按钮 ─────────────────────────────────────────────────

    btnOpen.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!currentLink) return;
        const { href } = currentLink;
        if (href.startsWith("#")) {
            scrollToAnchor(href.slice(1));
        } else {
            const cleanHref = href.split("#")[0];
            if (getLinkKind(cleanHref) === "external") {
                notifyOpenUrl(cleanHref);
            } else {
                notifyOpenFile(cleanHref);
            }
        }
        hidePopup();
    });

    // ── Edit 按钮：切换编辑模式 ───────────────────────────────────

    btnEdit.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        setEditMode(!isEditMode);
    });

    // ── Confirm 按钮 ──────────────────────────────────────────────

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
                tr = tr.addMark(
                    from,
                    from + newText.length,
                    linkType.create({ href: newHref, title: null }),
                );
            }
        } else {
            tr = tr.removeMark(from, to, linkType);
            if (newHref) {
                tr = tr.addMark(
                    from,
                    to,
                    linkType.create({ href: newHref, title: null }),
                );
            }
        }

        view.dispatch(tr);
        view.focus();
        hidePopup();
    });

    // ── Remove 按钮 ───────────────────────────────────────────────

    btnRemove.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const view = getView();
        if (!view || !currentLink) { hidePopup(); return; }

        const { state } = view;
        const linkType = state.schema.marks["link"];
        if (!linkType) { hidePopup(); return; }

        view.dispatch(state.tr.removeMark(currentLink.from, currentLink.to, linkType));
        view.focus();
        hidePopup();
    });

    // ── 输入框辅助 ────────────────────────────────────────────────

    [inputText, inputUrl].forEach((inp) => {
        inp.addEventListener("mousedown", (e) => e.stopPropagation());
        inp.addEventListener("keydown", (e) => {
            if (e.isComposing) return;
            if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                btnConfirm.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
            } else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                hidePopup();
                getView()?.focus();
            }
        });
        inp.addEventListener("blur", () => {
            requestAnimationFrame(() => {
                if (popup.style.display !== "none" && !popup.matches(":hover")) {
                    hidePopup();
                }
            });
        });
    });

    // ── 点击弹框外部关闭 ─────────────────────────────────────────

    document.addEventListener("mousedown", (e) => {
        if (!popup.contains(e.target as Node)) hidePopup();
    });
}
