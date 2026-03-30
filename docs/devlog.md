# 开发日志

> 记录每次开发会话的内容、Bug 和关键决策。
> 格式：`[序号] 日期 — 标题`，最新条目在最前。
> Bug 编号全局唯一（B001、B002...），跨会话不重置。

***

## \[034] 2026-03-30 — 项目开源到 GitHub，建立分支管理和 CI/CD 流程

**涉及文件：** `.gitignore`, `package.json`, `CLAUDE.md`, `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `.github/ISSUE_TEMPLATE/`, `.github/pull_request_template.md`, `CONTRIBUTING.md`

### 完成内容
- **更新 .gitignore**：新增 `.claude/`（私有记忆目录）、`releases/`、`.env*` 忽略规则
- **更新 package.json**：添加 `repository`/`bugs`/`homepage` 字段，修正 `package` 脚本 URL（`git-xing/md-wysiwyg-editor`），去掉 `--allow-missing-repository`
- **更新 CLAUDE.md**：添加 Git commit 中文描述规范（类型前缀保留英文）；更新关键文件速查表至最新目录结构
- **创建 GitHub 仓库**：`https://github.com/git-xing/md-wysiwyg-editor`，设置 topics、描述
- **分支策略**：`main`（稳定发布）+ `dev`（日常开发，已设为默认分支），两层结构
- **main 分支保护**：开启 Require PR before merging（0 approvals）、禁止 force push、禁止删除
- **CI/CD**：
  - `ci.yml`：push/PR 到 main/dev 时自动构建验证
  - `release.yml`：打 `v*.*.*` tag 时自动打包并发布到 VS Code Marketplace + 创建 GitHub Release
- **社区文件**：Bug Report 模板、Feature Request 模板、PR 模板、CONTRIBUTING.md

### Bug / 问题
（无新 bug）

### 备注
- 发布 CI 需在 GitHub Secrets 中配置 `VSCE_PAT`（Azure DevOps → Marketplace → Manage 权限的 PAT）
- 首次 CI 运行后可在分支保护规则中补充 "Require status checks: build" 选项
- 今后日常工作在 `dev` 分支，发版时从 `dev` 开 PR 到 `main`，merge 后打 tag 触发自动发布

---

## \[033] 2026-03-30 — 链接点击行为重构：阻止直接导航，支持 Cmd/Ctrl+单击打开

**涉及文件：** `webview/components/linkPopup/index.ts`, `webview/messaging.ts`, `src/MarkdownEditorProvider.ts`

### 完成内容
- **阻止原生导航**：用 MutationObserver 监听编辑器 DOM，将 `<a href>` 替换为 `<a data-href>`，彻底断开浏览器/WebView 原生导航入口（`e.preventDefault()` 在 VS Code WebView Electron 层面不可靠）
- **Cmd/Ctrl+单击打开**：click handler 改为从 `data-href` 读取 URL，仅在 metaKey/ctrlKey 时打开
- **相对路径支持**：新增 `isRelativePath()` 判断，相对路径调用 `notifyOpenFile()`，extension 端用 `path.resolve` 解析后调用 `vscode.commands.executeCommand("vscode.open", ...)`
- **弹框提示**：弹框底部新增 `hintEl`，Mac 显示"⌘+单击打开"，Windows/Linux 显示"Ctrl+单击打开"（`.link-popup-hint` 样式已存在）
- **新增消息类型**：`messaging.ts` 新增 `notifyOpenFile`；`MarkdownEditorProvider.ts` 新增 `case "openFile"` 处理

### Bug / 问题
（无新 bug）

### 备注
style.css 中 `.link-popup-hint` 样式已预先存在，无需新增。

---

## \[032] 2026-03-27 — 图片选中时工具栏展示文件名和 alt 信息条

**涉及文件：** `webview/components/imageView/index.ts`, `webview/style.css`

### 完成内容

- **信息条**：在图片工具栏最左侧新增 `.img-tb-info` 元素，选中图片时展示 `文件名 · alt文本`（无 alt 时仅显示文件名）
- 通过 `updateInfo(src, alt)` 在初始化、`update()` 时同步更新；alt 编辑确认后通过 ProseMirror dispatch 触发 `update()` 自动刷新
- 信息条样式：`font-size: 11px`、`max-width: 200px`、`text-overflow: ellipsis`，使用 `--vscode-descriptionForeground` 颜色（浅灰/降调），不影响操作按钮区域

### Bug / 问题

| 编号 | 描述 | 根因 | 解决方案 | 状态 |
|------|------|------|----------|------|
| — | 无新 Bug | — | — | — |

### 备注

- 工具栏最终顺序：`infoEl | sep | zoom | sep | alt | sep | [rename | sep] | delete`

---

## \[031] 2026-03-27 — 图片增强：尺寸限制 + 选中效果 + 点击放大 + 重命名

**涉及文件：** `webview/components/imageView/index.ts`（新建）, `webview/editor.ts`, `webview/messaging.ts`, `webview/index.ts`, `webview/style.css`, `webview/ui/icons.ts`, `src/MarkdownEditorProvider.ts`, `package.json`, `package.nls.json`, `package.nls.zh-cn.json`

### 完成内容

- **图片尺寸限制**：为 `.image-wrapper img.image-node` 添加 `max-width: 100%; height: auto;`，大图自动缩放至编辑器宽度
- **自定义 ImageNodeView**：新建 `webview/components/imageView/index.ts`，为 Milkdown 图片节点注册 ProseMirror NodeView：
  - 点击图片选中（绿色边框 + 浮动工具栏），不自动打开 lightbox
  - 工具栏按钮：放大（lightbox）、编辑 Alt、重命名（仅本地图片）、删除
  - Alt 编辑和重命名均为 inline 输入框 + 确认/取消按钮，Enter 确认 Esc 取消
  - 输入框内 copy/cut/paste/mousedown/click/select 事件 stopPropagation，修复快捷键被 ProseMirror 拦截问题
- **图片重命名**：WebView → Extension 发送 `renameImage` 消息，Extension 调用 `vscode.workspace.fs.rename()` 重命名磁盘文件，更新 `_imageUriMaps`，回传 `imageRenamed` 消息，WebView 通过 ProseMirror dispatch `setNodeMarkup` 更新节点 src
- **配置项 `imageSelectionColor`**：图片选中边框颜色，默认 `rgba(52, 211, 153, 0.6)`（与表格选中色一致），注入 CSS 变量 `--image-selection-color`
- **新增图标**：`IconPencil`（重命名）、`IconZoomIn`（放大）
- **修复 Thenable.catch() TS 报错**：`imageService.ts` 中两处 `.catch()` 改为 `try/catch`
- **统一缩进**：添加 `.editorconfig` + `.vscode/settings.json`，全项目统一 4 空格缩进

### Bug / 问题

| 编号 | 描述 | 根因 | 解决方案 | 状态 |
|------|------|------|----------|------|
| B070 | 本地图片重命名图标不显示 | 旧检测正则 `/^vscode-webview-resource:/` 不匹配新格式 `https://...vscode-cdn.net/...` | 改为 `/vscode-resource\|vscode-cdn\.net/.test(src)`，并改用 `rawSrc`（ProseMirror 属性值）而非 `img.src`（浏览器规范化后的值） | ✅ 已修复 |
| B071 | 输入框内复制/全选快捷键失效 | ProseMirror 在 `view.dom` 上拦截 copy/cut/paste 等事件 | `isolateInput()` 对 input 内这些事件调用 `stopPropagation()` | ✅ 已修复 |
| B072 | `imageService.ts` Thenable.catch TS 报错 | `vscode.workspace.fs` 返回 `Thenable` 无 `.catch()` | 改用 `try/catch` | ✅ 已修复 |

### 备注

- 重命名冲突处理：目标文件名已存在时自动追加时间戳后缀
- 修改 `imageSelectionColor` 设置后需重新打开编辑器生效
- `rawSrc` 模式：NodeView 内始终用 ProseMirror 属性值（不经浏览器规范化）做 Extension 通信和本地图片检测

---

## \[030] 2026-03-27 — 去除图片悬浮弹框 + 项目文件结构重构

**涉及文件：** `webview/linkPopup.ts`（现 `webview/components/linkPopup/index.ts`）, `webview/style.css`, `webview/index.ts`, `webview/editor.ts`, `src/MarkdownEditorProvider.ts`, 新建目录结构

### 完成内容

- **移除图片悬浮弹框**：删除 `linkPopup.ts` 中图片弹框全部逻辑（`ImageInfo` interface、`findImageAt`、`showImgPopup`/`hideImgPopup`、相关事件监听器），同时删除 `style.css` 中 `.img-popup`/`.img-popup-preview`/`.img-popup-src` 样式块；链接弹框功能完整保留
- **项目文件结构重构**：将 `webview/` 根目录下平铺的文件按职责分组到子目录：
  - `webview/i18n/index.ts` — 翻译函数（原 `i18n.ts`）
  - `webview/ui/icons.ts` — SVG 图标（原 `icons.ts`）
  - `webview/ui/tooltip.ts` — Tooltip 组件（原 `tooltip.ts`）
  - `webview/components/toolbar/index.ts` — 顶部工具栏（原 `toolbar.ts`）
  - `webview/components/selectionToolbar/index.ts` — 浮动选中工具栏（原 `selectionToolbar.ts`）
  - `webview/components/table/addButtons.ts` — 表格插入线（原 `tableAddButtons.ts`）
  - `webview/components/table/handles.ts` — 表格拖拽 handle（原 `tableHandles.ts`）
  - `webview/components/table/toolbar.ts` — 表格工具栏（原 `tableToolbar.ts`）
  - `webview/components/codeBlock/index.ts` — 代码块 UI（原 `codeBlockView.ts`）
  - `webview/components/toc/index.ts` — 目录面板（原 `toc.ts`）
  - `webview/components/linkPopup/index.ts` — 链接弹框（原 `linkPopup.ts`）
  - `src/i18n/webviewTranslations.ts` — WebView 翻译数据（原 `src/webviewTranslations.ts`）
