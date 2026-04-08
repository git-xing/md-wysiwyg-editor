import { notifyGetPathSuggestions, notifyResolveImagePath } from "@/messaging";
import { getFileIcon } from "../pathLink/fileIcons";
import type { PathSuggestionItem } from "../../../shared/messages";

// ─── resolveImagePath 异步机制 ────────────────────────────────
const _pendingResolve = new Map<string, (uri: string) => void>();

/** 由 index.ts 在收到 imagePathResolved 消息时调用 */
export function dispatchImagePathResolved(id: string, webviewUri: string): void {
    const cb = _pendingResolve.get(id);
    if (cb) { _pendingResolve.delete(id); cb(webviewUri); }
}

/** 将 relPath 解析为 webviewUri（异步，超时 3s 返回原值） */
export function resolveToWebviewUri(relPath: string): Promise<string> {
    return new Promise((resolve) => {
        const id = `rip_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
        const timer = setTimeout(() => {
            _pendingResolve.delete(id);
            resolve(relPath); // 超时回退
        }, 3000);
        _pendingResolve.set(id, (uri) => {
            clearTimeout(timer);
            resolve(uri);
        });
        notifyResolveImagePath(id, relPath);
    });
}

// 触发路径补全的前缀检测（与 pathComplete.ts 保持一致）
const PATH_PREFIX_REGEX = /^(@\/|\.{1,2}\/|[a-zA-Z0-9_-][a-zA-Z0-9._-]*\/)/;

type SuggestCallback = (items: PathSuggestionItem[]) => void;

// 回调 map：id → resolve（全局唯一，各 input 通过 id 区分）
const _pendingImgSuggestions = new Map<string, SuggestCallback>();

/** 外部调用此函数分发 pathSuggestions 消息到本模块 */
export function dispatchImgPathSuggestions(id: string, items: PathSuggestionItem[]): void {
    const cb = _pendingImgSuggestions.get(id);
    if (cb) {
        _pendingImgSuggestions.delete(id);
        cb(items);
    }
}

/**
 * 为一个 <input> 元素附加图片路径自动补全。
 * @param onEnter  dropdown 关闭时 Enter 调用（即 confirm）
 * @param onEscape dropdown 关闭时 Escape 调用（即 cancel）
 * 返回 cleanup 函数，调用后移除事件监听并关闭下拉。
 */
export function attachImgPathComplete(
    input: HTMLInputElement,
    onEnter?: () => void,
    onEscape?: () => void,
): () => void {
    let dropdown: HTMLUListElement | null = null;
    let activeIndex = -1;
    let lastItems: PathSuggestionItem[] = [];
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let suppressMouseover = false;
    let isDestroyed = false;
    // autocomplete 选中后跳过下一次 onInput 里清除 dataset 的操作
    let skipDatasetClear = false;

    // ── dropdown 管理 ──────────────────────────────────────────

    function closeDropdown(): void {
        if (dropdown) {
            dropdown.remove();
            dropdown = null;
        }
        activeIndex = -1;
        lastItems = [];
    }

    function updateActiveItem(): void {
        if (!dropdown) { return; }
        Array.from(dropdown.children).forEach((li, i) => {
            const isActive = i === activeIndex;
            li.classList.toggle("img-path-complete-item--active", isActive);
            if (isActive) {
                (li as HTMLElement).scrollIntoView({ block: "nearest" });
            }
        });
    }

    function applySelection(item: PathSuggestionItem): void {
        // 显示相对路径；若有 webviewUri 存入 dataset，confirm() 取用保证图片能渲染
        input.value = item.path;
        if (item.webviewUri) {
            input.dataset.imgWebviewUri = item.webviewUri;
        } else {
            delete input.dataset.imgWebviewUri;
        }
        skipDatasetClear = true;
        // 取消可能已排队的 debounce，避免选中后立即再触发补全
        if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
        input.focus();

        if (item.isDir) {
            // 选中目录：自动展开下一层
            closeDropdown();
            setTimeout(() => {
                triggerSuggest();
            }, 50);
        } else {
            closeDropdown();
        }
    }

    function showDropdown(items: PathSuggestionItem[]): void {
        closeDropdown();
        // 只保留目录和图片文件（有 webviewUri 的条目）
        const filtered = items.filter(item => item.isDir || item.webviewUri !== undefined);
        if (filtered.length === 0) { return; }
        lastItems = filtered;

        const rect = input.getBoundingClientRect();
        const ul = document.createElement("ul");
        ul.className = "img-path-complete-list";
        // position: fixed，直接用 viewport 坐标
        ul.style.top = `${rect.bottom + 2}px`;
        ul.style.left = `${rect.left}px`;
        ul.style.minWidth = `${rect.width}px`;

        filtered.forEach((item, i) => {
            const li = document.createElement("li");
            li.className = "img-path-complete-item";

            // 左侧：缩略图（图片）或文件夹图标（目录）
            if (item.webviewUri) {
                const thumb = document.createElement("img");
                thumb.className = "img-complete-thumb";
                thumb.src = item.webviewUri;
                thumb.alt = "";
                li.appendChild(thumb);
            } else {
                const iconEl = document.createElement("span");
                iconEl.className = "img-complete-icon";
                iconEl.innerHTML = getFileIcon(item.path, item.isDir);
                li.appendChild(iconEl);
            }

            // 右侧：文件名（不含斜杠后缀，完整路径作 title）
            const lastSeg = item.path.replace(/\/$/, "").split("/").pop() ?? item.path;
            const label = document.createElement("span");
            label.className = "img-complete-label";
            label.textContent = lastSeg;
            li.title = item.path;
            li.appendChild(label);

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

    // ── 触发补全请求 ───────────────────────────────────────────

    function triggerSuggest(): void {
        const query = input.value.trim();
        if (!query || !PATH_PREFIX_REGEX.test(query)) {
            closeDropdown();
            return;
        }

        const id = `ips_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
        _pendingImgSuggestions.set(id, (items) => {
            if (!isDestroyed) {
                showDropdown(items);
            }
        });
        notifyGetPathSuggestions(id, query);

        // 超时清理
        setTimeout(() => {
            _pendingImgSuggestions.delete(id);
        }, 5000);
    }

    // ── 事件监听 ───────────────────────────────────────────────

    function onInput(): void {
        // autocomplete 选中后首次 onInput 不清除 dataset（dataset 是手动输入的判断依据）
        if (skipDatasetClear) {
            skipDatasetClear = false;
        } else {
            delete input.dataset.imgWebviewUri;
        }
        if (debounceTimer) { clearTimeout(debounceTimer); }
        debounceTimer = setTimeout(() => {
            debounceTimer = null;
            if (!isDestroyed) { triggerSuggest(); }
        }, 200);
    }

    function onKeydown(e: KeyboardEvent): void {

        if (e.isComposing) { return; }

        // ── Enter / Escape：dropdown 打开时优先处理下拉，否则委托回调 ──
        if (e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            if (dropdown && activeIndex >= 0 && activeIndex < lastItems.length) {
                applySelection(lastItems[activeIndex]);
            } else {
                onEnter?.();
            }
            return;
        }

        if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            if (dropdown) {
                closeDropdown();
            } else {
                onEscape?.();
            }
            return;
        }

        if (!dropdown) { return; }

        // ── dropdown 方向键导航 ───────────────────────────────────
        if (e.key === "ArrowDown") {
            e.preventDefault();
            e.stopPropagation();
            suppressMouseover = true;
            activeIndex = activeIndex >= lastItems.length - 1 ? 0 : activeIndex + 1;
            updateActiveItem();
            return;
        }
        if (e.key === "ArrowUp") {
            e.preventDefault();
            e.stopPropagation();
            suppressMouseover = true;
            activeIndex = activeIndex <= 0 ? lastItems.length - 1 : activeIndex - 1;
            updateActiveItem();
            return;
        }
        if (e.key === "Tab") {
            if (activeIndex >= 0 && activeIndex < lastItems.length) {
                e.preventDefault();
                e.stopPropagation();
                applySelection(lastItems[activeIndex]);
            }
            return;
        }
    }

    function onDocMousedown(e: MouseEvent): void {
        if (dropdown && !dropdown.contains(e.target as Node) && e.target !== input) {
            closeDropdown();
        }
    }

    function onBlur(): void {
        // 延迟关闭，让 mousedown 的 applySelection 先执行
        setTimeout(() => {
            if (!isDestroyed) { closeDropdown(); }
        }, 150);
    }

    input.addEventListener("input", onInput);
    input.addEventListener("keydown", onKeydown, true);
    input.addEventListener("blur", onBlur);
    document.addEventListener("mousedown", onDocMousedown, true);

    // ── cleanup ────────────────────────────────────────────────

    return function detach(): void {
        isDestroyed = true;
        if (debounceTimer) { clearTimeout(debounceTimer); }
        closeDropdown();
        input.removeEventListener("input", onInput);
        input.removeEventListener("keydown", onKeydown, true);
        input.removeEventListener("blur", onBlur);
        document.removeEventListener("mousedown", onDocMousedown, true);
    };
}
