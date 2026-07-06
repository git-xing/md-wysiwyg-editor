/**
 * webview/index.ts
 *
 * 职责：WebView 主入口，负责初始化和组合各模块
 *
 * 本模块是 WebView 的核心入口文件，负责：
 * - 初始化 Milkdown 编辑器实例
 * - 组合和初始化各 UI 组件（工具栏、目录、查找栏等）
 * - 注册全局事件监听（拖放图片、粘贴图片、Checkbox 切换）
 * - 协调消息处理器、键盘快捷键、滚动持久化等模块
 * - 管理模块级状态（当前编辑器、行号映射、主题覆盖等）
 *
 * 模块划分：
 * - components/frontmatter: Frontmatter 面板
 * - imageUpload: 图片上传管理
 * - keyboardShortcuts: 键盘快捷键
 * - messageHandlers: 消息分发
 * - scrollPersistence: 滚动位置持久化
 */
import "./style.css";
import "./icon/codicon.css";
import {
    createEditor,
    getEditorView,
    registerSelectionChangeHandler,
    setLogTableSel,
} from "./editor";
import type { EditorView } from "@milkdown/prose/view";
import { TextSelection } from "@milkdown/prose/state";
import { t } from "./i18n";
import { notifyReady, notifyUpdate, onMessage } from "./messaging";
import type { ToWebviewMessage } from "../shared/messages";

import { setupLinkPopup } from "./components/linkPopup";
import { setupPathLink } from "./components/pathLink";
import { initPathComplete } from "./components/pathLink/pathComplete";
import { initFindBar } from "./components/findBar";
import { initHeadingIds } from "./headingIds";
import { setupTableAddButtons } from "./components/table/addButtons";
import { setupTableHandles } from "./components/table/handles";
import { initToolbar } from "./components/toolbar";
import { initToc } from "./components/toc";
import { setupSelectionToolbar } from "./components/selectionToolbar";
import { setupTableToolbar } from "./components/table/toolbar";
import type { Editor } from "@milkdown/core";

import { renderFrontmatterPanel } from "./components/frontmatter";
import {
    handleRenameImage,
    handleGetProjectImages,
    handleImageFile,
    insertImageNode,
} from "./imageUpload";
import { initScrollPersistence } from "./scrollPersistence";
import { initKeyboardShortcuts } from "./keyboardShortcuts";
import { createMessageHandlers, type Handler } from "./messageHandlers";
import { createEventManager } from "./eventManager";

// ── 模块级状态 ─────────────────────────────────────────────
let currentEditor: Editor | null = null;
let currentLineMap: number[] = [];
const _themeOverrides = new Set<string>();

export function getLineMap(): number[] {
    return currentLineMap;
}

let markdownSource = "";
export function getMarkdownSource(): string {
    return markdownSource;
}

// ── 滚动相关工具函数 ────────────────────────────────────────

/** 将 lineMap 中的源码行号（1-indexed）对应的块滚动到视口中间 */
function scrollToSourceLine(
    view: EditorView,
    lineMap: number[],
    targetLine: number,
): void {
    if (!lineMap.length) {
        return;
    }
    let blockIdx = 0;
    for (let i = 0; i < lineMap.length; i++) {
        if (lineMap[i] <= targetLine) {
            blockIdx = i;
        } else {
            break;
        }
    }
    const children = view.dom.children;
    if (blockIdx >= children.length) {
        return;
    }
    const el = children[blockIdx] as HTMLElement;
    if (!el) {
        return;
    }

    const blockStartLine = lineMap[blockIdx];
    const nextBlockLine =
        blockIdx + 1 < lineMap.length ? lineMap[blockIdx + 1] : undefined;
    const blockLineCount = nextBlockLine ? nextBlockLine - blockStartLine : 1;
    const lineOffsetInBlock = targetLine - blockStartLine;
    const offsetRatio =
        blockLineCount > 1 ? lineOffsetInBlock / (blockLineCount - 1) : 0;

    const elRect = el.getBoundingClientRect();
    const blockTop = elRect.top + window.scrollY;
    const blockHeight = elRect.height;
    const targetLineTop = blockTop + blockHeight * offsetRatio;
    const viewportHeight = window.innerHeight;
    const targetScrollTop = targetLineTop - viewportHeight / 2;

    window.scrollTo({ top: Math.max(0, targetScrollTop) });
}

/** 检测视口中间对应的源码行号（1-indexed） */
function getFirstVisibleSourceLine(
    view: EditorView,
    lineMap: number[],
): number {
    if (!lineMap.length) {
        return 1;
    }
    const topbarH =
        document.querySelector(".editor-topbar")?.getBoundingClientRect()
            .height ?? 40;
    const children = view.dom.children;
    const viewportHeight = window.innerHeight;
    const viewportCenter = topbarH + (viewportHeight - topbarH) / 2;

    for (let i = 0; i < children.length && i < lineMap.length; i++) {
        const rect = (children[i] as HTMLElement).getBoundingClientRect();
        if (rect.top <= viewportCenter && rect.bottom >= viewportCenter) {
            const blockStartLine = lineMap[i] ?? 1;
            const nextBlockLine =
                i + 1 < lineMap.length ? lineMap[i + 1] : undefined;
            const blockLineCount = nextBlockLine
                ? nextBlockLine - blockStartLine
                : 1;
            const blockTop = rect.top;
            const blockHeight = rect.height;
            const offsetInBlock = viewportCenter - blockTop;
            const offsetRatio =
                blockHeight > 0 ? offsetInBlock / blockHeight : 0;
            const lineOffset = Math.round(offsetRatio * (blockLineCount - 1));
            return blockStartLine + lineOffset;
        }
    }

    let closestIdx = 0;
    let closestDistance = Infinity;
    for (let i = 0; i < children.length && i < lineMap.length; i++) {
        const rect = (children[i] as HTMLElement).getBoundingClientRect();
        const blockCenter = rect.top + rect.height / 2;
        const distance = Math.abs(blockCenter - viewportCenter);
        if (distance < closestDistance) {
            closestDistance = distance;
            closestIdx = i;
        }
    }
    return lineMap[closestIdx] ?? 1;
}

