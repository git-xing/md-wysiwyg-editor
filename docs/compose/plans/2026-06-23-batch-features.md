# 批量功能开发 & Bug 修复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成 7 个独立任务：标题折叠下拉、工具栏按钮加大、小屏目录 bug、picture 可视化编辑、div align 全面支持、自定义 JS API、标题折叠回车 bug。

**Architecture:** 任务按依赖关系分 3 批并行执行。Batch 1 的 6 个任务完全独立，可并行。Batch 2 依赖 Batch 1 的 Task 1。Batch 3 为最终验证。

**Tech Stack:** TypeScript, Milkdown/ProseMirror, CSS, VS Code Extension API, Vitest

---

## 执行批次

| 批次 | 任务 | 依赖 |
|------|------|------|
| **Batch 1** | Task 1, 2, 3, 4, 5, 6 | 无（并行） |
| **Batch 2** | Task 7 | 依赖 Task 1 |
| **Batch 3** | 全量验证 | 依赖全部 |

---

## Task 1: 标题折叠区域下拉选择器

**Files:**
- Modify: `webview/plugins/headingFold.ts:59-123`
- Modify: `webview/style.css:277-360` (heading-fold-marker 样式)

- [ ] **Step 1: 扩大 `.heading-fold-marker` 点击区域**

在 `headingFold.ts` 的 `createHeadingFoldGutter` 函数中，给 marker 添加 `cursor: pointer` 和更大的 padding。修改 marker 创建逻辑（约第 70-72 行）：

```typescript
const marker = document.createElement("span");
marker.className = "heading-fold-marker";
marker.textContent = `#H${level}`;
marker.style.cursor = "pointer";
marker.style.padding = "2px 6px";
marker.style.borderRadius = "3px";
```

- [ ] **Step 2: 添加 marker 点击事件，弹出下拉框**

在 `createHeadingFoldGutter` 函数中，给 marker 添加 click 事件，创建一个下拉菜单：

```typescript
marker.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    showHeadingLevelDropdown(view, marker, headingPos);
});
```

- [ ] **Step 3: 实现 `showHeadingLevelDropdown` 函数**

在 `headingFold.ts` 中新增函数，创建下拉菜单 DOM：

```typescript
function showHeadingLevelDropdown(view: EditorView, anchor: HTMLElement, headingPos: number): void {
    // 移除已有下拉
    document.querySelectorAll(".heading-level-dropdown").forEach(el => el.remove());

    const dropdown = document.createElement("div");
    dropdown.className = "heading-level-dropdown";

    const levels: [string, number | null][] = [
        ["P", null], ["H1", 1], ["H2", 2], ["H3", 3], ["H4", 4], ["H5", 5], ["H6", 6],
    ];

    const node = view.state.doc.nodeAt(headingPos);
    const currentLevel = node?.attrs?.["level"] as number | undefined;

    levels.forEach(([label, level]) => {
        const item = document.createElement("div");
        item.className = "heading-level-dropdown-item";
        item.textContent = label;
        if (level === currentLevel || (level === null && !currentLevel)) {
            item.classList.add("heading-level-dropdown-item--active");
        }
        item.addEventListener("mousedown", (e) => {
            e.preventDefault();
            e.stopPropagation();
            // 设置选区到标题
            const tr = view.state.tr;
            tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(headingPos + 1, tr.doc.content.size))));
            view.dispatch(tr);
            // 执行命令
            if (level === null) {
                view.dispatch(view.state.tr); // 触发 turnIntoTextCommand
                // 通过 editor instance 调用
                const editor = (window as any).__milkdownEditor;
                if (editor) {
                    editor.action((ctx: any) => {
                        const cmd = ctx.get(turnIntoTextCommand.key ?? turnIntoTextCommand);
                        if (cmd) cmd();
                    });
                }
            } else {
                const editor = (window as any).__milkdownEditor;
                if (editor) {
                    editor.action((ctx: any) => {
                        const cmd = ctx.get(wrapInHeadingCommand.key ?? wrapInHeadingCommand);
                        if (cmd) cmd(level);
                    });
                }
            }
            dropdown.remove();
        });
        dropdown.appendChild(item);
    });

    // 定位
    const rect = anchor.getBoundingClientRect();
    dropdown.style.position = "fixed";
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.top = `${rect.bottom + 4}px`;
    dropdown.style.zIndex = "10000";
    document.body.appendChild(dropdown);

    // 点击外部关闭
    const close = (e: MouseEvent) => {
        if (!dropdown.contains(e.target as Node)) {
            dropdown.remove();
            document.removeEventListener("mousedown", close);
        }
    };
    setTimeout(() => document.addEventListener("mousedown", close), 0);
}
```

- [ ] **Step 4: 添加下拉框 CSS 样式**

在 `webview/style.css` 的 `.heading-fold-marker` 样式之后添加：

```css
.heading-fold-marker:hover {
    background: var(--vscode-toolbar-hoverBackground, rgba(128, 128, 128, 0.16));
    opacity: 0.85;
}

