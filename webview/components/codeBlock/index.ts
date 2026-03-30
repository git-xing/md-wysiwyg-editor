import type { Node as PMNode } from "@milkdown/prose/model";
import type {
    Decoration,
    DecorationSource,
    EditorView,
} from "@milkdown/prose/view";

type ViewMutationRecord = MutationRecord | { type: "selection"; target: Node };
import {
    IconCopy, IconCheck, IconChevronDown,
    IconChevronUp, IconChevronLeft, IconChevronRight,
    IconCode, IconEye,
    IconZoomIn, IconZoomOut, IconMaximize2, IconResetZoom,
    IconAlertCircle, IconX,
} from "../../ui/icons";
import { applyTooltip } from "../../ui/tooltip";
import { t } from "../../i18n";
import mermaid from "mermaid";

// ─── 语言列表 ───────────────────────────────────────────
const LANGUAGES: [string, string][] = [
    ["", t("Plain Text")],
    ["bash", "Bash / Shell"],
    ["c", "C"],
    ["cpp", "C++"],
    ["csharp", "C#"],
    ["css", "CSS"],
    ["go", "Go"],
    ["html", "HTML"],
    ["java", "Java"],
    ["javascript", "JavaScript"],
    ["json", "JSON"],
    ["markdown", "Markdown"],
    ["mermaid", "Mermaid"],
    ["php", "PHP"],
    ["python", "Python"],
    ["ruby", "Ruby"],
    ["rust", "Rust"],
    ["sql", "SQL"],
    ["swift", "Swift"],
    ["typescript", "TypeScript"],
    ["yaml", "YAML"],
];

function getLangLabel(val: string): string {
    return (LANGUAGES.find(([v]) => v === val)?.[1] ?? val) || t("Plain Text");
}

// ─── 行号更新 ────────────────────────────────────────────
function updateLineNumbers(gutter: HTMLElement, text: string): void {
    const lines = text.split("\n");
    const count = Math.max(1, lines.length);
    while (gutter.childElementCount < count) {
        gutter.appendChild(document.createElement("span"));
    }
    while (gutter.childElementCount > count) {
        gutter.removeChild(gutter.lastChild!);
    }
    Array.from(gutter.children).forEach((el, i) => {
        (el as HTMLElement).textContent = String(i + 1);
    });
}

