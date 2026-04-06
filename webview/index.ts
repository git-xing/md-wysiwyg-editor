import "./style.css";
import {
    createEditor,
    getEditorView,
    registerSelectionChangeHandler,
    setLogTableSel,
} from "./editor";
import type { EditorView } from "@milkdown/prose/view";
import { TextSelection } from "@milkdown/prose/state";
import {
    notifyReady,
    notifyUpdate,
    onMessage,
    notifySendToClaudeChat,
    notifySwitchToTextEditor,
    notifyUploadImage,
    notifyGetProjectImages,
    notifyRenameImage,
} from "./messaging";
import { setupLinkPopup } from "./components/linkPopup";
import { initFindBar } from "./components/findBar";
import { initHeadingIds } from "./headingIds";
import {
    setupTableAddButtons,
    setDebugMode,
} from "./components/table/addButtons";
import { setupTableHandles } from "./components/table/handles";
import { initToolbar } from "./components/toolbar";
import { initToc } from "./components/toc";
import {
    setupSelectionToolbar,
    getBlockContainerText,
    findLineInOriginalSource,
    getCellRowSourceLine,
} from "./components/selectionToolbar";
import { CellSelection } from "@milkdown/prose/tables";
import { setupTableToolbar } from "./components/table/toolbar";
import type { Editor } from "@milkdown/core";
import { editorViewCtx } from "@milkdown/core";

let currentEditor: Editor | null = null;
let currentLineMap: number[] = [];
export function getLineMap(): number[] {
    return currentLineMap;
}

// 存储原始 markdown 内容（来自 init/revert 消息，未经 Milkdown 序列化）
let markdownSource = "";
export function getMarkdownSource(): string {
    return markdownSource;
}

/** 将 lineMap 中的源码行号（1-indexed）对应的块滚动到视口顶部 */
function scrollToSourceLine(view: EditorView, lineMap: number[], targetLine: number): void {
    if (!lineMap.length) { return; }
    let blockIdx = 0;
    for (let i = 0; i < lineMap.length; i++) {
        if (lineMap[i] <= targetLine) { blockIdx = i; }
        else { break; }
    }
    const children = view.dom.children;
    if (blockIdx >= children.length) { return; }
    const el = children[blockIdx] as HTMLElement;
    if (!el) { return; }
    const topbarH = document.querySelector(".editor-topbar")?.getBoundingClientRect().height ?? 40;
    console.log('[scrollToLine] targetLine:', targetLine, 'blockIdx:', blockIdx, 'lineMap[blockIdx]:', lineMap[blockIdx]);
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - topbarH - 16 });
}

/** 检测视口顶部对应的源码行号（1-indexed），供切换到文本编辑器时定位用 */
function getFirstVisibleSourceLine(view: EditorView, lineMap: number[]): number {
    if (!lineMap.length) { return 1; }
    const topbarH = document.querySelector(".editor-topbar")?.getBoundingClientRect().height ?? 40;
    const children = view.dom.children;
    for (let i = 0; i < children.length && i < lineMap.length; i++) {
        const rect = (children[i] as HTMLElement).getBoundingClientRect();
        if (rect.bottom > topbarH + 8) {
            const result = lineMap[i] ?? 1;
            console.log('[getFirstVisible] result:', result, 'blockIdx:', i, 'rect.bottom:', rect.bottom.toFixed(0));
            return result;
        }
    }
    // 全部块都在视口上方（理论上不会发生）→ 返回最后一块
    const fallback = lineMap[Math.min(lineMap.length - 1, children.length - 1)] ?? 1;
    console.log('[getFirstVisible] fallback result:', fallback, 'lineMap.length:', lineMap.length);
    return fallback;
}

// ── 图片上传：pending promise map ────────────────────
type UploadCallbacks = {
    resolve: (url: string) => void;
    reject: (e: Error) => void;
};
const _pendingUploads = new Map<string, UploadCallbacks>();

