import type { Node as PMNode } from "@milkdown/prose/model";
import type {
    Decoration,
    DecorationSource,
    EditorView,
} from "@milkdown/prose/view";
import {
    IconZoomIn,
    IconPencil,
    IconTrash2,
    IconCheck,
    IconX,
} from "../../ui/icons";
import { applyTooltip } from "../../ui/tooltip";
import { t } from "../../i18n";

type ViewMutationRecord = MutationRecord | { type: "selection"; target: Node };

// ─── Lightbox ──────────────────────────────────────────────
let activeLightbox: HTMLElement | null = null;

function showGlobalLightbox(src: string, alt: string): void {
    if (activeLightbox) {
        return;
    }

    const lb = document.createElement("div");
    lb.className = "img-editor-lightbox";

    const img = document.createElement("img");
    img.className = "img-editor-lightbox-img";
    img.src = src;
    img.alt = alt;

    const closeBtn = document.createElement("button");
    closeBtn.className = "img-editor-lightbox-close";
    closeBtn.innerHTML = IconX;
    closeBtn.title = t("Close");

    lb.appendChild(img);
    lb.appendChild(closeBtn);
    document.body.appendChild(lb);
    activeLightbox = lb;

    function close(): void {
        if (activeLightbox && document.body.contains(activeLightbox)) {
            document.body.removeChild(activeLightbox);
        }
        activeLightbox = null;
        document.removeEventListener("keydown", onKeyDown);
    }

    function onKeyDown(e: KeyboardEvent): void {
        if (e.key === "Escape") {
            e.preventDefault();
            close();
        }
    }

    lb.addEventListener("mousedown", (e) => {
        if (e.target === lb) {
            close();
        }
    });
    closeBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        close();
    });
    document.addEventListener("keydown", onKeyDown);
}

// ─── 阻止输入框事件冒泡到 ProseMirror ────────────────────
// ProseMirror 在 view.dom 上监听 copy/cut/paste/keydown 等事件，
// input 内的剪贴板操作会冒泡被拦截（ProseMirror 的 copy handler 会 preventDefault）。
// 统一在 input 上阻止这些事件的冒泡，让浏览器原生行为正常触发。
function isolateInput(input: HTMLInputElement): void {
    const stopOnly = (e: Event) => e.stopPropagation();
    input.addEventListener("copy", stopOnly);
    input.addEventListener("cut", stopOnly);
    input.addEventListener("paste", stopOnly);
    input.addEventListener("mousedown", stopOnly);
    input.addEventListener("click", stopOnly);
    input.addEventListener("select", stopOnly);
}

// ─── 辅助：从 src 提取文件名（不含扩展名） ───────────────
function basenameNoExt(src: string): string {
    const name = src.split("/").pop() ?? src;
    const dot = name.lastIndexOf(".");
    return dot > 0 ? name.slice(0, dot) : name;
}

// ─── 工具栏按钮工厂 ────────────────────────────────────────
function makeBtn(icon: string, label: string): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.className = "img-tb-btn";
    btn.tabIndex = -1;
    btn.innerHTML = icon;
    applyTooltip(btn, label, { placement: "above" });
    return btn;
}

function makeSep(): HTMLElement {
    const sep = document.createElement("span");
    sep.className = "img-tb-sep";
    return sep;
}

