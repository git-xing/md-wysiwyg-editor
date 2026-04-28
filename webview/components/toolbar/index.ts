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
} from "@/ui/icons";
import { applyTooltip } from "@/ui/tooltip";
import { t, kbd } from "@/i18n";
import { sampleDocPosition } from "../selectionToolbar";
import { notifyOpenSettings, notifyGetProjectImages } from "@/messaging";
import { createButton, createSeparator } from "@/ui/dom";
import { attachImgPathComplete } from '../imageView/imgPathComplete';
import './toolbar.css';

type GetEditor = () => Editor | null;

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

// 调用 Milkdown 命令：传 command.key（CmdKey），而非 command 本身
function callCmd<T>(
    getEditor: GetEditor,
    command: { key: unknown },
    payload?: T,
): void {
    const editor = getEditor();
    if (!editor) {
        return;
    }
    editor.action((ctx) => {
        const mgr = ctx.get(commandsCtx);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mgr.call(command.key as any, payload as any);
    });
}

// 检查光标是否在指定节点类型内
function isInNode(view: EditorView, typeName: string): boolean {
    const { $from } = view.state.selection;
    for (let depth = $from.depth; depth >= 0; depth--) {
        if ($from.node(depth).type.name === typeName) {
            return true;
        }
    }
    return false;
}

// 自定义内联链接输入框（文本 + URL 两个输入框）
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
    okBtn.className = "tb-prompt-ok";
    okBtn.innerHTML = IconCheck;
    okBtn.title = t("Confirm");

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "tb-prompt-cancel";
    cancelBtn.innerHTML = IconX;
    cancelBtn.title = t("Cancel");

    overlay.appendChild(textInput);
    overlay.appendChild(urlInput);
    overlay.appendChild(okBtn);
    overlay.appendChild(cancelBtn);
    document.body.appendChild(overlay);

    // 定位到按钮下方
    const rect = near.getBoundingClientRect();
    overlay.style.top = `${rect.bottom + 4}px`;
    overlay.style.left = `${rect.left}px`;

    // 有预填文字则聚焦 URL，否则聚焦文字框
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

/**
 * 图片插入面板：居中悬浮（无遮罩），支持三种模式：浏览项目 / URL / 上传本地
 */
