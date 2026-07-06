import { commandsCtx, editorViewCtx } from "@milkdown/core";
import {
    createCodeBlockCommand,
    insertHrCommand,
    toggleEmphasisCommand,
    toggleInlineCodeCommand,
    toggleStrongCommand,
    turnIntoTextCommand,
    wrapInBlockquoteCommand,
    wrapInBulletListCommand,
    wrapInHeadingCommand,
    wrapInOrderedListCommand,
} from "@milkdown/preset-commonmark";
import {
    insertTableCommand,
    toggleStrikethroughCommand,
} from "@milkdown/preset-gfm";
import { undo, redo } from "@milkdown/prose/history";
import { lift } from "@milkdown/prose/commands";
import { TextSelection } from "@milkdown/prose/state";
import type { Editor } from "@milkdown/core";
import type { EditorView } from "@milkdown/prose/view";
import {
    IconAlignCenter,
    IconAlignLeft,
    IconAlignRight,
    IconBold,
    IconItalic,
    IconStrikethrough,
    IconCode,
    IconLink,
    IconImage,
    IconTable,
    IconQuote,
    IconTerminal,
    IconMinus,
    IconList,
    IconListOrdered,
    IconCheckSquare,
    IconUndo,
    IconRedo,
    IconCheck,
    IconX,
    IconToc,
    IconChevronDown,
    IconEraser,
    IconSettings,
    IconOverflow,
} from "@/ui/icons";
import { applyTooltip, hideTooltip } from "@/ui/tooltip";
import { t, kbd } from "@/i18n";
import { sampleDocPosition } from "../selectionToolbar";
import { notifyOpenSettings, notifyGetProjectImages } from "@/messaging";
import { createButton, createSeparator } from "@/ui/dom";
import { attachImgPathComplete } from '../imageView/imgPathComplete';
import './toolbar.css';
import { alignmentPluginKey } from '../../plugins/alignment';
import { TableGridSelector } from './tableGridSelector';

type GetEditor = () => Editor | null;

// ── 工具栏配置 ────────────────────────────────────────────
interface ToolbarItemConfig {
    /** 唯一标识 */
    id: string;
    /** 类型 */
    type: "button" | "separator" | "group" | "hidden";
    /** 图标 SVG（button 类型） */
    icon?: string;
    /** Tooltip 文本 */
    title?: string;
    /** 点击回调（button 类型） */
    onClick?: () => void;
    /** 是否可溢出到下拉菜单（默认 true） */
    overflowable?: boolean;
    /** 创建自定义 DOM 元素（group/hidden 类型） */
    createElement?: () => HTMLElement;
    /** 始终显示（覆盖 overflowable，如 format dropdown） */
    alwaysVisible?: boolean;
}

function sep(): HTMLElement {
    return createSeparator("tb-sep");
}

function btn(
    icon: string,
    title: string,
    onClick: () => void,
    extraClass = "",
): HTMLButtonElement {
    return createButton({
        className: `tb-btn${extraClass ? " " + extraClass : ""}`,
        icon,
        title,
        onClick,
    });
}

function callCmd<T>(
    getEditor: GetEditor,
    command: { key: unknown },
    payload?: T,
): void {
    const editor = getEditor();
    if (!editor) return;
    editor.action((ctx) => {
        const mgr = ctx.get(commandsCtx);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mgr.call(command.key as any, payload as any);
    });
}

function isInNode(view: EditorView, typeName: string): boolean {
    const { $from } = view.state.selection;
    for (let depth = $from.depth; depth >= 0; depth--) {
        if ($from.node(depth).type.name === typeName) {
            return true;
        }
    }
    return false;
}

// ── 内联链接弹窗 ──────────────────────────────────────────
function showInlineLinkPrompt(
    near: HTMLElement,
    defaultText: string,
    defaultHref: string,
    onConfirm: (text: string, href: string) => void,
): void {
    const overlay = document.createElement("div");
    overlay.className = "tb-prompt-overlay";
    overlay.addEventListener("mousedown", (e) => e.stopPropagation());

    const textInput = document.createElement("input");
    textInput.type = "text";
    textInput.className = "tb-prompt-input tb-prompt-input--short";
    textInput.placeholder = t("Link text");
    textInput.value = defaultText;

    const urlInput = document.createElement("input");
    urlInput.type = "text";
    urlInput.className = "tb-prompt-input";
    urlInput.placeholder = "https://...";
    urlInput.value = defaultHref;

    const okBtn = document.createElement("button");
    okBtn.className = "icon-btn tb-prompt-ok";
    okBtn.innerHTML = IconCheck;
    okBtn.title = t("Confirm");

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "icon-btn tb-prompt-cancel";
    cancelBtn.innerHTML = IconX;
    cancelBtn.title = t("Cancel");

    overlay.appendChild(textInput);
    overlay.appendChild(urlInput);
    overlay.appendChild(okBtn);
    overlay.appendChild(cancelBtn);
    document.body.appendChild(overlay);

    const rect = near.getBoundingClientRect();
    overlay.style.top = `${rect.bottom + 4}px`;
    overlay.style.left = `${rect.left}px`;

    if (defaultText) {
        urlInput.focus();
        urlInput.select();
    } else {
        textInput.focus();
    }

    function confirm(): void {
        const text = textInput.value.trim();
        const href = urlInput.value.trim();
        cleanup();
        onConfirm(text, href);
    }

    function cleanup(): void {
        if (document.body.contains(overlay)) {
            document.body.removeChild(overlay);
        }
        document.removeEventListener("mousedown", outsideClick);
    }

    function outsideClick(e: MouseEvent): void {
        const active = document.activeElement;
        if (
            !overlay.contains(e.target as Node) &&
            active !== textInput &&
            active !== urlInput
        ) {
            cleanup();
        }
    }

    okBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        confirm();
    });
    cancelBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        cleanup();
    });
    [textInput, urlInput].forEach((inp) => {
        inp.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.stopPropagation();
                e.preventDefault();
                confirm();
            } else if (e.key === "Escape") {
                e.stopPropagation();
                e.preventDefault();
                cleanup();
            }
        });
    });

    setTimeout(() => {
        document.addEventListener("mousedown", outsideClick);
    }, 0);
}