- 同步更新所有 import 路径，`pnpm build` 编译无报错

### Bug / 问题

无新增 Bug

### 备注

- `webview/index.ts`、`webview/editor.ts`、`webview/messaging.ts`、`webview/style.css` 保留在根目录（入口/通信/样式层）
- esbuild 入口不变，无需修改构建配置

---

## \[029] 2026-03-27 — B069 修复：重新打开文件后相对路径图片无法显示

**涉及文件：** `src/MarkdownEditorProvider.ts`

### 完成内容

- **新增 `_prepareContentForDisplay` 方法**：在向 WebView 发送 `init`/`revert` 内容前，将 markdown 中的相对路径图片（如 `./images/foo.png`）转换为 `vscode-resource://` webviewUri，同时存入 `_imageUriMaps` 供保存时还原
- **3 处调用**：`case "ready"` / `revertCustomDocument` / `watcher.onDidChange`
- `lineMap` 仍用原始内容（相对路径）计算，保证行号映射不受影响

### Bug / 问题
| 编号 | 描述 | 根因 | 解决方案 | 状态 |
|------|------|------|----------|------|
| B069 | 重新打开/revert 文件后图片显示 403 | `init`/`revert` 直接把含相对路径的磁盘内容发给 WebView，WebView 以 `vscode-webview://UUID/` 为 base 解析无法找到文件 | 新增 `_prepareContentForDisplay` 在发送前将相对路径替换为 webviewUri | ✅ 已修复 |

### 备注
- 只替换不以 `https?:` / `data:` / `vscode-resource:` / `vscode-webview-` 开头的路径，HTTP/data URL 不受影响
- `_imageUriMaps` 在此方法中 get-then-set，不会覆盖上传图片已有的映射条目

---

## \[028] 2026-03-27 — 图片面板二次重设计：浏览项目网格 + 多选 + 放大预览

**涉及文件：** `src/MarkdownEditorProvider.ts`, `webview/messaging.ts`, `webview/toolbar.ts`, `webview/index.ts`, `webview/style.css`, `src/webviewTranslations.ts`

### 完成内容

- **去掉遮罩层**：图片面板改为无遮罩悬浮弹窗（`position: fixed; z-index: 9999`），点击面板外关闭
- **浏览项目 tab 重设计**：
  - 不再调用系统文件选择框，改为扫描项目图片目录（`imageLocalPath` 配置或自动检测 `images/`/`imgs/` 等）
  - Extension 新增 `getProjectImages` 消息处理：读取目录，返回 `[{relPath, webviewUri, name}]`
  - WebView 渲染图片缩略图网格（`auto-fill minmax(90px,1fr)` grid），支持懒加载
  - **多选**：点击缩略图选中/取消（蓝色边框 + 左上角对勾图标），显示"已选 N 张"计数
  - **放大预览**：hover 缩略图时右下角出现 `⤢` 按钮，点击弹出 lightbox（全屏遮罩 + 居中大图 + 关闭按钮，ESC 也可关闭）
  - 确认插入所有已选图片（多张依次调用 `onConfirm`，插入当前光标位置后）
- **面板打开时自动加载**图片列表，无需手动点击按钮
- **新样式类**：`.img-insert-grid`、`.img-insert-thumb-item`、`.img-insert-thumb-item--selected`、`.img-insert-thumb-check`、`.img-insert-thumb-enlarge`、`.img-insert-selected-count`、`.img-lightbox`、`.img-lightbox-img`、`.img-lightbox-close`

### Bug / 问题
| 编号 | 描述 | 根因 | 解决方案 | 状态 |
|------|------|------|----------|------|
| B068 | 浏览项目 tab 之前使用系统文件选择框，无法批量选择、无预览 | 原设计直接调 `vscode.window.showOpenDialog` | 改为扫描目录返回图片列表，WebView 展示网格 | ✅ 已修复 |

### 备注
- lightbox 的遮罩（全屏）与主面板的无遮罩是刻意区分的：lightbox 功能性需要遮罩防止误操作
- 图片网格超出 320px 高度时可滚动

---

## \[027] 2026-03-27 — 图片面板重设计 + 403 修复 + 图片去重 + 自动补全可行性计划

**涉及文件：** `src/utils/imageService.ts`, `src/MarkdownEditorProvider.ts`, `webview/messaging.ts`, `webview/toolbar.ts`, `webview/index.ts`, `webview/style.css`, `src/webviewTranslations.ts`, `package.json`, `test/.vscode/settings.json`, `docs/image-path-autocomplete.md`（新建）

### 完成内容

- **403 Forbidden 修复**：
  - `localResourceRoots` 扩展为包含所有 workspace 文件夹 + `.md` 文件所在目录
  - Extension 新增 `_imageUriMaps`（per-document 的 webviewUri→relPath 映射）
  - `_handleImageUpload` 改为返回 `panel.webview.asWebviewUri(absUri)` 给 WebView 显示，保存时通过 `_prepareContentForSave` 替换回 relPath
  - WebView 中的图片现在可以正常显示（`vscode-resource://` 而非 403）
- **图片面板重设计**：
  - 由原来的按钮旁弹出 → 改为全屏遮罩居中弹出（420px，带标题栏 + 关闭按钮）
  - 三 tab：**浏览项目**（默认）/ **URL** / **上传本地**
  - 浏览项目 tab：触发 `vscode.window.showOpenDialog`，Extension 返回 webviewUri + relPath，支持预览缩略图
  - 上传本地 tab：移除拖拽（VSCode 会拦截），仅保留 click 选择；预览改用 `FileReader.readAsDataURL`（data: URL，CSP 允许）
  - 确认/取消按钮改为带文字的 28px 高按钮
- **图片去重**：`saveImageLocally` 在写盘前用 MD5 对比目标目录同扩展名文件，发现重复直接复用，不重新写盘
- **设置项排序**：`package.json` 所有 image 配置项加 `order` 属性（imageStorage: 10，后续 11-15），确保在设置 UI 中排序正确
- **浏览项目消息协议**：新增 `notifyBrowseProjectImages`、`projectImageSelected`、`projectImageCancelled` 三种消息
- **图片路径智能提示可行性计划**：新建 `docs/image-path-autocomplete.md`，包含完整的可行性分析和实现步骤
- **测试设置**：新建 `test/.vscode/settings.json`，配置项目级图片存储路径

### Bug / 问题
| 编号 | 描述 | 根因 | 解决方案 | 状态 |
|------|------|------|----------|------|
| B065 | 粘贴图片后 WebView 显示 403 Forbidden | `localResourceRoots` 只包含 `dist/`，WebView 无权访问 `images/` 目录 | 扩展 `localResourceRoots` + 返回 webviewUri + 保存时反转 relPath | ✅ 已修复 |
| B066 | 图片面板上传预览不显示（`blob:` URL 被 CSP 拦截） | `URL.createObjectURL` 生成 `blob:` URL，CSP `img-src` 不允许 | 改用 `FileReader.readAsDataURL` 生成 `data:` URL | ✅ 已修复 |
| B067 | 重复粘贴同一图片生成多个文件 | 每次上传直接写盘，无去重逻辑 | 写盘前 MD5 比对已有同扩展名文件 | ✅ 已修复 |

### 备注
- 浏览项目 tab 选择的图片也经过 webviewUri 映射，保存时同样会被替换为 relPath
- 拖拽图片到面板会被 VSCode 拦截为打开文件操作，已从 UI 中移除，用户体验一致（点击选择即可）
- 图片路径智能提示（autocomplete）可行性已分析，推荐方案 A（ProseMirror InputRule），待后续会话实现

---

## \[026] 2026-03-27 — 新增设置图标 + 图片上传/粘贴功能

**涉及文件：** `webview/toolbar.ts`, `webview/messaging.ts`, `webview/index.ts`, `webview/style.css`, `src/MarkdownEditorProvider.ts`, `src/utils/imageService.ts`, `src/webviewTranslations.ts`, `package.json`, `package.nls.json`, `package.nls.zh-cn.json`

### 完成内容

- **设置图标**：工具栏最右侧新增齿轮图标（`IconSettings`），点击发送 `openSettings` 消息，Extension 执行 `workbench.action.openSettings markdownWysiwyg` 打开扩展设置页
  - toolbar 追加 `flex: 1` spacer + 设置按钮，`.toolbar` 增加 `flex: 1` 撑满 topbar
