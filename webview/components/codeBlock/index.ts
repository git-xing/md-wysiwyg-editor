import type { Node as PMNode } from "@milkdown/prose/model";
import type {
    Decoration,
    DecorationSource,
    EditorView,
} from "@milkdown/prose/view";

type ViewMutationRecord = MutationRecord | { type: "selection"; target: Node };
import { IconCopy, IconCheck, IconChevronDown } from "../../ui/icons";
import { applyTooltip } from "../../ui/tooltip";
import { t } from "../../i18n";

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
// 使用文本字符串计数（避免读取 DOM，防止与 ProseMirror 的 DOMObserver 冲突）
function updateLineNumbers(gutter: HTMLElement, text: string): void {
    const lines = text.split("\n");
    // 不特殊处理末尾空串：ProseMirror 末尾有光标占位行，split 后每个元素都是真实行
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

    // Portal：挂载到 document.body，position:fixed 由 JS 计算，避免被 overflow 裁剪
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
            if (val === currentLang) {
                item.classList.add("lang-picker-item--active");
            }
            item.addEventListener("mousedown", (e) => {
                e.preventDefault();
                e.stopPropagation();
                selectLang(val);
            });
            listEl.appendChild(item);
            if (val === currentLang) {
                activeIndex = i;
            }
        });
    }

    function setActiveIdx(idx: number): void {
        const items = listEl.querySelectorAll<HTMLElement>(".lang-picker-item");
        items.forEach((el, i) =>
            el.classList.toggle("lang-picker-item--focused", i === idx),
        );
        if (items[idx]) {
            items[idx].scrollIntoView({ block: "nearest" });
        }
        activeIndex = idx;
    }

    // 修复：不再判断 activeElement，防止第一次点击外部无法关闭的 bug
    function outsideClickHandler(e: MouseEvent): void {
        if (
            !wrapper.contains(e.target as Node) &&
            !dropdown.contains(e.target as Node)
        ) {
            close();
        }
    }

    function closeOnScroll(e: Event): void {
        // 忽略下拉列表内部滚动，只关闭来自页面的滚动
        if (dropdown.contains(e.target as Node)) {
            return;
        }
        close();
    }

    function open(): void {
        isOpen = true;

        // 根据 trigger 位置计算下拉方向（判断下方是否有足够空间）
        const rect = triggerBtn.getBoundingClientRect();
        const dropW = Math.max(rect.width, 160);
        dropdown.style.left = `${rect.left}px`;
        dropdown.style.width = `${dropW}px`;
        dropdown.style.top = "";
        dropdown.style.bottom = "";

        // 先隐式显示以量高
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
        triggerBtn.querySelector(".lang-picker-label")!.textContent =
            getLangLabel(val);
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
        // IME 输入法合成阶段（isComposing=true）的 Enter 只是提交输入法，不应触发选择
        if (e.isComposing) {
            return;
        }
        const items = listEl.querySelectorAll<HTMLElement>(".lang-picker-item");
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIdx(Math.min(activeIndex + 1, items.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIdx(Math.max(activeIndex - 1, 0));
        } else if (e.key === "Enter") {
            e.preventDefault();
            const focused = listEl.querySelector<HTMLElement>(
                ".lang-picker-item--focused",
            );
            if (focused) {
                selectLang(focused.dataset["value"] ?? "");
            } else if (items[0]) {
                selectLang(items[0].dataset["value"] ?? "");
            }
        } else if (e.key === "Escape") {
            e.preventDefault();
            close();
        }
    });

    return {
        el: wrapper,
        update(lang: string) {
            currentLang = lang;
            triggerBtn.querySelector(".lang-picker-label")!.textContent =
                getLangLabel(lang);
        },
        destroy() {
            close();
            if (document.body.contains(dropdown)) {
                document.body.removeChild(dropdown);
            }
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
    console.log(
        `[NodeView ${_id}] 工厂创建`,
        new Error().stack?.split("\n")[2]?.trim(),
    );

    // 外层容器
    const wrapper = document.createElement("div");
    wrapper.className = "code-block-wrapper";

    // 头部（初始化时设 false，DOMObserver 尚未监听，不会触发重建；ignoreMutation 已保护后续变动）
    const header = document.createElement("div");
    header.className = "code-block-header";
    header.contentEditable = "false";

    // 语言搜索下拉
    const currentLang = (node.attrs["language"] as string) || "";
    const picker = createLangPicker(currentLang, (newLang) => {
        const pos = getPos();
        if (pos === undefined) {
            return;
        }
        view.dispatch(
            view.state.tr.setNodeMarkup(pos, null, {
                ...node.attrs,
                language: newLang,
            }),
        );
        view.focus();
    });

    // 复制按钮
    const copyBtn = document.createElement("button");
    copyBtn.className = "copy-btn";
    copyBtn.tabIndex = -1;
    copyBtn.innerHTML = IconCopy;
    const copyTooltip = applyTooltip(copyBtn, t("Copy Code"), {
        placement: "above",
    });
    let copyRestoreTimer: ReturnType<typeof setTimeout> | null = null;

    // mousedown 而非 click：避免 ProseMirror NodeView 环境中 click 事件被拦截
    copyBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log(`[NodeView ${_id}] 复制按钮 mousedown`);
        const code = codeEl.textContent ?? "";

        // 立即显示反馈，不等待剪贴板 Promise（VSCode WebView 中 clipboard API 行为不稳定）
        copyBtn.innerHTML = IconCheck;
        copyBtn.classList.add("copy-btn--done");
        copyTooltip.setText(t("Copied!"));
        copyTooltip.show();
        if (copyRestoreTimer) {
            clearTimeout(copyRestoreTimer);
        }
        copyRestoreTimer = setTimeout(() => {
            copyBtn.innerHTML = IconCopy;
            copyBtn.classList.remove("copy-btn--done");
            copyTooltip.setText(t("Copy Code"));
            copyRestoreTimer = null;
        }, 1500);

        // 尝试写剪贴板，失败时用 execCommand fallback
        navigator.clipboard?.writeText(code).catch(() => {
            const ta = document.createElement("textarea");
            ta.value = code;
            ta.style.cssText =
                "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            try {
                document.execCommand("copy");
            } catch {
                /* ignore */
            }
            document.body.removeChild(ta);
        });
    });

    header.appendChild(picker.el);
    header.appendChild(copyBtn);

    // 代码区（ProseMirror contentDOM）
    const pre = document.createElement("pre");
    const codeEl = document.createElement("code");
    if (currentLang) {
        codeEl.className = `language-${currentLang}`;
    }

    // 行号侧栏
    const lineGutter = document.createElement("div");
    lineGutter.className = "line-numbers-gutter";
    lineGutter.contentEditable = "false";

    // 立即用 PMNode textContent 初始化行号（不读 DOM，不触发 DOMObserver 竞争）
    updateLineNumbers(lineGutter, node.textContent);

    pre.appendChild(lineGutter);
    pre.appendChild(codeEl);

    // 底部拖拽 handle（放在 wrapper 底部）
    const resizeHandle = document.createElement("div");
    resizeHandle.className = "code-block-resize-handle";
    resizeHandle.contentEditable = "false";
    applyTooltip(resizeHandle, t("Drag to resize"), { placement: "above" });

    resizeHandle.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log(`[NodeView ${_id}] 拖拽 handle mousedown`);
        const startY = e.clientY;
        const startH = pre.getBoundingClientRect().height;

        const onMove = (ev: MouseEvent) => {
            const newH = Math.max(80, startH + ev.clientY - startY);
            pre.style.maxHeight = `${newH}px`;
            pre.style.height = `${newH}px`;
        };
        const onUp = () => {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
    });

    // Ctrl/Cmd+A：只选本代码块内容
    codeEl.addEventListener("keydown", (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "a") {
            e.preventDefault();
            e.stopPropagation();
            const sel = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(codeEl);
            sel?.removeAllRanges();
            sel?.addRange(range);
        }
    });

    wrapper.appendChild(header);
    wrapper.appendChild(pre);
    wrapper.appendChild(resizeHandle);

    return {
        dom: wrapper,
        contentDOM: codeEl,

        update(updatedNode: PMNode): boolean {
            console.log(`[NodeView ${_id}] update() 调用`);
            if (updatedNode.type !== node.type) {
                return false;
            }
            const newLang = (updatedNode.attrs["language"] as string) || "";
            picker.update(newLang);
            codeEl.className = newLang ? `language-${newLang}` : "";
            node = updatedNode;
            // 从 PMNode textContent 更新行号（不依赖 DOM 读取，避免触发额外 DOMObserver）
            updateLineNumbers(lineGutter, updatedNode.textContent);
            return true;
        },

        ignoreMutation(mutation: ViewMutationRecord): boolean {
            // selection 类型：返回 false 让 ProseMirror 正确追踪拖拽选区变化
            // 若返回 true，ProseMirror 会忽略选区更新，导致鼠标松手后选区被重置
            if (mutation.type === "selection") {
                return false;
            }
            // 只允许 contentDOM (codeEl) 内部的变动通知 ProseMirror，其余（header/lineGutter/resizeHandle）全部忽略
            return (
                !codeEl.contains(mutation.target as Node) &&
                mutation.target !== codeEl
            );
        },

        destroy(): void {
            console.log(
                `[NodeView ${_id}] destroy() 调用`,
                new Error().stack?.split("\n")[2]?.trim(),
            );
            picker.destroy();
            if (copyRestoreTimer) {
                clearTimeout(copyRestoreTimer);
            }
        },
    };
}
