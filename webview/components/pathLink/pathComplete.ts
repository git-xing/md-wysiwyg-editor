import { notifyGetPathSuggestions } from "@/messaging";
import { getFileIcon } from "./fileIcons";
import type { EditorView } from "@milkdown/prose/view";

// 触发补全的路径前缀检测
const PATH_PREFIX_REGEX = /^(@\/|\.{1,2}\/|[a-zA-Z0-9_-][a-zA-Z0-9._-]*\/)/;

type SuggestionItem = { path: string; isDir: boolean };
type SuggestCallback = (items: SuggestionItem[]) => void;

// 路径补全回调 map：id → resolve
const _pendingSuggestions = new Map<string, SuggestCallback>();

/** 外部调用此函数分发 pathSuggestions 消息 */
export function dispatchPathSuggestions(id: string, items: SuggestionItem[]): void {
    const cb = _pendingSuggestions.get(id);
    if (cb) {
        _pendingSuggestions.delete(id);
        cb(items);
    }
}

/** 获取当前光标所在的 inline code 元素（排除 pre>code 和 a>code） */
function getActiveInlineCode(): HTMLElement | null {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) { return null; }
    const node = sel.anchorNode;
    if (!node) { return null; }
    const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
    if (!el) { return null; }
    const code = el.closest("code");
    if (!code) { return null; }
    if (code.closest("pre")) { return null; }
    if (code.closest("a")) { return null; }
    return code as HTMLElement;
}

/** 通过当前 ProseMirror 选区位置查找 inlineCode mark 的文本范围 */
function getCodeNodeRangeFromSelection(view: EditorView): { from: number; to: number } | null {
    const { state } = view;
    const codeMark = state.schema.marks["inlineCode"];
    if (!codeMark) { return null; }

    const { $from } = state.selection;
    const parentStart = $from.start();
    let from: number | undefined;
    let to: number | undefined;
    $from.parent.forEach((node, offset) => {
        if (node.isText && node.marks.some(m => m.type === codeMark)) {
            const s = parentStart + offset;
            const e = s + node.nodeSize;
            if ($from.pos >= s && $from.pos <= e) {
                from = s;
                to = e;
            }
        }
    });
    return from !== undefined && to !== undefined ? { from, to } : null;
}