// ── 图片插入面板 ──────────────────────────────────────────
function showImageInsertPanel(
    onConfirm: (alt: string, src: string) => void,
    onUploadImage?: (file: File, altText: string) => Promise<string>,
    onGetProjectImages?: (
        id: string,
    ) => Promise<Array<{
        relPath: string;
        webviewUri: string;
        name: string;
    }> | null>,
): void {
    const panel = document.createElement("div");
    panel.className = "img-insert-panel";
    panel.addEventListener("mousedown", (e) => e.stopPropagation());

    const titleBar = document.createElement("div");
    titleBar.className = "img-insert-title";
    const titleText = document.createElement("span");
    titleText.textContent = t("Insert Image");
    const closeBtn = document.createElement("button");
    closeBtn.className = "icon-btn img-insert-close-btn";
    closeBtn.innerHTML = IconX;
    closeBtn.type = "button";
    titleBar.appendChild(titleText);
    titleBar.appendChild(closeBtn);
    panel.appendChild(titleBar);

    const tabsRow = document.createElement("div");
    tabsRow.className = "img-insert-tabs";

    const tabProject = document.createElement("button");
    tabProject.className = "img-insert-tab img-insert-tab--active";
    tabProject.textContent = t("Browse Project");
    tabProject.type = "button";

    const tabUrl = document.createElement("button");
    tabUrl.className = "img-insert-tab";
    tabUrl.textContent = t("URL");
    tabUrl.type = "button";

    const tabUpload = document.createElement("button");
    tabUpload.className = "img-insert-tab";
    tabUpload.textContent = t("Upload");
    tabUpload.type = "button";

    tabsRow.appendChild(tabProject);
    tabsRow.appendChild(tabUrl);
    tabsRow.appendChild(tabUpload);
    panel.appendChild(tabsRow);

    const altInput = document.createElement("input");
    altInput.type = "text";
    altInput.className = "img-insert-input";
    altInput.placeholder = t("Alt text (alt)");
    panel.appendChild(altInput);

    const projectSection = document.createElement("div");
    projectSection.className = "img-insert-section";

    const gridStatus = document.createElement("div");
    gridStatus.className = "img-insert-status";
    gridStatus.textContent = t("Loading...");

    const imageGrid = document.createElement("div");
    imageGrid.className = "img-insert-grid";

    const selectedCount = document.createElement("div");
    selectedCount.className = "img-insert-selected-count";
    selectedCount.style.display = "none";

    projectSection.appendChild(gridStatus);
    projectSection.appendChild(imageGrid);
    projectSection.appendChild(selectedCount);
    panel.appendChild(projectSection);

    const urlSection = document.createElement("div");
    urlSection.className = "img-insert-section";
    urlSection.style.display = "none";

    const srcInput = document.createElement("input");
    srcInput.type = "text";
    srcInput.className = "img-insert-input";
    srcInput.placeholder = t("Image URL https://...");
    urlSection.appendChild(srcInput);
    panel.appendChild(urlSection);
    const detachSrcComplete = attachImgPathComplete(srcInput);

    const uploadSection = document.createElement("div");
    uploadSection.className = "img-insert-section";
    uploadSection.style.display = "none";

    const selectFileBtn = document.createElement("button");
    selectFileBtn.className = "img-insert-browse-btn";
    selectFileBtn.type = "button";
    selectFileBtn.textContent = t("Select local image");

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.style.display = "none";

    const uploadPreview = document.createElement("img");
    uploadPreview.className = "img-insert-preview";
    uploadPreview.style.display = "none";

    const statusText = document.createElement("div");
    statusText.className = "img-insert-status";
    statusText.style.display = "none";

    uploadSection.appendChild(selectFileBtn);
    uploadSection.appendChild(fileInput);
    uploadSection.appendChild(uploadPreview);
    uploadSection.appendChild(statusText);
    panel.appendChild(uploadSection);

    const btnRow = document.createElement("div");
    btnRow.className = "img-insert-btn-row";

    const okBtn = document.createElement("button");
    okBtn.className = "img-insert-ok-btn";
    okBtn.innerHTML = IconCheck + " " + t("Confirm");
    okBtn.type = "button";

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "img-insert-cancel-btn";
    cancelBtn.innerHTML = IconX + " " + t("Cancel");
    cancelBtn.type = "button";

    btnRow.appendChild(okBtn);
    btnRow.appendChild(cancelBtn);
    panel.appendChild(btnRow);

    document.body.appendChild(panel);

    const pw = Math.min(540, window.innerWidth - 32);
    panel.style.width = pw + "px";
    panel.style.left = Math.round((window.innerWidth - pw) / 2) + "px";
    panel.style.top =
        Math.round((window.innerHeight - panel.offsetHeight) / 2) + "px";
    requestAnimationFrame(() => {
        panel.style.top =
            Math.round((window.innerHeight - panel.offsetHeight) / 2) + "px";
    });

    type Tab = "project" | "url" | "upload";
    let activeTab: Tab = "project";
    let pendingUploadUrl = "";
    let selectedImages: Array<{
        relPath: string;
        webviewUri: string;
        name: string;
    }> = [];
    let imagesLoaded = false;

    function updateSelectedCount(): void {
        if (selectedImages.length === 0) {
            selectedCount.style.display = "none";
        } else {
            selectedCount.textContent =
                t("Selected") + ": " + selectedImages.length;
            selectedCount.style.display = "";
        }
    }

    function showLightbox(src: string, name: string): void {
        const lb = document.createElement("div");
        lb.className = "img-lightbox";
        lb.addEventListener("mousedown", (e) => e.stopPropagation());

        const lbImg = document.createElement("img");
        lbImg.className = "img-lightbox-img";
        lbImg.src = src;
        lbImg.alt = name;

        const lbClose = document.createElement("button");
        lbClose.className = "icon-btn img-lightbox-close";
        lbClose.innerHTML = IconX;
        lbClose.type = "button";

        lb.appendChild(lbImg);
        lb.appendChild(lbClose);
        document.body.appendChild(lb);

        const closeLb = (): void => {
            if (document.body.contains(lb)) {
                document.body.removeChild(lb);
            }
        };
        lb.addEventListener("mousedown", (e) => {
            if (e.target === lb) closeLb();
        });
        lbClose.addEventListener("mousedown", (e) => {
            e.preventDefault();
            closeLb();
        });
        document.addEventListener("keydown", function onKey(e) {
            if (e.key === "Escape") {
                closeLb();
                document.removeEventListener("keydown", onKey);
            }
        });
    }

    function renderGrid(
        images: Array<{ relPath: string; webviewUri: string; name: string }>,
    ): void {
        imageGrid.innerHTML = "";
        selectedImages = [];
        updateSelectedCount();

        if (images.length === 0) {
            gridStatus.textContent = t("No images found");
            gridStatus.style.display = "";
            return;
        }

        gridStatus.style.display = "none";

        images.forEach((img) => {
            const item = document.createElement("div");
            item.className = "img-insert-thumb-item";
            item.title = img.name;

            const thumb = document.createElement("img");
            thumb.className = "img-insert-thumb";
            thumb.src = img.webviewUri;
            thumb.alt = img.name;
            thumb.loading = "lazy";

            const checkmark = document.createElement("div");
            checkmark.className = "img-insert-thumb-check";
            checkmark.innerHTML = IconCheck;

            const enlargeBtn = document.createElement("button");
            enlargeBtn.className = "img-insert-thumb-enlarge";
            enlargeBtn.innerHTML = "⤢";
            enlargeBtn.type = "button";
            enlargeBtn.title = t("Enlarge");

            item.appendChild(thumb);
            item.appendChild(checkmark);
            item.appendChild(enlargeBtn);
            imageGrid.appendChild(item);

            item.addEventListener("mousedown", (e) => {
                if (
                    (e.target as Element).closest(".img-insert-thumb-enlarge")
                ) {
                    return;
                }
                e.preventDefault();
                const idx = selectedImages.findIndex(
                    (s) => s.webviewUri === img.webviewUri,
                );
                if (idx >= 0) {
                    selectedImages.splice(idx, 1);
                    item.classList.remove("img-insert-thumb-item--selected");
                } else {
                    selectedImages.push(img);
                    item.classList.add("img-insert-thumb-item--selected");
                }
                updateSelectedCount();
            });

            enlargeBtn.addEventListener("mousedown", (e) => {
                e.preventDefault();
                e.stopPropagation();
                showLightbox(img.webviewUri, img.name);
            });
        });
    }

    function loadProjectImages(): void {
        if (imagesLoaded) return;
        imagesLoaded = true;
        gridStatus.textContent = t("Loading...");
        gridStatus.style.display = "";
        imageGrid.innerHTML = "";
        const id = `gimgs_${Date.now().toString(36)}`;
        onGetProjectImages?.(id)
            .then((images) => renderGrid(images ?? []))
            .catch(() => {
                gridStatus.textContent = t("Failed to load images");
                gridStatus.style.display = "";
            });
    }

    function switchTab(tab: Tab): void {
        activeTab = tab;
        tabProject.classList.toggle("img-insert-tab--active", tab === "project");
        tabUrl.classList.toggle("img-insert-tab--active", tab === "url");
        tabUpload.classList.toggle("img-insert-tab--active", tab === "upload");
        projectSection.style.display = tab === "project" ? "" : "none";
        urlSection.style.display = tab === "url" ? "" : "none";
        uploadSection.style.display = tab === "upload" ? "" : "none";
        if (tab === "url") srcInput.focus();
        if (tab === "project") loadProjectImages();
    }

    selectFileBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        fileInput.click();
    });
    fileInput.addEventListener("change", () => {
        const file = fileInput.files?.[0];
        if (file) handleFile(file);
    });

    function handleFile(file: File): void {
        if (!file.type.startsWith("image/")) return;
        const reader = new FileReader();
        reader.onload = () => {
            uploadPreview.src = reader.result as string;
            uploadPreview.style.display = "";
        };
        reader.readAsDataURL(file);
        pendingUploadUrl = "";

        if (!onUploadImage) return;

        statusText.textContent = t("Uploading...");
        statusText.className = "img-insert-status img-insert-status--loading";
        statusText.style.display = "";
        okBtn.disabled = true;

        onUploadImage(file, altInput.value.trim())
            .then((url) => {
                pendingUploadUrl = url;
                statusText.style.display = "none";
                okBtn.disabled = false;
            })
            .catch((err: Error) => {
                statusText.textContent = err.message;
                statusText.className =
                    "img-insert-status img-insert-status--error";
                okBtn.disabled = false;
                pendingUploadUrl = "";
            });
    }

    function confirm(): void {
        const alt = altInput.value.trim();
        if (activeTab === "project") {
            if (selectedImages.length === 0) return;
            cleanup();
            selectedImages.forEach((img) => onConfirm(alt, img.webviewUri));
        } else if (activeTab === "url") {
            const src = (srcInput.dataset.imgWebviewUri ?? "").trim() || srcInput.value.trim();
            cleanup();
            if (src) onConfirm(alt, src);
        } else {
            cleanup();
            if (pendingUploadUrl) onConfirm(alt, pendingUploadUrl);
        }
    }

    function cleanup(): void {
        detachSrcComplete();
        if (document.body.contains(panel)) {
            document.body.removeChild(panel);
        }
        document.removeEventListener("mousedown", outsideClick);
    }

    function outsideClick(e: MouseEvent): void {
        if (!panel.contains(e.target as Node)) cleanup();
    }

    tabProject.addEventListener("mousedown", (e) => { e.preventDefault(); switchTab("project"); });
    tabUrl.addEventListener("mousedown", (e) => { e.preventDefault(); switchTab("url"); });
    tabUpload.addEventListener("mousedown", (e) => { e.preventDefault(); switchTab("upload"); });
    closeBtn.addEventListener("mousedown", (e) => { e.preventDefault(); cleanup(); });
    okBtn.addEventListener("mousedown", (e) => { e.preventDefault(); confirm(); });
    cancelBtn.addEventListener("mousedown", (e) => { e.preventDefault(); cleanup(); });

    [altInput, srcInput].forEach((inp) => {
        inp.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.stopPropagation();
                e.preventDefault();
                confirm();
            } else if (e.key === "Escape") {
                e.stopPropagation();
                e.preventDefault();
                cleanup();
            }
        });
    });

    if (!onGetProjectImages) {
        tabProject.style.display = "none";
        switchTab("url");
    } else {
        loadProjectImages();
    }
    if (!onUploadImage) tabUpload.style.display = "none";

    setTimeout(() => {
        document.addEventListener("mousedown", outsideClick);
    }, 0);
}

