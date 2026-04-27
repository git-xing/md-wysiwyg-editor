# Claude 项目指令 — markdownView

## 语言规范

- **始终用简体中文回复**，禁止使用韩文或其他语言

## 项目基本规则

- **包管理器**：必须用 `pnpm`，禁止 npm/yarn
- **构建**：修改代码后执行 `pnpm build` 验证编译无误
- **调试**：F5 启动扩展调试实例（`.vscode/launch.json`）
- **语言**：全部 TypeScript；Extension 端用 `tsconfig.json`，WebView 端用 `tsconfig.webview.json`
- **双目标构建**：`dist/extension.js`（Node.js）+ `dist/webview.js`（Browser），由 `esbuild.mjs` 完成
- **打包发布**：VSIX 包必须输出到 `releases/` 文件夹，命令：`pnpm run package`
- **Git commit 规范**：commit 描述部分必须用**中文**，类型前缀（`feat:`、`fix:`、`refactor:`、`chore:`、`docs:` 等）保留英文。例：`feat: 新增图片上传功能`、`fix: 修复表格拖拽偏移问题`

***

## 关键文件速查

```
src/extension.ts                         — 扩展入口，注册 CustomEditorProvider
src/MarkdownEditorProvider.ts            — Provider 核心（消息路由、自动保存、revert）
src/utils/getNonce.ts                    — CSP nonce 生成
src/utils/imageService.ts               — 图片本地保存（MD5 去重）+ 服务器上传
src/i18n/webviewTranslations.ts         — WebView 翻译数据
webview/index.ts                         — WebView 入口
webview/editor.ts                        — Milkdown 编辑器初始化（含 keymap 插件）
webview/messaging.ts                     — WebView ↔ Extension 消息协议（唯一通信层）
webview/style.css                        — VSCode 主题适配（--vscode-* CSS 变量）
webview/i18n/index.ts                    — t() / kbd() 翻译函数
webview/ui/icons.ts                      — SVG 图标
webview/ui/tooltip.ts                    — Tooltip 组件
webview/components/toolbar/index.ts     — 顶部主工具栏
webview/components/selectionToolbar/index.ts — 浮动选中工具栏
webview/components/table/addButtons.ts  — 表格插入线
webview/components/table/handles.ts     — 表格行列拖拽 handle
webview/components/table/toolbar.ts     — 表格工具栏
webview/components/codeBlock/index.ts   — 代码块 UI
webview/components/toc/index.ts         — 目录（TOC）面板
webview/components/linkPopup/index.ts   — 链接 hover 弹窗
webview/components/imageView/index.ts   — 图片 NodeView（选中/lightbox/工具栏）
docs/devlog.md                           — 开发日志（每次会话后必须更新）
docs/roadmap.md                          — 项目路线图
```

***

## 架构约束

- WebView ↔ Extension 通信**只通过** `webview/messaging.ts` 中封装的函数
- WebView 侧不直接 `import` VSCode API，通过 `acquireVsCodeApi()` 获取句柄
- CSS 必须使用 `--vscode-*` 变量以适配亮/暗主题
- 不在模块外部维护全局状态（单例除外，如 editor view）

***

## 开发留痕规范

**已知 bug 和功能需求不再记录到本地文件，改用** **`/devlog`** **skill 直接提交为 GitHub Issue。**

### /devlog Skill 说明

- **已知 Bug**：加 `bug` + `known-limitation` label，仅记录开发完成后仍未修复的问题
- **功能需求**：加 `enhancement` + `roadmap` label，记录计划功能（含完善度、实现思路、涉及文件）
- Skill 定义：`.claude/skills/devlog/SKILL.md`
- 触发方式：用户说"记录 bug"、"记录需求"、"功能需求"，或直接输入 `/devlog`

### 若阶段进度有变化，同步更新 `docs/roadmap.md`

### 更新 `~/.claude/projects/-Users-liuyaoming-code-vsocde-expand-markdownView/memory/MEMORY.md` 中的"当前状态"

***

## 测试规范

### 技术栈

