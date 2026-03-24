# Markdown WYSIWYG Editor — 开发路线图

## 技术栈

| 层级 | 选型 | 说明 |
| --- | --- | --- |
| VSCode API | `CustomEditorProvider` | 接管 .md 文件打开，支持读写 |
| WYSIWYG 编辑器 | Milkdown v7 | 基于 ProseMirror，原生 Markdown 序列化 |
| 构建工具 | esbuild | 双目标构建（Node.js + Browser），< 1s |
| 包管理器 | pnpm | 项目统一使用 pnpm |

---

## 阶段一：骨架搭建 ✅

目标：`pnpm build` 成功，F5 可启动，打开 .md 文件显示自定义编辑器（纯文本占位）。

**已完成的文件：**

- `package.json` — 扩展 manifest，`priority: "default"` 接管 .md 文件
- `tsconfig.json` — Extension 主进程 TypeScript 配置
- `tsconfig.webview.json` — WebView 前端 TypeScript 配置（含 DOM lib）
- `esbuild.mjs` — 双目标构建脚本
- `.vscode/launch.json` — F5 调试配置
- `.vscode/tasks.json` — pnpm build/watch 任务
- `src/extension.ts` — 扩展入口
- `src/MarkdownEditorProvider.ts` — CustomEditorProvider 核心实现
- `src/MarkdownDocument.ts` — 文档模型（读写 URI）
- `src/utils/getNonce.ts` — CSP nonce 生成
- `webview/index.ts` — WebView 前端入口（占位）
- `webview/messaging.ts` — WebView ↔ Extension 消息协议
- `.vscodeignore` / `.gitignore`

---

## 阶段二：WYSIWYG 编辑 + 自动保存 ✅

目标：集成 Milkdown，实现真正的所见即所得编辑，支持自动保存和手动保存切换。

**计划文件：**

- `webview/editor.ts` — Milkdown 编辑器初始化（含 GFM 表格支持）
- `webview/style.css` — VSCode 主题适配（使用 `--vscode-*` CSS 变量）
- `webview/index.ts` — 重写，接入 Milkdown + messaging
- `package.json` — 新增 `contributes.configuration`（自动保存设置）
- `src/MarkdownEditorProvider.ts` — 加 CSS 引用、自动保存逻辑、revert 推送

**自动保存设置：**

| 设置项 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `markdownWysiwyg.autoSave` | boolean | `true` | 编辑后自动写盘 |
| `markdownWysiwyg.autoSaveDelay` | number | `1000` | 自动保存防抖延迟（ms） |

**行为：**

- 自动保存 ON：编辑停止 1s 后自动写盘，标题栏无 `●`
- 自动保存 OFF：编辑后显示 `●`，需手动 Cmd+S 保存
- Cmd+S 在两种模式下均有效

---

## 阶段三：表格右键菜单 📋

目标：在表格单元格右键显示上下文菜单，支持行列增删操作。

**计划文件：**

- `webview/tableMenu.ts` — 表格右键菜单，调用 `prosemirror-tables` commands

**支持的操作：**

- 在上方插入行
- 在下方插入行
- 在左侧插入列
- 在右侧插入列
- 删除当前行
- 删除当前列

---

---

## 阶段三：UI 增强功能（进行中）

> 与原计划有出入：表格右键菜单改为工具栏形式实现，并扩展了更多 UI 组件。

**实际已完成：**

- ✅ 浮动选中工具栏（`selectionToolbar.ts`）：格式切换（段落/标题）、内联样式（粗体/斜体/删除线/行内代码）、发送到 Claude
- ✅ 表格行/列选中工具栏：对齐（左/中/右）、删除行/列/整表格、清空表头
- ✅ 表格插入线（`tableAddButtons.ts`）：悬浮行/列边缘显示插入按钮
- ✅ 表格拖拽 handle（`tableHandles.ts`）：行列整体选中
- ✅ 目录（TOC）面板（`toc.ts`）：侧边栏快速跳转
- ✅ 代码块 UI（`codeBlockView.ts`）：语言切换、复制按钮
- ✅ 链接 hover 弹窗（`linkPopup.ts`）：悬浮预览/跳转
- ✅ 顶部主工具栏（`toolbar.ts`）
- 🔄 发送到 Claude Chat（`sendToClaudeChat`）：行号精准传递已实现，实际效果依赖 Claude 扩展 API

---

## 阶段四：待规划 📋

（后续根据需求填写）

---

## 消息通信架构

```
Extension (Node.js)              WebView (Browser)
─────────────────                ─────────────────
resolveCustomEditor
  └─ 发送 {type:'init'} ───────> 接收 → Milkdown 加载内容

  接收 {type:'update'} <─────── 内容变更 → notifyUpdate() (300ms debounce)
  └─ document.update()
  └─ 自动保存 ON: 1s 后 writeFile
  └─ 自动保存 OFF: fire onDidChange (显示 ●)

saveCustomDocument (Cmd+S)
  └─ document.save() → writeFile

revertCustomDocument
  └─ document.revert() (重读磁盘)
  └─ webviewPanel.postMessage({type:'revert', content}) ──> 重建编辑器
```
