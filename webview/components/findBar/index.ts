import "./findBar.css";
import { createButton } from "@/ui/dom";
import { IconChevronUp, IconChevronDown, IconX } from "@/ui/icons";
import { t, kbd } from "@/i18n";

// TypeScript 类型声明：CSS Custom Highlight API（Chromium 105+ / Electron 22+）
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
}

export function initFindBar(getEditorEl: () => HTMLElement | null): FindBarController {
    // ── DOM 结构 ─────────────────────────────────────────
    const bar = document.createElement("div");
    bar.className = "find-bar";
    bar.setAttribute("role", "search");

    const input = document.createElement("input");
    input.className = "find-bar__input";
    input.type = "text";
    input.placeholder = t("Find");
    input.setAttribute("aria-label", t("Find"));
    input.spellcheck = false;
    input.autocomplete = "off";

    const count = document.createElement("span");
    count.className = "find-bar__count";

    const btnPrev = createButton({
        className: "find-bar__btn",
        icon: IconChevronUp,
        title: `${t("Previous Match")} (${kbd("Shift-Enter")})`,
    });
    btnPrev.setAttribute("aria-label", t("Previous Match"));

    const btnNext = createButton({
        className: "find-bar__btn",
        icon: IconChevronDown,
        title: `${t("Next Match")} (Enter)`,
    });
    btnNext.setAttribute("aria-label", t("Next Match"));

    const sep = document.createElement("div");
    sep.className = "find-bar__sep";

    const btnCase = createButton({
        className: "find-bar__btn",
        label: "Aa",
        title: t("Match Case"),
    });
    btnCase.setAttribute("aria-label", t("Match Case"));
    btnCase.setAttribute("aria-pressed", "false");

    const btnClose = createButton({
        className: "find-bar__btn",
        icon: IconX,
        title: `${t("Close")} (Esc)`,
    });
    btnClose.setAttribute("aria-label", t("Close"));

    // 布局：input → count → prev↑ → next↓ → sep → Aa → close
    bar.append(input, count, btnPrev, btnNext, sep, btnCase, btnClose);
    document.body.appendChild(bar);

    // ── 状态 ─────────────────────────────────────────────
    let visible = false;
    let caseSensitive = false;
    let matchRanges: Range[] = [];
    let currentIdx = 0;
    let debounceTimer = 0;

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

        if (!query) {
            count.textContent = "";
            bar.classList.remove("find-bar--no-results");
            updateHighlights();
            return;
        }

        const editorEl = getEditorEl();
        if (!editorEl) { return; }

        const q = caseSensitive ? query : query.toLowerCase();
        const walker = document.createTreeWalker(editorEl, NodeFilter.SHOW_TEXT);
        let node: Text | null;
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

        if (matchRanges.length) {
            count.textContent = `1/${matchRanges.length}`;
            bar.classList.remove("find-bar--no-results");
            scrollToMatch(0);
        } else {
            count.textContent = t("No results");
            bar.classList.add("find-bar--no-results");
        }
        updateHighlights();
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

    // ── 事件绑定 ─────────────────────────────────────────
    input.addEventListener("input", () => {
        clearTimeout(debounceTimer);
        debounceTimer = window.setTimeout(() => search(input.value), 150);
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

    btnNext.addEventListener("click", goNext);
    btnPrev.addEventListener("click", goPrev);
    btnClose.addEventListener("click", close);

    btnCase.addEventListener("click", () => {
        caseSensitive = !caseSensitive;
        btnCase.classList.toggle("find-bar__btn--active", caseSensitive);
        btnCase.setAttribute("aria-pressed", String(caseSensitive));
        search(input.value);
    });

    // 阻止搜索栏内的 mousedown 冒泡，防止编辑器捕获
    bar.addEventListener("mousedown", (e) => e.stopPropagation());

    // ── 公开 API ─────────────────────────────────────────
    function open(initialQuery?: string) {
        visible = true;
        bar.classList.add("find-bar--visible");
        if (initialQuery !== undefined && initialQuery !== input.value) {
            input.value = initialQuery;
        }
        input.focus();
        input.select();
        search(input.value);
    }

    function close() {
        visible = false;
        bar.classList.remove("find-bar--visible");
        bar.classList.remove("find-bar--no-results");
        clearHighlights();
        matchRanges = [];
        count.textContent = "";
    }

    return { open, close, isOpen: () => visible };
}