// ─── Mermaid 模块级初始化 ────────────────────────────────
let mermaidInitialized = false;
function ensureMermaid(): void {
    if (mermaidInitialized) return;
    mermaidInitialized = true;
    const bg = getComputedStyle(document.documentElement)
        .getPropertyValue("--vscode-editor-background")
        .trim();
    const isDark = !bg.includes("255") && !bg.includes("fff") && !bg.includes("FFF");
    mermaid.initialize({
        startOnLoad: false,
        theme: isDark ? "dark" : "default",
        securityLevel: "loose",
    });
}

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// ─── 搜索下拉组件 ────────────────────────────────────────
function createLangPicker(
    currentLang: string,
    onSelect: (lang: string) => void,
): { el: HTMLElement; update: (lang: string) => void; destroy: () => void } {
    const wrapper = document.createElement("div");
    wrapper.className = "lang-picker";

    const triggerBtn = document.createElement("button");
    triggerBtn.className = "lang-picker-btn";
    triggerBtn.tabIndex = -1;
    triggerBtn.innerHTML = `<span class="lang-picker-label">${getLangLabel(currentLang)}</span>${IconChevronDown}`;

    const dropdown = document.createElement("div");
    dropdown.className = "lang-picker-dropdown";
    dropdown.style.display = "none";
    document.body.appendChild(dropdown);

    const searchInput = document.createElement("input");
    searchInput.className = "lang-picker-search";
    searchInput.type = "text";
    searchInput.placeholder = t("Search language...");
    searchInput.setAttribute("autocomplete", "off");
    searchInput.setAttribute("spellcheck", "false");

    const listEl = document.createElement("ul");
    listEl.className = "lang-picker-list";

    dropdown.appendChild(searchInput);
    dropdown.appendChild(listEl);
    wrapper.appendChild(triggerBtn);

    let isOpen = false;
    let activeIndex = -1;

    function renderList(filter = ""): void {
        const q = filter.toLowerCase();
        const filtered = LANGUAGES.filter(
            ([val, label]) =>
                label.toLowerCase().includes(q) ||
                val.toLowerCase().includes(q),
        );
        listEl.innerHTML = "";
        activeIndex = -1;
        filtered.forEach(([val, label], i) => {
            const item = document.createElement("li");
            item.className = "lang-picker-item";
            item.dataset["value"] = val;
            item.textContent = label;
            if (val === currentLang) item.classList.add("lang-picker-item--active");
            item.addEventListener("mousedown", (e) => {
                e.preventDefault();
                e.stopPropagation();
                selectLang(val);
            });
            listEl.appendChild(item);
            if (val === currentLang) activeIndex = i;
        });
    }

    function setActiveIdx(idx: number): void {
        const items = listEl.querySelectorAll<HTMLElement>(".lang-picker-item");
        items.forEach((el, i) =>
            el.classList.toggle("lang-picker-item--focused", i === idx),
        );
        if (items[idx]) items[idx].scrollIntoView({ block: "nearest" });
        activeIndex = idx;
    }

    function outsideClickHandler(e: MouseEvent): void {
        if (!wrapper.contains(e.target as Node) && !dropdown.contains(e.target as Node)) {
            close();
        }
    }
    function closeOnScroll(e: Event): void {
        if (dropdown.contains(e.target as Node)) return;
        close();
    }

    function open(): void {
        isOpen = true;
        const rect = triggerBtn.getBoundingClientRect();
        const dropW = Math.max(rect.width, 160);
        dropdown.style.left = `${rect.left}px`;
        dropdown.style.width = `${dropW}px`;
        dropdown.style.top = "";
        dropdown.style.bottom = "";

        dropdown.style.visibility = "hidden";
        dropdown.style.display = "block";
        const dropH = dropdown.offsetHeight;
        dropdown.style.display = "none";
        dropdown.style.visibility = "";

        const spaceBelow = window.innerHeight - rect.bottom;
        if (spaceBelow >= dropH + 8 || spaceBelow >= rect.top) {
            dropdown.style.top = `${rect.bottom + 2}px`;
        } else {
            dropdown.style.bottom = `${window.innerHeight - rect.top + 2}px`;
        }

        dropdown.style.display = "block";
        triggerBtn.classList.add("lang-picker-btn--open");
        searchInput.value = "";
        renderList();
        searchInput.focus();

        setTimeout(() => {
            document.addEventListener("mousedown", outsideClickHandler);
            window.addEventListener("scroll", closeOnScroll, { capture: true });
        }, 0);
    }

    function close(): void {
        isOpen = false;
        dropdown.style.display = "none";
        triggerBtn.classList.remove("lang-picker-btn--open");
        document.removeEventListener("mousedown", outsideClickHandler);
        window.removeEventListener("scroll", closeOnScroll, true);
    }

    function selectLang(val: string): void {
        currentLang = val;
        triggerBtn.querySelector(".lang-picker-label")!.textContent = getLangLabel(val);
        close();
        onSelect(val);
    }

    triggerBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        isOpen ? close() : open();
    });

    searchInput.addEventListener("input", () => renderList(searchInput.value));
    searchInput.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.isComposing) return;
        const items = listEl.querySelectorAll<HTMLElement>(".lang-picker-item");
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIdx(Math.min(activeIndex + 1, items.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIdx(Math.max(activeIndex - 1, 0));
        } else if (e.key === "Enter") {
            e.preventDefault();
            const focused = listEl.querySelector<HTMLElement>(".lang-picker-item--focused");
            if (focused) selectLang(focused.dataset["value"] ?? "");
            else if (items[0]) selectLang(items[0].dataset["value"] ?? "");
        } else if (e.key === "Escape") {
            e.preventDefault();
            close();
        }
    });

    return {
        el: wrapper,
        update(lang: string) {
            currentLang = lang;
            triggerBtn.querySelector(".lang-picker-label")!.textContent = getLangLabel(lang);
        },
        destroy() {
            close();
            if (document.body.contains(dropdown)) document.body.removeChild(dropdown);
        },
    };
}