.heading-level-dropdown {
    display: flex;
    flex-direction: column;
    background: var(--vscode-editorHoverWidget-background, #252526);
    border: 1px solid var(--vscode-editorHoverWidget-border, #454545);
    border-radius: 5px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
    overflow: hidden;
    min-width: 52px;
}

.heading-level-dropdown-item {
    padding: 5px 12px;
    font-size: 12px;
    color: var(--vscode-editorHoverWidget-foreground, #ccc);
    cursor: pointer;
    text-align: left;
    white-space: nowrap;
}

.heading-level-dropdown-item:hover {
    background: var(--vscode-list-hoverBackground, rgba(255, 255, 255, 0.08));
}

.heading-level-dropdown-item--active {
    color: var(--vscode-focusBorder, #007acc);
    font-weight: 600;
}

.heading-level-dropdown-item--active::after {
    content: " ✓";
    font-size: 10px;
}
```

- [ ] **Step 5: 导入所需命令**

在 `headingFold.ts` 顶部添加导入：

```typescript
import { wrapInHeadingCommand, turnIntoTextCommand } from "@milkdown/preset-commonmark";
```

- [ ] **Step 6: 运行测试验证**

Run: `pnpm test`
Expected: 所有现有测试通过

---

## Task 2: 工具栏按钮加大

**Files:**
- Modify: `webview/components/toolbar/toolbar.css:19-38`

- [ ] **Step 1: 修改 `.tb-btn` 尺寸**

将 `toolbar.css` 中 `.tb-btn` 的 `min-width` 从 `26px` 改为 `30px`，`height` 从 `24px` 改为 `28px`：

```css
.tb-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 30px;
    height: 28px;
    padding: 0 5px;
    /* ... 其余不变 */
}
```

- [ ] **Step 2: 同步调整 `.tb-select` 高度**

```css
.tb-select {
    height: 28px;
    /* ... 其余不变 */
}
```

- [ ] **Step 3: 运行测试验证**

Run: `pnpm test`
Expected: 所有测试通过

---

## Task 3: 小屏下打开目录正文 left 不变动

**Files:**
- Modify: `webview/style.css:159-197`

- [ ] **Step 1: 为 `toc-open` 添加模式限制**

当前 `toc-open` 的编辑器偏移样式没有区分 docked/overlay 模式。在 overlay 模式下，TOC 覆盖在内容上方，正文不应偏移。修改 CSS：

将：
```css
&.toc-open {
    #editor,
    .frontmatter-panel {
        --toc-editor-offset: max(
            0px,
            calc(var(--toc-width, 220px) + var(--toc-content-gap, 100px) - var(--editor-content-left-padding))
        );
        width: calc(100% - var(--toc-editor-offset));
        margin-left: var(--toc-editor-offset);
    }

    #editor {
        padding-left: 48px;
        --editor-content-left-padding: 48px;
    }
}
```

改为：
```css
&.toc-open:not(.toc-overlay-open) {
    #editor,
    .frontmatter-panel {
        --toc-editor-offset: max(
            0px,
            calc(var(--toc-width, 220px) + var(--toc-content-gap, 100px) - var(--editor-content-left-padding))
        );
        width: calc(100% - var(--toc-editor-offset));
        margin-left: var(--toc-editor-offset);
    }

    #editor {
        padding-left: 48px;
        --editor-content-left-padding: 48px;
    }
}
```

这样当 TOC 以 overlay 模式打开时（`toc-overlay-open`），正文不会偏移。

- [ ] **Step 2: 运行测试验证**

Run: `pnpm test`
Expected: 所有测试通过

---

## Task 4: `<picture>` 可视化编辑

**Files:**
- Create: `webview/components/pictureEditor/index.ts`
- Create: `webview/components/pictureEditor/pictureEditor.css`
- Modify: `webview/editor.ts` (注册 picture NodeView)
- Test: `webview/__tests__/pictureEditor.test.ts`

- [ ] **Step 1: 创建 pictureEditor 组件目录**

```bash
mkdir -p webview/components/pictureEditor
```

- [ ] **Step 2: 实现 `pictureEditor/index.ts`**

创建 `createPictureView` 工厂函数，渲染 `<picture>` 元素并提供编辑工具栏：

```typescript
import "./pictureEditor.css";
import type { Node } from "@milkdown/prose/model";
import type { EditorView } from "@milkdown/prose/view";
import { t } from "@/i18n";

interface PictureAttrs {
    sources?: Array<{ srcset: string; media?: string; type?: string }>;
    src?: string;
    alt?: string;
}

export function createPictureView(
    node: Node,
    view: EditorView,
    getPos: () => number | undefined,
): { dom: HTMLElement; update?: (node: Node) => boolean } {
    const wrapper = document.createElement("span");
    wrapper.className = "picture-view";
    wrapper.contentEditable = "false";

    const pictureEl = document.createElement("picture");

    // 从 node attrs 构建 picture 内容
    function renderPicture(attrs: PictureAttrs): void {
        pictureEl.innerHTML = "";
        // source 元素
        if (attrs.sources) {
            for (const s of attrs.sources) {
                const source = document.createElement("source");
                if (s.srcset) source.srcset = s.srcset;
                if (s.media) source.media = s.media;
                if (s.type) source.type = s.type;
                pictureEl.appendChild(source);
            }
        }
        // img 元素
        const img = document.createElement("img");
        img.src = attrs.src || "";
        img.alt = attrs.alt || "";
        pictureEl.appendChild(img);
    }

    // 工具栏
    const toolbar = document.createElement("div");
    toolbar.className = "picture-view-toolbar";

    const editBtn = document.createElement("button");
    editBtn.className = "picture-view-btn";
    editBtn.textContent = t("Edit");
    editBtn.addEventListener("click", () => showEditPanel(node, view, getPos));
    toolbar.appendChild(editBtn);

    renderPicture(node.attrs as PictureAttrs);
    wrapper.appendChild(pictureEl);
    wrapper.appendChild(toolbar);

    return {
        dom: wrapper,
        update(newNode: Node) {
            if (newNode.type.name !== "picture") return false;
            renderPicture(newNode.attrs as PictureAttrs);
            return true;
        },
    };
}
```

- [ ] **Step 3: 实现编辑面板 `showEditPanel`**

在同文件中添加编辑面板逻辑，允许编辑：
- 每个 `<source>` 的 `srcset`、`media`、`type`
- `<img>` 的 `src`、`alt`
- 添加/删除 `<source>` 元素

```typescript
function showEditPanel(node: Node, view: EditorView, getPos: () => number | undefined): void {
    // 移除已有面板
    document.querySelectorAll(".picture-edit-panel").forEach(el => el.remove());

    const panel = document.createElement("div");
    panel.className = "picture-edit-panel";
    // ... 构建表单 UI，包含 source 列表和 img 属性编辑
    // 保存时通过 view.dispatch 更新 node attrs
}
```

- [ ] **Step 4: 创建 CSS 样式文件**

`pictureEditor.css` 包含 `.picture-view`、`.picture-view-toolbar`、`.picture-edit-panel` 等样式。

- [ ] **Step 5: 在 editor.ts 注册 NodeView**

在 `editor.ts` 的 NodeView 注册区域添加：

```typescript
// 注册 picture NodeView
editor.record((ctx: any) => {
    const view = ctx.get(editorViewCtx);
    // ... 注册 picture 类型的 NodeView
});
```

- [ ] **Step 6: 编写单元测试**

`webview/__tests__/pictureEditor.test.ts` 测试：
- `createPictureView` 返回正确的 DOM 结构
- `update` 方法正确更新 picture 内容
- 编辑面板表单提交正确更新 node attrs

- [ ] **Step 7: 运行测试验证**

Run: `pnpm test`
Expected: 所有测试通过

---

## Task 5: `<div align="center">` 全面支持

**Files:**
- Modify: `webview/editor.ts:230-247` (扩展 createHtmlView)
- Modify: `webview/style.css:217-224` (扩展 .html-inline 样式)
- Modify: `webview/components/toolbar/index.ts` (添加对齐按钮)
- Test: `webview/__tests__/htmlBlockView.test.ts`

- [ ] **Step 1: 扩展 HTML NodeView 支持块级内容**

修改 `createHtmlView` 函数，当 HTML 内容包含块级元素（如 `<div>`）时使用 `display: block` 而非 `display: contents`：

```typescript
function createHtmlView(node: { attrs: Record<string, string> }) {
    const raw = node.attrs["value"] ?? "";
    const isBlock = /<div[\s>]/i.test(raw);

    const dom = document.createElement(isBlock ? "div" : "span");
    dom.className = `html-inline${isBlock ? " html-block" : ""}`;
    dom.dataset["type"] = "html";
    dom.innerHTML = DOMPurify.sanitize(raw, {
        USE_PROFILES: { html: true },
        ADD_ATTR: ["align", "style", "width", "height"],
    });
    return {
        dom,
        ignoreMutation: () => true,
        stopEvent: () => false,
    };
}
```

- [ ] **Step 2: 添加块级 HTML 的 CSS 样式**

在 `style.css` 的 `.html-inline` 样式后添加：

```css
.html-block {
    display: block;
    margin: 0.5em 0;
    padding: 0.5em;
    border: 1px dashed transparent;
    border-radius: 4px;
    transition: border-color 0.15s;
}

.html-block:hover {
    border-color: var(--vscode-panel-border, rgba(128, 128, 128, 0.3));
}

.html-block[align="center"] {
    text-align: center;
}

.html-block[align="right"] {
    text-align: right;
}
```

- [ ] **Step 3: 在工具栏添加对齐按钮组**

在 `toolbar/index.ts` 中，找到合适位置（如块操作区域）添加居中对齐按钮：

```typescript
// 居中对齐
toolbar.appendChild(
    btn(IconAlignCenter, t("Align Center"), () => {
        const view = getEditor()?.ctx.get(editorViewCtx);
        if (!view) return;
        const { from, to } = view.state.selection;
        const selectedText = view.state.doc.textBetween(from, to);
        if (!selectedText) return;
        const html = `<div align="center">${selectedText}</div>`;
        const tr = view.state.tr;
        tr.replaceWith(from, to, view.state.schema.nodes["html"]?.create({ value: html }));
        view.dispatch(tr);
    })
);
```

- [ ] **Step 4: 编写测试**

`webview/__tests__/htmlBlockView.test.ts` 测试：
- 块级 HTML 正确识别
- align 属性正确渲染
- 内联 vs 块级切换

- [ ] **Step 5: 运行测试验证**

Run: `pnpm test`
Expected: 所有测试通过

---

## Task 6: 自定义 JS 完整 API

**Files:**
- Create: `webview/api.ts` (全局 API 对象)
- Modify: `webview/editor.ts` (暴露 editor instance)
- Modify: `shared/messages.ts` (添加 API 消息类型)
- Modify: `src/MarkdownEditorProvider.ts` (处理 API 消息)
- Modify: `src/MarkdownEditorProvider.ts:774-836` (注入 API 脚本)
- Test: `webview/__tests__/api.test.ts`

- [ ] **Step 1: 在 `shared/messages.ts` 添加消息类型**

```typescript
// ToExtensionMessage 中添加：
| { type: "apiCall"; id: string; method: string; args: unknown[] }

// ToWebviewMessage 中添加：
| { type: "apiResponse"; id: string; result: unknown; error?: string }
| { type: "apiEvent"; event: string; data: unknown }
```

- [ ] **Step 2: 创建 `webview/api.ts`**

实现全局 `MarkdownEditor` API 对象：

```typescript
import { sendMessage } from "./messaging";

interface MarkdownEditorAPI {
    // 生命周期
    on(event: string, callback: (data: unknown) => void): void;
    off(event: string, callback: (data: unknown) => void): void;

    // 内容操作
    getContent(): string;
    setContent(content: string): void;
    insertText(text: string): void;
    getSelection(): { text: string; from: number; to: number } | null;

    // 编辑器操作
    focus(): void;
    scrollToLine(line: number): void;
    getHeadings(): Array<{ level: number; text: string; pos: number }>;

    // 主题
    getTheme(): Record<string, string>;
}

const listeners = new Map<string, Set<(data: unknown) => void>>();

function createAPI(): MarkdownEditorAPI {
    return {
        on(event, callback) {
            if (!listeners.has(event)) listeners.set(event, new Set());
            listeners.get(event)!.add(callback);
        },
        off(event, callback) {
            listeners.get(event)?.delete(callback);
        },
        getContent() {
            const editor = (window as any).__milkdownEditor;
            return editor?.action((ctx: any) => {
                const view = ctx.get(editorViewCtx);
                return view?.state.doc.textContent ?? "";
            }) ?? "";
        },
        setContent(content) {
            sendMessage({ type: "update", content });
        },
        insertText(text) {
            const editor = (window as any).__milkdownEditor;
            editor?.action((ctx: any) => {
                const view = ctx.get(editorViewCtx);
                if (!view) return;
                const { from } = view.state.selection;
                const tr = view.state.tr.insertText(text, from);
                view.dispatch(tr);
            });
        },
        getSelection() {
            const editor = (window as any).__milkdownEditor;
            return editor?.action((ctx: any) => {
                const view = ctx.get(editorViewCtx);
                if (!view) return null;
                const { from, to } = view.state.selection;
                if (from === to) return null;
                return { text: view.state.doc.textBetween(from, to), from, to };
            }) ?? null;
        },
        focus() {
            const editor = (window as any).__milkdownEditor;
            editor?.action((ctx: any) => {
                const view = ctx.get(editorViewCtx);
                view?.focus();
            });
        },
        scrollToLine(line) {
            sendMessage({ type: "debug", message: `scrollToLine:${line}` });
        },
        getHeadings() {
            const editor = (window as any).__milkdownEditor;
            return editor?.action((ctx: any) => {
                const view = ctx.get(editorViewCtx);
                if (!view) return [];
                const headings: Array<{ level: number; text: string; pos: number }> = [];
                view.state.doc.nodesBetween(0, view.state.doc.content.size, (node, pos) => {
                    if (node.type.name === "heading") {
                        headings.push({ level: node.attrs["level"], text: node.textContent, pos });
                    }
                });
                return headings;
            }) ?? [];
        },
        getTheme() {
            return (window as any).__themeColors ?? {};
        },
    };
}

// 在模块初始化时暴露到 window
export function initAPI(): void {
    (window as any).MarkdownEditor = createAPI();
}
```

- [ ] **Step 3: 在 editor.ts 中调用 `initAPI()`**

在 editor 初始化完成后调用 `initAPI()`，并暴露 editor instance：

```typescript
// 在 createEditor 完成后
(window as any).__milkdownEditor = editor;
initAPI();
```

- [ ] **Step 4: 在 MarkdownEditorProvider 中处理 API 消息**

在 `src/MarkdownEditorProvider.ts` 的消息处理中添加：

```typescript
case "apiCall":
    this._handleApiCall(message.id, message.method, message.args);
    break;
```

实现 `_handleApiCall` 方法处理来自 webview 的 API 调用请求。

- [ ] **Step 5: 触发生命周期事件**

在适当位置触发事件：
- `ready`: editor 初始化完成后
- `contentChange`: 内容变化时
- `save`: 保存时

```typescript
function emitEvent(event: string, data: unknown): void {
    const callbacks = listeners.get(event);
    if (callbacks) {
        for (const cb of callbacks) cb(data);
    }
}
```

- [ ] **Step 6: 编写单元测试**

`webview/__tests__/api.test.ts` 测试 API 对象的各个方法。

- [ ] **Step 7: 运行测试验证**

Run: `pnpm test`
Expected: 所有测试通过

---

## Task 7: 标题折叠时回车无法把新行加到标题外

**依赖:** Task 1 完成后执行

**Files:**
- Modify: `webview/plugins/headingFold.ts` (添加 Enter keymap)

- [ ] **Step 1: 在 headingFoldPlugin 中添加 keymap 处理**

在 `headingFoldPlugin` 的 `props` 中添加 `handleKeyDown`：

```typescript
props: {
    decorations(state) {
        return buildHeadingFoldDecorations(state.doc, headingFoldPluginKey.getState(state) ?? new Set<number>());
    },
    handleKeyDown(view, event) {
        if (event.key !== "Enter") return false;

        const folded = headingFoldPluginKey.getState(view.state);
        if (!folded || folded.size === 0) return false;

        const { $from } = view.state.selection;
        // 找到光标所在的标题
        let headingPos: number | null = null;
        for (let depth = $from.depth; depth >= 0; depth--) {
            const node = $from.node(depth);
            if (node.type.name === "heading") {
                headingPos = $from.before(depth);
                break;
            }
        }

        if (headingPos === null || !folded.has(headingPos)) return false;

        // 标题被折叠，在标题后插入新段落
        const headingNode = view.state.doc.nodeAt(headingPos);
        if (!headingNode) return false;

        const insertPos = headingPos + headingNode.nodeSize;
        const paragraph = view.state.schema.nodes["paragraph"]?.create();
        if (!paragraph) return false;

        const tr = view.state.tr.insert(insertPos, paragraph);
        tr.setSelection(TextSelection.near(tr.doc.resolve(insertPos + 1)));
        view.dispatch(tr);
        return true;
    },
},
```

- [ ] **Step 2: 运行测试验证**

Run: `pnpm test`
Expected: 所有测试通过

---

## Batch 3: 最终验证

- [ ] **Step 1: 运行全量测试**

Run: `pnpm test`
Expected: 所有测试通过

- [ ] **Step 2: 运行构建**

Run: `pnpm build`
Expected: 构建成功

- [ ] **Step 3: 手动验证**

按 F5 启动 Extension Development Host，逐一验证：
1. 点击标题区域 `#H2` 标记，出现下拉框可选择 P~H6
2. 工具栏按钮明显变大
3. 小屏下打开目录，正文不偏移
4. `<picture>` 元素可可视化编辑属性
5. `<div align="center">` 正确渲染和可设置
6. 自定义 JS 可访问 `window.MarkdownEditor` API
7. 标题折叠时按回车，新行在标题外