// ── 主函数 ────────────────────────────────────────────────
export function initToolbar(
    topbar: HTMLElement,
    getEditor: GetEditor,
    onTocToggle?: () => void,
    debugOpts?: {
        getLineMap: () => number[];
        getMarkdownSource: () => string;
    },
    onUploadImage?: (file: File, altText: string) => Promise<string>,
    onGetProjectImages?: (
        id: string,
    ) => Promise<Array<{
        relPath: string;
        webviewUri: string;
        name: string;
    }> | null>,
): {
    onSelectionChange: (view: EditorView) => void;
    setDebugMode: (enabled: boolean) => void;
} {
    const toolbar = document.createElement("div");
    toolbar.className = "toolbar";

    // ── 工具栏配置：定义所有项目及其溢出行为 ──────────────
    const config: ToolbarItemConfig[] = [];

    // 目录（条件）
    if (onTocToggle) {
        config.push(
            { id: "toc", type: "button", icon: IconToc, title: t("Table of Contents"), onClick: onTocToggle },
            { id: "sep-toc", type: "separator" },
        );
    }

    // 撤销 / 重做
    config.push(
        { id: "undo", type: "button", icon: IconUndo, title: t("Undo") + " " + kbd("Mod-z"), onClick: () => {
            const editor = getEditor();
            if (!editor) return;
            editor.action((ctx) => { const view = ctx.get(editorViewCtx); undo(view.state, view.dispatch); });
        }},
        { id: "redo", type: "button", icon: IconRedo, title: t("Redo") + " " + kbd("Mod-Shift-z"), onClick: () => {
            const editor = getEditor();
            if (!editor) return;
            editor.action((ctx) => { const view = ctx.get(editorViewCtx); redo(view.state, view.dispatch); });
        }},
        { id: "sep-history", type: "separator" },
    );

    // 块格式下拉 — 始终可见，不溢出
    config.push({ id: "format", type: "group", alwaysVisible: true, overflowable: false });

    // 内联格式
    config.push(
        { id: "bold", type: "button", icon: IconBold, title: t("Bold") + " " + kbd("Mod-b"), onClick: () => callCmd(getEditor, toggleStrongCommand) },
        { id: "italic", type: "button", icon: IconItalic, title: t("Italic") + " " + kbd("Mod-i"), onClick: () => callCmd(getEditor, toggleEmphasisCommand) },
        { id: "strikethrough", type: "button", icon: IconStrikethrough, title: t("Strikethrough") + " " + kbd("Mod-Shift-x"), onClick: () => callCmd(getEditor, toggleStrikethroughCommand) },
        { id: "inline-code", type: "button", icon: IconCode, title: t("Inline Code") + " " + kbd("Mod-e"), onClick: () => {
            const editor = getEditor();
            if (!editor) return;
            editor.action((ctx) => {
                const view = ctx.get(editorViewCtx);
                const { state } = view;
                if (!state.selection.empty) {
                    ctx.get(commandsCtx).call(toggleInlineCodeCommand.key as any);
                    return;
                }
                const codeMark = state.schema.marks["inlineCode"];
                if (!codeMark) return;
                const { from } = state.selection;
                const textNode = state.schema.text("\u200b", [codeMark.create()]);
                const tr = state.tr.insert(from, textNode);
                tr.setSelection(TextSelection.create(tr.doc, from + 1));
                view.dispatch(tr);
                view.focus();
            });
        }},
        { id: "clear-format", type: "button", icon: IconEraser, title: t("Clear Formatting"), onClick: () => {
            const editor = getEditor();
            if (!editor) return;
            editor.action((ctx) => {
                const view = ctx.get(editorViewCtx);
                const { state } = view;
                const { from, to, empty } = state.selection;
                if (empty) return;
                let tr = state.tr;
                Object.values(state.schema.marks).forEach((markType) => {
                    tr = tr.removeMark(from, to, markType);
                });
                view.dispatch(tr);
                view.focus();
            });
        }},
        { id: "sep-inline", type: "separator" },
    );

    // 插入
    config.push(
        { id: "link", type: "button", icon: IconLink, title: t("Insert/Edit Link") },
        { id: "image", type: "button", icon: IconImage, title: t("Insert Image") },
        { id: "table", type: "group", alwaysVisible: true, overflowable: false },
        { id: "sep-insert", type: "separator" },
    );

    // 列表
    config.push(
        { id: "bullet-list", type: "button", icon: IconList, title: t("Bullet List"), onClick: () => {
            const editor = getEditor();
            if (!editor) return;
            editor.action((ctx) => {
                const view = ctx.get(editorViewCtx);
                if (isInNode(view, "bullet_list")) {
                    lift(view.state, view.dispatch);
                } else {
                    ctx.get(commandsCtx).call(wrapInBulletListCommand.key as any);
                }
            });
        }},
        { id: "ordered-list", type: "button", icon: IconListOrdered, title: t("Ordered List"), onClick: () => {
            const editor = getEditor();
            if (!editor) return;
            editor.action((ctx) => {
                const view = ctx.get(editorViewCtx);
                if (isInNode(view, "ordered_list")) {
                    lift(view.state, view.dispatch);
                } else {
                    ctx.get(commandsCtx).call(wrapInOrderedListCommand.key as any);
                }
            });
        }},
        { id: "task-list", type: "button", icon: IconCheckSquare, title: t("Task List"), onClick: () => {
            const editor = getEditor();
            if (!editor) return;
            editor.action((ctx) => {
                const view = ctx.get(editorViewCtx);
                const { state } = view;
                const { $from } = state.selection;
                let isTaskList = false;
                for (let depth = $from.depth; depth >= 0; depth--) {
                    const node = $from.node(depth);
                    if (node.type.name === "list_item" && node.attrs["checked"] != null) {
                        isTaskList = true;
                        break;
                    }
                }
                if (isTaskList) {
                    lift(state, view.dispatch);
                } else {
                    const mgr = ctx.get(commandsCtx);
                    mgr.call(wrapInBulletListCommand.key as any);
                    const { state: newState, dispatch } = view;
                    const { from, to } = newState.selection;
                    let tr = newState.tr;
                    let changed = false;
                    newState.doc.nodesBetween(from, to, (node, pos) => {
                        if (node.type.name === "list_item" && node.attrs["checked"] == null) {
                            tr = tr.setNodeMarkup(pos, null, { ...node.attrs, checked: false });
                            changed = true;
                        }
                    });
                    if (changed) dispatch(tr);
                }
            });
        }},
        { id: "sep-list", type: "separator" },
    );

    // 块
    config.push(
        { id: "blockquote", type: "button", icon: IconQuote, title: t("Blockquote"), onClick: () => {
            const editor = getEditor();
            if (!editor) return;
            editor.action((ctx) => {
                const view = ctx.get(editorViewCtx);
                if (isInNode(view, "blockquote")) {
                    lift(view.state, view.dispatch);
                } else {
                    ctx.get(commandsCtx).call(wrapInBlockquoteCommand.key as any);
                }
            });
        }},
        { id: "code-block", type: "button", icon: IconTerminal, title: t("Code Block"), onClick: () => callCmd(getEditor, createCodeBlockCommand) },
        { id: "hr", type: "button", icon: IconMinus, title: t("Horizontal Rule"), onClick: () => callCmd(getEditor, insertHrCommand) },
    );

    // 对齐 — 永远隐藏，不参与溢出
    config.push({ id: "align", type: "hidden", overflowable: false });

    // 调试 — 条件隐藏
    if (debugOpts) {
        config.push({ id: "debug", type: "hidden", overflowable: false });
    }

    // 设置
    config.push(
        { id: "sep-settings", type: "separator" },
        { id: "settings", type: "button", icon: IconSettings, title: t("Settings"), onClick: () => notifyOpenSettings() },
    );

    // ── 从配置构建 DOM ─────────────────────────────────────
    const elements = new Map<string, HTMLElement>();
    const fmtItems: HTMLElement[] = [];
    let fmtBtn: HTMLButtonElement;
    let fmtWrap: HTMLElement;
    let alignWrap: HTMLElement;
    let dbgSep: HTMLElement | null = null;
    let dbgWrap: HTMLElement | null = null;

    for (const item of config) {
        if (item.type === "button") {
            const el = btn(item.icon!, item.title!, item.onClick!);
            if (item.id === "link") {
                // 链接按钮需要特殊处理（捕获选区）
                el.addEventListener("mousedown", (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const editor = getEditor();
                    if (!editor) return;
                    let capturedFrom = 0;
                    let capturedTo = 0;
                    let existingHref = "";
                    let selectedText = "";
                    editor.action((ctx) => {
                        const view = ctx.get(editorViewCtx);
                        const { state } = view;
                        const linkType = state.schema.marks["link"];
                        if (!linkType) return;
                        capturedFrom = state.selection.from;
                        capturedTo = state.selection.to;
                        if (capturedFrom !== capturedTo) {
                            selectedText = state.doc.textBetween(capturedFrom, capturedTo);
                        }
                        state.doc.nodesBetween(capturedFrom, capturedTo, (node) => {
                            const mark = linkType.isInSet(node.marks);
                            if (mark) existingHref = (mark.attrs as Record<string, string>)["href"] ?? "";
                        });
                    });
                    showInlineLinkPrompt(el, selectedText, existingHref, (text, href) => {
                        editor.action((ctx) => {
                            const view = ctx.get(editorViewCtx);
                            const { state } = view;
                            const lType = state.schema.marks["link"];
                            if (!lType) return;
                            let tr = state.tr;
                            if (capturedFrom === capturedTo) {
                                const insertText = text || href;
                                if (!insertText) return;
                                tr = tr.insertText(insertText, capturedFrom);
                                if (href) tr = tr.addMark(capturedFrom, capturedFrom + insertText.length, lType.create({ href, title: null }));
                            } else {
                                const newText = text || selectedText;
                                tr = tr.removeMark(capturedFrom, capturedTo, lType);
                                tr = tr.insertText(newText, capturedFrom, capturedTo);
                                if (href && newText) tr = tr.addMark(capturedFrom, capturedFrom + newText.length, lType.create({ href, title: null }));
                            }
                            view.dispatch(tr);
                            view.focus();
                        });
                    });
                });
                // 覆盖 onClick，由上面的 mousedown 处理
                (el as any).__linkHandled = true;
            }
            if (item.id === "image") {
                el.addEventListener("mousedown", (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    showImageInsertPanel(
                        (alt, src) => {
                            const editor = getEditor();
                            if (!editor) return;
                            editor.action((ctx) => {
                                const view = ctx.get(editorViewCtx);
                                const { state } = view;
                                const imageType = state.schema.nodes["image"];
                                if (!imageType) return;
                                const node = imageType.create({ src, alt, title: "" });
                                view.dispatch(state.tr.replaceSelectionWith(node));
                                view.focus();
                            });
                        },
                        onUploadImage,
                        onGetProjectImages,
                    );
                });
            }
            toolbar.appendChild(el);
            elements.set(item.id, el);
        } else if (item.type === "separator") {
            toolbar.appendChild(sep());
        } else if (item.type === "group" && item.id === "format") {
            // 块格式下拉
            fmtWrap = document.createElement("div");
            fmtWrap.className = "tb-fmt-wrap";
            fmtBtn = document.createElement("button");
            fmtBtn.className = "tb-btn tb-fmt-btn";
            fmtBtn.innerHTML = `<span class="tb-fmt-label">P</span>${IconChevronDown}`;
            fmtBtn.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); });

            const fmtMenu = document.createElement("div");
            fmtMenu.className = "tb-fmt-menu";
            fmtMenu.style.display = "none";

            const formats: [string, () => void][] = [
                ["P", () => callCmd(getEditor, turnIntoTextCommand)],
                ["H1", () => callCmd(getEditor, wrapInHeadingCommand, 1)],
                ["H2", () => callCmd(getEditor, wrapInHeadingCommand, 2)],
                ["H3", () => callCmd(getEditor, wrapInHeadingCommand, 3)],
                ["H4", () => callCmd(getEditor, wrapInHeadingCommand, 4)],
                ["H5", () => callCmd(getEditor, wrapInHeadingCommand, 5)],
                ["H6", () => callCmd(getEditor, wrapInHeadingCommand, 6)],
            ];

            formats.forEach(([label, action]) => {
                const item = document.createElement("div");
                item.className = "tb-fmt-item";
                item.textContent = label;
                item.addEventListener("mousedown", (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    action();
                    fmtMenu.style.display = "none";
                });
                fmtMenu.appendChild(item);
                fmtItems.push(item);
            });

            let fmtHideTimer: ReturnType<typeof setTimeout> | null = null;
            function positionFmtMenu(): void {
                const rect = fmtBtn.getBoundingClientRect();
                const approxMenuH = formats.length * 30;
                const spaceBelow = window.innerHeight - rect.bottom;
                if (spaceBelow < approxMenuH + 8) {
                    fmtMenu.style.top = "auto";
                    fmtMenu.style.bottom = "calc(100% + 6px)";
                } else {
                    fmtMenu.style.bottom = "auto";
                    fmtMenu.style.top = "calc(100% + 6px)";
                }
            }
            fmtWrap.addEventListener("mouseenter", () => {
                if (fmtHideTimer) { clearTimeout(fmtHideTimer); fmtHideTimer = null; }
                positionFmtMenu();
                fmtMenu.style.display = "flex";
            });
            fmtWrap.addEventListener("mouseleave", () => {
                fmtHideTimer = setTimeout(() => { fmtMenu.style.display = "none"; }, 100);
            });
            fmtMenu.addEventListener("mouseenter", () => {
                if (fmtHideTimer) { clearTimeout(fmtHideTimer); fmtHideTimer = null; }
            });

            fmtWrap.appendChild(fmtBtn);
            fmtWrap.appendChild(fmtMenu);
            toolbar.appendChild(fmtWrap);
            elements.set("format", fmtWrap);
        } else if (item.type === "group" && item.id === "table") {
            // 表格按钮 + 网格选择器
            const tableBtn = btn(IconTable, "", () => callCmd(getEditor, insertTableCommand, { row: 3, col: 3 }));
            const tableGridSelector = new TableGridSelector();
            tableGridSelector.attachTo(tableBtn);
            tableGridSelector.onSelect((rows, cols) => {
                const editor = getEditor();
                if (!editor) return;
                editor.action((ctx) => {
                    const view = ctx.get(editorViewCtx);
                    const { state } = view;
                    ctx.get(commandsCtx).call(insertTableCommand.key as any, { row: rows, col: cols });
                    const newState = view.state;
                    const { $from } = newState.selection;
                    for (let depth = $from.depth; depth >= 0; depth--) {
                        const node = $from.node(depth);
                        if (node.type.name === 'table') {
                            const tableStart = $from.before(depth);
                            let found = false;
                            newState.doc.nodesBetween(tableStart, tableStart + node.nodeSize, (n, p) => {
                                if (found) return false;
                                if (n.type.name === 'paragraph' && p > tableStart) {
                                    const tr = newState.tr;
                                    tr.setSelection(TextSelection.create(tr.doc, p + 1));
                                    view.dispatch(tr);
                                    view.focus();
                                    found = true;
                                    return false;
                                }
                            });
                            break;
                        }
                    }
                });
            });
            toolbar.appendChild(tableBtn);
            elements.set("table", tableBtn);
        } else if (item.type === "hidden" && item.id === "align") {
            // 对齐按钮组
            alignWrap = document.createElement("div");
            alignWrap.className = "tb-align-wrap";
            alignWrap.style.display = "none";
            const alignBtn = document.createElement("button");
            alignBtn.className = "tb-btn";
            alignBtn.innerHTML = IconAlignLeft;
            applyTooltip(alignBtn, t("Align Left"));
            alignBtn.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); });
            const alignMenu = document.createElement("div");
            alignMenu.className = "tb-align-menu";
            alignMenu.style.display = "none";
            const alignDefs: [string, string, string][] = [
                [IconAlignLeft, t("Align Left"), "left"],
                [IconAlignCenter, t("Align Center"), "center"],
                [IconAlignRight, t("Align Right"), "right"],
            ];
            alignDefs.forEach(([icon, title, value]) => {
                const item = document.createElement("div");
                item.className = "tb-align-item";
                item.innerHTML = icon;
                applyTooltip(item as HTMLElement, title, { placement: "right" });
                item.addEventListener("mousedown", (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const editor = getEditor();
                    if (!editor) return;
                    const view = editor.ctx.get(editorViewCtx);
                    if (!view) return;
                    const { $from } = view.state.selection;
                    const pos = $from.before($from.depth);
                    const node = $from.node($from.depth);
                    if (node.type.name === "html") {
                        const text = node.textContent;
                        const paraType = view.state.schema.nodes["paragraph"];
                        if (!paraType) return;
                        const newPara = paraType.create({}, view.state.schema.text(text));
                        const tr = view.state.tr.replaceWith(pos, pos + node.nodeSize, newPara);
                        tr.setMeta(alignmentPluginKey, { action: "set", pos, align: value });
                        view.dispatch(tr);
                    } else if (node.type.name === "paragraph") {
                        const tr = view.state.tr.setMeta(alignmentPluginKey, { action: "set", pos, align: value });
                        view.dispatch(tr);
                    }
                    alignBtn.innerHTML = icon;
                    applyTooltip(alignBtn, title);
                    alignMenu.style.display = "none";
                });
                alignMenu.appendChild(item);
            });
            let alignHideTimer: ReturnType<typeof setTimeout> | null = null;
            alignWrap.addEventListener("mouseenter", () => {
                if (alignHideTimer) { clearTimeout(alignHideTimer); alignHideTimer = null; }
                const rect = alignBtn.getBoundingClientRect();
                const approxH = alignDefs.length * 34;
                const spaceBelow = window.innerHeight - rect.bottom;
                if (spaceBelow < approxH + 8) {
                    alignMenu.style.top = "auto";
                    alignMenu.style.bottom = "calc(100% + 6px)";
                } else {
                    alignMenu.style.bottom = "auto";
                    alignMenu.style.top = "calc(100% + 6px)";
                }
                alignMenu.style.display = "flex";
            });
            alignWrap.addEventListener("mouseleave", () => {
                alignHideTimer = setTimeout(() => { alignMenu.style.display = "none"; }, 100);
            });
            alignMenu.addEventListener("mouseenter", () => {
                if (alignHideTimer) { clearTimeout(alignHideTimer); alignHideTimer = null; }
            });
            alignWrap.appendChild(alignBtn);
            alignWrap.appendChild(alignMenu);
            toolbar.appendChild(alignWrap);
            elements.set("align", alignWrap);
        } else if (item.type === "hidden" && item.id === "debug" && debugOpts) {
            // 调试按钮组
            const { getLineMap, getMarkdownSource } = debugOpts;
            dbgSep = sep();
            dbgSep.style.display = "none";
            dbgWrap = document.createElement("div");
            dbgWrap.className = "tb-fmt-wrap";
            dbgWrap.style.display = "none";
            const dbgBtn = document.createElement("button");
            dbgBtn.className = "tb-btn tb-fmt-btn";
            dbgBtn.innerHTML = IconList + IconChevronDown;
            applyTooltip(dbgBtn, t("Debug tools"));
            dbgBtn.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); });
            const dbgMenu = document.createElement("div");
            dbgMenu.className = "tb-fmt-menu";
            dbgMenu.style.display = "none";
            const testLineItem = document.createElement("button");
            testLineItem.className = "tb-fmt-item";
            testLineItem.textContent = t("Test get line number");
            testLineItem.addEventListener("click", async () => {
                dbgMenu.style.display = "none";
                const editor = getEditor();
                if (!editor) return;
                const view: EditorView = editor.action((ctx) => ctx.get(editorViewCtx));
                if (!view) return;
                const nodeCount = view.state.doc.childCount;
                const step = Math.max(1, Math.floor(nodeCount / 10));
                const samples: object[] = [];
                let offset = 0;
                for (let idx = 0; idx < nodeCount; idx++) {
                    const node = view.state.doc.child(idx);
                    if (idx % step === 0 && samples.length < 10) {
                        samples.push({ n: samples.length + 1, ...sampleDocPosition(view, offset + 1, getLineMap, getMarkdownSource) });
                    }
                    offset += node.nodeSize;
                }
                const json = JSON.stringify({ ts: new Date().toISOString(), docNodes: nodeCount, lineMapLen: getLineMap().length, srcLines: getMarkdownSource().split("\n").length, samples }, null, 2);
                try { await navigator.clipboard.writeText(json); } catch { console.log("[Debug] 测试行号结果:", json); }
            });
            dbgMenu.appendChild(testLineItem);
            dbgWrap.appendChild(dbgBtn);
            dbgWrap.appendChild(dbgMenu);
            dbgWrap.addEventListener("mouseenter", () => { dbgMenu.style.display = "flex"; });
            dbgWrap.addEventListener("mouseleave", () => { dbgMenu.style.display = "none"; });
            toolbar.appendChild(dbgSep);
            toolbar.appendChild(dbgWrap);
            elements.set("debug", dbgWrap);
        }
    }

    topbar.appendChild(toolbar);

    // 若页面加载时 debugMode 已为 true，立即显示
    if (window.__i18n?.debugMode && dbgSep && dbgWrap) {
        dbgSep.style.display = "";
        dbgWrap.style.display = "";
    }

    // ── 溢出检测与下拉菜单 ─────────────────────────────────
    const overflowMenu = document.createElement("div");
    overflowMenu.className = "tb-overflow-menu";
    document.body.appendChild(overflowMenu);

    // 溢出按钮放回 toolbar 内部
    const overflowBtn = document.createElement("button");
    overflowBtn.className = "tb-overflow-btn";
    overflowBtn.innerHTML = IconOverflow;
    applyTooltip(overflowBtn, t("More tools"));
    toolbar.appendChild(overflowBtn);

    // wrapper 包裹 toolbar
    const toolbarWrapper = document.createElement("div");
    toolbarWrapper.className = "toolbar-wrapper";
    toolbar.parentNode?.insertBefore(toolbarWrapper, toolbar);
    toolbarWrapper.appendChild(toolbar);

    let overflowOpen = false;

    function closeOverflow(): void {
        overflowOpen = false;
        overflowMenu.classList.remove("tb-overflow-menu--visible");
        document.removeEventListener("mousedown", onOverflowOutsideClick);
    }

    function onOverflowOutsideClick(e: MouseEvent): void {
        if (!overflowMenu.contains(e.target as Node) && e.target !== overflowBtn) {
            closeOverflow();
        }
    }

    overflowBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (overflowOpen) {
            closeOverflow();
        } else {
            overflowOpen = true;
            hideTooltip();
            overflowMenu.classList.add("tb-overflow-menu--visible");
            const rect = overflowBtn.getBoundingClientRect();
            const menuH = overflowMenu.offsetHeight;
            const spaceBelow = window.innerHeight - rect.bottom;
            if (spaceBelow < menuH + 8) {
                overflowMenu.style.top = "auto";
                overflowMenu.style.bottom = `${window.innerHeight - rect.top + 4}px`;
            } else {
                overflowMenu.style.top = `${rect.bottom + 4}px`;
                overflowMenu.style.bottom = "auto";
            }
            overflowMenu.style.left = `${Math.min(
                rect.left + rect.width / 2 - overflowMenu.offsetWidth / 2,
                window.innerWidth - overflowMenu.offsetWidth - 8,
            )}px`;
            setTimeout(() => {
                document.addEventListener("mousedown", onOverflowOutsideClick);
            }, 0);
        }
    });

    // ── 溢出检测 ───────────────────────────────────────────
    const hiddenByOverflow = new Set<HTMLElement>();
    let checking = false;

    function getAllVisibleChildren(): HTMLElement[] {
        return Array.from(toolbar.children).filter((child) => {
            if (hiddenByOverflow.has(child)) return false;
            const style = window.getComputedStyle(child);
            return style.display !== "none";
        }) as HTMLElement[];
    }

    function isOverflowableButton(el: HTMLElement): boolean {
        if (el.classList.contains("tb-sep")) return false;
        for (const [id, el2] of elements) {
            if (el2 === el) {
                const cfg = config.find((c) => c.id === id);
                return cfg ? cfg.overflowable !== false && cfg.type !== "hidden" : true;
            }
        }
        return false;
    }

    function checkOverflow(): void {
        if (checking) return;
        checking = true;

        closeOverflow();

        // 恢复
        for (const child of hiddenByOverflow) child.style.display = "";
        hiddenByOverflow.clear();
        overflowBtn.style.display = "none";

        const children = getAllVisibleChildren();
        const gap = 2;
        const available = toolbarWrapper.clientWidth - 4;

        // 测量所有子元素累计宽度（含 margin）
        let totalWidth = 0;
        let firstOverflowIdx = -1;
        for (let i = 0; i < children.length; i++) {
            const rect = children[i].getBoundingClientRect();
            const style = window.getComputedStyle(children[i]);
            const ml = parseFloat(style.marginLeft) || 0;
            const mr = parseFloat(style.marginRight) || 0;
            totalWidth += rect.width + ml + mr + gap;
            if (totalWidth > available && firstOverflowIdx === -1) {
                firstOverflowIdx = i;
            }
        }

        if (firstOverflowIdx === -1) {
            checking = false;
            return;
        }

        overflowBtn.style.display = "flex";
        overflowMenu.innerHTML = "";

        // 从溢出点开始隐藏所有子元素
        for (let i = firstOverflowIdx; i < children.length; i++) {
            children[i].style.display = "none";
            hiddenByOverflow.add(children[i]);
        }

        // 二次检查：逐个隐藏被裁切的末尾按钮（跳过分隔符）
        for (;;) {
            const remaining = getAllVisibleChildren();
            // 找最后一个按钮（非分隔符）
            let lastBtn: HTMLElement | null = null;
            for (let i = remaining.length - 1; i >= 0; i--) {
                if (isOverflowableButton(remaining[i])) {
                    lastBtn = remaining[i];
                    break;
                }
            }
            if (!lastBtn) break;
            const lastRect = lastBtn.getBoundingClientRect();
            const toolbarRect = toolbar.getBoundingClientRect();
            if (lastRect.right <= toolbarRect.right + 1) break;
            lastBtn.style.display = "none";
            hiddenByOverflow.add(lastBtn);
        }

        // 构建溢出菜单（按 DOM 顺序排列）
        const sortedHidden = Array.from(hiddenByOverflow).sort((a, b) => {
            const children = Array.from(toolbar.children);
            return children.indexOf(a) - children.indexOf(b);
        });
        for (const child of sortedHidden) {
            if (!isOverflowableButton(child)) continue;
            const svgEl = child.querySelector("svg");
            if (!svgEl) continue;

            const clonedBtn = document.createElement("button");
            clonedBtn.className = "tb-overflow-item";
            clonedBtn.innerHTML = svgEl.outerHTML;
            const tooltipText = child.dataset.tooltip || "";
            if (tooltipText) applyTooltip(clonedBtn, tooltipText);

            const capturedChild = child;
            clonedBtn.addEventListener("mousedown", (e) => {
                e.preventDefault();
                e.stopPropagation();
                const target = capturedChild.querySelector("button") as HTMLElement | null;
                if (target) target.click();
                else capturedChild.click();
                closeOverflow();
            });

            overflowMenu.appendChild(clonedBtn);
        }

        if (overflowMenu.children.length === 0) {
            overflowBtn.style.display = "none";
        }

        checking = false;
    }

    window.addEventListener("resize", () => {
        if (overflowOpen) closeOverflow();
        requestAnimationFrame(checkOverflow);
    });

    requestAnimationFrame(checkOverflow);

    return {
        onSelectionChange(view: EditorView): void {
            const { $from } = view.state.selection;
            let activeLevel = 0;
            for (let d = $from.depth; d >= 0; d--) {
                const n = $from.node(d);
                if (n.type.name === "heading") {
                    activeLevel = n.attrs["level"] as number;
                    break;
                }
                if (n.type.name === "code_block") {
                    activeLevel = -1;
                    break;
                }
            }
            const labelEl = fmtBtn?.querySelector(".tb-fmt-label");
            if (labelEl) {
                const labels = ["P", "H1", "H2", "H3", "H4", "H5", "H6"];
                labelEl.textContent = activeLevel === -1 ? "—" : (labels[activeLevel] ?? "P");
            }
            fmtItems.forEach((item, i) => {
                item.classList.toggle(
                    "tb-fmt-item--active",
                    i === 0 ? activeLevel === 0 : i === activeLevel,
                );
            });
        },
        setDebugMode(enabled: boolean): void {
            if (!dbgSep || !dbgWrap) return;
            dbgSep.style.display = enabled ? "" : "none";
            dbgWrap.style.display = enabled ? "" : "none";
            requestAnimationFrame(checkOverflow);
        },
    };
}
