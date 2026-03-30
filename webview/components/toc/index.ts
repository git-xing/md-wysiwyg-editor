import type { EditorView } from "@milkdown/prose/view";
import { applyTooltip } from "../../ui/tooltip";
import { t } from "../../i18n";

interface HeadingEntry {
    level: number;
    text: string;
    pos: number;
}

const TOC_WIDTH = 220;

export function initToc(getEditorView: () => EditorView | null): {
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

    panel.appendChild(header);
    panel.appendChild(list);

    // ── 右侧收起/展开 Tab（独立 fixed 元素，不受 panel overflow:hidden 影响）──
    const tabEl = document.createElement("button");
    tabEl.className = "toc-toggle-tab";
    tabEl.tabIndex = -1;
    document.body.appendChild(tabEl);

    let isOpen = false;
    let isAutoShown = false;

    function updateTab(): void {
        tabEl.textContent = isOpen ? "‹" : "›";
        tabEl.style.left = isOpen ? `${TOC_WIDTH}px` : "0px";
    }
    updateTab();

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
                    headings.push({
                        level: node.attrs["level"] as number,
                        text: node.textContent,
                        pos,
                    });
                }
            },
        );
        return headings;
    }

    function refresh(): void {
        if (!isOpen) {
            return;
        }
        const headings = getHeadings();
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
            item.style.paddingLeft = `${(level - 1) * 12 + 8}px`;
            item.textContent = text || `${t("Heading")} ${level}`;
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
                    while (el && !el.matches("h1,h2,h3,h4,h5,h6")) {
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
                        window.scrollTo({ top, behavior: "smooth" });
                    }
                } catch {
                    /* 文档结构异常时忽略 */
                }
            });
            list.appendChild(item);
        });
    }

    function outsideClickHandler(e: MouseEvent): void {
        if (!panel.contains(e.target as Node)) {
            close();
        }
    }

    function close(): void {
        isOpen = false;
        isAutoShown = false;
        panel.classList.remove("toc-panel--open");
        document.removeEventListener("mousedown", outsideClickHandler);
        updateTab();
    }

    function openPanel(auto: boolean): void {
        isOpen = true;
        isAutoShown = auto;
        panel.classList.add("toc-panel--open");
        refresh();
        updateTab();
        if (!auto) {
            // 手动打开才注册外部点击关闭（自动展开时 TOC 持久显示，不因外部点击关闭）
            setTimeout(() => {
                document.addEventListener("mousedown", outsideClickHandler);
            }, 0);
        }
    }

    function toggle(): void {
        if (isOpen) {
            close();
        } else {
            openPanel(false);
        }
    }

    // Tab 点击：始终调用 toggle
    tabEl.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle();
    });

    // ── 自动展开检测 ──────────────────────────────────────
    function hasEnoughSpace(): boolean {
        const editorEl = document.getElementById("editor");
        if (!editorEl) {
            return false;
        }
        return editorEl.getBoundingClientRect().left >= TOC_WIDTH;
    }

    function checkAutoShow(): void {
        if (hasEnoughSpace() && !isOpen) {
            openPanel(true);
        } else if (!hasEnoughSpace() && isAutoShown) {
            close();
        }
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

    requestAnimationFrame(() => {
        updatePanelPosition();
        checkAutoShow();
    });

    window.addEventListener("resize", () => {
        updatePanelPosition();
        checkAutoShow();
    });

    return { panel, toggle, refresh };
}