- **图片插入面板 UI 重设计**：将原来的简单横向输入框（`showImagePrompt`）替换为新的竖向卡片浮层（`showImageInsertPanel`）
  - Tab 切换：URL 模式（保留原有 URL 输入）/ Upload 模式（拖拽/点击选择本地文件）
  - 共用 alt text 输入框；Upload 模式含 drop zone、文件预览缩略图、上传状态文本
  - 新增 `.img-insert-*` CSS 类体系，与现有 `.tb-prompt-*` 一致的 VSCode 变量风格
- **图片上传消息协议**：新增 `uploadImage`（WebView→Extension）、`imageUploaded`/`imageUploadError`（Extension→WebView）三种消息类型
- **本地存储**：新建 `src/utils/imageService.ts`，`saveImageLocally` 按优先级自动检测 `images/`、`imgs/`、`assets/images/`、`assets/` 目录，均不存在时创建 `images/`，返回相对 .md 文件的路径
- **服务器上传**：`uploadImageToServer` 用 Node.js `https` 模块构建 multipart/form-data，支持自定义字段名、额外参数、JSON path 提取响应 URL
- **粘贴/拖放**：`webview/index.ts` 添加全局 `paste` 事件和 `#editor` 的 `drop` 事件，自动捕获图片文件，通过 pending map 追踪异步上传结果后插入节点
- **新增配置项（6个）**：`imageStorage`、`imageLocalPath`、`imageServerUrl`、`imageServerFieldName`、`imageServerExtraParams`、`imageServerResponsePath`，中英双语描述

### Bug / 问题
| 编号 | 描述 | 根因 | 解决方案 | 状态 |
|------|------|------|----------|------|
| B064 | `_handleImageUpload` 方法被错误插入 `_getHtmlForWebview` 函数体内 | Edit 操作错误定位插入点 | 手动重构文件，将方法挪到正确位置 | ✅ 已修复 |

### 备注
- 本地保存的图片在 WebView 中不显示预览（相对路径无法被 WebView 沙箱解析），但 Markdown 内容正确；服务器上传（HTTP URL）可直接预览
- 图片文件通过 `FileReader.readAsArrayBuffer` + postMessage 传输，大文件（>20MB）目前无限制提示，可后续扩展
- Upload tab 仅在 `onUploadImage` 回调存在时显示，预留了无上传后端时隐藏的开关

---

## \[025] 2026-03-24 — 修复 CellSelection endLine + 代码块行号 verbatim 降级

**涉及文件：** `webview/index.ts`, `webview/selectionToolbar.ts`

### 完成内容

- **B062 endLine 修复**：将 `getCellRowSourceLine` 调用从 `selection.from+1`/`selection.to-1` 改为 `selection.$anchorCell.pos`/`selection.$headCell.pos`，并用 `Math.min/max` 取行号范围，确保 anchor/head 任意顺序都正确
  - 根因：`selection.to-1` 可能落在两个 cell 之间（table_row 层），`doc.resolve()` 解析后深度链不含 `table_cell`，`findCell` 失败 → 返回 null → endLine=startLine，结果只有一行
  - 修复后 "红色,黄色,蓝色" → 期望 `#181-183` ✓
- **代码块内容 verbatim 行号降级**：在 `findLineInOriginalSource` 失败后、lineMap 降级前，增加逐字搜索选中文本首行/末行的步骤
  - 用 `source.split('\n').findIndex(l => l.includes(firstLine))` 逐字匹配（不经 normalizeForSearch）
  - 适用场景：`# 开发模式（监听文件变化）` 等代码块内含 `#` 的注释，normalizeForSearch 会去掉 `#` 前缀导致匹配到错误行
  - 修复后 "开发模式（监听文件变化）" → 期望 `#140` ✓
- 两处修改（`index.ts` Option+K + `selectionToolbar.ts` sendBtn）保持逻辑一致

### Bug / 问题

| 编号 | 描述 | 根因 | 解决方案 | 状态 |
|------|------|------|----------|------|
| B062 | CellSelection 行号只返回单行（如 "红色,黄色,蓝色" 得到 `#181` 而非 `#181-183`） | `selection.to-1` 落在 table_row 层间隙，`getCellRowSourceLine` 找不到 table_cell → null → endLine=startLine | 改用 `$anchorCell.pos`/`$headCell.pos` + min/max | ✅ 已修复 |
| B063 | 代码块注释行（如 `# 开发模式...`）行号错误（`#91` 而非 `#140`） | normalizeForSearch 剥掉 `#`，文本搜索失败后 lineMap 索引错位 | 新增 verbatim 首行搜索降级路径 | ✅ 已修复 |

### 备注

- B062 endLine 是本 session 的最后一块拼图；B063 是新发现的边缘场景
- lineMap 根本性错位问题（松散列表 +17 extra entries）仍然存在，但通过 textSearch 优先 + verbatim 降级，绝大部分场景已绕过

---

## \[024] 2026-03-24 — 调试工具：toolbar 新增"测试获取行号"采样诊断菜单

**涉及文件：** `webview/selectionToolbar.ts`, `webview/toolbar.ts`, `webview/index.ts`

### 完成内容

- **[023] B062 修复已回退**：header row 文本搜索方案导致非表格选区行号也出错，已恢复为原有 `lineMap[tableTopIdx]` 逻辑；B062 状态改为 ⏳ 待处理
- **新增 `sampleDocPosition` 导出函数**（`selectionToolbar.ts`）：对任意文档位置运行行号计算，返回 `{ pos, nodeType, nodeIdx, lineMapVal, srcAtMap, line, via, pmSnip, srcAtCalc, ok }` 诊断数据；可快速对比 lineMap 指向的源码行与 ProseMirror 节点实际内容是否一致
- **toolbar 调试菜单**：`initToolbar` 新增 `debugOpts` 参数，debug 模式下在工具栏末尾渲染 List 图标下拉按钮；菜单项"测试获取行号"点击后均匀采样 10 个顶层节点，序列化为 JSON（含 `docNodes/lineMapLen/srcLines/samples`）写入剪切板（写入失败则 console.log）
- **index.ts**：`initToolbar` 调用传入 `{ getLineMap, getMarkdownSource }` 作为 `debugOpts`

### Bug / 问题

| 编号 | 描述 | 根因 | 解决方案 | 状态 |
|------|------|------|----------|------|
| B062 | CellSelection 行号错误（选中"黄色""蓝色"得到 `#117` 而非 `#191-192`） | `lineMap[$pos.index(0)]` 与 PM 节点索引不对齐（松散列表 +14 extra entries） | [023] 的文本搜索修复已回退；添加诊断工具辅助定量分析错位情况 | ⏳ 待处理 |

### 备注

- 诊断工具 JSON 格式：`lineMapVal` + `srcAtMap` 直接显示 lineMap 指向的源码行，`pmSnip` 显示 PM 节点文本，`ok` 字段粗略判断两者是否匹配；错位节点（松散列表之后）将出现 `ok: false`
- `sampleDocPosition` 内部复用已有 `getBlockContainerText`、`findLineInOriginalSource`、`normalizeForSearch`

---

## \[023] 2026-03-24 — CellSelection 行号根因修复：改用 header row 文本搜索定位表格起始行

**涉及文件：** `webview/selectionToolbar.ts`

### 完成内容

- **B062 根因修复**：`getCellRowSourceLine` 原先用 `lineMap[$pos.index(0)]` 查表格起始行——但 `computeLineMap` 按空行分块，松散列表（items 间有空行）每个 item 是独立 entry；ProseMirror 却把整个列表合并为 1 个 bullet_list/ordered_list 节点，导致索引严重错位（test/sample.md 积累 +14 extra entries，`lineMap[46]`=109 而非 188，计算出错误的 `#117`）
- **新方案**：提取表格 header row 所有单元格文本，在 `markdownSource` 中搜索包含所有 header 文本且含 `|` 的行，以此作为 `tableStartLine`；彻底绕过 lineMap 索引问题
- 函数签名：`getLineMapFn` 参数替换为 `getMarkdownSource`，两处调用同步更新

### Bug / 问题

| 编号 | 描述 | 根因 | 解决方案 | 状态 |
|------|------|------|----------|------|
| B062 | CellSelection 行号错误（如选中"黄色""蓝色"得到 `#117` 而非 `#191-192`） | `lineMap[$pos.index(0)]` 索引与 ProseMirror 节点数不对齐（松散列表产生 +14 extra lineMap entries） | 改用 header row 文本搜索定位表格起始行，不依赖 lineMap 索引 → 已回退（导致非表格选区也出错）；改为添加诊断工具 | ⏳ 待处理 |

### 备注

- 搜索逻辑：遍历源码行，找到第一个同时包含 `|` 和所有 header cell 文本的行 → 该行为表格 header 行
- GFM 公式保持不变：header(rowIdx=0)→tableStartLine，data row N→tableStartLine+N+1

---

## \[022] 2026-03-24 — 调试日志真正动态化 + Handle 点击时间保护 + CellSelection 行号直接从表格结构计算

**涉及文件：** `webview/editor.ts`, `webview/index.ts`, `webview/tableHandles.ts`, `webview/selectionToolbar.ts`

### 完成内容