// ── 重试滚动 ────────────────────────────────────────────────
function retryScroll(fn: () => void): void {
    let done = false;
    const tryFn = () => {
        if (done) return;
        const view = getEditorView();
        if (!view) return;
        const firstChild = view.dom.children[0] as HTMLElement | undefined;
        if (!firstChild || firstChild.getBoundingClientRect().height === 0)
            return;
        fn();
        done = true;
    };
    for (const delay of [300, 600, 1100, 2000]) {
        setTimeout(tryFn, delay);
    }
}

// ── 编辑器初始化 ─────────────────────────────────────────────
async function initEditor(
    container: HTMLElement,
    markdown: string,
): Promise<void> {
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
            toc.refresh();
            findBar.refresh();
        },
        handleRenameImage,
    );
    toc.refresh();
}

// ── 初始化事件管理器 ──────────────────────────────────────────
const eventManager = createEventManager();

// ── 初始化 UI 组件 ───────────────────────────────────────────
const toc = initToc(eventManager, () => getEditorView());
document.body.appendChild(toc.panel);

const findBar = initFindBar(() => document.getElementById("editor"), getEditorView);

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

if (topbar) {
    const updateTopbarHeight = () => {
        document.documentElement.style.setProperty(
            "--editor-topbar-height",
            `${topbar.getBoundingClientRect().height || 40}px`,
        );
    };
    updateTopbarHeight();
    new ResizeObserver(updateTopbarHeight).observe(topbar);
}

// ── 编辑器容器事件绑定 ───────────────────────────────────────
const editorContainer = document.getElementById("editor");
if (editorContainer) {
    setupLinkPopup(editorContainer, () => getEditorView());
    setupPathLink(editorContainer);
    initHeadingIds(editorContainer);
    initPathComplete(() => getEditorView());
    setupTableAddButtons(editorContainer, () => getEditorView());
    setupTableHandles(editorContainer, () => getEditorView());

    // 点击底部空白区域 → 光标移到文档末尾
    eventManager.onElement(editorContainer, "mousedown", (e) => {
        const view = getEditorView();
        if (!view) {
            return;
        }
        if (view.dom.contains(e.target as Node)) {
            return;
        }
        const lastChild = view.dom.lastElementChild;
        if (!lastChild) {
            return;
        }
        const lastRect = lastChild.getBoundingClientRect();
        if (e.clientY <= lastRect.bottom) {
            return;
        }
        e.preventDefault();
        const { state } = view;
        const sel = TextSelection.atEnd(state.doc);
        view.dispatch(state.tr.setSelection(sel));
        view.focus();
    });

    // 拖放图片
    eventManager.onElement(editorContainer, "dragover", (e) => {
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

    eventManager.onElement(editorContainer, "drop", (e) => {
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
            .then((url) => insertImageNode(currentEditor, url, ""))
            .catch((err: Error) =>
                console.error("[ImageUpload] drop failed:", err),
            );
    });
}

// 粘贴图片
eventManager.onDocument("paste", (e) => {
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
        .then((url) => insertImageNode(currentEditor, url, ""))
        .catch((err: Error) =>
            console.error("[ImageUpload] paste failed:", err),
        );
});

// ── 选中文字浮动工具栏 ───────────────────────────────────────
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

// Checkbox toggle
eventManager.onDocument(
    "click",
    (e) => {
        const target = e.target as Element;
        const taskItem = target.closest(
            'li[data-item-type="task"]',
        ) as HTMLElement | null;
        if (!taskItem) {
            return;
        }
        const rect = taskItem.getBoundingClientRect();
        if ((e as MouseEvent).clientX - rect.left > 24) {
            return;
        }
        const view = getEditorView();
        if (!view) {
            return;
        }
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

// ── 初始化键盘快捷键和滚动持久化 ──────────────────────────────
initKeyboardShortcuts(
    eventManager,
    getEditorView,
    getLineMap,
    getMarkdownSource,
    getFirstVisibleSourceLine,
    findBar,
);
initScrollPersistence(eventManager);

// ── 消息处理器 ───────────────────────────────────────────────
const handlers = createMessageHandlers({
    state: {
        getEditor: () => currentEditor,
        setEditor: (editor) => {
            currentEditor = editor;
        },
        getLineMap,
        setLineMap: (lineMap) => {
            currentLineMap = lineMap;
        },
        getMarkdownSource,
        setMarkdownSource: (source) => {
            markdownSource = source;
        },
    },
    actions: {
        scrollToSourceLine,
        getFirstVisibleSourceLine,
        initEditor,
        retryScroll,
        getEditorView,
    },
    topbarTb,
    themeOverrides: _themeOverrides,
});

onMessage(async (msg) => {
    const container = document.getElementById("editor");
    if (!container) {
        return;
    }
    const handler = handlers[msg.type as ToWebviewMessage["type"]];
    if (handler) {
        // 类型安全的调用：msg 的类型已经是 ToWebviewMessage，handler 接受对应类型的 msg
        await (handler as Handler)(msg, container);
    }
});

// WebView 加载完成
notifyReady();