// ── 获取项目图片列表：pending promise map ────────────
type GetImagesCallbacks = {
    resolve: (
        images: Array<{
            relPath: string;
            webviewUri: string;
            name: string;
        }> | null,
    ) => void;
    reject: (e: Error) => void;
};
const _pendingGetImages = new Map<string, GetImagesCallbacks>();

// ── 图片重命名：pending promise map ──────────────────
type RenameCallbacks = { resolve: () => void; reject: (e: Error) => void };
const _pendingRenames = new Map<string, RenameCallbacks>();

async function handleRenameImage(
    webviewUri: string,
    newBasename: string,
): Promise<void> {
    const id = `rename_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    return new Promise((resolve, reject) => {
        let settled = false;
        const timeoutId = setTimeout(() => {
            if (!settled) {
                settled = true;
                _pendingRenames.delete(id);
                reject(new Error("Rename timed out"));
            }
        }, 15000);
        _pendingRenames.set(id, {
            resolve: () => {
                if (!settled) {
                    settled = true;
                    clearTimeout(timeoutId);
                    resolve();
                }
            },
            reject: (e) => {
                if (!settled) {
                    settled = true;
                    clearTimeout(timeoutId);
                    reject(e);
                }
            },
        });
        notifyRenameImage(id, webviewUri, newBasename);
    });
}

async function handleGetProjectImages(
    _unusedId: string,
): Promise<Array<{
    relPath: string;
    webviewUri: string;
    name: string;
}> | null> {
    const id = `gimgs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    return new Promise((resolve, reject) => {
        let settled = false;
        const timeoutId = setTimeout(() => {
            if (!settled) {
                settled = true;
                _pendingGetImages.delete(id);
                resolve(null);
            }
        }, 10000);
        _pendingGetImages.set(id, {
            resolve: (r) => {
                if (!settled) {
                    settled = true;
                    clearTimeout(timeoutId);
                    resolve(r);
                }
            },
            reject: (e) => {
                if (!settled) {
                    settled = true;
                    clearTimeout(timeoutId);
                    reject(e);
                }
            },
        });
        notifyGetProjectImages(id);
    });
}