- **调试日志真正动态化**：`editor.ts` 将 `const LOG_TABLE_SEL` 改为 `let logTableSel` + `export function setLogTableSel()`，`index.ts` 在 `setDebugMode` 消息处理中同时调用 `setLogTableSel(msg.enabled)`，无需重载页面即可开关 `[TableSel]` 日志
- **Handle 点击时间保护**：`tableHandles.ts` drag 对象新增 `startTime: number`，`onDragEnd` 加入时间判断 `elapsed < 150ms` → 强制视为点击；防止触控板快速点击被误识别为拖拽
- **CellSelection 行号直接从表格结构计算**：`selectionToolbar.ts` 新增 `getCellRowSourceLine`，通过 `TableMap.findCell(cellRelPos).top`（行索引）+ `lineMap[tableTopIdx]`（表格起始行）直接得出源码行号（GFM 公式：header→tableStartLine，data row N→tableStartLine+N+1），彻底绕过文本搜索失败问题

### Bug / 问题

| 编号 | 描述 | 根因 | 解决方案 | 状态 |
|------|------|------|----------|------|
| B059 | 开启 debugMode 后 `[TableSel]` 日志不出现 | `LOG_TABLE_SEL` 是模块加载时的 `const`，`setDebugMode` 消息未更新 `editor.ts` 变量 | 改为 `let logTableSel` + 导出 setter，index.ts 同步调用 | ✅ 已修复 |
| B060 | 触控板点击 Handle ⠿ 仍有概率被识别为拖拽 | 8px 距离阈值对触控板不足，缺乏时间保护 | `startTime` + 150ms 时间判断，快速点击强制为点击 | ✅ 已修复 |
| B061 | CellSelection 多选表格行号错误（如 `#35` 而非 `#39-40`） | 短文本 cell（< 3 字）`getBlockContainerText` 回退到 table_row，文本无法在 markdown 源中匹配，fallback 返回表格起始行 | 新增 `getCellRowSourceLine` 直接用 `TableMap` + lineMap 计算，不依赖文本匹配 | ✅ 已修复 |

### 备注

- GFM 表格行号公式：`header(rowIdx=0)→tableStartLine`，`data row N(rowIdx≥1)→tableStartLine+N+1`（+1 为分隔线）
- `from+1`/`to-1` 的 CellSelection 位置修正已不再需要，CellSelection 完全走 `getCellRowSourceLine` 新路径

---

## \[021] 2026-03-24 — 日志调试化 + Handle 误触阈值 + CellSelection 行号范围

**涉及文件：** `webview/i18n.ts`, `webview/editor.ts`, `webview/tableAddButtons.ts`, `webview/tableHandles.ts`, `webview/selectionToolbar.ts`

### 完成内容

- **Window 类型声明修复**：`webview/i18n.ts` 的 `declare const window` 改为 `declare global { interface Window { ... } }` 全局扩展，补充 `debugMode?: boolean` 字段，消除其他文件的 `(window as any)` 转换
- **`[TableSel]` 日志调试化**：在 `editor.ts` 顶部新增 `LOG_TABLE_SEL = Boolean(window.__i18n?.debugMode)`，所有 5 处 `[TableSel]` 日志改为 debug 模式下才打印（`debugMode=true` 开启）
- **Handle 点击阈值**：`tableHandles.ts` 第 278 行拖拽识别阈值从 `> 4` 改为 `> 8`，防止触控板点击微抖误触发拖拽（应为点击选中整行/列）
µ- **CellSelection 行号范围**：`selectionToolbar.ts` 发送 Claude 时，CellSelection 的 `$from`/`$to` 解析改用 `from+1`/`to-1` 进入 cell 内部，`getBlockContainerText` 能正确返回单个 cell 文本，行号从 `#81` 修复为 `#79-81`

### Bug / 问题

| 编号 | 描述 | 根因 | 解决方案 | 状态 |
|------|------|------|----------|------|
| B057 | Handle 点击被误识别为拖拽 | 触控板点击微抖超过 4px 阈值 | 阈值改为 8px | ✅ 已修复 |
| B058 | CellSelection 发送 Claude 行号只有末行 | `selection.from/to` 在 cell 边界外，`getBlockContainerText` 返回 table_row 文本 | `from+1`/`to-1` 进入 cell 内部 | ✅ 已修复 |

### 备注

- `[TableSel]` 日志关闭后控制台不再有调试输出；需要时在 devtools 执行 `location.reload()` 前设置 `window.__i18n.debugMode = true`（实际上需重载页面生效，因为是模块级常量）
- `window.__i18n` 类型现为全局可见，其他 webview 文件无需转换即可访问

---

## \[020] 2026-03-24 — 通过 filterTransaction 彻底修复多格拖拽选区丢失（B056）

**涉及文件：** `webview/editor.ts`

### 完成内容

* **B056 终极修复**。通过诊断日志的调用栈确认根因：不是 ProseMirror 的 `mouseDown.up()`，而是 DOM `selectionchange` 事件触发的 `onSelectionChange → flush → readDOMChange → dispatch`，且通过 `setTimeout/rAF` 延迟执行，在 `Promise.resolve()` 微任务**之后**才运行。旧的微任务恢复机制时机错误（检查时 CellSelection 还在，但覆盖发生在之后）。
* 新修复方案：在 `cellClickFixPlugin` Plugin spec 加入 `filterTransaction`，当 `lastGoodCellSelection` 有效时直接拒绝将 CellSelection 替换为非 CellSelection 的事务（`readDOMChange` 的 dispatch 被拒绝，不会到达 apply）。`lastGoodCellSelection` 通过 `setTimeout(200)` 过期（远长于 readDOMChange 的执行时机），mousedown 也立即清除。
* 删除原有微任务恢复块（`Promise.resolve().then`），代码更简洁。同时添加诊断日志（行列坐标修复 `$headCell.pos+1`、微任务日志、`console.trace` 取消来源）。

### Bug / 问题

| 编号 | 描述 | 根因 | 解决方案 | 状态 |
|------|------|------|----------|------|
| B056 | 多格拖拽松手后 CellSelection 偶发消失 | DOM `selectionchange` → `readDOMChange` 通过 `setTimeout/rAF` 延迟覆盖，在微任务后执行，所有微任务恢复机制均失效 | 新增 `filterTransaction` 在事务层拦截，保护窗口 200ms | ✅ 已修复 |

### 备注

- 调用栈分析：成功路径触发源为 `setCellSelection → move`（用户新操作）；失败路径触发源为 `readDOMChange → flush → onSelectionChange`（DOM selectionchange 延迟）
- `filterTransaction` 是 ProseMirror Plugin spec 的标准接口，不影响其他插件

---

## \[019] 2026-03-24 — 修复多格拖拽选区松手后偶发丢失（微任务恢复机制）

**涉及文件：** `webview/editor.ts`

### 完成内容

* **B056** 多格拖拽松手后 CellSelection 绿色背景偶发消失（B054+B055 修复后仍残留）。根因：ProseMirror 原生 `mouseDown.up()` 在 mouseup 冒泡阶段读取浏览器 DOM 选区并 dispatch，浏览器不理解 `CellSelection`，`createSelectionBetween` 偶发失败时会产生 TextSelection 覆盖正确的 CellSelection，而此时 `appendTransaction` 已无法拦截（入口不再是 CellSelection）。修复方案：在 `cellClickFixPlugin` 中新增 `lastGoodCellSelection` 变量，每次 `appendTransaction` 检测到多格 CellSelection 时保存；cleanup 的跨格拖拽分支在同步清除后安排微任务，微任务中若当前选区已不是 CellSelection 则用 `lastGoodCellSelection` 恢复。微任务在所有 mouseup 处理完成后、浏览器重绘前执行，无视觉闪烁。

### Bug / 问题

| 编号 | 描述 | 根因 | 解决方案 | 状态 |
|------|------|------|----------|------|
| B056 | 多格拖拽松手后 CellSelection 绿色背景偶发消失（B054+B055 后仍残留） | ProseMirror 原生 mouseup 读浏览器 DOM 选区并 dispatch，偶发产生 TextSelection 覆盖 CellSelection；`appendTransaction` 无法拦截 TextSelection 入口 | 新增 `lastGoodCellSelection` 保存多格 CellSelection，cleanup 安排微任务在 mouseup 后恢复（若当前已非 CellSelection） | ✅ 已修复 |

### 备注

- 三层防线：① `wasCrossCell` 同步清除（主路径）② 同格检查（appendTransaction 兜底）③ `lastGoodCellSelection` 微任务恢复（终极兜底）
- 新增变量 `lastGoodCellSelection`，mousedown 时重置为 null

---

## \[018] 2026-03-24 — 补全多格拖拽防线：格内拖拽分支加同格检查

**涉及文件：** `webview/editor.ts`

### 完成内容

* **B055** 多格拖拽仍有小概率失效（`wasCrossCell` 未被设置时兜底缺失）。在 `cellClickFixPlugin.appendTransaction` 的格内拖拽分支中新增**同格检查**：创建 TextSelection 之前，验证 `pendingClickPos`（anchor，在 cell A）和 `posAtCoords(lastMouseX/Y)` 得到的 head 是否在同一个 `table_cell` / `table_header` 内。若 anchor 与 head 分属不同格（`aCellStart !== hCellStart`），则 `return null` 保留现有 CellSelection，不创建跨格 TextSelection。此检查与 `wasCrossCell` 同步清除机制互为补充：前者是最后防线，覆盖一切 edge case。