export function initPathComplete(getEditorViewFn: () => EditorView | null): void {
    let dropdown: HTMLUListElement | null = null;
    let activeIndex = -1;
    let lastItems: SuggestionItem[] = [];
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    // 在 showDropdown 时快照 code mark 范围，避免 click 时光标位置不可靠
    let savedRange: { from: number; to: number } | null = null;
    // 键盘导航后屏蔽 mouseover，防止 scrollIntoView 触发 mouseover 覆盖 activeIndex
    let suppressMouseover = false;

    function closeDropdown(): void {
        if (dropdown) {
            dropdown.remove();
            dropdown = null;
        }
        activeIndex = -1;
        lastItems = [];
        savedRange = null;
    }

    function updateActiveItem(): void {
        if (!dropdown) { return; }
        Array.from(dropdown.children).forEach((li, i) => {
            const isActive = i === activeIndex;
            li.classList.toggle("path-complete-item--active", isActive);
            if (isActive) {
                (li as HTMLElement).scrollIntoView({ block: "nearest" });
            }
        });
    }

    function applySelection(item: SuggestionItem): void {
        const view = getEditorViewFn();
        if (!view) {
            closeDropdown();
            return;
        }
        const range = savedRange ?? getCodeNodeRangeFromSelection(view);
        if (!range) {
            closeDropdown();
            return;
        }
        const codeMark = view.state.schema.marks["inlineCode"];
        if (!codeMark) { return; }
        const { state } = view;
        view.dispatch(
            state.tr.replaceRangeWith(
                range.from,
                range.to,
                state.schema.text(item.path, [codeMark.create()]),
            ),
        );
        view.focus();

        if (item.isDir) {
            // 选择了文件夹：替换内容后自动进入该目录（50ms 等 ProseMirror DOM 更新）
            closeDropdown();
            setTimeout(() => {
                const newCode = getActiveInlineCode();
                if (newCode) { triggerSuggest(newCode); }
            }, 50);
        } else {
            closeDropdown();
        }
    }

    function showDropdown(code: HTMLElement, items: SuggestionItem[]): void {
        closeDropdown();
        if (items.length === 0) { return; }

        lastItems = items;

        // 快照当前 code mark 范围，在 click 时光标可能已移位
        const view = getEditorViewFn();
        if (view) { savedRange = getCodeNodeRangeFromSelection(view); }

        const rect = code.getBoundingClientRect();
        const ul = document.createElement("ul");
        ul.className = "path-complete-list";
        ul.style.top = `${rect.bottom + window.scrollY + 2}px`;
        ul.style.left = `${rect.left + window.scrollX}px`;

        items.forEach((item, i) => {
            const li = document.createElement("li");
            li.className = "path-complete-item";

            // 图标
            const iconEl = document.createElement("span");
            iconEl.className = "path-complete-icon";
            iconEl.innerHTML = getFileIcon(item.path, item.isDir);

            // 只显示最后一段文件名/目录名，完整路径作 title
            const lastSeg = item.path.replace(/\/$/, '').split('/').pop() ?? item.path;
            const label = document.createElement("span");
            label.className = "path-complete-label";
            label.textContent = lastSeg;
            li.title = item.path;

            li.append(iconEl, label);

            li.addEventListener("mousedown", (e) => {
                e.preventDefault();
                activeIndex = i;
                applySelection(item);
            });
            li.addEventListener("mousemove", () => { suppressMouseover = false; });
            li.addEventListener("mouseover", () => {
                if (suppressMouseover) { return; }
                activeIndex = i;
                updateActiveItem();
            });
            ul.appendChild(li);
        });

        document.body.appendChild(ul);
        dropdown = ul;
        activeIndex = 0;
        updateActiveItem();
    }

    function triggerSuggest(code: HTMLElement): void {
        const query = (code.textContent ?? "").trim();
        if (!query || !PATH_PREFIX_REGEX.test(query)) {
            closeDropdown();
            return;
        }

        const id = `ps_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
        _pendingSuggestions.set(id, (items) => {
            const currentCode = getActiveInlineCode();
            if (currentCode === code) {
                showDropdown(code, items);
            }
        });
        notifyGetPathSuggestions(id, query);

        // 超时清理
        setTimeout(() => {
            if (_pendingSuggestions.has(id)) {
                _pendingSuggestions.delete(id);
            }
        }, 5000);
    }

    // 键盘导航（capture 阶段，优先于编辑器处理）
    document.addEventListener("keydown", (e) => {
        if (!dropdown) { return; }

        if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            closeDropdown();
            return;
        }

        if (e.key === "ArrowDown") {
            e.preventDefault();
            suppressMouseover = true;
            activeIndex = activeIndex >= lastItems.length - 1 ? 0 : activeIndex + 1;
            updateActiveItem();
            return;
        }

        if (e.key === "ArrowUp") {
            e.preventDefault();
            suppressMouseover = true;
            activeIndex = activeIndex <= 0 ? lastItems.length - 1 : activeIndex - 1;
            updateActiveItem();
            return;
        }

        if (e.key === "Enter" || e.key === "Tab") {
            if (activeIndex >= 0 && activeIndex < lastItems.length) {
                e.preventDefault();
                e.stopPropagation();
                applySelection(lastItems[activeIndex]);
            }
            return;
        }
    }, true);

    // 输入时触发补全（debounce 200ms）
    document.addEventListener("keyup", (e) => {
        if (["Escape", "ArrowDown", "ArrowUp", "Enter", "Tab"].includes(e.key)) { return; }

        const code = getActiveInlineCode();
        if (!code) {
            closeDropdown();
            return;
        }

        if (debounceTimer) { clearTimeout(debounceTimer); }
        debounceTimer = setTimeout(() => {
            debounceTimer = null;
            triggerSuggest(code);
        }, 200);
    });

    // 点击其他区域关闭下拉
    document.addEventListener("mousedown", (e) => {
        if (dropdown && !dropdown.contains(e.target as Node)) {
            closeDropdown();
        }
    }, true);

    // 失焦关闭
    window.addEventListener("blur", () => {
        closeDropdown();
    });
}
