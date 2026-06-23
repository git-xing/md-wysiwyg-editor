import './toc.css';
import type { EditorView } from "@milkdown/prose/view";
import { applyTooltip } from "@/ui/tooltip";
import { t } from "@/i18n";
import type { EventManager } from "@/eventManager";
import {
    getTopbarBottom,
    getAllHeadings,
    findHeadingPos,
    findActiveHeading,
} from "@/utils/headingUtils";

interface HeadingEntry {
    level: number;
    text: string;
    pos: number;
}

const TOC_WIDTH_DEFAULT = 220;
const TOC_WIDTH_MIN = 150;
const TOC_WIDTH_MAX = 400;
const DOCKED_MIN_CONTENT_WIDTH = 720;
const HEADING_SELECTOR = "h1,h2,h3,h4,h5,h6";
const tocAutoHideThreshold = window.__i18n?.tocAutoHideThreshold ?? 3;
type TocMode = "docked" | "overlay";

export function initToc(eventManager: EventManager, getEditorView: () => EditorView | null): {
    panel: HTMLElement;
    toggle: () => void;
    refresh: () => void;
} {
    const panel = document.createElement("div");
    panel.className = "toc-panel";

    const header = document.createElement("div");
    header.className = "toc-header";
    header.textContent = t("Table of Contents");

    const list = document.createElement("div");
    list.className = "toc-list";

    const resizeHandle = document.createElement("div");
    resizeHandle.className = "toc-resize-handle";

    panel.appendChild(header);
    panel.appendChild(list);
    panel.appendChild(resizeHandle);

    // ── 右侧收起/展开 Tab（独立 fixed 元素，不受 panel overflow:hidden 影响）──
    const tabEl = document.createElement("button");
    tabEl.className = "toc-toggle-tab";
    tabEl.tabIndex = -1;
    document.body.appendChild(tabEl);

    let tocMode: TocMode = "overlay";
    let isOpen = false;
    let dockedUserCollapsed = false;
    let userToggled = false;
    let activeHeadingPos: number | null = null;
    let scrollRafId: number | null = null;
    let tocWidth = TOC_WIDTH_DEFAULT;
    let isDragging = false;
    let dragStartX = 0;
    let dragStartWidth = 0;

    function setActiveHeadingPos(pos: number | null): void {
        activeHeadingPos = pos;
        let activeItem: HTMLElement | null = null;
        list.querySelectorAll<HTMLElement>(".toc-item").forEach((item) => {
            const isActive = pos !== null && item.dataset["headingPos"] === String(pos);
            item.classList.toggle("toc-item--active", isActive);
            if (isActive) {
                activeItem = item;
            }
        });
        if (activeItem) {
            (activeItem as HTMLElement).scrollIntoView({ block: "nearest" });
        }
    }

    function updateTab(): void {
        tabEl.textContent = isOpen ? "‹" : "›";
        tabEl.style.left = isOpen ? `${tocWidth}px` : "0px";
    }

    function updateTocWidth(newWidth: number): void {
        tocWidth = Math.max(TOC_WIDTH_MIN, Math.min(TOC_WIDTH_MAX, newWidth));
        panel.style.width = `${tocWidth}px`;
        document.documentElement.style.setProperty("--toc-width", `${tocWidth}px`);
        updateTab();
    }

    function updateBodyClasses(): void {
        document.body.classList.toggle("toc-docked", tocMode === "docked");
        document.body.classList.toggle("toc-overlay", tocMode === "overlay");
        document.body.classList.toggle("toc-open", isOpen && tocMode === "docked");
        document.body.classList.toggle("toc-overlay-open", isOpen && tocMode === "overlay");
    }

    function syncOutsideClickHandler(): void {
        document.removeEventListener("mousedown", outsideClickHandler);
        if (isOpen && tocMode === "overlay") {
            setTimeout(() => {
                if (isOpen && tocMode === "overlay") {
                    document.addEventListener("mousedown", outsideClickHandler);
                }
            }, 0);
        }
    }

    function syncTocState(): void {
        panel.classList.toggle("toc-panel--open", isOpen);
        panel.classList.toggle("toc-panel--docked", tocMode === "docked");
        panel.classList.toggle("toc-panel--overlay", tocMode === "overlay");
        panel.style.width = `${tocWidth}px`;
        document.documentElement.style.setProperty("--toc-width", `${tocWidth}px`);
        updateBodyClasses();
        updateTab();
        syncOutsideClickHandler();
        if (isOpen) {
            renderHeadings(getHeadings());
        }
    }

    // ── 从 ProseMirror 文档中提取所有 heading 节点 ────────
    function getHeadings(): HeadingEntry[] {
        const view = getEditorView();
        if (!view) {
            return [];
        }
        const headings: HeadingEntry[] = [];
        view.state.doc.nodesBetween(
            0,
            view.state.doc.content.size,
            (node, pos) => {
                if (node.type.name === "heading") {
                    const text = node.textContent.trim();
                    if (text) {
                        headings.push({
                            level: node.attrs["level"] as number,
                            text,
                            pos,
                        });
                    }
                }
            },
        );
        return headings;
    }

    function shouldAutoOpen(headings: HeadingEntry[]): boolean {
        return tocMode === "docked" && headings.length > tocAutoHideThreshold;
    }

    function syncAutoOpenState(headings: HeadingEntry[]): void {
        if (!userToggled) {
            isOpen = shouldAutoOpen(headings);
        }
    }

    function renderHeadings(headings: HeadingEntry[]): void {
        list.innerHTML = "";
        if (headings.length === 0) {
            const empty = document.createElement("div");
            empty.className = "toc-empty";
            empty.textContent = t("No headings");
            list.appendChild(empty);
            return;
        }
        headings.forEach(({ level, text, pos }) => {
            const item = document.createElement("div");
            item.className = `toc-item toc-item--h${level}`;
            item.dataset["headingPos"] = String(pos);
            item.style.paddingLeft = `${(level - 1) * 12 + 8}px`;
            item.textContent = text || `${t("Heading")} ${level}`;
            item.classList.toggle("toc-item--active", activeHeadingPos === pos);
            applyTooltip(item, text, {
                placement: "above",
                truncatedOnly: true,
            });
            item.addEventListener("mousedown", (e) => {
                e.preventDefault();
                e.stopPropagation();
                const view = getEditorView();
                if (!view) {
                    return;
                }
                try {
                    const { node } = view.domAtPos(pos + 1);
                    let el: HTMLElement | null =
                        node.nodeType === Node.TEXT_NODE
                            ? node.parentElement
                            : (node as HTMLElement);
                    while (el && !el.matches(HEADING_SELECTOR)) {
                        el = el.parentElement;
                    }
                    if (el) {
                        const topbar = document.querySelector(
                            ".editor-topbar",
                        ) as HTMLElement | null;
                        const topbarH =
                            topbar?.getBoundingClientRect().height ?? 40;
                        const top =
                            el.getBoundingClientRect().top +
                            window.scrollY -
                            topbarH -
                            8;
                        // 立即更新 TOC 选中状态
                        setActiveHeadingPos(pos);
                        window.scrollTo({ top, behavior: "smooth" });
                    }
                } catch {
                    /* 文档结构异常时忽略 */
                }
            });
            list.appendChild(item);
        });
        setActiveHeadingPos(activeHeadingPos);
    }

    function refresh(): void {
        const headings = getHeadings();
        syncAutoOpenState(headings);
        syncTocState();
    }

    function outsideClickHandler(e: MouseEvent): void {
        if (!panel.contains(e.target as Node)) {
            close();
        }
    }

    function close(): void {
        isOpen = false;
        syncTocState();
    }

    function openPanel(): void {
        isOpen = true;
        syncTocState();
    }

    function toggle(): void {
        userToggled = true;
        if (tocMode === "docked") {
            dockedUserCollapsed = isOpen;
            isOpen = !isOpen;
            syncTocState();
        } else {
            if (isOpen) {
                close();
            } else {
                openPanel();
            }
        }
    }

    // Tab 点击：始终调用 toggle
    tabEl.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle();
    });

    // ── 拖拽调整 TOC 宽度 ──────────────────────────────────
    resizeHandle.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        isDragging = true;
        dragStartX = e.clientX;
        dragStartWidth = tocWidth;
        panel.classList.add("toc-panel--dragging");
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
    });

    document.addEventListener("mousemove", (e) => {
        if (!isDragging) {
            return;
        }
        const delta = e.clientX - dragStartX;
        updateTocWidth(dragStartWidth + delta);
    });

    document.addEventListener("mouseup", () => {
        if (isDragging) {
            isDragging = false;
            panel.classList.remove("toc-panel--dragging");
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
        }
    });

    // ── 自动展开检测 ──────────────────────────────────────
    function hasEnoughSpace(): boolean {
        if (document.body.classList.contains("editor-width-auto")) {
            return window.innerWidth >= tocWidth + DOCKED_MIN_CONTENT_WIDTH;
        }
        const editorEl = document.getElementById("editor");
        if (!editorEl) {
            return false;
        }
        const rect = editorEl.getBoundingClientRect();
        return rect.left >= tocWidth && rect.width >= DOCKED_MIN_CONTENT_WIDTH;
    }

    function resolveMode(): TocMode {
        return hasEnoughSpace() ? "docked" : "overlay";
    }

    function checkResponsiveMode(): void {
        const nextMode = resolveMode();
        if (nextMode === tocMode) {
            return;
        }

        tocMode = nextMode;
        if (tocMode === "docked") {
            const headings = getHeadings();
            isOpen = userToggled ? !dockedUserCollapsed : shouldAutoOpen(headings);
        } else {
            isOpen = false;
        }
        syncTocState();
    }

    // ── 动态对齐到 topbar 底部，同步 tab 垂直位置 ──────────
    function updatePanelPosition(): void {
        const topbar = document.querySelector(
            ".editor-topbar",
        ) as HTMLElement | null;
        const topbarBottom = topbar?.getBoundingClientRect().bottom ?? 40;
        panel.style.top = `${topbarBottom}px`;
        panel.style.height = `calc(100vh - ${topbarBottom}px)`;
        // tab 垂直居中于面板
        const tabTop =
            topbarBottom + (window.innerHeight - topbarBottom) / 2 - 24;
        tabEl.style.top = `${tabTop}px`;
    }

    // ── TOC 独立的滚动检测：更新当前可见标题的选中状态 ──────
    function updateActiveHeadingOnScroll(): void {
        scrollRafId = null;
        const view = getEditorView();
        if (!view) {
            return;
        }

        const top = getTopbarBottom();
        // 检测点往下偏移 50px，避免滚动完成前误判为上一个标题
        const threshold = top + 50;
        // TOC 不排除折叠隐藏的标题
        const result = findActiveHeading(view, threshold, false);
        setActiveHeadingPos(result?.pos ?? null);
    }

    function scheduleScrollUpdate(): void {
        if (scrollRafId !== null) {
            return;
        }
        scrollRafId = requestAnimationFrame(updateActiveHeadingOnScroll);
    }

    requestAnimationFrame(() => {
        tocMode = resolveMode();
        const headings = getHeadings();
        isOpen = userToggled ? tocMode === "docked" && !dockedUserCollapsed : shouldAutoOpen(headings);
        updatePanelPosition();
        syncTocState();
        // 初始化时检测一次当前可见标题
        updateActiveHeadingOnScroll();
    });

    eventManager.onWindow("resize", () => {
        updatePanelPosition();
        checkResponsiveMode();
    });
    // 监听滚动事件，独立更新 TOC 选中状态
    eventManager.onWindow("scroll", scheduleScrollUpdate, { passive: true });

    return { panel, toggle, refresh };
}