### Bug / 问题

| 编号 | 描述 | 根因 | 解决方案 | 状态 |
|------|------|------|----------|------|
| B055 | 多格拖拽偶发失效仍残留（B054 修复后小概率复现） | `wasCrossCell` 依赖 `pendingClickPos !== null` 时的 `appendTransaction`，若在极端 edge case 下 `wasCrossCell` 未被设置，cleanup 走微任务路径，ProseMirror mouseup dispatch 的单格 CellSelection 仍被错误转换为跨格 TextSelection | 在格内拖拽分支加同格检查（anchor/head cell start 必须相等），跨格时 `return null` 保留 CellSelection | ✅ 已修复 |

### 备注

- 格内文字拖拽（anchor/head 在同格）不受影响，同格检查通过
- `wasCrossCell` 机制保留，两者互为双保险

---

## \[017] 2026-03-24 — 修复多格拖拽偶发性失效（appendTransaction 跨格 race condition）

**涉及文件：** `webview/editor.ts`, `webview/selectionToolbar.ts`

### 完成内容

* **B054** 多格拖拽松手后偶发变成 TextSelection 选中大量文字。根因：`cellClickFixPlugin` 中 `pendingClickPos` 通过微任务延迟清除，而 ProseMirror 冒泡阶段 mouseup dispatch 触发的 `appendTransaction` 在微任务运行前就已执行，此时 cross-cell drag 后 selection 为单格 CellSelection（cell B），`clickIsPlain = false`，误走「格内拖拽」分支，创建了 TextSelection(posA→posB)。修复：新增 `wasCrossCell` 标志，`appendTransaction` 检测到多格选区时设为 true，cleanup 中若 `wasCrossCell` 则**同步**清除 `pendingClickPos`，确保 ProseMirror mouseup dispatch 时已无 pendingClickPos，appendTransaction 直接跳过。另外将 `lastView = view` 移至 `isDragging` 判断前，避免极端情况下 lastView 为 null。

### Bug / 问题

| 编号 | 描述 | 根因 | 解决方案 | 状态 |
|------|------|------|----------|------|
| B054 | 多格拖拽偶发失效：松手后变成 TextSelection（选中从 cell A 到 cell B 的文字） | `pendingClickPos` 微任务清除，ProseMirror mouseup dispatch（冒泡阶段）先于微任务执行，`appendTransaction` 以 `clickIsPlain=false` + 单格 CellSelection 误创建 TextSelection | 新增 `wasCrossCell` 标志，跨格拖拽时同步清除 `pendingClickPos`，阻止 mouseup dispatch 触发 `appendTransaction` | ✅ 已修复 |

### 备注

- 单击和格内拖拽路径不受影响（`wasCrossCell = false`，仍走微任务清除）
- `wasCrossCell` 在每次 mousedown 时重置为 false

---

## \[016] 2026-03-23 — 拖拽多选表格时隐藏浮动工具栏

**涉及文件：** `webview/selectionToolbar.ts`

### 完成内容

* **B053** 拖拽跨格选中时浮动工具栏在拖拽过程中弹出，导致用户拖拽路径被遮挡。在 `setupSelectionToolbar` 中新增 `isDragging` 标志：`mousedown` capture-phase 检测到编辑器内点击时设为 `true`；`mouseup` capture-phase 清除标志并主动触发 `showAndPosition` 显示最终选区工具栏；`showAndPosition` 开头若 `isDragging` 为 `true` 则隐藏工具栏并 return。

### Bug / 问题

| 编号 | 描述 | 根因 | 解决方案 | 状态 |
|------|------|------|----------|------|
| B053 | 拖拽多选表格格子时浮动工具栏在拖拽中途弹出 | `onSelectionChange` 在每次 ProseMirror 状态变化时调用 `showAndPosition`，拖拽中持续产生 CellSelection 状态变化 | 在 `selectionToolbar.ts` 中维护 `isDragging` 标志，拖拽时隐藏工具栏，mouseup 后再显示 | ✅ 已修复 |

### 备注

- mousedown/mouseup 均使用 capture-phase，保证在 ProseMirror 处理之前/之后正确设置标志
- 普通文字拖拽选中、shift+click 扩选、handle 点击均走同一 mouseup 路径，松手后工具栏正常显示

---

## \[015] 2026-03-23 — 修复三个 Bug：表格单击闪烁、Option+K 行号、调试模式勾选

**涉及文件：** `webview/editor.ts`, `webview/index.ts`, `package.nls.json`, `package.nls.zh-cn.json`

### 完成内容

* **B050** `cellClickFixPlugin` 改用 `appendTransaction` 方式：mousedown 时记录 `posAtCoords` 结果，`appendTransaction` 同步检测单格 CellSelection 并返回 TextSelection 修正 transaction，修正在首次 render 前完成，彻底消除绿色闪烁
* **B051** Option+K 有文字选区时精确计算行号：通过 `textBetween(blockContentStart, selection.from, '\n')` 统计块内换行数，加上 fence offset（代码块 +1），得到选区起始行；无选区保持原有发送整块逻辑
* **B052** 调试模式勾选改用 Unicode `✓`：`$(check)` codicon 在 VSCode `...` 溢出菜单文字项中不渲染，替换为 Unicode `✓ 调试模式` / `✓ Debug Mode`

### Bug / 问题

| 编号 | 描述 | 根因 | 解决方案 | 状态 |
|------|------|------|----------|------|
| B050 | 单击表格单元格绿色背景闪一下 | `cellClickFixPlugin` 在 mouseup 时转换 CellSelection，但 mousedown→mouseup 之间浏览器已渲染了绿色高亮 | 改用 `appendTransaction`，同步在首次 render 前修正 selection | ✅ 已修复 |
| B051 | Option+K 发送选中代码片段时行号为整个代码块范围（如 #40-61）| handler 始终使用 `topBlock.textContent`（整块）计算 endLine，忽略了用户的文字选区 | 有选区时统计块内偏移行数精确计算 startLine/endLine | ✅ 已修复 |
| B052 | 调试模式菜单项旁边看不到勾选标记 | `$(check)` codicon 语法在溢出菜单文字标题中不被渲染 | 改用 Unicode `✓` | ✅ 已修复 |

### 备注

- Bug 1 修复后 mouseup 监听器已完全移除，仅保留 mousedown + appendTransaction 两处处理
- Bug 2 仅修复 Option+K（`webview/index.ts`）；选中工具栏 sendBtn 在代码块内不显示，不受影响
- Bug 3 两个 NLS 文件均已更新

---

## \[014] 2026-03-23 — 修复单击表格单元格产生 CellSelection 的问题

**涉及文件：** `webview/editor.ts`

### 完成内容

* 新增 `cellClickFixPlugin`：监听 `td/th` 内的单击 mousedown，在 mouseup 时若检测到单格 CellSelection，转换为 TextSelection，光标精确落在点击位置

### Bug / 问题

| 编号 | 描述 | 根因 | 解决方案 | 状态 |
|------|------|------|----------|------|
| B049 | 单击表格单元格出现绿色高亮（CellSelection）而非光标定位 | Milkdown GFM preset 使用 `tableEditing({ allowTableNodeSelection: true })`，`normalizeSelection` 将 NodeSelection(cell) 转为 CellSelection | 新增 ProseMirror 插件，在 mouseup 时将单格 CellSelection 转换为 TextSelection | ✅ 已修复 |

### 备注

- 整行/整列选中（`isRowSelection()`/`isColSelection()`）保留，不受影响
- 双击/三击（`event.detail !== 1`）不触发修复逻辑，三击选格行为由 prosemirror-tables handleTripleClick 正常处理

---

## \[013] 2026-03-23 — 调试模式开关：菜单勾选状态修复（两命令互斥方案）

**涉及文件：** `package.json`, `package.nls.json`, `package.nls.zh-cn.json`, `src/extension.ts`

### 完成内容

* **调试模式开关**：将原 `toggleDebugMode` 单命令改为两个互斥命令 `debugModeEnable` / `debugModeDisable`
* `debugModeEnable` 标题为「调试模式」，`when = !markdownWysiwyg.debugModeActive`，显示在未激活时
* `debugModeDisable` 标题为「`$(check)` 调试模式」，`when = markdownWysiwyg.debugModeActive`，显示在激活时
* 两个命令共用同一个 `toggleDebugMode` handler（toggle 逻辑不变）
* nls 文件同步更新两个新 key

### Bug / 问题

| 编号 | 描述 | 根因 | 解决方案 | 状态 |
|------|------|------|----------|------|
| B048 | `...` 菜单中调试模式无勾选 ✓ 显示 | VSCode 已知限制：`toggled` 属性在 `editor/title` 溢出菜单中不渲染勾选图标 | 改用两个互斥命令 + `$(check)` 前缀模拟勾选效果 | ✅ 已修复 |

### 备注

- `toggled` 属性在 `commandPalette` 等地方有效，但在 `editor/title` `...` 溢出菜单无效（VSCode 已知问题）

---

## \[012] 2026-03-23 — 国际化（i18n）：中英双语 + 平台快捷键适配

