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
} from "@/ui/icons";
import { applyTooltip, hideTooltip } from "@/ui/tooltip";
import { t } from "@/i18n";
import mermaid from "mermaid";
import { highlight } from "@/highlighter";
import { lockBodyScroll, unlockBodyScroll, animateCloseLightbox, bindLightboxDismiss } from "@/utils";
import { createButton } from "@/ui/dom";
import './codeBlock.css';

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
        // 禁用 Mermaid 为 SVG 设置 max-width:100%，避免与我们写回的固定 width/height 属性冲突
        flowchart: { useMaxWidth: false },
        sequence: { useMaxWidth: false },
        gantt: { useMaxWidth: false },
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
    let naturalSvgW = 0, naturalSvgH = 0; // SVG viewBox 自然尺寸（固定不变）
    const ZOOM_MIN = 0.05, ZOOM_MAX = 10.0, ZOOM_BTN = 0.25;
    const PAN_STEP = 80;
    let lbActiveLightbox: HTMLElement | null = null;
    // 当前缩放百分比显示元素（overlay 中间）
    let zoomValueDisplay: HTMLButtonElement | null = null;

    function makeMermaidBtn(icon: string, tipText: string, extraClass = ""): HTMLButtonElement {
        return createButton({
            className: "mermaid-zoom-btn" + (extraClass ? ` ${extraClass}` : ""),
            icon,
            tabIndex: -1,
            title: tipText,
            tooltipPlacement: "above",
        });
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

            if (!naturalSvgW || !naturalSvgH) return;

            const padding = 40;
            const scaleX = (containerW - padding) / naturalSvgW;
            const scaleY = (containerH - padding) / naturalSvgH;
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
        naturalSvgW = 0; naturalSvgH = 0;
        svgContainer.innerHTML = `<div class="mermaid-loading">${t("Rendering...")}</div>`;

        // svgContainer 是 inline-block，loading div 绝对定位不占空间 → clientWidth=0。
        // 渲染前临时设置宽度，让 Mermaid（尤其是甘特图）以正确宽度布局。
        const renderWidth = mermaidPreview.clientWidth || 800;
        svgContainer.style.width = renderWidth + "px";

        // 传入 svgContainer 作为第三参数：mermaid 改用 hidden div（不可见），
        // 不再向 body 注入可见错误元素（bomb icon），且渲染完成后自动移除 hidden div
        const id = `mmid-${Math.random().toString(36).slice(2, 9)}`;
        try {
            const { svg } = await mermaid.render(id, code, svgContainer);
            svgContainer.innerHTML = svg;
            const svgEl = svgContainer.querySelector("svg");
            if (svgEl) {
                svgEl.style.display = "block";
                // 多级 fallback 读取自然尺寸（svgContainer.style.width 此时仍为 renderWidth，
                // 确保甘特图等 width="100%" 的 SVG 在真实宽度下计算 clientWidth）
                let nw = 0, nh = 0;
                // 1. viewBox（最精确）
                const vb = svgEl.getAttribute("viewBox");
                if (vb) {
                    const parts = vb.trim().split(/[\s,]+/);
                    if (parts.length >= 4) {
                        nw = parseFloat(parts[2]);
                        nh = parseFloat(parts[3]);
                    }
                }
                // 2. 显式 width/height 属性（排除 "100%" 等百分比值）
                if (!nw) {
                    const wa = svgEl.getAttribute("width");
                    if (wa && !wa.includes("%")) nw = parseFloat(wa);
                }
                if (!nh) {
                    const ha = svgEl.getAttribute("height");
                    if (ha && !ha.includes("%")) nh = parseFloat(ha);
                }
                // 3. 浏览器实际渲染尺寸（svgContainer 宽度还在，clientWidth 有效）
                if (!nw) nw = svgEl.clientWidth || renderWidth;
                if (!nh) nh = svgEl.clientHeight || 400;
                naturalSvgW = nw;
                naturalSvgH = nh;
                // 将自然尺寸写回 SVG 属性，确保 CSS scale 以固定像素尺寸为基准
                // （若 Mermaid 输出 width="100%"，不写回则 CSS scale 会以容器宽度为基准，导致缩放错误）
                svgEl.setAttribute("width", String(nw));
                svgEl.setAttribute("height", String(nh));
                // 清除 Mermaid 可能附加的 max-width:100%;height:auto 内联样式
                // 否则会覆盖上方写入的 width/height 属性，导致 SVG 以容器宽度渲染
                svgEl.style.maxWidth = "none";
                svgEl.style.height = "";
                // 清除临时渲染宽度（已读取完尺寸）
                svgContainer.style.width = "";
                // ── 自适应容器高度 ──────────────────────────────────
                // 以"填满宽度"缩放比估算合适的容器高度，高图表自动扩展
                // fitWidthScale 限制 ≤1.0，不对小图放大
                const availableW = mermaidPreview.clientWidth || 800;
                const fitWidthScale = Math.min((availableW - 40) / nw, 1.0);
                const idealH = nh * fitWidthScale + 80; // 上下各 40px padding
                const maxH = Math.min(window.innerHeight * 0.92, 2000);
                const finalH = Math.max(300, Math.min(Math.ceil(idealH), maxH));
                mermaidPreview.style.height = finalH + "px";
                mermaidPreview.style.minHeight = finalH + "px";
                // ─────────────────────────────────────────────────────
            } else {
                svgContainer.style.width = "";
            }
            lastRenderedCode = code;
            fitToView();
        } catch (err) {
            svgContainer.style.width = ""; // 出错时同样还原
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
    // 内联预览只响应 ctrlKey=true（Mac 双指捏合缩放），普通滚动透传给页面。
    // 全屏预览（openDiagramLightbox）仍保留滚轮平移+缩放。
    const onPreviewWheel = (e: WheelEvent) => {
        if (!e.ctrlKey) return; // 普通滚动不拦截，让页面正常滚动
        e.preventDefault();
        e.stopPropagation();
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

    // ── 代码全屏（可编辑 + 语法高亮） ─────────────────────────
    function openCodeLightbox(): void {
        if (lbActiveLightbox) return;
        const overlay = document.createElement("div");
        overlay.className = "mermaid-lightbox code-editor-lightbox";

        const lbHeader = document.createElement("div");
        lbHeader.className = "mermaid-lightbox-header";
        lbHeader.contentEditable = "false";

        const lang = (node.attrs["language"] as string) || "";
        const lbTitle = document.createElement("span");
        lbTitle.className = "mermaid-lightbox-title";
        lbTitle.textContent = getLangLabel(lang);

        const lbCopyBtn = makeMermaidBtn(IconCopy, t("Copy Code"));
        const lbCloseBtn = makeMermaidBtn(IconX, t("Close"));

        lbHeader.append(lbTitle, lbCopyBtn, lbCloseBtn);

        // ── 编辑器主体：行号区 + 代码区（高亮 pre + textarea 叠加）
        const lbBody = document.createElement("div");
        lbBody.className = "mermaid-lightbox-body code-lightbox-body";

        // 行号栏
        const gutter = document.createElement("div");
        gutter.className = "code-lightbox-gutter";
        gutter.setAttribute("aria-hidden", "true");

        // 代码区（pre 高亮层 + textarea 输入层）
        const codeArea = document.createElement("div");
        codeArea.className = "code-lightbox-editor-wrap";

        const pre = document.createElement("pre");
        pre.className = "code-lightbox-pre";
        pre.setAttribute("aria-hidden", "true");
        const codeClone = document.createElement("code");
        if (lang) codeClone.className = `language-${lang}`;
        pre.appendChild(codeClone);

        const textarea = document.createElement("textarea");
        textarea.className = "code-lightbox-textarea";
        textarea.spellcheck = false;
        textarea.autocomplete = "off";
        textarea.setAttribute("autocorrect", "off");
        textarea.setAttribute("autocapitalize", "off");

        const rawCode = codeEl.textContent ?? "";
        textarea.value = rawCode;
        codeClone.innerHTML = highlight(rawCode, lang);

        codeArea.append(pre, textarea);
        lbBody.append(gutter, codeArea);
        overlay.append(lbHeader, lbBody);
        document.body.appendChild(overlay);
        lockBodyScroll();
        lbActiveLightbox = overlay;

        // ── 行号更新
        const updateGutter = (): void => {
            const lines = textarea.value.split("\n");
            const count = Math.max(1, lines.length);
            while (gutter.childElementCount < count) gutter.appendChild(document.createElement("span"));
            while (gutter.childElementCount > count) gutter.removeChild(gutter.lastChild!);
            Array.from(gutter.children).forEach((el, i) => {
                (el as HTMLElement).textContent = String(i + 1);
            });
        };
        updateGutter();

        // 自动聚焦
        requestAnimationFrame(() => textarea.focus());

        // ── 实时高亮 + 行号 + 滚动同步
        const updateHighlight = (): void => {
            codeClone.innerHTML = highlight(textarea.value, lang);
            updateGutter();
            pre.scrollTop = textarea.scrollTop;
            pre.scrollLeft = textarea.scrollLeft;
            gutter.scrollTop = textarea.scrollTop;
        };
        textarea.addEventListener("input", updateHighlight);
        textarea.addEventListener("scroll", () => {
            pre.scrollTop = textarea.scrollTop;
            pre.scrollLeft = textarea.scrollLeft;
            gutter.scrollTop = textarea.scrollTop;
        });

        // Tab 键插入 4 空格（不跳焦）
        textarea.addEventListener("keydown", (e) => {
            if (e.key === "Tab") {
                e.preventDefault();
                const s = textarea.selectionStart;
                const end = textarea.selectionEnd;
                textarea.value = textarea.value.slice(0, s) + "    " + textarea.value.slice(end);
                textarea.selectionStart = textarea.selectionEnd = s + 4;
                updateHighlight();
            }
        });

        // ── 复制当前 textarea 内容
        lbCopyBtn.addEventListener("mousedown", (e) => {
            e.preventDefault(); e.stopPropagation();
            navigator.clipboard?.writeText(textarea.value).catch(() => {});
            lbCopyBtn.innerHTML = IconCheck;
            setTimeout(() => { lbCopyBtn.innerHTML = IconCopy; }, 1500);
        });

        // ── 关闭（带淡出动画 + 写回 ProseMirror）
        function closeLb(): void {
            const newCode = textarea.value;
            const originalCode = codeEl.textContent ?? "";
            if (newCode !== originalCode) {
                const pos = getPos();
                if (pos !== undefined) {
                    const n = view.state.doc.nodeAt(pos);
                    if (n) {
                        view.dispatch(
                            view.state.tr.replaceWith(
                                pos + 1,
                                pos + n.nodeSize - 1,
                                newCode ? view.state.schema.text(newCode) : [],
                            )
                        );
                    }
                }
            }
            unlockBodyScroll();
            animateCloseLightbox(overlay, () => {
                lbActiveLightbox = null;
                removeKeyListener();
            });
        }

        const removeKeyListener = bindLightboxDismiss(overlay, lbCloseBtn, closeLb);
    }

    // ── Mermaid 图表全屏 ──────────────────────────────────
    function openDiagramLightbox(): void {
        if (lbActiveLightbox) return;
        if (!svgContainer.querySelector("svg")) return;

        let lbPanX = 0, lbPanY = 0, lbZoom = 1.0;
        let lbIsCodeMode = false;
        const originalCode = codeEl.textContent ?? "";

        // ── Overlay ───────────────────────────────────────────
        const overlay = document.createElement("div");
        overlay.className = "mermaid-lightbox";

        // ── Header ────────────────────────────────────────────
        const lbHeader = document.createElement("div");
        lbHeader.className = "mermaid-lightbox-header";
        lbHeader.contentEditable = "false";

        const lbTitle = document.createElement("span");
        lbTitle.className = "mermaid-lightbox-title";
        lbTitle.textContent = "Mermaid";

        const lbToggleBtn = document.createElement("button");
        lbToggleBtn.className = "mermaid-zoom-btn";
        lbToggleBtn.tabIndex = -1;
        lbToggleBtn.innerHTML = IconCode;
        const lbToggleTip = applyTooltip(lbToggleBtn, t("Edit Code"), { placement: "above" });
        const lbZoomOutBtn  = makeMermaidBtn(IconZoomOut, t("Zoom Out"));
        const lbZoomResetBtn = document.createElement("button");
        lbZoomResetBtn.className = "mermaid-zoom-btn";
        lbZoomResetBtn.tabIndex = -1;
        lbZoomResetBtn.textContent = "100%";
        applyTooltip(lbZoomResetBtn, t("Reset Zoom"), { placement: "above" });
        const lbZoomInBtn = makeMermaidBtn(IconZoomIn, t("Zoom In"));
        const lbCloseBtn  = makeMermaidBtn(IconX, t("Close"));

        lbHeader.append(lbTitle, lbToggleBtn, lbZoomOutBtn, lbZoomResetBtn, lbZoomInBtn, lbCloseBtn);

        // ── Body ──────────────────────────────────────────────
        const lbBody = document.createElement("div");
        lbBody.className = "mermaid-lightbox-body";

        // 预览面板
        const lbPreviewPane = document.createElement("div");
        lbPreviewPane.className = "lb-mermaid-preview-pane";

        const lbSvgContainer = document.createElement("div");
        lbSvgContainer.className = "mermaid-lightbox-svg";
        lbSvgContainer.innerHTML = svgContainer.innerHTML;
        const lbSvgEl = lbSvgContainer.querySelector("svg");
        if (lbSvgEl) lbSvgEl.style.display = "block";
        lbPreviewPane.appendChild(lbSvgContainer);

        // 代码编辑面板（复用 code lightbox 结构）
        const lbCodePane = document.createElement("div");
        lbCodePane.className = "lb-mermaid-code-pane";

        const gutter = document.createElement("div");
        gutter.className = "code-lightbox-gutter";
        gutter.setAttribute("aria-hidden", "true");

        const codeArea = document.createElement("div");
        codeArea.className = "code-lightbox-editor-wrap";

        const lbPre = document.createElement("pre");
        lbPre.className = "code-lightbox-pre";
        lbPre.setAttribute("aria-hidden", "true");
        const lbCodeEl = document.createElement("code");
        lbCodeEl.className = "language-mermaid";
        lbPre.appendChild(lbCodeEl);

        const textarea = document.createElement("textarea");
        textarea.className = "code-lightbox-textarea";
        textarea.spellcheck = false;
        textarea.autocomplete = "off";
        textarea.setAttribute("autocorrect", "off");
        textarea.setAttribute("autocapitalize", "off");
        textarea.value = originalCode;
        lbCodeEl.innerHTML = highlight(originalCode, "mermaid");

        codeArea.append(lbPre, textarea);
        lbCodePane.append(gutter, codeArea);

        lbBody.append(lbPreviewPane, lbCodePane);
        overlay.append(lbHeader, lbBody);
        document.body.appendChild(overlay);
        lockBodyScroll();
        lbActiveLightbox = overlay;

        // ── 行号 ──────────────────────────────────────────────
        const updateGutter = (): void => {
            const lines = textarea.value.split("\n");
            const count = Math.max(1, lines.length);
            while (gutter.childElementCount < count) gutter.appendChild(document.createElement("span"));
            while (gutter.childElementCount > count) gutter.removeChild(gutter.lastChild!);
            Array.from(gutter.children).forEach((el, i) => {
                (el as HTMLElement).textContent = String(i + 1);
            });
        };
        updateGutter();

        // ── 实时高亮 + 滚动同步 ──────────────────────────────
        const updateHighlight = (): void => {
            lbCodeEl.innerHTML = highlight(textarea.value, "mermaid");
            updateGutter();
            lbPre.scrollTop = textarea.scrollTop;
            lbPre.scrollLeft = textarea.scrollLeft;
            gutter.scrollTop = textarea.scrollTop;
        };
        textarea.addEventListener("input", updateHighlight);
        textarea.addEventListener("scroll", () => {
            lbPre.scrollTop = textarea.scrollTop;
            lbPre.scrollLeft = textarea.scrollLeft;
            gutter.scrollTop = textarea.scrollTop;
        });
        textarea.addEventListener("keydown", (e) => {
            if (e.key === "Tab") {
                e.preventDefault();
                const s = textarea.selectionStart, end = textarea.selectionEnd;
                textarea.value = textarea.value.slice(0, s) + "    " + textarea.value.slice(end);
                textarea.selectionStart = textarea.selectionEnd = s + 4;
                updateHighlight();
            }
        });

        // ── 预览区 transform ──────────────────────────────────
        function applyLbTransform(): void {
            lbSvgContainer.style.transform = `translate(${lbPanX}px, ${lbPanY}px) scale(${lbZoom})`;
            lbZoomResetBtn.textContent = `${Math.round(lbZoom * 100)}%`;
        }

        function fitLbView(): void {
            const svgEl2 = lbSvgContainer.querySelector("svg");
            if (!svgEl2) return;
            const bW = lbPreviewPane.clientWidth, bH = lbPreviewPane.clientHeight;
            const sW = parseFloat(svgEl2.getAttribute("width") ?? "0");
            const sH = parseFloat(svgEl2.getAttribute("height") ?? "0");
            if (sW && sH && bW && bH) {
                lbPanX = 0; lbPanY = 0;
                lbZoom = Math.max(ZOOM_MIN, Math.min((bW - 80) / sW, (bH - 80) / sH, ZOOM_MAX));
                applyLbTransform();
            }
        }

        requestAnimationFrame(fitLbView);

        // ── Lightbox 内部 Mermaid 渲染 ────────────────────────
        async function renderLbMermaid(code: string): Promise<void> {
            ensureMermaid();
            lbSvgContainer.innerHTML = `<div class="mermaid-loading">${t("Rendering...")}</div>`;
            const id = `lbmm-${Math.random().toString(36).slice(2, 9)}`;
            const hidden = document.createElement("div");
            hidden.style.cssText = "position:absolute;visibility:hidden;pointer-events:none";
            document.body.appendChild(hidden);
            try {
                const { svg } = await mermaid.render(id, code, hidden);
                lbSvgContainer.innerHTML = svg;
                const svgEl = lbSvgContainer.querySelector("svg");
                if (svgEl) {
                    const vb = svgEl.getAttribute("viewBox");
                    if (vb) {
                        const parts = vb.trim().split(/[\s,]+/);
                        if (parts.length >= 4) {
                            const w = parseFloat(parts[2]), h = parseFloat(parts[3]);
                            if (w && h) { svgEl.setAttribute("width", String(w)); svgEl.setAttribute("height", String(h)); }
                        }
                    }
                    svgEl.style.display = "block";
                }
                requestAnimationFrame(fitLbView);
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                lbSvgContainer.innerHTML = `<div class="mermaid-error"><span>${IconAlertCircle}</span><pre class="mermaid-error-msg">${escapeHtml(msg)}</pre></div>`;
            } finally {
                if (document.body.contains(hidden)) document.body.removeChild(hidden);
            }
        }

        // ── 切换代码 / 预览 ───────────────────────────────────
        function switchToCodeMode(): void {
            lbIsCodeMode = true;
            lbPreviewPane.style.display = "none";
            lbCodePane.style.display = "flex";
            [lbZoomOutBtn, lbZoomResetBtn, lbZoomInBtn].forEach(b => (b.style.display = "none"));
            lbToggleBtn.innerHTML = IconEye;
            lbToggleTip.setText(t("Preview Diagram"));
            hideTooltip();
            requestAnimationFrame(() => textarea.focus());
        }

        function switchToPreviewMode(): void {
            lbIsCodeMode = false;
            lbPreviewPane.style.display = "";
            lbCodePane.style.display = "none";
            [lbZoomOutBtn, lbZoomResetBtn, lbZoomInBtn].forEach(b => (b.style.display = ""));
            lbToggleBtn.innerHTML = IconCode;
            lbToggleTip.setText(t("Edit Code"));
            hideTooltip();
            if (textarea.value !== originalCode) renderLbMermaid(textarea.value);
        }

        lbToggleBtn.addEventListener("mousedown", (e) => {
            e.preventDefault(); e.stopPropagation();
            if (lbIsCodeMode) switchToPreviewMode(); else switchToCodeMode();
        });

        // ── 预览区交互（拖拽平移 + 滚轮缩放）────────────────
        lbPreviewPane.addEventListener("mousedown", (e) => {
            if (e.button !== 0 || (e.target as Element).closest("button")) return;
            e.preventDefault();
            const sx = e.clientX - lbPanX, sy = e.clientY - lbPanY;
            lbPreviewPane.style.cursor = "grabbing";
            const onMove = (ev: MouseEvent) => { lbPanX = ev.clientX - sx; lbPanY = ev.clientY - sy; applyLbTransform(); };
            const onUp = () => { lbPreviewPane.style.cursor = "grab"; document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup", onUp);
        });

        lbPreviewPane.addEventListener("wheel", (e) => {
            e.preventDefault();
            if (e.ctrlKey) {
                let nz = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, lbZoom * Math.pow(0.98, e.deltaY)));
                const rect = lbPreviewPane.getBoundingClientRect();
                const mx = e.clientX - rect.left - rect.width / 2;
                const my = e.clientY - rect.top - rect.height / 2;
                const r = nz / lbZoom;
                lbPanX = mx + (lbPanX - mx) * r;
                lbPanY = my + (lbPanY - my) * r;
                lbZoom = nz;
            } else {
                lbPanX -= e.deltaX;
                lbPanY -= e.deltaY;
            }
            applyLbTransform();
        }, { passive: false });

        lbZoomInBtn.addEventListener("mousedown",  (e) => { e.preventDefault(); e.stopPropagation(); lbZoom = Math.min(ZOOM_MAX, lbZoom + ZOOM_BTN); applyLbTransform(); });
        lbZoomOutBtn.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); lbZoom = Math.max(ZOOM_MIN, lbZoom - ZOOM_BTN); applyLbTransform(); });
        lbZoomResetBtn.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); lbPanX = 0; lbPanY = 0; lbZoom = 1.0; applyLbTransform(); });

        // ── 关闭（写回 ProseMirror）──────────────────────────
        function closeLb(): void {
            const newCode = textarea.value;
            if (newCode !== originalCode) {
                const pos = getPos();
                if (pos !== undefined) {
                    const n = view.state.doc.nodeAt(pos);
                    if (n) {
                        view.dispatch(
                            view.state.tr.replaceWith(
                                pos + 1,
                                pos + n.nodeSize - 1,
                                newCode ? view.state.schema.text(newCode) : [],
                            )
                        );
                    }
                }
            }
            unlockBodyScroll();
            animateCloseLightbox(overlay, () => {
                lbActiveLightbox = null;
                removeKeyListener();
            });
        }

        const removeKeyListener = bindLightboxDismiss(overlay, lbCloseBtn, closeLb);
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