| 层次 | 框架 | 适用范围 |
|------|------|----------|
| Extension 单元测试 | **Vitest 2.x**（Node 环境） | `src/utils/`、`src/MarkdownDocument.ts` |
| WebView 单元测试 | **Vitest 2.x + jsdom 24.x** | `webview/utils/`、`webview/messaging.ts` |
| 集成测试（计划中） | **@vscode/test-electron + Mocha** | 需真实 VSCode Extension Host |

`vscode` 模块通过 `__mocks__/vscode.ts` 统一 mock，由 `vitest.config.ts` 的 `resolve.alias` 注入，禁止在单个测试文件中 `vi.mock("vscode")`。

### 测试命令

```bash
pnpm test              # 一次性运行全部单元测试
pnpm test:watch        # 监听模式（开发期间使用）
pnpm test:coverage     # 运行测试并生成覆盖率报告（coverage/）
```

### 目录与命名规范

```
src/__tests__/           — Extension 侧单元测试（Node 环境）
webview/__tests__/       — WebView 侧单元测试（jsdom 环境）
webview/__tests__/setup.ts  — jsdom 全局 setup（注入 acquireVsCodeApi）
shared/__tests__/        — 共享类型测试
__mocks__/vscode.ts      — vscode API 统一 mock
```

- 测试文件命名：`<模块名>.test.ts`，与被测文件同名
- 测试结构遵循 **AAA 原则**（Arrange / Act / Assert），`describe` → `it` 两层
- `it` 描述格式：`输入条件 应该 期望结果`（中文）

### 覆盖率要求

| 模块 | 行覆盖率下限 |
|------|------------|
| `src/utils/imageService.ts` | ≥ 85% |
| `src/utils/getNonce.ts` | 100% |
| `src/MarkdownDocument.ts` | ≥ 80% |
| `src/utils/contentTransform.ts` | ≥ 90% |
| `src/utils/lineMap.ts` | ≥ 90% |
| `webview/utils/slug.ts` | ≥ 90% |
| **整体** | ≥ 70% |

### 强制流程

#### 功能开发后
1. 编写对应单元测试（核心逻辑、边界值、异常路径各至少一个用例）
2. 运行 `pnpm test` 确认全部通过
3. 运行 `pnpm build` 确认编译无误
4. 方可 `git commit`

#### Bug 修复后
1. 先补充**能复现该 bug 的测试用例**（写在修复同一 commit 内）
2. 确认该用例在修复前失败、修复后通过
3. 运行 `pnpm test` 确认全套通过后方可提交

#### git push 前
- **必须**执行 `pnpm test`，全部通过才允许推送
- CI 的 `unit-test` job 会在每次 push/PR 时自动运行（`.github/workflows/ci.yml`），失败则阻断构建

### 测试失败处理流程

```
测试失败
  │
  ├─ 是新引入的失败？→ 定位代码变更，修复后重新运行
  │
  ├─ 是测试预期不符实现（实现已有意变更）？→ 同步更新测试
  │
  └─ 是环境/依赖问题？→ 检查 jsdom 版本、vscode mock 是否完整
```

**禁止行为**：
- 禁止跳过（`it.skip`）或注释失败的测试用例来让 CI 通过
- 禁止修改测试预期值来掩盖 bug（除非实现有意变更且经过评审）
- 禁止在未运行测试的情况下 push 到 `main` 或 `dev` 分支

### Mock 规范

- 每个 `describe` 块在 `beforeEach` 中调用 `vi.clearAllMocks()` 重置 mock 状态
- 文件系统操作统一 mock `vscode.workspace.fs`（禁止使用真实 fs 写磁盘）
- 依赖时间的逻辑使用 `vi.useFakeTimers()` / `vi.useRealTimers()`，禁止 `setTimeout` 真实等待
- 禁止测试 `private` 类方法，通过公共接口验证行为

***

## 自动保存设置

| 设置项                             | 类型      | 默认值    | 说明       |
| ------------------------------- | ------- | ------ | -------- |
| `markdownWysiwyg.autoSave`      | boolean | `true` | 编辑后自动写盘  |
| `markdownWysiwyg.autoSaveDelay` | number  | `1000` | 防抖延迟（ms） |