**涉及文件：** `src/webviewTranslations.ts`（新建）, `webview/i18n.ts`（新建）, `src/MarkdownEditorProvider.ts`, `webview/toolbar.ts`, `webview/selectionToolbar.ts`, `webview/toc.ts`, `webview/codeBlockView.ts`, `webview/linkPopup.ts`, `package.json`, `package.nls.json`（新建）, `package.nls.zh-cn.json`（新建）, `l10n/bundle.l10n.json`（新建）, `l10n/bundle.l10n.zh-cn.json`（新建）, `README.md`, `README.zh-CN.md`（新建）

### 完成内容

* **package.json 配置描述多语言**：所有中文描述改为 `%key%` 占位符，新建 `package.nls.json`（英文默认）和 `package.nls.zh-cn.json`（中文），VSCode 根据界面语言自动选择
* **Extension 错误提示**：`无法打开聊天` 改为 `vscode.l10n.t()`，中文翻译放入 `l10n/bundle.l10n.zh-cn.json`
* **WebView i18n 基础设施**：
  * Extension 端读取 `vscode.env.language` + `process.platform`，在 HTML 中注入 `window.__i18n = { translations, isMac }`
  * 新建 `webview/i18n.ts`：`t(key)` 查表函数（未找到 fallback 为 key 本身）+ `kbd(shortcut)` 平台快捷键格式化函数
* **WebView 文案替换**：5 个 webview 文件共约 50 处中文硬编码全部替换为 `t()` 调用
* **平台快捷键适配**：所有带快捷键的 tooltip 改为 `t('Bold') + ' ' + kbd('Mod-b')` 形式，Mac 显示 `粗体 ⌘B`，Windows 显示 `Bold Ctrl+B`
* **README 双语**：`README.md` 重写为英文（Marketplace 默认），新建 `README.zh-CN.md` 保留中文，两文件顶部互相链接

### Bug / 问题

无新增 Bug。

### 备注

- `window.__i18n` 在 HTML 的内联 `<script>` 中注入（相同 nonce，满足 CSP），在 webview.js bundle 加载前已就位，模块级常量初始化安全
- `kbd()` 输入格式遵循 ProseMirror keymap 规范（`Mod-b`、`Mod-Shift-z`、`Alt-k`）
- 下次开发日志编号：`[013]`，Bug 编号接续 B047

---

## \[011] 2026-03-22 — 行号修复二期：原始内容 + 容器节点文本搜索

**涉及文件：** `webview/index.ts`, `webview/selectionToolbar.ts`, `src/MarkdownEditorProvider.ts`

### 完成内容

* 在 `webview/index.ts` 新增 `markdownSource` 变量，在 `init`/`revert` 时存储原始 markdown（Milkdown 序列化前的内容），通过 `getMarkdownSource()` 暴露
* 在 `webview/selectionToolbar.ts` 新增三个工具函数：
  * `normalizeForSearch`：去掉 markdown 标记（`##`/`*`/\`/`~`/`>`/`|`/列表标记）再比较
  * `getBlockContainerText`：沿 PM 节点树向上找最深块节点的完整文本（比选中文本更具体）
  * `findLineInOriginalSource`：在原始 markdown 中用归一化后的块文本搜索对应行号（1-indexed）
* `sendBtn` 行号计算改为：`getBlockContainerText` + `findLineInOriginalSource`，失败时 fallback 到 lineMap
* 删除 `src/MarkdownEditorProvider.ts` 中的 `findLinesForText`（它搜索序列化内容，行号不准），`_handleSendToClaudeChat` 直接使用 webview 传来的 `startLine`/`endLine`

### Bug / 问题

| 编号 | 描述 | 根因 | 解决方案 | 状态 |
|------|------|------|----------|------|
| B047 | 选中列表项中文字发送到 Claude，行号仍然偏移（如 `#15` 应为 `#25`） | `findLinesForText` 搜索 `document.getText()` 返回的是 Milkdown 序列化后内容（去掉了列表项间空行），序列化内容中该行为 15；另外 `$from.index(0)` 指向整个 bullet_list，不是具体 list_item | webview 存储原始内容；用 PM 容器节点完整文本在原始内容中搜索行号 | ✅ 已修复 |

---

## \[010] 2026-03-22 — 行号偏移修复：改用文本搜索替代 lineMap 块索引

**涉及文件：** `src/MarkdownEditorProvider.ts`

### 完成内容

* 放弃修复 `computeLineMap`（ProseMirror 节点结构太复杂，难以精确镜像）
* 新增 `findLinesForText(markdown, selectedText)` 函数：在 markdown 源文件中搜索选中文本的首尾行关键词，直接定位实际行号
* 在 `_handleSendToClaudeChat` 中优先使用文本搜索结果，fallback 到 webview 传来的 lineMap 行号
* `computeLineMap` 恢复原始简单实现（仅用于 lineMapUpdate 特性，不影响发送行号）

### Bug / 问题

| 编号 | 描述 | 根因 | 解决方案 | 状态 |
|------|------|------|----------|------|
| B045 | 发送到 Claude 行号偏移（+24 甚至更多） | `computeLineMap` 块结构与 ProseMirror 不同步（列表松散项、HTML 块等差异） | 不依赖 lineMap，改在 extension 端用 `includes` 文本搜索定位实际行 | ✅ 已修复 |
| B046 | 首次修复尝试（computeLineMap 重写）反而使偏移变大（+24→+68） | 误删了 Milkdown 确实创建 PM 节点的 `<br />` HTML 块条目 | 放弃 computeLineMap 路径，改用文本搜索 | ✅ 已修复 |

---

## \[009-B] 2026-03-22 — 补丁：插入线定时器循环 + 单行 mention 重复行号

**涉及文件：** `webview/tableAddButtons.ts`, `src/MarkdownEditorProvider.ts`

### 完成内容

* 修复插入线在两个边框之间区域不消失的问题：`cancelHide()` 原在找到 cell 后无条件调用，导致 150ms 定时器每 16ms 被重置永远无法到期；改为在确认近边框（即将显示插入线）之后才调用
* 修复单行选中发送到 Claude 时 mention 显示 `#180-180`：改为 `startLine === endLine` 时只写 `#180`

### Bug / 问题

| 编号 | 描述 | 根因 | 解决方案 | 状态 |
|------|------|------|----------|------|
| B043 | 插入线在单元格中部持续显示直到下一个边框 | `cancelHide()` 无条件调用形成重置循环 | 移到 nearBorder 确认后调用 | ✅ 已修复 |
| B044 | 单行选中发送到 Claude 显示 `#180-180` 冗余行号 | mentionStr 始终使用 `start-end` 格式 | `startLine === endLine` 时只写 `#N` | ✅ 已修复 |

---

## \[009] 2026-03-22 — 5 项修复：删除线快捷键/插入线点击拦截/空列发送Claude/任务列表缩进/清除格式按钮

**涉及文件：** `webview/editor.ts`, `webview/selectionToolbar.ts`, `webview/toolbar.ts`, `webview/style.css`, `webview/tableAddButtons.ts`, `webview/icons.ts`

### 完成内容

* 删除线快捷键从 `⌘⇧S`（与 VSCode "另存为"冲突）改为 `⌘⇧X`，并同步更新 toolbar/selectionToolbar tooltip 文字
* 顶部工具栏行内代码 tooltip 补充快捷键标识 `⌘E`
* CSS `.table-add-line--h/v` 改为 `pointer-events: none`，修复插入线可见时点击单元格边框触发意外 CellSelection 的问题
* `THRESHOLD_UP` 9→5，`THRESHOLD_DOWN` 10→6，缩小插入线触发检测区域
* 选中空列 CellSelection 后点击"发送到 Claude"：新增回退逻辑，当 text 为空时取父表格全文内容发送
* 任务列表 `ul` 添加 `padding-left: 4px`（利用 CSS `:has()` 精准命中），消除复选框左侧多余空白
* 顶部工具栏新增"清除格式"按钮（IconEraser），选中文字后点击移除所有 mark

### Bug / 问题

| 编号 | 描述 | 根因 | 解决方案 | 状态 |
|------|------|------|----------|------|
| B038 | `⌘⇧S` 删除线与 VSCode 另存为冲突 | 快捷键选取未避开 VSCode 原生绑定 | 改为 `Mod-Shift-x` | ✅ 已修复 |
| B039 | 插入线可见时点击单元格边框触发 CellSelection | `.table-add-line--h/v` 有 `pointer-events: auto` 拦截鼠标 click | 改为 `pointer-events: none` | ✅ 已修复 |
| B040 | 插入线触发区域过大（THRESHOLD 9/10px） | 阈值设置偏大，正常单元格中部也会误触发 | 降低到 5/6px | ✅ 已修复 |
| B041 | 选中空列点击发送到 Claude 无反应 | `textBetween` 返回空串后直接退出 | 回退到父表格全文 | ✅ 已修复 |
| B042 | 任务列表复选框左侧多余空白 | `ul` 使用浏览器默认 `padding-left`≈40px | `:has()` 选择器将 padding-left 改为 4px | ✅ 已修复 |

---

## \[007] 2026-03-22 — 修复 4 个 Bug：预览状态/插入线闪烁/sendToClaudeChat 关闭文件/多表格内联代码

**涉及文件：** `src/MarkdownEditorProvider.ts`, `webview/tableAddButtons.ts`, `webview/selectionToolbar.ts`

### 完成内容