// ─── NodeView 工厂 ────────────────────────────────────────
export function createCodeBlockView(
    node: PMNode,
    view: EditorView,
    getPos: () => number | undefined,
    _decorations?: readonly Decoration[],
    _innerDecorations?: DecorationSource,
): {
    dom: HTMLElement;
    contentDOM: HTMLElement;
    update: (n: PMNode) => boolean;
    ignoreMutation: (m: ViewMutationRecord) => boolean;
    destroy: () => void;
} {
    const _id = Math.random().toString(36).slice(2, 6);
    console.log(`[NodeView ${_id}] 工厂创建`, new Error().stack?.split("\n")[2]?.trim());

    const wrapper = document.createElement("div");
    wrapper.className = "code-block-wrapper";

    const header = document.createElement("div");
    header.className = "code-block-header";
    header.contentEditable = "false";

    const currentLang = (node.attrs["language"] as string) || "";
    const picker = createLangPicker(currentLang, (newLang) => {
        const pos = getPos();
        if (pos === undefined) return;
        view.dispatch(
            view.state.tr.setNodeMarkup(pos, null, { ...node.attrs, language: newLang }),
        );
        view.focus();
    });

    // ── Mermaid 状态 ──────────────────────────────────────
    let isMermaid = currentLang === "mermaid";
    let isPreviewMode = false;
    let renderTimer: ReturnType<typeof setTimeout> | null = null;
    let lastRenderedCode = "";
    let isRendering = false;
    let panX = 0, panY = 0, zoomLevel = 1.0;
    const ZOOM_MIN = 0.05, ZOOM_MAX = 10.0, ZOOM_BTN = 0.25;
    const PAN_STEP = 80;
    let lbActiveLightbox: HTMLElement | null = null;
    // 当前缩放百分比显示元素（overlay 中间）
    let zoomValueDisplay: HTMLButtonElement | null = null;

    function makeMermaidBtn(icon: string, tipText: string, extraClass = ""): HTMLButtonElement {
        const btn = document.createElement("button");
        btn.className = "mermaid-zoom-btn" + (extraClass ? ` ${extraClass}` : "");
        btn.tabIndex = -1;
        btn.innerHTML = icon;
        applyTooltip(btn, tipText, { placement: "above" });
        return btn;
    }

    // ── Header 按钮（spacer 之后，右对齐）────────────────
    const spacer = document.createElement("div");
    spacer.style.flex = "1";

    // 代码/预览切换按钮（仅 mermaid 时显示）
    const toggleBtn = document.createElement("button");
    toggleBtn.className = "code-view-toggle-btn";
    toggleBtn.tabIndex = -1;
    toggleBtn.innerHTML = IconEye;
    toggleBtn.style.display = isMermaid ? "inline-flex" : "none";
    const toggleTooltip = applyTooltip(toggleBtn, t("Preview Diagram"), { placement: "above" });

    // 全屏按钮（常驻）
    const fullscreenBtn = document.createElement("button");
    fullscreenBtn.className = "mermaid-zoom-btn code-block-fullscreen-btn";
    fullscreenBtn.tabIndex = -1;
    fullscreenBtn.innerHTML = IconMaximize2;
    applyTooltip(fullscreenBtn, t("View Fullscreen"), { placement: "above" });

    // 复制按钮
    const copyBtn = document.createElement("button");
    copyBtn.className = "copy-btn";
    copyBtn.tabIndex = -1;
    copyBtn.innerHTML = IconCopy;
    const copyTooltip = applyTooltip(copyBtn, t("Copy Code"), { placement: "above" });
    let copyRestoreTimer: ReturnType<typeof setTimeout> | null = null;

    copyBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const code = codeEl.textContent ?? "";
        copyBtn.innerHTML = IconCheck;
        copyBtn.classList.add("copy-btn--done");
        copyTooltip.setText(t("Copied!"));
        copyTooltip.show();
        if (copyRestoreTimer) clearTimeout(copyRestoreTimer);
        copyRestoreTimer = setTimeout(() => {
            copyBtn.innerHTML = IconCopy;
            copyBtn.classList.remove("copy-btn--done");
            copyTooltip.setText(t("Copy Code"));
            copyRestoreTimer = null;
        }, 1500);
        navigator.clipboard?.writeText(code).catch(() => {
            const ta = document.createElement("textarea");
            ta.value = code;
            ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
            document.body.appendChild(ta);
            ta.focus(); ta.select();
            try { document.execCommand("copy"); } catch { /* ignore */ }
            document.body.removeChild(ta);
        });
    });

    // header: [picker][spacer][toggleBtn][fullscreenBtn][copyBtn]
    header.appendChild(picker.el);
    header.appendChild(spacer);
    header.appendChild(toggleBtn);
    header.appendChild(fullscreenBtn);
    header.appendChild(copyBtn);

    // ── 代码区 ────────────────────────────────────────────
    const pre = document.createElement("pre");
    const codeEl = document.createElement("code");
    if (currentLang) codeEl.className = `language-${currentLang}`;

    const lineGutter = document.createElement("div");
    lineGutter.className = "line-numbers-gutter";
    lineGutter.contentEditable = "false";
    updateLineNumbers(lineGutter, node.textContent);

    pre.appendChild(lineGutter);
    pre.appendChild(codeEl);

    // ── Mermaid 预览区域 ───────────────────────────────────
    const mermaidPreview = document.createElement("div");
    mermaidPreview.className = "mermaid-preview";
    mermaidPreview.contentEditable = "false";

    // SVG 容器（transform 作用在这里）
    const svgContainer = document.createElement("div");
    svgContainer.className = "mermaid-svg-container";
    mermaidPreview.appendChild(svgContainer);

    // ── 右上角缩放 overlay：[-] [百分比] [+] ─────────────
    const zoomOverlay = document.createElement("div");
    zoomOverlay.className = "mermaid-zoom-overlay";
    zoomOverlay.contentEditable = "false";

    const overlayZoomOut = makeMermaidBtn(IconZoomOut, t("Zoom Out"), "mermaid-overlay-btn");
    const overlayZoomVal = document.createElement("button");
    overlayZoomVal.className = "mermaid-zoom-btn mermaid-overlay-btn mermaid-overlay-val";
    overlayZoomVal.tabIndex = -1;
    overlayZoomVal.textContent = "100%";
    applyTooltip(overlayZoomVal, t("Reset Zoom"), { placement: "above" });
    const overlayZoomIn = makeMermaidBtn(IconZoomIn, t("Zoom In"), "mermaid-overlay-btn");

    zoomValueDisplay = overlayZoomVal;
    zoomOverlay.append(overlayZoomOut, overlayZoomVal, overlayZoomIn);
    mermaidPreview.appendChild(zoomOverlay);

    // ── 右下角方向控制：↑←[reset]→↓ ─────────────────────
    const panControls = document.createElement("div");
    panControls.className = "mermaid-pan-controls";
    panControls.contentEditable = "false";

    // 中间 reset 按钮（fit-to-view）
    const panResetBtn = document.createElement("button");
    panResetBtn.className = "mermaid-pan-btn mermaid-pan-reset";
    panResetBtn.tabIndex = -1;
    panResetBtn.innerHTML = IconResetZoom;
    applyTooltip(panResetBtn, t("Reset Zoom"), { placement: "above" });
    panResetBtn.addEventListener("mousedown", (e) => {
        e.preventDefault(); e.stopPropagation();
        fitToView();
    });

    const panUp    = makePanBtn(IconChevronUp,    "up");
    const panDown  = makePanBtn(IconChevronDown,  "down");
    const panLeft  = makePanBtn(IconChevronLeft,  "left");
    const panRight = makePanBtn(IconChevronRight, "right");

    const panGrid = document.createElement("div");
    panGrid.className = "mermaid-pan-grid";
    // row1: _ ↑ _
    panGrid.appendChild(document.createElement("span"));
    panGrid.appendChild(panUp);
    panGrid.appendChild(document.createElement("span"));
    // row2: ← [reset] →
    panGrid.appendChild(panLeft);
    panGrid.appendChild(panResetBtn);
    panGrid.appendChild(panRight);
    // row3: _ ↓ _
    panGrid.appendChild(document.createElement("span"));
    panGrid.appendChild(panDown);
    panGrid.appendChild(document.createElement("span"));

    panControls.appendChild(panGrid);
    mermaidPreview.appendChild(panControls);

    function makePanBtn(icon: string, dir: string): HTMLButtonElement {
        const btn = document.createElement("button");
        btn.className = "mermaid-pan-btn";
        btn.tabIndex = -1;
        btn.innerHTML = icon;
        btn.addEventListener("mousedown", (e) => {
            e.preventDefault(); e.stopPropagation();
            switch (dir) {
                case "up":    panY += PAN_STEP; break;
                case "down":  panY -= PAN_STEP; break;
                case "left":  panX += PAN_STEP; break;
                case "right": panX -= PAN_STEP; break;
            }
            applyTransform();
        });
        return btn;
    }

    // ── 拖拽 handle ────────────────────────────────────────
    const resizeHandle = document.createElement("div");
    resizeHandle.className = "code-block-resize-handle";
    resizeHandle.contentEditable = "false";
    applyTooltip(resizeHandle, t("Drag to resize"), { placement: "above" });

    resizeHandle.addEventListener("mousedown", (e) => {
        e.preventDefault(); e.stopPropagation();
        // 以当前可见元素为基准测量起始高度
        const visibleEl = isPreviewMode ? mermaidPreview : pre;
        const startY = e.clientY;
        const startH = visibleEl.getBoundingClientRect().height;

        const onMove = (ev: MouseEvent) => {
            const newH = Math.max(80, startH + ev.clientY - startY);
            // 同步更新两个元素，确保切换模式时高度保持一致
            pre.style.maxHeight = `${newH}px`;
            pre.style.height = `${newH}px`;
            mermaidPreview.style.maxHeight = `${newH}px`;
            mermaidPreview.style.height = `${newH}px`;
        };
        const onUp = () => {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
    });

    codeEl.addEventListener("keydown", (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "a") {
            e.preventDefault(); e.stopPropagation();
            const sel = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(codeEl);
            sel?.removeAllRanges();
            sel?.addRange(range);
        }
    });

    wrapper.appendChild(header);
    wrapper.appendChild(pre);
    wrapper.appendChild(mermaidPreview);
    wrapper.appendChild(resizeHandle);

    // ── Transform 工具函数 ─────────────────────────────────
    function applyTransform(): void {
        svgContainer.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomLevel})`;
        // 同步百分比显示
        if (zoomValueDisplay) {
            zoomValueDisplay.textContent = `${Math.round(zoomLevel * 100)}%`;
        }
    }

    // fitToView：读取 SVG viewBox，自适应填满容器
    function fitToView(): void {
        const svgEl = svgContainer.querySelector("svg");
        if (!svgEl) return;

        requestAnimationFrame(() => {
            const containerW = mermaidPreview.clientWidth;
            const containerH = mermaidPreview.clientHeight;
            if (!containerW || !containerH) return;

            let svgW = parseFloat(svgEl.getAttribute("width") ?? "0");
            let svgH = parseFloat(svgEl.getAttribute("height") ?? "0");
            if (!svgW || !svgH) {
                const vb = svgEl.getAttribute("viewBox");
                if (vb) {
                    const parts = vb.trim().split(/[\s,]+/);
                    if (parts.length >= 4) {
                        svgW = parseFloat(parts[2]);
                        svgH = parseFloat(parts[3]);
                    }
                }
            }
            if (!svgW || !svgH) return;

            const padding = 40;
            const scaleX = (containerW - padding) / svgW;
            const scaleY = (containerH - padding) / svgH;
            zoomLevel = Math.min(scaleX, scaleY, ZOOM_MAX);
            zoomLevel = Math.max(ZOOM_MIN, zoomLevel);
            panX = 0; panY = 0;
            applyTransform();
        });
    }

    // ── Mermaid 渲染 ───────────────────────────────────────
    async function renderMermaid(code: string): Promise<void> {
        if (!isMermaid || !isPreviewMode) return;
        if (isRendering) return;
        if (code === lastRenderedCode && svgContainer.querySelector("svg")) return;

        ensureMermaid();
        isRendering = true;
        svgContainer.innerHTML = `<div class="mermaid-loading">${t("Rendering...")}</div>`;

        // 传入 svgContainer 作为第三参数：mermaid 改用 hidden div（不可见），
        // 不再向 body 注入可见错误元素（bomb icon），且渲染完成后自动移除 hidden div
        const id = `mmid-${Math.random().toString(36).slice(2, 9)}`;
        try {
            const { svg } = await mermaid.render(id, code, svgContainer);
            svgContainer.innerHTML = svg;
            const svgEl = svgContainer.querySelector("svg");
            if (svgEl) {
                // 从 viewBox 提取自然尺寸并写入 width/height 属性
                // 这样 SVG 有固定 px 尺寸，拖拽容器高度时不会跟着缩放
                const vb = svgEl.getAttribute("viewBox");
                if (vb) {
                    const parts = vb.trim().split(/[\s,]+/);
                    if (parts.length >= 4) {
                        const w = parseFloat(parts[2]);
                        const h = parseFloat(parts[3]);
                        if (w && h) {
                            svgEl.setAttribute("width", String(w));
                            svgEl.setAttribute("height", String(h));
                        }
                    }
                }
                svgEl.style.display = "block";
            }
            lastRenderedCode = code;
            fitToView();
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            svgContainer.innerHTML = `
                <div class="mermaid-error">
                    <span>${IconAlertCircle}</span>
                    <pre class="mermaid-error-msg">${escapeHtml(msg)}</pre>
                </div>`;
        } finally {
            isRendering = false;
        }
    }

    // 进入预览模式（内部复用）
    function enterPreviewMode(): void {
        isPreviewMode = true;
        toggleBtn.innerHTML = IconCode;
        toggleBtn.classList.add("code-view-toggle-btn--active");
        toggleTooltip.setText(t("Edit Code"));
        pre.style.display = "none";
        mermaidPreview.style.display = "flex";
    }

    // 退出预览模式（内部复用）
    function exitPreviewMode(): void {
        isPreviewMode = false;
        toggleBtn.innerHTML = IconEye;
        toggleBtn.classList.remove("code-view-toggle-btn--active");
        toggleTooltip.setText(t("Preview Diagram"));
        pre.style.display = "";
        mermaidPreview.style.display = "none";
    }

    // ── 切换代码/预览 ──────────────────────────────────────
    toggleBtn.addEventListener("mousedown", (e) => {
        e.preventDefault(); e.stopPropagation();
        if (isPreviewMode) {
            exitPreviewMode();
        } else {
            enterPreviewMode();
            renderMermaid(node.textContent);
        }
    });

    // ── Mermaid 默认进入预览模式 ──────────────────────────
    if (isMermaid) {
        enterPreviewMode();
        setTimeout(() => renderMermaid(node.textContent), 0);
    }

    // ── 拖拽 pan（鼠标拖拽）──────────────────────────────
    mermaidPreview.addEventListener("mousedown", (e) => {
        if (e.button !== 0 || (e.target as Element).closest("button")) return;
        e.preventDefault(); e.stopPropagation();
        const startX = e.clientX - panX;
        const startY = e.clientY - panY;
        mermaidPreview.classList.add("mermaid-preview--panning");
        const onMove = (ev: MouseEvent) => {
            panX = ev.clientX - startX;
            panY = ev.clientY - startY;
            applyTransform();
        };
        const onUp = () => {
            mermaidPreview.classList.remove("mermaid-preview--panning");
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
    });

    // ── 触控板/滚轮事件 ────────────────────────────────────
    // ctrlKey=true  → Mac 双指捏合（缩放）
    // ctrlKey=false → 双指滑动（拖拽 pan）
    const onPreviewWheel = (e: WheelEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (e.ctrlKey) {
            // 双指捏合：指数平滑缩放，不跳变
            const factor = Math.pow(0.98, e.deltaY);
            const newZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoomLevel * factor));
            // 以鼠标/手指位置为缩放中心
            const rect = mermaidPreview.getBoundingClientRect();
            const mx = e.clientX - rect.left - rect.width / 2;
            const my = e.clientY - rect.top - rect.height / 2;
            const r = newZoom / zoomLevel;
            panX = mx + (panX - mx) * r;
            panY = my + (panY - my) * r;
            zoomLevel = newZoom;
        } else {
            // 双指滑动：直接平移（deltaX 水平，deltaY 垂直）
            panX -= e.deltaX;
            panY -= e.deltaY;
        }
        applyTransform();
    };
    mermaidPreview.addEventListener("wheel", onPreviewWheel, { passive: false });

    // ── Overlay 缩放按钮 ──────────────────────────────────
    overlayZoomOut.addEventListener("mousedown", (e) => {
        e.preventDefault(); e.stopPropagation();
        zoomLevel = Math.max(ZOOM_MIN, zoomLevel - ZOOM_BTN);
        applyTransform();
    });
    overlayZoomIn.addEventListener("mousedown", (e) => {
        e.preventDefault(); e.stopPropagation();
        zoomLevel = Math.min(ZOOM_MAX, zoomLevel + ZOOM_BTN);
        applyTransform();
    });
    overlayZoomVal.addEventListener("mousedown", (e) => {
        e.preventDefault(); e.stopPropagation();
        fitToView();
    });

    // ── 全屏按钮 ───────────────────────────────────────────
    fullscreenBtn.addEventListener("mousedown", (e) => {
        e.preventDefault(); e.stopPropagation();
        if (isMermaid && isPreviewMode) openDiagramLightbox();
        else openCodeLightbox();
    });

    // ── 代码全屏 ───────────────────────────────────────────
    function openCodeLightbox(): void {
        if (lbActiveLightbox) return;
        const overlay = document.createElement("div");
        overlay.className = "mermaid-lightbox";

        const lbHeader = document.createElement("div");
        lbHeader.className = "mermaid-lightbox-header";
        lbHeader.contentEditable = "false";

        const lbTitle = document.createElement("span");
        lbTitle.className = "mermaid-lightbox-title";
        lbTitle.textContent = getLangLabel((node.attrs["language"] as string) || "");

        const lbCopyBtn = makeMermaidBtn(IconCopy, t("Copy Code"));
        const lbCloseBtn = makeMermaidBtn(IconX, t("Close"));

        lbCopyBtn.addEventListener("mousedown", (e) => {
            e.preventDefault(); e.stopPropagation();
            navigator.clipboard?.writeText(codeEl.textContent ?? "").catch(() => {});
            lbCopyBtn.innerHTML = IconCheck;
            setTimeout(() => { lbCopyBtn.innerHTML = IconCopy; }, 1500);
        });

        lbHeader.append(lbTitle, lbCopyBtn, lbCloseBtn);

        const lbBody = document.createElement("div");
        lbBody.className = "mermaid-lightbox-body code-lightbox-body";

        const lbPre = document.createElement("pre");
        lbPre.className = "code-lightbox-pre";
        const lbCode = document.createElement("code");
        lbCode.textContent = codeEl.textContent ?? "";
        const lang = (node.attrs["language"] as string) || "";
        if (lang) lbCode.className = `language-${lang}`;
        lbPre.appendChild(lbCode);
        lbBody.appendChild(lbPre);
        overlay.append(lbHeader, lbBody);
        document.body.appendChild(overlay);
        lbActiveLightbox = overlay;

        function closeLb(): void {
            if (lbActiveLightbox && document.body.contains(lbActiveLightbox))
                document.body.removeChild(lbActiveLightbox);
            lbActiveLightbox = null;
            document.removeEventListener("keydown", onKey);
        }
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); closeLb(); } };
        lbCloseBtn.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); closeLb(); });
        overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) closeLb(); });
        document.addEventListener("keydown", onKey);
    }

    // ── Mermaid 图表全屏 ──────────────────────────────────
    function openDiagramLightbox(): void {
        if (lbActiveLightbox) return;
        if (!svgContainer.querySelector("svg")) return;

        let lbPanX = 0, lbPanY = 0, lbZoom = 1.0;

        const overlay = document.createElement("div");
        overlay.className = "mermaid-lightbox";

        const lbHeader = document.createElement("div");
        lbHeader.className = "mermaid-lightbox-header";
        lbHeader.contentEditable = "false";

        const lbTitle = document.createElement("span");
        lbTitle.className = "mermaid-lightbox-title";
        lbTitle.textContent = "Mermaid";

        const lbZoomOutBtn  = makeMermaidBtn(IconZoomOut, t("Zoom Out"));
        const lbZoomResetBtn = document.createElement("button");
        lbZoomResetBtn.className = "mermaid-zoom-btn";
        lbZoomResetBtn.tabIndex = -1;
        lbZoomResetBtn.textContent = "100%";
        applyTooltip(lbZoomResetBtn, t("Reset Zoom"), { placement: "above" });
        const lbZoomInBtn = makeMermaidBtn(IconZoomIn, t("Zoom In"));
        const lbCloseBtn  = makeMermaidBtn(IconX, t("Close"));

        lbHeader.append(lbTitle, lbZoomOutBtn, lbZoomResetBtn, lbZoomInBtn, lbCloseBtn);

        const lbBody = document.createElement("div");
        lbBody.className = "mermaid-lightbox-body";

        const lbSvgContainer = document.createElement("div");
        lbSvgContainer.className = "mermaid-lightbox-svg";
        lbSvgContainer.innerHTML = svgContainer.innerHTML;

        const lbSvgEl = lbSvgContainer.querySelector("svg");
        if (lbSvgEl) lbSvgEl.style.display = "block";

        lbBody.appendChild(lbSvgContainer);
        overlay.append(lbHeader, lbBody);
        document.body.appendChild(overlay);
        lbActiveLightbox = overlay;

        function applyLbTransform(): void {
            lbSvgContainer.style.transform = `translate(${lbPanX}px, ${lbPanY}px) scale(${lbZoom})`;
            lbZoomResetBtn.textContent = `${Math.round(lbZoom * 100)}%`;
        }

        // 自动适配全屏
        requestAnimationFrame(() => {
            const svgEl2 = lbSvgContainer.querySelector("svg");
            if (!svgEl2) return;
            const bW = lbBody.clientWidth, bH = lbBody.clientHeight;
            const sW = parseFloat(svgEl2.getAttribute("width") ?? "0");
            const sH = parseFloat(svgEl2.getAttribute("height") ?? "0");
            if (sW && sH && bW && bH) {
                lbZoom = Math.min((bW - 80) / sW, (bH - 80) / sH, ZOOM_MAX);
                lbZoom = Math.max(ZOOM_MIN, lbZoom);
                applyLbTransform();
            }
        });

        lbBody.addEventListener("mousedown", (e) => {
            if (e.button !== 0 || (e.target as Element).closest("button")) return;
            e.preventDefault();
            const sx = e.clientX - lbPanX, sy = e.clientY - lbPanY;
            lbBody.style.cursor = "grabbing";
            const onMove = (ev: MouseEvent) => { lbPanX = ev.clientX - sx; lbPanY = ev.clientY - sy; applyLbTransform(); };
            const onUp = () => { lbBody.style.cursor = "grab"; document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup", onUp);
        });

        lbBody.addEventListener("wheel", (e) => {
            e.preventDefault();
            let nz: number;
            if (e.ctrlKey) {
                nz = lbZoom * Math.pow(0.98, e.deltaY);
            } else {
                lbPanX -= e.deltaX;
                lbPanY -= e.deltaY;
                applyLbTransform();
                return;
            }
            nz = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, nz));
            const rect = lbBody.getBoundingClientRect();
            const mx = e.clientX - rect.left - rect.width / 2;
            const my = e.clientY - rect.top - rect.height / 2;
            const r = nz / lbZoom;
            lbPanX = mx + (lbPanX - mx) * r;
            lbPanY = my + (lbPanY - my) * r;
            lbZoom = nz;
            applyLbTransform();
        }, { passive: false });

        lbZoomInBtn.addEventListener("mousedown", (e) => {
            e.preventDefault(); e.stopPropagation();
            lbZoom = Math.min(ZOOM_MAX, lbZoom + ZOOM_BTN); applyLbTransform();
        });
        lbZoomOutBtn.addEventListener("mousedown", (e) => {
            e.preventDefault(); e.stopPropagation();
            lbZoom = Math.max(ZOOM_MIN, lbZoom - ZOOM_BTN); applyLbTransform();
        });
        lbZoomResetBtn.addEventListener("mousedown", (e) => {
            e.preventDefault(); e.stopPropagation();
            lbPanX = 0; lbPanY = 0; lbZoom = 1.0; applyLbTransform();
        });

        function closeLb(): void {
            if (lbActiveLightbox && document.body.contains(lbActiveLightbox))
                document.body.removeChild(lbActiveLightbox);
            lbActiveLightbox = null;
            document.removeEventListener("keydown", onLbKey);
        }
        const onLbKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); closeLb(); } };
        lbCloseBtn.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); closeLb(); });
        overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) closeLb(); });
        document.addEventListener("keydown", onLbKey);
    }

    return {
        dom: wrapper,
        contentDOM: codeEl,

        update(updatedNode: PMNode): boolean {
            if (updatedNode.type !== node.type) return false;

            const newLang = (updatedNode.attrs["language"] as string) || "";
            const wasM = isMermaid;
            isMermaid = newLang === "mermaid";

            picker.update(newLang);
            codeEl.className = newLang ? `language-${newLang}` : "";
            node = updatedNode;
            updateLineNumbers(lineGutter, updatedNode.textContent);

            if (!wasM && isMermaid) {
                toggleBtn.style.display = "inline-flex";
                // 切换到 mermaid 语言时默认进入预览模式
                enterPreviewMode();
                setTimeout(() => renderMermaid(updatedNode.textContent), 0);
            }
            if (wasM && !isMermaid) {
                toggleBtn.style.display = "none";
                exitPreviewMode();
                lastRenderedCode = "";
            }
            if (isMermaid && isPreviewMode) {
                if (renderTimer) clearTimeout(renderTimer);
                renderTimer = setTimeout(() => renderMermaid(updatedNode.textContent), 600);
            }
            return true;
        },

        ignoreMutation(mutation: ViewMutationRecord): boolean {
            if (mutation.type === "selection") return false;
            return (
                !codeEl.contains(mutation.target as Node) &&
                mutation.target !== codeEl
            );
        },

        destroy(): void {
            picker.destroy();
            if (copyRestoreTimer) clearTimeout(copyRestoreTimer);
            if (renderTimer) clearTimeout(renderTimer);
            mermaidPreview.removeEventListener("wheel", onPreviewWheel);
            if (lbActiveLightbox && document.body.contains(lbActiveLightbox)) {
                document.body.removeChild(lbActiveLightbox);
                lbActiveLightbox = null;
            }
        },
    };
}