function showImageInsertPanel(
    onConfirm: (alt: string, src: string) => void,
    onUploadFile?: (file: File, altText: string) => Promise<string>,
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

    // ── 标题栏 ────────────────────────────────────────
    const titleBar = document.createElement("div");
    titleBar.className = "img-insert-title";
    const titleText = document.createElement("span");
    titleText.textContent = t("Insert Image");
    const closeBtn = document.createElement("button");
    closeBtn.className = "img-insert-close-btn";
    closeBtn.innerHTML = IconX;
    closeBtn.type = "button";
    titleBar.appendChild(titleText);
    titleBar.appendChild(closeBtn);
    panel.appendChild(titleBar);

    // ── Tab 切换 ──────────────────────────────────────
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

    // ── Alt 文本（三种模式共用）─────────────────────
    const altInput = document.createElement("input");
    altInput.type = "text";
    altInput.className = "img-insert-input";
    altInput.placeholder = t("Alt text (alt)");
    panel.appendChild(altInput);

    // ── 浏览项目 tab ──────────────────────────────────
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

    // ── URL 模式内容 ──────────────────────────────────
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

    // ── 上传本地 tab ──────────────────────────────────
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

    // ── 确认 / 取消 ──────────────────────────────────
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

    // 居中定位
    const pw = Math.min(540, window.innerWidth - 32);
    panel.style.width = pw + "px";
    panel.style.left = Math.round((window.innerWidth - pw) / 2) + "px";
    panel.style.top =
        Math.round((window.innerHeight - panel.offsetHeight) / 2) + "px";
    // 初次渲染后再垂直居中（offsetHeight 需要元素在 DOM 后才准确）
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

    // ── 放大预览（lightbox）────────────────────────────
    function showLightbox(src: string, name: string): void {
        const lb = document.createElement("div");
        lb.className = "img-lightbox";
        lb.addEventListener("mousedown", (e) => e.stopPropagation());

        const lbImg = document.createElement("img");
        lbImg.className = "img-lightbox-img";
        lbImg.src = src;
        lbImg.alt = name;

        const lbClose = document.createElement("button");
        lbClose.className = "img-lightbox-close";
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
            if (e.target === lb) {
                closeLb();
            }
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

    // ── 渲染图片网格 ──────────────────────────────────
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

            // 点击选中/取消
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

            // 放大预览
            enlargeBtn.addEventListener("mousedown", (e) => {
                e.preventDefault();
                e.stopPropagation();
                showLightbox(img.webviewUri, img.name);
            });
        });
    }

    // ── 加载项目图片 ──────────────────────────────────
    function loadProjectImages(): void {
        if (imagesLoaded) {
            return;
        }
        imagesLoaded = true;
        gridStatus.textContent = t("Loading...");
        gridStatus.style.display = "";
        imageGrid.innerHTML = "";
        const id = `gimgs_${Date.now().toString(36)}`;
        onGetProjectImages?.(id)
            .then((images) => {
                renderGrid(images ?? []);
            })
            .catch(() => {
                gridStatus.textContent = t("Failed to load images");
                gridStatus.style.display = "";
            });
    }

    function switchTab(tab: Tab): void {
        activeTab = tab;
        tabProject.classList.toggle(
            "img-insert-tab--active",
            tab === "project",
        );
        tabUrl.classList.toggle("img-insert-tab--active", tab === "url");
        tabUpload.classList.toggle("img-insert-tab--active", tab === "upload");
        projectSection.style.display = tab === "project" ? "" : "none";
        urlSection.style.display = tab === "url" ? "" : "none";
        uploadSection.style.display = tab === "upload" ? "" : "none";
        if (tab === "url") {
            srcInput.focus();
        }
        if (tab === "project") {
            loadProjectImages();
        }
    }

    // 上传本地：file input
    selectFileBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        fileInput.click();
    });
    fileInput.addEventListener("change", () => {
        const file = fileInput.files?.[0];
        if (file) {
            handleFile(file);
        }
    });

    function handleFile(file: File): void {
        if (!file.type.startsWith("image/")) {
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            uploadPreview.src = reader.result as string;
            uploadPreview.style.display = "";
        };
        reader.readAsDataURL(file);
        pendingUploadUrl = "";

        if (!onUploadFile) {
            return;
        }

        statusText.textContent = t("Uploading...");
        statusText.className = "img-insert-status img-insert-status--loading";
        statusText.style.display = "";
        okBtn.disabled = true;

        onUploadFile(file, altInput.value.trim())
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
            if (selectedImages.length === 0) {
                return;
            }
            cleanup();
            selectedImages.forEach((img) => onConfirm(alt, img.webviewUri));
        } else if (activeTab === "url") {
            // 补全选中时 dataset 存有 webviewUri，优先使用；否则直接用输入值
            const src = (srcInput.dataset.imgWebviewUri ?? "").trim() || srcInput.value.trim();
            cleanup();
            if (src) {
                onConfirm(alt, src);
            }
        } else {
            cleanup();
            if (pendingUploadUrl) {
                onConfirm(alt, pendingUploadUrl);
            }
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
        if (!panel.contains(e.target as Node)) {
            cleanup();
        }
    }

    // Tab 切换
    tabProject.addEventListener("mousedown", (e) => {
        e.preventDefault();
        switchTab("project");
    });
    tabUrl.addEventListener("mousedown", (e) => {
        e.preventDefault();
        switchTab("url");
    });
    tabUpload.addEventListener("mousedown", (e) => {
        e.preventDefault();
        switchTab("upload");
    });

    closeBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        cleanup();
    });
    okBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        confirm();
    });
    cancelBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        cleanup();
    });

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

    // 隐藏不可用 tab
    if (!onGetProjectImages) {
        tabProject.style.display = "none";
        switchTab("url");
    } else {
        loadProjectImages(); // 默认激活 project tab 时立即加载
    }
    if (!onUploadFile) {
        tabUpload.style.display = "none";
    }

    setTimeout(() => {
        document.addEventListener("mousedown", outsideClick);
    }, 0);
}

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

    // ── 目录导航（可选，位于工具栏最左侧）─────────────
    if (onTocToggle) {
        toolbar.appendChild(btn(IconToc, t("Table of Contents"), onTocToggle));
        toolbar.appendChild(sep());
    }

    // ── 撤销 / 重做（直接调 ProseMirror history）────────
    toolbar.appendChild(
        btn(IconUndo, t("Undo") + " " + kbd("Mod-z"), () => {
            const editor = getEditor();
            if (!editor) {
                return;
            }
            editor.action((ctx) => {
                const view = ctx.get(editorViewCtx);
                undo(view.state, view.dispatch);
            });
        }),
    );
    toolbar.appendChild(
        btn(IconRedo, t("Redo") + " " + kbd("Mod-Shift-z"), () => {
            const editor = getEditor();
            if (!editor) {
                return;
            }
            editor.action((ctx) => {
                const view = ctx.get(editorViewCtx);
                redo(view.state, view.dispatch);
            });
        }),
    );

    toolbar.appendChild(sep());

    // ── 块类型下拉（hover 展开，与浮动工具栏风格一致）──
    const fmtWrap = document.createElement("div");
    fmtWrap.className = "tb-fmt-wrap";

    const fmtBtn = document.createElement("button");
    fmtBtn.className = "tb-btn tb-fmt-btn";
    fmtBtn.innerHTML = `<span class="tb-fmt-label">P</span>${IconChevronDown}`;
    fmtBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
    });

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

    const fmtItems: HTMLElement[] = [];
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
        if (fmtHideTimer) {
            clearTimeout(fmtHideTimer);
            fmtHideTimer = null;
        }
        positionFmtMenu();
        fmtMenu.style.display = "flex";
    });
    fmtWrap.addEventListener("mouseleave", () => {
        fmtHideTimer = setTimeout(() => {
            fmtMenu.style.display = "none";
        }, 100);
    });
    fmtMenu.addEventListener("mouseenter", () => {
        if (fmtHideTimer) {
            clearTimeout(fmtHideTimer);
            fmtHideTimer = null;
        }
    });

    fmtWrap.appendChild(fmtBtn);
    fmtWrap.appendChild(fmtMenu);
    toolbar.appendChild(fmtWrap);

    toolbar.appendChild(sep());

    // ── 内联格式 ──────────────────────────────────────
    toolbar.appendChild(
        btn(IconBold, t("Bold") + " " + kbd("Mod-b"), () =>
            callCmd(getEditor, toggleStrongCommand),
        ),
    );
    toolbar.appendChild(
        btn(IconItalic, t("Italic") + " " + kbd("Mod-i"), () =>
            callCmd(getEditor, toggleEmphasisCommand),
        ),
    );
    toolbar.appendChild(
        btn(
            IconStrikethrough,
            t("Strikethrough") + " " + kbd("Mod-Shift-x"),
            () => callCmd(getEditor, toggleStrikethroughCommand),
        ),
    );
    toolbar.appendChild(
        btn(IconCode, t("Inline Code") + " " + kbd("Mod-e"), () => {
            const editor = getEditor();
            if (!editor) { return; }
            editor.action((ctx) => {
                const view = ctx.get(editorViewCtx);
                const { state } = view;
                if (!state.selection.empty) {
                    ctx.get(commandsCtx).call(toggleInlineCodeCommand.key as any);
                    return;
                }
                // 无选区：插入零宽空格占位文本 + inlineCode mark，光标置入其中
                const codeMark = state.schema.marks["inlineCode"];
                if (!codeMark) { return; }
                const { from } = state.selection;
                const textNode = state.schema.text("\u200b", [codeMark.create()]);
                const tr = state.tr.insert(from, textNode);
                tr.setSelection(TextSelection.create(tr.doc, from + 1));
                view.dispatch(tr);
                view.focus();
            });
        }),
    );
    toolbar.appendChild(
        btn(IconEraser, t("Clear Formatting"), () => {
            const editor = getEditor();
            if (!editor) {
                return;
            }
            editor.action((ctx) => {
                const view = ctx.get(editorViewCtx);
                const { state } = view;
                const { from, to, empty } = state.selection;
                if (empty) {
                    return;
                }
                let tr = state.tr;
                Object.values(state.schema.marks).forEach((markType) => {
                    tr = tr.removeMark(from, to, markType);
                });
                view.dispatch(tr);
                view.focus();
            });
        }),
    );

    toolbar.appendChild(sep());

    // ── 插入 ──────────────────────────────────────────
    // 链接：先捕获当前选区文字和已有链接，再通过双输入框获取文本和 URL
    let linkBtnEl: HTMLButtonElement;
    linkBtnEl = btn(IconLink, t("Insert/Edit Link"), () => {
        const editor = getEditor();
        if (!editor) {
            return;
        }

        let capturedFrom = 0;
        let capturedTo = 0;
        let existingHref = "";
        let selectedText = "";

        editor.action((ctx) => {
            const view = ctx.get(editorViewCtx);
            const { state } = view;
            const linkType = state.schema.marks["link"];
            if (!linkType) {
                return;
            }
            capturedFrom = state.selection.from;
            capturedTo = state.selection.to;
            if (capturedFrom !== capturedTo) {
                selectedText = state.doc.textBetween(capturedFrom, capturedTo);
            }
            state.doc.nodesBetween(capturedFrom, capturedTo, (node) => {
                const mark = linkType.isInSet(node.marks);
                if (mark) {
                    existingHref =
                        (mark.attrs as Record<string, string>)["href"] ?? "";
                }
            });
        });

        showInlineLinkPrompt(
            linkBtnEl,
            selectedText,
            existingHref,
            (text, href) => {
                editor.action((ctx) => {
                    const view = ctx.get(editorViewCtx);
                    const { state } = view;
                    const lType = state.schema.marks["link"];
                    if (!lType) {
                        return;
                    }
                    let tr = state.tr;
                    if (capturedFrom === capturedTo) {
                        // 无选区：插入新文字并加链接
                        const insertText = text || href;
                        if (!insertText) {
                            return;
                        }
                        tr = tr.insertText(insertText, capturedFrom);
                        if (href) {
                            tr = tr.addMark(
                                capturedFrom,
                                capturedFrom + insertText.length,
                                lType.create({ href, title: null }),
                            );
                        }
                    } else {
                        // 有选区：替换文字并更新链接
                        const newText = text || selectedText;
                        tr = tr.removeMark(capturedFrom, capturedTo, lType);
                        tr = tr.insertText(newText, capturedFrom, capturedTo);
                        if (href && newText) {
                            tr = tr.addMark(
                                capturedFrom,
                                capturedFrom + newText.length,
                                lType.create({ href, title: null }),
                            );
                        }
                    }
                    view.dispatch(tr);
                    view.focus();
                });
            },
        );
    });
    toolbar.appendChild(linkBtnEl);

    // 图片：弹出插入面板后插入 image 节点
    let imgBtnEl: HTMLButtonElement;
    imgBtnEl = btn(IconImage, t("Insert Image"), () => {
        showImageInsertPanel(
            (alt, src) => {
                const editor = getEditor();
                if (!editor) {
                    return;
                }
                editor.action((ctx) => {
                    const view = ctx.get(editorViewCtx);
                    const { state } = view;
                    const imageType = state.schema.nodes["image"];
                    if (!imageType) {
                        return;
                    }
                    const node = imageType.create({ src, alt, title: "" });
                    view.dispatch(state.tr.replaceSelectionWith(node));
                    view.focus();
                });
            },
            onUploadImage,
            onGetProjectImages,
        );
    });
    toolbar.appendChild(imgBtnEl);

    toolbar.appendChild(
        btn(IconTable, t("Insert Table"), () =>
            callCmd(getEditor, insertTableCommand, { row: 3, col: 3 }),
        ),
    );

    toolbar.appendChild(sep());

    // ── 列表（支持切换：再次点击取消） ──────────────────
    toolbar.appendChild(
        btn(IconList, t("Bullet List"), () => {
            const editor = getEditor();
            if (!editor) {
                return;
            }
            editor.action((ctx) => {
                const view = ctx.get(editorViewCtx);
                if (isInNode(view, "bullet_list")) {
                    // 已在无序列表中：lift 取消
                    lift(view.state, view.dispatch);
                } else {
                    ctx.get(commandsCtx).call(
                        wrapInBulletListCommand.key as any,
                    );
                }
            });
        }),
    );

    toolbar.appendChild(
        btn(IconListOrdered, t("Ordered List"), () => {
            const editor = getEditor();
            if (!editor) {
                return;
            }
            editor.action((ctx) => {
                const view = ctx.get(editorViewCtx);
                if (isInNode(view, "ordered_list")) {
                    lift(view.state, view.dispatch);
                } else {
                    ctx.get(commandsCtx).call(
                        wrapInOrderedListCommand.key as any,
                    );
                }
            });
        }),
    );

    // 任务列表：检测是否已是任务项，若是则 lift 取消
    toolbar.appendChild(
        btn(IconCheckSquare, t("Task List"), () => {
            const editor = getEditor();
            if (!editor) {
                return;
            }
            editor.action((ctx) => {
                const view = ctx.get(editorViewCtx);
                const { state } = view;

                // 检查是否已在 bullet_list 且有 checked 属性（任务列表）
                const { $from } = state.selection;
                let isTaskList = false;
                for (let depth = $from.depth; depth >= 0; depth--) {
                    const node = $from.node(depth);
                    if (
                        node.type.name === "list_item" &&
                        node.attrs["checked"] != null
                    ) {
                        isTaskList = true;
                        break;
                    }
                }

                if (isTaskList) {
                    lift(state, view.dispatch);
                } else {
                    // 先包裹为 bullet_list，再将 list_item 设为任务项
                    const mgr = ctx.get(commandsCtx);
                    mgr.call(wrapInBulletListCommand.key as any);

                    const { state: newState, dispatch } = view;
                    const { from, to } = newState.selection;
                    let tr = newState.tr;
                    let changed = false;
                    newState.doc.nodesBetween(from, to, (node, pos) => {
                        if (
                            node.type.name === "list_item" &&
                            node.attrs["checked"] == null
                        ) {
                            tr = tr.setNodeMarkup(pos, null, {
                                ...node.attrs,
                                checked: false,
                            });
                            changed = true;
                        }
                    });
                    if (changed) {
                        dispatch(tr);
                    }
                }
            });
        }),
    );

    toolbar.appendChild(sep());

    // ── 块（支持切换） ──────────────────────────────────
    toolbar.appendChild(
        btn(IconQuote, t("Blockquote"), () => {
            const editor = getEditor();
            if (!editor) {
                return;
            }
            editor.action((ctx) => {
                const view = ctx.get(editorViewCtx);
                if (isInNode(view, "blockquote")) {
                    lift(view.state, view.dispatch);
                } else {
                    ctx.get(commandsCtx).call(
                        wrapInBlockquoteCommand.key as any,
                    );
                }
            });
        }),
    );
    toolbar.appendChild(
        btn(IconTerminal, t("Code Block"), () =>
            callCmd(getEditor, createCodeBlockCommand),
        ),
    );
    toolbar.appendChild(
        btn(IconMinus, t("Horizontal Rule"), () =>
            callCmd(getEditor, insertHrCommand),
        ),
    );

    // ── 调试工具按钮（始终创建，由 setDebugMode 控制显隐）─────────────────
    let dbgSep: HTMLElement | null = null;
    let dbgWrap: HTMLElement | null = null;

    if (debugOpts) {
        const { getLineMap, getMarkdownSource } = debugOpts;

        dbgSep = sep();
        dbgSep.style.display = "none";

        dbgWrap = document.createElement("div");
        dbgWrap.className = "tb-fmt-wrap";
        dbgWrap.style.display = "none";

        const dbgBtn = document.createElement("button");
        dbgBtn.className = "tb-btn tb-fmt-btn";
        dbgBtn.innerHTML = IconList + IconChevronDown;
        applyTooltip(dbgBtn, "调试工具");
        dbgBtn.addEventListener("mousedown", (e) => {
            e.preventDefault();
            e.stopPropagation();
        });

        const dbgMenu = document.createElement("div");
        dbgMenu.className = "tb-fmt-menu";
        dbgMenu.style.display = "none";

        const testLineItem = document.createElement("button");
        testLineItem.className = "tb-fmt-item";
        testLineItem.textContent = "测试获取行号";
        testLineItem.addEventListener("click", async () => {
            dbgMenu.style.display = "none";
            const editor = getEditor();
            if (!editor) {
                return;
            }
            const view: EditorView = editor.action((ctx) =>
                ctx.get(editorViewCtx),
            );
            if (!view) {
                return;
            }

            const nodeCount = view.state.doc.childCount;
            const step = Math.max(1, Math.floor(nodeCount / 10));
            const samples: object[] = [];
            let offset = 0;

            for (let idx = 0; idx < nodeCount; idx++) {
                const node = view.state.doc.child(idx);
                if (idx % step === 0 && samples.length < 10) {
                    samples.push({
                        n: samples.length + 1,
                        ...sampleDocPosition(
                            view,
                            offset + 1,
                            getLineMap,
                            getMarkdownSource,
                        ),
                    });
                }
                offset += node.nodeSize;
            }

            const json = JSON.stringify(
                {
                    ts: new Date().toISOString(),
                    docNodes: nodeCount,
                    lineMapLen: getLineMap().length,
                    srcLines: getMarkdownSource().split("\n").length,
                    samples,
                },
                null,
                2,
            );

            try {
                await navigator.clipboard.writeText(json);
            } catch {
                console.log(
                    "[Debug] 测试行号结果（剪切板写入失败，改用 console）:",
                    json,
                );
            }
        });

        dbgMenu.appendChild(testLineItem);
        dbgWrap.appendChild(dbgBtn);
        dbgWrap.appendChild(dbgMenu);

        dbgWrap.addEventListener("mouseenter", () => {
            dbgMenu.style.display = "flex";
        });
        dbgWrap.addEventListener("mouseleave", () => {
            dbgMenu.style.display = "none";
        });

        toolbar.appendChild(dbgSep);
        toolbar.appendChild(dbgWrap);
    }

    // ── 设置按钮 ────────────────────────────────────────
    toolbar.appendChild(
        btn(IconSettings, t("Settings"), () => notifyOpenSettings()),
    );

    topbar.appendChild(toolbar);

    // 若页面加载时 debugMode 已为 true，立即显示
    if (window.__i18n?.debugMode && dbgSep && dbgWrap) {
        dbgSep.style.display = "";
        dbgWrap.style.display = "";
    }

    return {
        onSelectionChange(view: EditorView): void {
            const { $from } = view.state.selection;
            let activeLevel = 0; // 0 = paragraph
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
            // 更新按钮显示的格式标签
            const labelEl = fmtBtn.querySelector(".tb-fmt-label");
            if (labelEl) {
                const labels = ["P","H1","H2","H3","H4","H5","H6"];
                labelEl.textContent = activeLevel === -1 ? "—" : (labels[activeLevel] ?? "P");
            }
            fmtItems.forEach((item, i) => {
                // i=0 → P (activeLevel===0), i=1..6 → H1..H6 (activeLevel===i)
                item.classList.toggle(
                    "tb-fmt-item--active",
                    i === 0 ? activeLevel === 0 : i === activeLevel,
                );
            });
        },
        setDebugMode(enabled: boolean): void {
            if (!dbgSep || !dbgWrap) {
                return;
            }
            dbgSep.style.display = enabled ? "" : "none";
            dbgWrap.style.display = enabled ? "" : "none";
        },
    };
}
