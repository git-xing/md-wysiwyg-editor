# Claude 项目指令 — markdownView

## 项目基本规则

- **包管理器**：必须用 `pnpm`，禁止 npm/yarn
- **构建**：修改代码后执行 `pnpm build` 验证编译无误
- **调试**：F5 启动扩展调试实例（`.vscode/launch.json`）
- **语言**：全部 TypeScript；Extension 端用 `tsconfig.json`，WebView 端用 `tsconfig.webview.json`
- **双目标构建**：`dist/extension.js`（Node.js）+ `dist/webview.js`（Browser），由 `esbuild.mjs` 完成

---

## 关键文件速查

```
src/extension.ts              — 扩展入口，注册 CustomEditorProvider
src/MarkdownEditorProvider.ts — Provider 核心（消息路由、自动保存、revert）
src/MarkdownDocument.ts       — 文档模型（读写磁盘 URI）
src/utils/getNonce.ts         — CSP nonce 生成
webview/index.ts              — WebView 入口
webview/editor.ts             — Milkdown 编辑器初始化（含 keymap 插件）
webview/messaging.ts          — WebView ↔ Extension 消息协议（唯一通信层）
webview/style.css             — VSCode 主题适配（--vscode-* CSS 变量）
webview/selectionToolbar.ts   — 浮动选中工具栏（格式、发送到 Claude）
webview/tableHandles.ts       — 表格行列拖拽 handle
webview/tableAddButtons.ts    — 表格插入线（行列边缘悬浮）
webview/tableToolbar.ts       — 表格工具栏（对齐、删除）
webview/codeBlockView.ts      — 代码块 UI（语言切换、复制按钮）
webview/toc.ts                — 目录（TOC）面板
webview/linkPopup.ts          — 链接 hover 弹窗
webview/toolbar.ts            — 顶部主工具栏
docs/devlog.md                — 开发日志（每次会话后必须更新）
docs/roadmap.md               — 项目路线图
```

---

## 架构约束

- WebView ↔ Extension 通信**只通过** `webview/messaging.ts` 中封装的函数
- WebView 侧不直接 `import` VSCode API，通过 `acquireVsCodeApi()` 获取句柄
- CSS 必须使用 `--vscode-*` 变量以适配亮/暗主题
- 不在模块外部维护全局状态（单例除外，如 editor view）

---

## 开发留痕规范

**每次开发会话结束时，Claude 必须执行以下操作：**

### 1. 更新 `docs/devlog.md`

在文件顶部（`---` 分隔线之后、第一条条目之前）新增一条，序号递增：

```markdown
## [NNN] YYYY-MM-DD — 一句话标题（概括本次做了什么）

**涉及文件：** `路径1`, `路径2`

### 完成内容
- 功能/修复描述

### Bug / 问题
| 编号 | 描述 | 根因 | 解决方案 | 状态 |
|------|------|------|----------|------|
| BNNN | 问题描述 | 根因分析 | 解决方案 | ✅已修复 |

### 备注
特别说明、遗留问题、后续跟进...

---
```

**Bug 编号规则：** B001、B002... **全局唯一，跨会话不重置**。新增 bug 编号接续上一条目的最大编号。

**状态标识：**
- `✅ 已修复` — 本次会话已解决
- `🔄 反复` — 多次修改仍未彻底解决
- `⏳ 待处理` — 已知但暂未修复

### 2. 若阶段进度有变化，同步更新 `docs/roadmap.md`

### 3. 更新 `~/.claude/projects/-Users-liuyaoming-code-vsocde-expand-markdownView/memory/MEMORY.md` 中的"当前状态"

---

## 自动保存设置

| 设置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `markdownWysiwyg.autoSave` | boolean | `true` | 编辑后自动写盘 |
| `markdownWysiwyg.autoSaveDelay` | number | `1000` | 防抖延迟（ms） |
