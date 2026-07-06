import "./findBar.css";
import { createButton } from "@/ui/dom";
import { t, kbd } from "@/i18n";
import type { EditorView } from "@milkdown/prose/view";

declare class Highlight {
    constructor(...ranges: Range[]);
}
declare namespace CSS {
    const highlights: Map<string, Highlight>;
}

export interface FindBarController {
    open(initialQuery?: string): void;
    close(): void;
    isOpen(): boolean;
    refresh(): void;
}

export function initFindBar(
    getEditorEl: () => HTMLElement | null,
    getEditorView: () => EditorView | null,
): FindBarController {
    // ── DOM 结构 ─────────────────────────────────────────
    const widget = document.createElement("div");
    widget.className = "find-widget";
    widget.setAttribute("role", "search");

    // ── 拖拽手柄 ──────────────────────────────────────────
    const dragHandle = document.createElement("div");
    dragHandle.className = "find-widget__drag-handle";
    dragHandle.title = t("Drag to resize");

    // ── 替换区展开按钮 ──────────────────────────────────
    const btnToggleReplace = document.createElement("button");
    btnToggleReplace.className = "icon-btn find-widget__toggle-replace";
    btnToggleReplace.classList.add("codicon", "codicon-chevron-right");
    btnToggleReplace.title = t("Toggle Replace");
    btnToggleReplace.setAttribute("aria-label", t("Toggle Replace"));
    btnToggleReplace.setAttribute("aria-expanded", "false");

    // ── 内容区（查找行+替换行） ─────────────────────────
    const contentArea = document.createElement("div");
    contentArea.className = "find-widget__content";

    // ── 查找行 ──────────────────────────────────────────
    const findRow = document.createElement("div");
    findRow.className = "find-widget__row";

    const inputWrapper = document.createElement("div");
    inputWrapper.className = "find-widget__input-wrapper";

    const input = document.createElement("input");
    input.className = "find-widget__input find-widget__input--has-actions";
    input.type = "text";
    input.placeholder = t("Find");
    input.setAttribute("aria-label", t("Find"));
    input.spellcheck = false;
    input.autocomplete = "off";

    const inputActions = document.createElement("div");
    inputActions.className = "find-widget__input-actions";

    const btnRegex = createButton({
        className: "icon-btn find-widget__btn--disabled",
        icon: "regex",
        title: t("Use Regular Expression"),
    });
    btnRegex.setAttribute("aria-label", t("Use Regular Expression"));
    btnRegex.setAttribute("aria-pressed", "false");

    const btnCase = createButton({
        className: "icon-btn find-widget__btn--disabled",
        label: "Aa",
        title: t("Match Case"),
    });
    btnCase.setAttribute("aria-label", t("Match Case"));
    btnCase.setAttribute("aria-pressed", "false");

    inputActions.append(btnRegex, btnCase);
    inputWrapper.append(input, inputActions);

    const count = document.createElement("span");
    count.className = "find-widget__count";

    const btnPrev = createButton({
        className: "icon-btn find-widget__btn--disabled",
        icon: "chevron-up",
        title: `${t("Previous Match")} (${kbd("Shift-Enter")})`,
    });
    btnPrev.setAttribute("aria-label", t("Previous Match"));

    const btnNext = createButton({
        className: "icon-btn find-widget__btn--disabled",
        icon: "chevron-down",
        title: `${t("Next Match")} (Enter)`,
    });
    btnNext.setAttribute("aria-label", t("Next Match"));

    const btnClose = createButton({
        className: "icon-btn find-widget__close",
        icon: "close",
        title: `${t("Close")} (Esc)`,
    });
    btnClose.setAttribute("aria-label", t("Close"));

    findRow.append(inputWrapper, count, btnPrev, btnNext, btnClose);

    // ── 替换行 ──────────────────────────────────────────
    const replaceRow = document.createElement("div");
    replaceRow.className = "find-widget__replace";

    const replaceInner = document.createElement("div");
    replaceInner.className = "find-widget__replace-inner";

    const replaceInputWrapper = document.createElement("div");
    replaceInputWrapper.className = "find-widget__input-wrapper";

    const replaceInput = document.createElement("input");
    replaceInput.className = "find-widget__input";
    replaceInput.type = "text";
    replaceInput.placeholder = t("Replace");
    replaceInput.setAttribute("aria-label", t("Replace"));
    replaceInput.spellcheck = false;
    replaceInput.autocomplete = "off";

    replaceInputWrapper.append(replaceInput);

    const btnReplace = createButton({
        className: "icon-btn spacing find-widget__btn--disabled",
        icon: "replace",
        title: t("Replace"),
    });
    btnReplace.setAttribute("aria-label", t("Replace"));

    const btnReplaceAll = createButton({
        className: "icon-btn spacing find-widget__btn--disabled",
        icon: "replace-all",
        title: t("Replace All"),
    });
    btnReplaceAll.setAttribute("aria-label", t("Replace All"));

    const replaceTailSpacer = document.createElement("div");
    replaceTailSpacer.className = "find-widget__replace-tail-spacer";

    replaceInner.append(replaceInputWrapper, btnReplace, btnReplaceAll, replaceTailSpacer);
    replaceRow.append(replaceInner);

    contentArea.append(findRow, replaceRow);
    widget.append(dragHandle, btnToggleReplace, contentArea);
    document.body.appendChild(widget);

    // ── 状态 ─────────────────────────────────────────────
    let visible = false;
    let caseSensitive = false;
    let useRegex = false;
    let replaceVisible = false;
    let regexError = false;
    let matchRanges: Range[] = [];
    let currentIdx = 0;
    let debounceTimer = 0;

    // ── 按钮禁用状态管理 ─────────────────────────────────
    function updateButtonStates() {
        const hasQuery = input.value.length > 0;
        const hasMatches = matchRanges.length > 0;

        btnRegex.classList.toggle("find-widget__btn--disabled", false);
        btnCase.classList.toggle("find-widget__btn--disabled", false);

        const navDisabled = !hasQuery || !hasMatches;
        btnPrev.classList.toggle("find-widget__btn--disabled", navDisabled);
        btnNext.classList.toggle("find-widget__btn--disabled", navDisabled);

        const replaceDisabled = !hasQuery || !hasMatches;
        btnReplace.classList.toggle("find-widget__btn--disabled", replaceDisabled);
        btnReplaceAll.classList.toggle("find-widget__btn--disabled", replaceDisabled);
    }

    // ── 高亮更新 ─────────────────────────────────────────
    function updateHighlights() {
        if (!("highlights" in CSS)) { return; }
        if (!matchRanges.length) {
            CSS.highlights.delete("find-highlight");
            CSS.highlights.delete("find-highlight-current");
            return;
        }
        CSS.highlights.set("find-highlight", new Highlight(...matchRanges));
        if (matchRanges[currentIdx]) {
            CSS.highlights.set("find-highlight-current", new Highlight(matchRanges[currentIdx]));
        }
    }

    function clearHighlights() {
        if (!("highlights" in CSS)) { return; }
        CSS.highlights.delete("find-highlight");
        CSS.highlights.delete("find-highlight-current");
    }

    // ── 搜索 ──────────────────────────────────────────────
    function search(query: string) {
        matchRanges = [];
        currentIdx = 0;
        regexError = false;

        if (!query) {
            count.textContent = "";
            widget.classList.remove("find-widget--no-results", "find-widget--regex-error");
            updateHighlights();
            updateButtonStates();
            return;
        }

        const editorEl = getEditorEl();
        if (!editorEl) { return; }

        const walker = document.createTreeWalker(editorEl, NodeFilter.SHOW_TEXT);
        let node: Text | null;

        if (useRegex) {
            let re: RegExp;
            try {
                re = new RegExp(query, caseSensitive ? "g" : "gi");
            } catch {
                regexError = true;
                count.textContent = t("Invalid regular expression");
                widget.classList.add("find-widget--no-results", "find-widget--regex-error");
                updateHighlights();
                updateButtonStates();
                return;
            }

            while ((node = walker.nextNode() as Text | null)) {
                const text = node.textContent!;
                let m: RegExpExecArray | null;
                re.lastIndex = 0;
                while ((m = re.exec(text)) !== null) {
                    const r = new Range();
                    r.setStart(node, m.index);
                    r.setEnd(node, m.index + m[0].length);
                    matchRanges.push(r);
                    if (m[0].length === 0) { re.lastIndex++; }
                }
            }
        } else {
            const q = caseSensitive ? query : query.toLowerCase();
            while ((node = walker.nextNode() as Text | null)) {
                const text = caseSensitive ? node.textContent! : node.textContent!.toLowerCase();
                let idx = 0;
                while (idx < text.length) {
                    const found = text.indexOf(q, idx);
                    if (found === -1) { break; }
                    const r = new Range();
                    r.setStart(node, found);
                    r.setEnd(node, found + query.length);
                    matchRanges.push(r);
                    idx = found + 1;
                }
            }
        }

        if (matchRanges.length) {
            count.textContent = `1/${matchRanges.length}`;
            widget.classList.remove("find-widget--no-results", "find-widget--regex-error");
            scrollToMatch(0);
        } else {
            count.textContent = t("No results");
            widget.classList.add("find-widget--no-results");
        }
        updateHighlights();
        updateButtonStates();
    }

    function scrollToMatch(idx: number) {
        if (!matchRanges[idx]) { return; }
        currentIdx = idx;
        count.textContent = `${currentIdx + 1}/${matchRanges.length}`;
        updateHighlights();
        const r = matchRanges[idx];
        const node = r.startContainer;
        const el = node instanceof Element ? node : (node as ChildNode).parentElement;
        if (el) {
            const topbarH = document.querySelector(".editor-topbar")?.getBoundingClientRect().height ?? 40;
            const rect = el.getBoundingClientRect();
            if (rect.top < topbarH + 8 || rect.bottom > window.innerHeight - 8) {
                window.scrollTo({ top: rect.top + window.scrollY - topbarH - 60 });
            }
        }
    }

    function goNext() {
        if (!matchRanges.length) { return; }
        scrollToMatch((currentIdx + 1) % matchRanges.length);
    }

    function goPrev() {
        if (!matchRanges.length) { return; }
        scrollToMatch((currentIdx - 1 + matchRanges.length) % matchRanges.length);
    }

    // ── 替换逻辑 ─────────────────────────────────────────
    function rangeToDocPos(r: Range): { from: number; to: number } | null {
        const view = getEditorView();
        if (!view) { return null; }
        const from = view.posAtDOM(r.startContainer, r.startOffset);
        const to = view.posAtDOM(r.endContainer, r.endOffset);
        if (from < 0 || to < 0) { return null; }
        return { from, to };
    }

    function replaceCurrent(replacement: string) {
        const view = getEditorView();
        if (!view || !matchRanges.length || !matchRanges[currentIdx]) { return; }

        const pos = rangeToDocPos(matchRanges[currentIdx]);
        if (!pos) { return; }

        const savedIdx = currentIdx;
        const tr = view.state.tr.insertText(replacement, pos.from, pos.to);
        view.dispatch(tr);
        view.focus();
        requestAnimationFrame(() => {
            search(input.value);
            if (matchRanges.length) {
                const nextIdx = savedIdx >= matchRanges.length ? 0 : savedIdx;
                scrollToMatch(nextIdx);
            }
        });
    }

    function replaceAll(replacement: string) {
        const view = getEditorView();
        if (!view || !matchRanges.length) { return; }

        const positions: { from: number; to: number }[] = [];
        for (const r of matchRanges) {
            const pos = rangeToDocPos(r);
            if (pos) { positions.push(pos); }
        }

        positions.sort((a, b) => b.from - a.from);

        let tr = view.state.tr;
        for (const { from, to } of positions) {
            tr = tr.insertText(replacement, from, to);
        }
        view.dispatch(tr);
        view.focus();
        requestAnimationFrame(() => search(input.value));
    }

    // ── 事件绑定 ─────────────────────────────────────────
    input.addEventListener("input", () => {
        clearTimeout(debounceTimer);
        debounceTimer = window.setTimeout(() => search(input.value), 150);
        updateButtonStates();
    });

    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            if (e.shiftKey) { goPrev(); } else { goNext(); }
        } else if (e.key === "Escape") {
            e.preventDefault();
            close();
        } else if ((e.metaKey || e.ctrlKey) && e.code === "KeyF") {
            e.preventDefault();
        }
    });

    replaceInput.addEventListener("input", () => updateButtonStates());

    replaceInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            replaceCurrent(replaceInput.value);
        } else if (e.key === "Escape") {
            e.preventDefault();
            close();
        }
    });

    btnNext.addEventListener("click", goNext);
    btnPrev.addEventListener("click", goPrev);
    btnClose.addEventListener("click", close);

    btnCase.addEventListener("click", () => {
        caseSensitive = !caseSensitive;
        btnCase.classList.toggle("find-widget__btn--active", caseSensitive);
        btnCase.setAttribute("aria-pressed", String(caseSensitive));
        search(input.value);
    });

    btnRegex.addEventListener("click", () => {
        useRegex = !useRegex;
        btnRegex.classList.toggle("find-widget__btn--active", useRegex);
        btnRegex.setAttribute("aria-pressed", String(useRegex));
        search(input.value);
    });

    btnToggleReplace.addEventListener("click", () => {
        replaceVisible = !replaceVisible;
        replaceRow.classList.toggle("find-widget__replace--visible", replaceVisible);
        btnToggleReplace.classList.toggle("find-widget__toggle-replace--expanded", replaceVisible);
        btnToggleReplace.setAttribute("aria-expanded", String(replaceVisible));
        if (replaceVisible) { replaceInput.focus(); }
    });

    btnReplace.addEventListener("click", () => replaceCurrent(replaceInput.value));
    btnReplaceAll.addEventListener("click", () => replaceAll(replaceInput.value));

    widget.addEventListener("mousedown", (e) => e.stopPropagation());

    // ── 拖拽调整宽度 ──────────────────────────────────────
    dragHandle.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const startWidth = widget.getBoundingClientRect().width;

        const onMouseMove = (ev: MouseEvent) => {
            const delta = startX - ev.clientX;
            const newWidth = Math.max(280, Math.min(800, startWidth + delta));
            widget.style.width = `${newWidth}px`;
        };

        const onMouseUp = () => {
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
        };

        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
    });

    // ── 公开 API ─────────────────────────────────────────
    function open(initialQuery?: string) {
        visible = true;
        widget.classList.add("find-widget--visible");
        if (initialQuery !== undefined && initialQuery !== input.value) {
            input.value = initialQuery;
        }
        input.focus();
        input.select();
        search(input.value);
    }

    function close() {
        visible = false;
        widget.classList.remove("find-widget--visible");
        widget.classList.remove("find-widget--no-results", "find-widget--regex-error");
        clearHighlights();
        matchRanges = [];
        count.textContent = "";
        updateButtonStates();
    }

    function refresh() {
        if (visible && input.value) {
            search(input.value);
        }
    }

    return { open, close, isOpen: () => visible, refresh };
}