async function handleImageFile(file: File, altText: string): Promise<string> {
    const id = `img_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    return new Promise<string>((resolve, reject) => {
        _pendingUploads.set(id, { resolve, reject });
        const timeoutId = setTimeout(() => {
            if (_pendingUploads.has(id)) {
                _pendingUploads.delete(id);
                reject(new Error("Upload timed out"));
            }
        }, 30000);
        // 读取文件为 Uint8Array 后发送给 Extension
        const reader = new FileReader();
        reader.onload = () => {
            const data = new Uint8Array(reader.result as ArrayBuffer);
            notifyUploadImage(id, data, file.type, altText);
        };
        reader.onerror = () => {
            clearTimeout(timeoutId);
            _pendingUploads.delete(id);
            reject(new Error("Failed to read file"));
        };
        reader.readAsArrayBuffer(file);
    });
}

function insertImageNode(src: string, alt: string): void {
    const editor = currentEditor;
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
}

// 初始化目录面板
const toc = initToc(() => getEditorView());
document.body.appendChild(toc.panel);

// 初始化查找栏
const findBar = initFindBar(() => document.getElementById("editor"));

/** 解析 YAML frontmatter 字符串为 key-value 数组 */
function parseFrontmatter(raw: string): { key: string; value: string }[] {
    return raw
        .split('\n')
        .filter(line => !line.match(/^---/) && line.includes(':'))
        .map(line => {
            const colonIdx = line.indexOf(':');
            return {
                key: line.slice(0, colonIdx).trim(),
                value: line.slice(colonIdx + 1).trim(),
            };
        })
        .filter(({ key }) => key.length > 0);
}

/** 在 #editor 前渲染 frontmatter 表格面板；无 frontmatter 时移除面板 */
function renderFrontmatterPanel(frontmatter: string | undefined): void {
    const existing = document.getElementById('frontmatter-panel');
    const editorEl = document.getElementById('editor');
    if (!frontmatter) {
        existing?.remove();
        if (editorEl) { editorEl.style.paddingTop = ''; }
        return;
    }
    const entries = parseFrontmatter(frontmatter);
    if (entries.length === 0) {
        existing?.remove();
        if (editorEl) { editorEl.style.paddingTop = ''; }
        return;
    }
    const panel = existing ?? document.createElement('div');
    panel.id = 'frontmatter-panel';
    panel.className = 'frontmatter-panel';
    panel.innerHTML = `<table class="frontmatter-table"><tbody>${
        entries.map(({ key, value }) =>
            `<tr><td class="fm-key">${escapeHtml(key)}</td><td class="fm-val">${escapeHtml(value)}</td></tr>`
        ).join('')
    }</tbody></table>`;
    const editor = document.getElementById('editor');
    if (!existing) {
        editor?.parentNode?.insertBefore(panel, editor);
    }
    // 有 frontmatter 面板时，editor 的顶部 padding 由面板承担，只保留间距
    if (editor) { editor.style.paddingTop = '16px'; }
}


function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function initEditor(
    container: HTMLElement,
    markdown: string,
): Promise<void> {
    // 销毁旧编辑器（revert 时使用）
    if (currentEditor) {
        currentEditor.destroy();
        currentEditor = null;
        container.innerHTML = "";
    }

    currentEditor = await createEditor(
        container,
        markdown,
        (updated) => {
            notifyUpdate(updated);
            toc.refresh(); // 内容变化时刷新目录（面板关闭时是 no-op）
        },
        handleRenameImage,
    );
    toc.refresh(); // 编辑器初始化完成后刷新一次
}

// 工具栏（传入 TOC 切换回调 + 图片上传回调）
const topbar = document.querySelector<HTMLElement>(".editor-topbar");
const topbarTb = topbar
    ? initToolbar(
          topbar,
          () => currentEditor,
          () => toc.toggle(),
          { getLineMap, getMarkdownSource },
          async (file: File, altText: string) => handleImageFile(file, altText),
          async (id: string) => handleGetProjectImages(id),
      )
    : null;

// 链接 Hover 弹框 + 表格行列添加按钮（在 #editor 容器上监听）
const editorContainer = document.getElementById("editor");
if (editorContainer) {
    setupLinkPopup(editorContainer, () => getEditorView());
    initHeadingIds(editorContainer);
    setupTableAddButtons(editorContainer, () => getEditorView());
    setupTableHandles(editorContainer, () => getEditorView());

    // 点击 #editor 容器底部空白区域（内容最后一行以下）→ 光标移到文档末尾并聚焦
    editorContainer.addEventListener("mousedown", (e) => {
        const view = getEditorView();
        if (!view) { return; }
        // 点到 ProseMirror 内容区域内则不干预，让编辑器自己处理
        if (view.dom.contains(e.target as Node)) { return; }
        // 只响应内容最后一个块底部以下的点击（排除左/右/顶部 padding 区域）
        const lastChild = view.dom.lastElementChild;
        if (!lastChild) { return; }
        const lastRect = lastChild.getBoundingClientRect();
        if (e.clientY <= lastRect.bottom) { return; }
        e.preventDefault();
        const { state } = view;
        const sel = TextSelection.atEnd(state.doc);
        view.dispatch(state.tr.setSelection(sel));
        view.focus();
    });

    // 拖放图片文件到编辑器
    editorContainer.addEventListener("dragover", (e) => {
        const items = e.dataTransfer?.items;
        if (
            items &&
            Array.from(items).some(
                (i) => i.kind === "file" && i.type.startsWith("image/"),
            )
        ) {
            e.preventDefault();
            e.stopPropagation();
        }
    });

    editorContainer.addEventListener("drop", (e) => {
        const files = e.dataTransfer?.files;
        if (!files?.length) {
            return;
        }
        const imageFile = Array.from(files).find((f) =>
            f.type.startsWith("image/"),
        );
        if (!imageFile) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        handleImageFile(imageFile, "")
            .then((url) => {
                insertImageNode(url, "");
            })
            .catch((err: Error) =>
                console.error("[ImageUpload] drop failed:", err),
            );
    });
}

// 粘贴图片（全局监听，优先处理图片，其他内容交给编辑器自身处理）
document.addEventListener("paste", (e) => {
    const items = e.clipboardData?.items;
    if (!items) {
        return;
    }
    const imageItem = Array.from(items).find((i) =>
        i.type.startsWith("image/"),
    );
    if (!imageItem) {
        return;
    }
    const file = imageItem.getAsFile();
    if (!file) {
        return;
    }
    e.preventDefault();
    handleImageFile(file, "")
        .then((url) => {
            insertImageNode(url, "");
        })
        .catch((err: Error) =>
            console.error("[ImageUpload] paste failed:", err),
        );
});

// 选中文字浮动工具栏 + 表格工具栏（共享同一个 selectionChange 事件）
const selTb = setupSelectionToolbar(
    () => getEditorView(),
    () => currentEditor,
    getLineMap,
    getMarkdownSource,
);
const tableTb = setupTableToolbar(() => getEditorView());
registerSelectionChangeHandler((view) => {
    selTb.onSelectionChange(view);
    tableTb.onSelectionChange(view);
    topbarTb?.onSelectionChange(view);
});

// Checkbox toggle：点击任务列表项左侧的伪元素复选框区域
document.addEventListener(
    "click",
    (e) => {
        const target = e.target as Element;
        const taskItem = target.closest(
            'li[data-item-type="task"]',
        ) as HTMLElement | null;
        if (!taskItem) {
            return;
        }

        // 只响应点击最左边 24px（checkbox 伪元素区域）
        const rect = taskItem.getBoundingClientRect();
        if ((e as MouseEvent).clientX - rect.left > 24) {
            return;
        }

        const view = getEditorView();
        if (!view) {
            return;
        }

        // 用 posAtDOM 从 DOM 节点直接反查 ProseMirror 位置（比 posAtCoords 精确）
        let domPos: number;
        try {
            domPos = view.posAtDOM(taskItem, 0);
        } catch {
            return;
        }

        const { state } = view;
        const $pos = state.doc.resolve(
            Math.min(domPos, state.doc.content.size),
        );

        // 沿 $pos 的祖先链找到 task_list_item 节点
        for (let d = $pos.depth; d >= 0; d--) {
            const node = $pos.node(d);
            if (
                node.type.name === "task_list_item" ||
                node.type.name === "list_item"
            ) {
                const nodePos = $pos.before(d);
                const checked = node.attrs.checked as boolean;
                view.dispatch(
                    state.tr.setNodeMarkup(nodePos, null, {
                        ...node.attrs,
                        checked: !checked,
                    }),
                );
                return;
            }
        }
    },
    true,
);

// Cmd/Ctrl+F：打开查找栏（预填当前选区文字）
window.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.code === "KeyF" && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        const view = getEditorView();
        let initialQuery: string | undefined;
        if (view) {
            const { selection, doc } = view.state;
            if (!selection.empty) {
                const text = doc.textBetween(selection.from, selection.to);
                if (text.trim()) { initialQuery = text; }
            }
        }
        findBar.open(initialQuery);
    }
});

// Cmd/Ctrl+Shift+M：切换到文本编辑器（附带当前视口顶部行号，供文本编辑器定位）
window.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === "KeyM") {
        e.preventDefault();
        const view = getEditorView();
        const line = view ? getFirstVisibleSourceLine(view, currentLineMap) : undefined;
        notifySwitchToTextEditor(line);
    }
});

// Option+K 快捷键：把光标所在顶层块发送给 Claude
// 有文字选区时发送选中文字 + 精确行号；无选区时发送整个顶层块
window.addEventListener("keydown", (e) => {
    if (e.altKey && e.code === "KeyK") {
        e.preventDefault();
        const view = getEditorView();
        if (!view) {
            return;
        }
        const { selection } = view.state;
        const $from = view.state.doc.resolve(selection.from);
        const topBlockIdx = $from.index(0);
        const topBlock = view.state.doc.child(topBlockIdx);
        const map = currentLineMap;
        const textBefore = view.state.doc.textBetween(0, $from.before(1), "\n");
        const fallbackStart = (textBefore.match(/\n/g) ?? []).length + 1;
        const blockStartLine = map[topBlockIdx] ?? fallbackStart;

        if (!selection.empty) {
            // 有文字选区：发送选中文字 + 精确行号
            const text = view.state.doc.textBetween(
                selection.from,
                selection.to,
                "\n",
            );
            if (!text.trim()) {
                return;
            }

            const source = markdownSource;
            let startLine: number;
            let endLine: number;

            if (selection instanceof CellSelection) {
                // 用 $anchorCell.pos / $headCell.pos 保证在单元格内部
                // （selection.to-1 可能落在行间位置而非格内，导致 getCellRowSourceLine 返回 null）
                const anchorLine = getCellRowSourceLine(
                    view.state.doc,
                    selection.$anchorCell.pos,
                    () => source,
                );
                const headLine = getCellRowSourceLine(
                    view.state.doc,
                    selection.$headCell.pos,
                    () => source,
                );
                if (anchorLine !== null && headLine !== null) {
                    startLine = Math.min(anchorLine, headLine);
                    endLine = Math.max(anchorLine, headLine);
                } else {
                    startLine = anchorLine ?? headLine ?? blockStartLine;
                    endLine = startLine;
                }
            } else {
                // 普通文本选区：优先用文本搜索，失败时降级 lineMap+偏移
                const $fromPos = view.state.doc.resolve(selection.from);
                const $toPos = view.state.doc.resolve(selection.to);
                const startBlockText = getBlockContainerText($fromPos);
                const endBlockText = getBlockContainerText($toPos);
                startLine = findLineInOriginalSource(source, startBlockText);
                endLine = findLineInOriginalSource(source, endBlockText);

                if (startLine === -1) {
                    // 逐字搜索选中文本首行（适用于代码块内容等 normalizeForSearch 会破坏的场景）
                    const firstLine = text.trim().split("\n")[0].trim();
                    if (firstLine.length >= 2) {
                        const idx = source
                            .split("\n")
                            .findIndex((l) => l.includes(firstLine));
                        if (idx >= 0) {
                            startLine = idx + 1;
                        }
                    }
                }
                if (startLine === -1) {
                    const isFenced = topBlock.type.name === "code_block";
                    const blockContentStart = $from.before(1) + 1;
                    const textBeforeInBlock = view.state.doc.textBetween(
                        blockContentStart,
                        selection.from,
                        "\n",
                    );
                    const linesIntoBlock = (
                        textBeforeInBlock.match(/\n/g) ?? []
                    ).length;
                    startLine =
                        blockStartLine + (isFenced ? 1 : 0) + linesIntoBlock;
                }
                if (endLine === -1) {
                    endLine = startLine + (text.match(/\n/g) ?? []).length;
                }
            }

            notifySendToClaudeChat(text, startLine, endLine);
        } else {
            // 无选区：发送整个顶层块（原有行为）
            const text = topBlock.textContent;
            if (!text.trim()) {
                return;
            }
            const endLine = blockStartLine + text.split("\n").length - 1;
            notifySendToClaudeChat(text, blockStartLine, endLine);
        }
    }
});

// WebView 加载完成，通知 Extension 侧发送初始内容
notifyReady();

// 监听来自 Extension 侧的消息
onMessage(async (msg) => {
    const container = document.getElementById("editor");
    if (!container) {
        return;
    }

    if (msg.type === "init" || msg.type === "revert") {
        markdownSource = msg.content; // 保存原始内容，供行号搜索使用
        currentLineMap = msg.lineMap ?? [];
        renderFrontmatterPanel(msg.frontmatter);
        await initEditor(container, msg.content);
        // 全局搜索导航或切换回预览时，滚动到指定源码行
        // Milkdown 渲染 + 浏览器布局需要时间，多次重试确保 DOM 就绪后才滚动
        if (msg.type === "init" && msg.scrollToLine) {
            const targetLine = msg.scrollToLine;
            let scrollDone = false;
            const tryScroll = () => {
                if (scrollDone) { return; }
                const view = getEditorView();
                if (!view) { return; }
                // 检查第一个块的 DOM 高度：若为 0 说明布局尚未完成
                const firstChild = view.dom.children[0] as HTMLElement | undefined;
                if (!firstChild || firstChild.getBoundingClientRect().height === 0) { return; }
                scrollToSourceLine(view, currentLineMap, targetLine);
                scrollDone = true;
            };
            // 300ms 首试（Milkdown 渲染需要时间），若失败则在 600ms / 1100ms / 2000ms 继续重试
            for (const delay of [300, 600, 1100, 2000]) {
                setTimeout(tryScroll, delay);
            }
        }
    } else if (msg.type === "requestSwitchToTextEditor") {
        // 来自菜单按钮/命令面板的"切换到文本编辑器"请求
        // 与 Cmd+Shift+M 快捷键逻辑相同：先获取当前可见行再通知 Extension
        const view = getEditorView();
        const line = view ? getFirstVisibleSourceLine(view, currentLineMap) : undefined;
        notifySwitchToTextEditor(line);
    } else if (msg.type === "scrollToLine") {
        // 面板已打开时（如全局搜索点击已打开文件）直接滚动
        // 若 initEditor 正在重建（getEditorView 返回 null），最多重试 8 次
        const scrollLine = msg.line;
        let scrollAttempts = 0;
        const tryScrollNow = () => {
            const view = getEditorView();
            if (view) {
                scrollToSourceLine(view, currentLineMap, scrollLine);
            } else if (scrollAttempts < 8) {
                scrollAttempts++;
                setTimeout(tryScrollNow, 250);
            }
        };
        tryScrollNow();
    } else if (msg.type === "lineMapUpdate") {
        currentLineMap = msg.lineMap;
    } else if (msg.type === "setDebugMode") {
        setDebugMode(msg.enabled);
        setLogTableSel(msg.enabled);
        topbarTb?.setDebugMode(msg.enabled);
    } else if (msg.type === "imageUploaded") {
        const cb = _pendingUploads.get(msg.id);
        if (cb) {
            _pendingUploads.delete(msg.id);
            cb.resolve(msg.url);
        }
    } else if (msg.type === "imageUploadError") {
        const cb = _pendingUploads.get(msg.id);
        if (cb) {
            _pendingUploads.delete(msg.id);
            cb.reject(new Error(msg.error));
        }
    } else if (msg.type === "projectImagesList") {
        const cb = _pendingGetImages.get(msg.id);
        if (cb) {
            _pendingGetImages.delete(msg.id);
            cb.resolve(msg.images);
        }
    } else if (msg.type === "imageRenamed") {
        const cb = _pendingRenames.get(msg.id);
        if (cb) {
            _pendingRenames.delete(msg.id);
            cb.resolve();
        }
        // 更新 ProseMirror 文档中对应图片节点的 src
        const editor = currentEditor;
        if (editor) {
            editor.action((ctx) => {
                const view = ctx.get(editorViewCtx);
                const { state } = view;
                const tr = state.tr;
                let changed = false;
                state.doc.descendants((node, pos) => {
                    if (
                        node.type.name === "image" &&
                        node.attrs["src"] === msg.oldWebviewUri
                    ) {
                        tr.setNodeMarkup(pos, null, {
                            ...node.attrs,
                            src: msg.newWebviewUri,
                        });
                        changed = true;
                    }
                });
                if (changed) {
                    view.dispatch(tr);
                }
            });
        }
    } else if (msg.type === "imageRenameError") {
        const cb = _pendingRenames.get(msg.id);
        if (cb) {
            _pendingRenames.delete(msg.id);
            cb.reject(new Error(msg.error));
        }
    }
});