* 修复预览模式（tab 斜体）下编辑不自动 pin tab：首次收到 update 消息时执行 `workbench.action.keepEditor`

* 修复表格插入线闪烁：移除 mousemove 里的全量 `hideAll()`，改为按需选择性隐藏，避免 hide→show 循环

* 修复 sendToClaudeChat 在预览状态下关闭文件：将临时文本编辑器的 `preview: true` 改为 `preview: false`，操作完成后 `webviewPanel.reveal()` 恢复焦点

* 修复多表格选中时行内代码只应用到最后一个：实现自定义 `applyInlineCodeToSelection`，直接操作 ProseMirror transaction 遍历所有文本节点批量添加/移除 code mark

### Bug / 问题

| 编号   | 描述                      | 根因                                                                    | 解决方案                                                | 状态    |
| ---- | ----------------------- | --------------------------------------------------------------------- | --------------------------------------------------- | ----- |
| B027 | 编辑时 tab 不退出预览（斜体）状态     | autoSave 模式不触发 `onDidChangeCustomDocument`，VSCode 不知道文档已变更            | 首次编辑时执行 `workbench.action.keepEditor` 固定 tab        | ✅ 已修复 |
| B028 | 表格插入线在边框悬停时闪烁           | mousemove 每次先 `hideAll()` 再显示，形成 hide-show 循环                         | 改为选择性隐藏，不经历 hide-show 循环                            | ✅ 已修复 |
| B029 | 预览状态下发送到 Claude 会关闭当前文件 | `showTextDocument(..., preview:true)` 在同列会替换处于预览状态的 custom editor tab | 改为 `preview: false`，操作后 `reveal()` 恢复 webview panel | ✅ 已修复 |
| B030 | 多表格选中点击内联代码只有最后一个生效     | `toggleInlineCodeCommand` 不处理跨多块节点的选区                                 | 自定义函数遍历选区所有文本节点，dispatch 单个 transaction             | ✅ 已修复 |

***

## \[006-B] 2026-03-19\~20 — 发送到 Claude：根因攻坚 + lineMap 行号方案

> 本条目从对话记录补录，记录 \[005] 阶段中"发送到 Claude"功能的完整曲折过程。
> 详细叙事版见 `docs/send-to-claude-story.md`。

**涉及文件：** `src/MarkdownEditorProvider.ts`, `webview/selectionToolbar.ts`, `webview/messaging.ts`, `webview/editor.ts`

### 完成内容

* 发现 `workbench.action.chat.open` 的 `query` 参数无效，转向 `claude-vscode.insertAtMention`

* 四种参数格式（字符串/@ 前缀/带行号字符串/对象）全部尝试，均无效

* **找到根本原因**：`CustomEditorProvider` 不设置 `window.activeTextEditor`，Claude 扩展命令静默返回

* **创意解法**：先用 `showTextDocument` 临时打开同文件的文本编辑器（使 `activeTextEditor` 有值），设置选区，调用 `claude-vscode.focus`，再关闭临时 tab

* 修复 Claude 面板状态检测（已打开/未打开走不同路径）

* 修复窗口闪烁（`ViewColumn.Beside` → `webviewPanel.viewColumn` 同列切换）

* 修复行号偏差（临时方案：扩展侧搜索 ±30 行范围，后被 lineMap 替代）

* **lineMap 终极方案**：加载文件时计算块→行号映射表，通过 `init` 消息传给 WebView，webview 查表获取精确行号

### Bug / 问题

| 编号   | 描述                                 | 根因                                                                                                 | 解决方案                                                   | 状态    |
| ---- | ---------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ----- |
| B031 | `insertAtMention` 四种参数格式全部无效，命令无响应 | `CustomEditorProvider`（WebView）不设置 `window.activeTextEditor`，Claude 扩展判断 `!activeTextEditor` 后静默返回 | 临时用 `showTextDocument` 打开文本编辑器，使 `activeTextEditor` 有值 | ✅ 已修复 |
| B032 | Claude 面板关闭后再次发送失败                 | `claude-vscode.openLast/focus` 打开面板后抢走焦点，`activeTextEditor` 再次变 undefined                          | 调用前检测面板状态：已打开直接 `focus`，未打开先 `openLast` 等待加载再激活临时编辑器   | ✅ 已修复 |
| B033 | 行号偏差（选中第 15 行，Claude 收到 #8-8）      | ProseMirror 块分隔符只算 1 字符，Markdown 文件段落间有空行（2 换行），累计偏差                                               | 计算 lineMap 数组（块索引→文件行号），webview 直接查表，消除所有偏差            | ✅ 已修复 |

### Bug / 问题（终端 Claude 部分）

| 编号   | 描述                                                     | 根因                                           | 解决方案                                                     | 状态    |
| ---- | ------------------------------------------------------ | -------------------------------------------- | -------------------------------------------------------- | ----- |
| B034 | 终端名称判断不可靠（用户可随意改名）                                     | `terminal.name` 是 UI 标签，不反映运行的命令             | 改用 `state.shell` 字段有无来识别                                 | ✅ 已修复 |
| B035 | ShellIntegration 事件只能捕获注册后启动的终端，扩展加载前已有的 claude 终端检测不到 | `onDidStartTerminalShellExecution` 无法追溯过去的事件 | 双保险：ShellIntegration 动态检测（Set）+ `state.shell` 缺失特征扫描已有终端 | ✅ 已修复 |
| B036 | 兜底到 `activeTerminal` 时会把普通终端当 claude 使用                | 第三级兜底过于宽泛                                    | 去掉 `activeTerminal` 兜底，没有 claude 终端则直接走 VSCode 插件路径      | ✅ 已修复 |

### 备注

完整开发曲折记录见 [docs/send-to-claude-story.md](send-to-claude-story.md)，包含第八阶段终端 Claude 优先策略、`state.shell` 关键发现、完整演进图和开发感悟，适合演示分享使用。

***

## \[006] 2026-03-22 — sendToClaudeChat 修复 + 开发留痕体系建立

**涉及文件：** `src/MarkdownEditorProvider.ts`, `webview/selectionToolbar.ts`, `webview/messaging.ts`, `CLAUDE.md`（新建）, `docs/devlog.md`（本文件，新建）, `docs/roadmap.md`

### 完成内容

* 修复 sendToClaudeChat 参数格式（字符串 → 对象 `{uri, line, character, endLine, displayText}`）

* 增加 `claude-vscode.chat.focus` 激活面板 + 200ms 延迟

* messaging.ts 增加 `startLine`/`endLine` 透传；selectionToolbar 用 lineMap 查表计算行号（fallback 近似值）

* 建立 `CLAUDE.md`（项目规则 + 留痕规范）

* 建立 `docs/devlog.md`（本文件，补录历史条目 \[001]\~\[005]）

* 更新 `docs/roadmap.md`（阶段三实际进度）

### Bug / 问题

| 编号   | 描述                                     | 根因                                                                            | 解决方案                                                     | 状态    |
| ---- | -------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------- | ----- |
| B025 | `insertAtMention` 调用无效（Claude 面板未响应）   | 参数传字符串，Claude 扩展期望对象 `{uri, line, character, endLine, displayText}`；调用前未先激活面板 | 改为对象参数 + 先调用 `chat.focus` + 200ms 延迟                     | ✅ 已修复 |
| B026 | WebView 未传行号，Extension 侧无法构造精确 mention | messaging 函数签名缺少行号参数                                                          | 添加 `startLine`/`endLine` 参数并在消息体透传；webview 侧用 lineMap 查表 | ✅ 已修复 |

### 备注

sendToClaudeChat 实际效果依赖 Claude VSCode 扩展 API 版本，`insertAtMention` 命令签名若有变化需再次调整。B016/B023 归并追踪（参见持久问题列表）。

***

## \[005] 2026-03-20\~21 — 集成调试（Option+K / Claude Chat / 打包）

**涉及文件：** `src/MarkdownEditorProvider.ts`, `webview/selectionToolbar.ts`, `package.json`

### 完成内容

* Option+K 快捷键集成（与 Claude VSCode 扩展联动）

* 项目打包为 `.vsix` 扩展包

### Bug / 问题

| 编号   | 描述                      | 根因                                        | 解决方案                                                        | 状态    |
| ---- | ----------------------- | ----------------------------------------- | ----------------------------------------------------------- | ----- |
| B022 | Option+K 快捷键无反应         | 键盘事件监听未正确绑定到 WebView                      | 修改事件监听逻辑，确保按键在 WebView 中被捕获                                 | ✅ 已修复 |
| B023 | 发送到 Claude 行号与文件实际行号不匹配 | 编辑器内部 ProseMirror doc 位置 ≠ 文件 Markdown 行号 | 建立 lineMap 映射表；selectionToolbar 优先用 lineMap 查表，fallback 近似值 | 🔄 反复 |
| B024 | 打包时报错缺少 repository 字段   | VSCode 扩展打包规范要求此字段                        | 在 package.json 添加 repository 配置                             | ✅ 已修复 |

### 备注

B023 是持续困扰"发送到 Claude"功能的根本问题，lineMap 方案是目前最准确的解决路径，精度待验证。

***

## \[004] 2026-03-20 — Bug 修复：Backspace 进入代码块 / Tab 焦点 / 表格 handle 位置