// ─── NodeView 工厂 ─────────────────────────────────────────
export function createImageView(
    node: PMNode,
    view: EditorView,
    getPos: () => number | undefined,
    _decorations?: readonly Decoration[],
    _innerDecorations?: DecorationSource,
    onRenameImage?: (webviewUri: string, newBasename: string) => Promise<void>,
): {
    dom: HTMLElement;
    update: (n: PMNode) => boolean;
    selectNode: () => void;
    deselectNode: () => void;
    stopEvent: (e: Event) => boolean;
    ignoreMutation: (m: ViewMutationRecord) => boolean;
    destroy: () => void;
} {
    let currentNode = node;

    // ── 外层 wrapper ──────────────────────────────────────────
    const wrapper = document.createElement("div");
    wrapper.className = "image-wrapper";

    // ── 图片 ──────────────────────────────────────────────────
    const img = document.createElement("img");
    img.className = "image-node";
    img.src = (node.attrs["src"] as string) ?? "";
    img.alt = (node.attrs["alt"] as string) ?? "";
    img.draggable = false;

    // ── 工具栏 ────────────────────────────────────────────────
    const toolbar = document.createElement("div");
    toolbar.className = "image-toolbar";
    toolbar.contentEditable = "false";

    // 放大按钮
    const zoomBtn = makeBtn(IconZoomIn, t("View Full Size"));
    zoomBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        showGlobalLightbox(img.src, img.alt);
    });

    // Alt 文本编辑
    const altBtn = document.createElement("button");
    altBtn.className = "img-tb-btn";
    altBtn.tabIndex = -1;
    altBtn.textContent = "ALT";
    altBtn.style.fontWeight = "600";
    applyTooltip(altBtn, t("Edit Alt Text"), { placement: "above" });

    altBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        startAltEdit();
    });

    // 重命名按钮（仅本地图片）
    const renameBtn = makeBtn(IconPencil, t("Rename"));
    renameBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        startRenameEdit();
    });

    // 删除按钮
    const deleteBtn = makeBtn(IconTrash2, t("Delete"));
    deleteBtn.style.color = "var(--vscode-errorForeground, #f44)";
    deleteBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const pos = getPos();
        if (pos === undefined) {
            return;
        }
        view.dispatch(view.state.tr.delete(pos, pos + currentNode.nodeSize));
        view.focus();
    });

    // ── 信息条（文件名 + alt） ────────────────────────────────
    const infoEl = document.createElement("span");
    infoEl.className = "img-tb-info";

    function updateInfo(src: string, alt: string): void {
        const name = src.split("/").pop() ?? src;
        infoEl.textContent = alt ? `${name} · ${alt}` : name;
        infoEl.title = infoEl.textContent;
    }

    // 组装工具栏：info | sep | zoom | sep | alt | sep | delete
    // （重命名按钮在 sep+delete 之前按条件插入）
    toolbar.appendChild(infoEl);
    toolbar.appendChild(makeSep());
    toolbar.appendChild(zoomBtn);
    toolbar.appendChild(makeSep());
    toolbar.appendChild(altBtn);
    toolbar.appendChild(makeSep());
    toolbar.appendChild(deleteBtn);

    wrapper.appendChild(img);
    wrapper.appendChild(toolbar);

    // ── 更新工具栏中重命名按钮可见性 ─────────────────────────
    // （用 rawSrc 而非 img.src，避免浏览器规范化改变 URL 格式）
    let rawSrc = (node.attrs["src"] as string) ?? "";
    updateInfo(rawSrc, img.alt);
    // 本地图片：vscode-webview-resource:（旧）或 vscode-cdn.net / vscode-resource（新）
    function isLocalImage(src: string): boolean {
        return /vscode-resource|vscode-cdn\.net/.test(src);
    }

    function updateRenameVisibility(src: string): void {
        const isLocal = isLocalImage(src);
        if (isLocal && onRenameImage) {
            if (!renameBtn.parentElement) {
                // 插在 sep 和 deleteBtn 之间
                toolbar.insertBefore(makeSep(), deleteBtn);
                toolbar.insertBefore(renameBtn, deleteBtn);
            }
        } else {
            renameBtn.parentElement?.removeChild(renameBtn);
            // 同时移除它前面的 sep（若有多余的）
            const seps = toolbar.querySelectorAll(".img-tb-sep");
            const lastSep = seps[seps.length - 1];
            if (lastSep && lastSep.nextElementSibling === deleteBtn) {
                lastSep.parentElement?.removeChild(lastSep);
            }
        }
    }
    updateRenameVisibility(rawSrc);

    // ── Alt 文本内联编辑 ──────────────────────────────────────
    let isEditingAlt = false;

    function startAltEdit(): void {
        if (isEditingAlt) {
            return;
        }
        isEditingAlt = true;

        const input = document.createElement("input");
        input.className = "img-rename-input";
        input.value = img.alt;
        input.placeholder = t("Alt text");
        input.style.width = "160px";
        isolateInput(input);

        const confirmBtn = document.createElement("button");
        confirmBtn.className = "img-tb-btn";
        confirmBtn.tabIndex = -1;
        confirmBtn.innerHTML = IconCheck;
        confirmBtn.style.color = "var(--vscode-charts-green, #4caf50)";

        const cancelBtn = document.createElement("button");
        cancelBtn.className = "img-tb-btn";
        cancelBtn.tabIndex = -1;
        cancelBtn.innerHTML = IconX;

        // 暂时隐藏其他按钮
        Array.from(toolbar.children).forEach((el) => {
            (el as HTMLElement).style.display = "none";
        });

        toolbar.appendChild(input);
        toolbar.appendChild(confirmBtn);
        toolbar.appendChild(cancelBtn);
        input.focus();
        input.select();

        function confirm(): void {
            if (!isEditingAlt) {
                return;
            }
            isEditingAlt = false;
            const newAlt = input.value.trim();
            cleanupAlt();
            if (newAlt !== currentNode.attrs["alt"]) {
                const pos = getPos();
                if (pos !== undefined) {
                    view.dispatch(
                        view.state.tr.setNodeMarkup(pos, null, {
                            ...currentNode.attrs,
                            alt: newAlt,
                        }),
                    );
                }
            }
            view.focus();
        }

        function cancel(): void {
            if (!isEditingAlt) {
                return;
            }
            isEditingAlt = false;
            cleanupAlt();
            view.focus();
        }

        function cleanupAlt(): void {
            toolbar.removeChild(input);
            toolbar.removeChild(confirmBtn);
            toolbar.removeChild(cancelBtn);
            Array.from(toolbar.children).forEach((el) => {
                (el as HTMLElement).style.display = "";
            });
        }

        input.addEventListener("keydown", (e) => {
            e.stopPropagation();
            if (e.isComposing) {
                return;
            }
            if (e.key === "Enter") {
                e.preventDefault();
                confirm();
            } else if (e.key === "Escape") {
                e.preventDefault();
                cancel();
            }
        });
        confirmBtn.addEventListener("mousedown", (e) => {
            e.preventDefault();
            e.stopPropagation();
            confirm();
        });
        cancelBtn.addEventListener("mousedown", (e) => {
            e.preventDefault();
            e.stopPropagation();
            cancel();
        });
    }

    // ── 重命名内联编辑 ────────────────────────────────────────
    let isEditingRename = false;

    function startRenameEdit(): void {
        if (isEditingRename || !onRenameImage) {
            return;
        }
        isEditingRename = true;

        const currentName = basenameNoExt(rawSrc);
        const input = document.createElement("input");
        input.className = "img-rename-input";
        input.value = currentName;
        isolateInput(input);
        input.placeholder = t("New filename");

        const confirmBtn = document.createElement("button");
        confirmBtn.className = "img-tb-btn";
        confirmBtn.tabIndex = -1;
        confirmBtn.innerHTML = IconCheck;
        confirmBtn.style.color = "var(--vscode-charts-green, #4caf50)";

        const cancelBtn = document.createElement("button");
        cancelBtn.className = "img-tb-btn";
        cancelBtn.tabIndex = -1;
        cancelBtn.innerHTML = IconX;

        Array.from(toolbar.children).forEach((el) => {
            (el as HTMLElement).style.display = "none";
        });

        toolbar.appendChild(input);
        toolbar.appendChild(confirmBtn);
        toolbar.appendChild(cancelBtn);
        input.focus();
        input.select();

        function confirm(): void {
            if (!isEditingRename) {
                return;
            }
            const newBasename = input.value.trim();
            if (!newBasename || newBasename === currentName) {
                cancel();
                return;
            }
            isEditingRename = false;
            cleanupRename();
            onRenameImage!(rawSrc, newBasename).catch(() => {
                // rename 失败时静默（Extension 侧会弹 error 提示）
            });
            view.focus();
        }

        function cancel(): void {
            if (!isEditingRename) {
                return;
            }
            isEditingRename = false;
            cleanupRename();
            view.focus();
        }

        function cleanupRename(): void {
            if (toolbar.contains(input)) {
                toolbar.removeChild(input);
            }
            if (toolbar.contains(confirmBtn)) {
                toolbar.removeChild(confirmBtn);
            }
            if (toolbar.contains(cancelBtn)) {
                toolbar.removeChild(cancelBtn);
            }
            Array.from(toolbar.children).forEach((el) => {
                (el as HTMLElement).style.display = "";
            });
        }

        input.addEventListener("keydown", (e) => {
            e.stopPropagation();
            if (e.isComposing) {
                return;
            }
            if (e.key === "Enter") {
                e.preventDefault();
                confirm();
            } else if (e.key === "Escape") {
                e.preventDefault();
                cancel();
            }
        });
        confirmBtn.addEventListener("mousedown", (e) => {
            e.preventDefault();
            e.stopPropagation();
            confirm();
        });
        cancelBtn.addEventListener("mousedown", (e) => {
            e.preventDefault();
            e.stopPropagation();
            cancel();
        });
    }

    // ── NodeView 接口 ─────────────────────────────────────────
    return {
        dom: wrapper,

        update(updatedNode: PMNode): boolean {
            if (updatedNode.type !== currentNode.type) {
                return false;
            }
            const newSrc = (updatedNode.attrs["src"] as string) ?? "";
            const newAlt = (updatedNode.attrs["alt"] as string) ?? "";
            if (rawSrc !== newSrc) {
                rawSrc = newSrc;
                img.src = newSrc;
                updateRenameVisibility(newSrc);
            }
            if (img.alt !== newAlt) {
                img.alt = newAlt;
            }
            updateInfo(rawSrc, newAlt);
            currentNode = updatedNode;
            return true;
        },

        selectNode(): void {
            wrapper.classList.add("image-wrapper--selected");
            toolbar.style.display = "flex";

            // 检查工具栏是否超出视口顶部，若超出则改为显示在图片下方
            const rect = wrapper.getBoundingClientRect();
            if (rect.top < 60) {
                toolbar.classList.add("image-toolbar--below");
            } else {
                toolbar.classList.remove("image-toolbar--below");
            }
        },

        deselectNode(): void {
            wrapper.classList.remove("image-wrapper--selected");
            toolbar.style.display = "none";
        },

        stopEvent(e: Event): boolean {
            // 工具栏内的事件（按钮、输入框）阻止 ProseMirror 处理
            return toolbar.contains(e.target as Node);
        },

        ignoreMutation(_m: ViewMutationRecord): boolean {
            // 无 contentDOM，所有 DOM 变动都是 UI 层，ProseMirror 不需要感知
            return true;
        },

        destroy(): void {
            // 清理 lightbox（若此图片触发的 lightbox 仍在显示）
            if (activeLightbox && document.body.contains(activeLightbox)) {
                const lbImg = activeLightbox.querySelector("img");
                if (lbImg && lbImg.src === img.src) {
                    document.body.removeChild(activeLightbox);
                    activeLightbox = null;
                }
            }
        },
    };
}