**涉及文件：** `webview/editor.ts`, `webview/codeBlockView.ts`, `webview/toc.ts`, `webview/tableAddButtons.ts`, `webview/tableHandles.ts`

### 完成内容

* 修复 3 个积累的交互 bug（Backspace/Tab 焦点/表格 handle 位置）

### Bug / 问题

| 编号   | 描述                              | 根因                                   | 解决方案                                                                                 | 状态    |
| ---- | ------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------ | ----- |
| B019 | Backspace 在代码块后段落行首时光标进入代码块内部   | ProseMirror `joinBackward` 对代码块的默认行为 | keymap 添加更高优先级的 Backspace handler：检测前一块是 code\_block 时改为 NodeSelection 选中该块，用户再按一次删除 | ✅ 已修复 |
| B020 | Tab 键从编辑器跳到代码块语言选择器/复制按钮/TOC 按钮 | 相关 `<button>` 元素默认 `tabindex=0`      | 创建时设置 `tabIndex = -1`                                                                | ✅ 已修复 |
| B021 | 表格插入线/拖拽 handle 在单元格输入内容后位置不更新  | 位置计算只在 `mousemove` 触发，鼠标静止时不重算       | ResizeObserver 监听表格尺寸变化，变化时向编辑器容器派发合成 mousemove 事件                                   | ✅ 已修复 |

***

## \[003] 2026-03-17\~19 — 表格功能 + 浮动选中工具栏

**涉及文件：** `webview/tableHandles.ts`, `webview/tableAddButtons.ts`, `webview/tableToolbar.ts`, `webview/selectionToolbar.ts`, `webview/style.css`

### 完成内容

* 表格行/列选中高亮

* 表格插入线（行/列边缘悬浮 ± 图标）

* 表格行/列拖拽 handle

* 表格对齐工具栏（左/中/右）

* 浮动选中工具栏（格式切换、内联样式、发送到 Claude）

### Bug / 问题

| 编号   | 描述                                             | 根因                                   | 解决方案                 | 状态              |
| ---- | ---------------------------------------------- | ------------------------------------ | -------------------- | --------------- |
| B010 | 表格选中样式不明显                                      | 背景色不够突出                              | 浅绿色背景 + 绿色边框         | ✅ 已修复           |
| B011 | 表格离开后选中状态消失                                    | 选中状态被意外清除                            | 修改逻辑保持状态直到用户主动取消     | ✅ 已修复           |
| B012 | 对齐 icon 显示条件错误（行选中时不应显示）                       | 条件判断缺少行/列区分                          | 改为仅整列选中时显示           | ✅ 已修复           |
| B013 | 表格插入线触发面积过小                                    | hover 判定区域太窄                         | 扩大 hover 判定面积        | ✅ 已修复           |
| B014 | 表格新增行/列后无选中状态                                  | 新增后未设置选中                             | 新增后直接设置选中状态          | ✅ 已修复           |
| B015 | 表格斑马条纹与表头颜色冲突                                  | 表头与第一行同色                             | 给表头单独设置背景色           | ✅ 已修复           |
| B016 | 选中文字发送到 Claude 无效果                             | `insertAtMention` 命令参数格式错误（传字符串而非对象） | 在 \[006] 完整修复        | 🔄 反复（见 \[006]） |
| B017 | 表格拖拽 icon 鼠标无法移入（hover 时消失）                    | icon hover 事件与容器冲突                   | 修复鼠标事件层级冲突           | ✅ 已修复           |
| B018 | 选中表头删除报错 `Cannot read properties of undefined` | 删除逻辑未处理 undefined                    | 增加 null/undefined 检查 | ✅ 已修复           |

### 备注

表格选中与插入线视觉方案经历多次迭代：绿色背景 → 去边框 → 绿色边框+绿色插入线，最终确定统一绿色方案。浮动工具栏位置多次调整（工具栏上方 → 鼠标下方，`position: absolute` → `position: fixed`）。

***

## \[002] 2026-03-16\~17 — 代码块完善 + 列表样式 + 工具栏修复

**涉及文件：** `webview/codeBlockView.ts`, `webview/toolbar.ts`, `webview/style.css`, `webview/toc.ts`

### 完成内容

* 代码块：可搜索语言选择器、复制按钮、行号显示

* 目录（TOC）面板（侧边栏点击跳转）

* 有序列表多层级样式（第一层 1/2/3、第二层 a/b/c 级联）

* 工具栏吸顶修复

### Bug / 问题

| 编号   | 描述                                               | 根因                                                                                             | 解决方案                                                                            | 状态    |
| ---- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----- |
| B005 | 代码块复制按钮无 UI 反馈（点击后无视觉变化）                         | 用 `click` 事件触发，后续 `init` 重置 UI 状态                                                              | 改用 `mousedown` + `e.preventDefault()` 解耦复制和 UI 初始化                              | ✅ 已修复 |
| B006 | 有序列表嵌套层级样式错误                                     | CSS 列表计数器未正确级联                                                                                 | 修改级联规则：第一层 `decimal` → 第二层 `lower-alpha`                                        | ✅ 已修复 |
| B007 | 工具栏链接按钮报错 `No value supplied for attribute href` | href 属性为空/undefined 时未处理                                                                       | 补充默认值处理                                                                         | ✅ 已修复 |
| B008 | 链接插入报错（`prompt()` 被 WebView 沙盒阻止）                | WebView CSP 沙盒限制，`prompt()` 不可用                                                                | 改为自定义模态弹框替代 `prompt()`                                                          | ✅ 已修复 |
| B009 | 代码块行号位置错误、无横向滚动条、语言选择框消失                         | MutationObserver 干扰 ProseMirror 内部 DOMObserver flush；flex 容器 `align-items: stretch` 导致内容无法溢出滚动 | 移除 MutationObserver，改用 PMNode.textContent 直接初始化；CSS 加 `align-items: flex-start` | ✅ 已修复 |

### 备注

B009 根因发现周期较长（涉及对 ProseMirror 内部 DOMObserver flush 机制的理解）。代码块行号初始化方案从 `setTimeout(0)` 改为直接调用 `updateLineNumbers()`。

***

## \[001] 2026-03-13 — 项目骨架搭建 + Milkdown 集成 + 基础功能

**涉及文件：** `package.json`, `tsconfig.json`, `tsconfig.webview.json`, `esbuild.mjs`, `.vscode/launch.json`, `.vscode/tasks.json`, `src/extension.ts`, `src/MarkdownEditorProvider.ts`, `src/MarkdownDocument.ts`, `src/utils/getNonce.ts`, `webview/index.ts`, `webview/editor.ts`, `webview/messaging.ts`, `webview/style.css`, `webview/toolbar.ts`, `webview/linkPopup.ts`

### 完成内容

* VSCode 扩展骨架，`pnpm build` 成功，F5 可启动

* 注册 `CustomEditorProvider`，`priority: "default"` 接管 .md 文件打开

* 集成 Milkdown v7（GFM 支持：表格、删除线、任务列表）

* 自动保存（1s 防抖）+ 手动保存（Cmd+S）

* 设置项：`markdownWysiwyg.autoSave`、`markdownWysiwyg.autoSaveDelay`

* 链接 hover 弹窗（linkPopup.ts）

* 顶部主工具栏基础版

* esbuild 双目标构建脚本（Node.js + Browser）

* WebView ↔ Extension 消息通信协议（messaging.ts）

### Bug / 问题

| 编号   | 描述                        | 根因                                                                 | 解决方案                                         | 状态    |
| ---- | ------------------------- | ------------------------------------------------------------------ | -------------------------------------------- | ----- |
| B001 | 复选框勾选错位（点击一个，上一个被勾选）      | `posAtCoords` 在 checkbox 区域获取位置不在节点内部，`nodesBetween` 找到上一个节点       | 改用 `view.posAtDOM(taskItem, 0)` 从 DOM 反查精确位置 | ✅ 已修复 |
| B002 | 链接悬浮弹窗无法移入（鼠标移向弹窗时立即消失）   | `mouseout` 在离开容器移向弹窗时立即触发，弹窗还未进入就被隐藏                               | 改用 `mouseleave` + 延迟隐藏机制                     | ✅ 已修复 |
| B003 | 复选框渲染为 `.` 而非 checkbox 样式 | 任务列表实际 DOM 结构是 `<li data-item-type="task">`，非预期的 `.task-list-item` | 修改 CSS 选择器，用 `::after` 伪元素模拟 ✓ 勾选标记          | ✅ 已修复 |
| B004 | 代码块语言选择框体验差，无语法高亮         | 初版用 `<input>+<datalist>` 组合，交互体验差                                  | 改为标准 `<select>` 下拉 + refractor 语法高亮库         | ✅ 已修复 |

***

## 持久 / 未完全解决问题

| 编号   | 描述                    | 最新状态                                         |
| ---- | --------------------- | -------------------------------------------- |
| B016 | 发送到 Claude 功能不稳定      | 🔄 \[006] 已修复参数格式和行号，实际效果依赖 Claude 扩展 API 版本 |
| B023 | 发送到 Claude 行号映射精度     | 🔄 lineMap 方案改善，未完全验证                        |
| —    | 输入法下代码块语言选择器回车影响编辑器内容 | ⏳ 已知，未修复                                     |
