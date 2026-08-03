<p align="center">
    <img src="./images/icon.jpg" alt="logo" width="90"/>
</p>

<p align="center">
    <a href="./README.md">English</a>
    &nbsp;·&nbsp;
    <strong>简体中文</strong>
    &nbsp;·&nbsp;
    <a href="./i18n/docs/zh-cn/custom-themes.md">自定义主题配置</a>
</p>

<p align="center">
    <a href="https://github.com/git-xing/md-wysiwyg-editor"><img src="https://badgen.net/badge/icon/github?icon=github&label" alt="Visual Studio Marketplace Version"/></a>
    <a href="https://marketplace.visualstudio.com/items?itemName=chance-liu.md-wysiwyg-editor"><img src="https://img.shields.io/visual-studio-marketplace/v/chance-liu.md-wysiwyg-editor?color=blue&label=VS%20Code%20Marketplace&logo=visual-studio-code" alt="Visual Studio Marketplace Version"/></a>
    <a href="./LICENSE"><img src="https://img.shields.io/npm/l/reasonix.svg?style=flat-square&color=8b949e&labelColor=161b22" alt="license"/></a>
    <a href="https://marketplace.visualstudio.com/items?itemName=chance-liu.md-wysiwyg-editor"><img src="https://badgen.net/vs-marketplace/d/chance-liu.md-wysiwyg-editor?color=blue" alt="downloads"/></a>
    <a href="https://github.com/git-xing/md-wysiwyg-editor"><img src="https://img.shields.io/github/stars/git-xing/md-wysiwyg-editor?style=social" alt="GitHub stars"/></a>
</p>

<h2 align="center">为 VS Code 打造的所见即所得 Markdown 编辑器</h2>
<p align="center">告别源码与预览的来回切换，像编辑 Word 文档一样写 Markdown</p>
<p align="center">
    基于 <a href="https://milkdown.dev/">Milkdown</a>（ProseMirror）内核，编辑体验流畅自然，
    保存为标准 Markdown 格式
</p>

## 编辑器界面

[![编辑器界面](images/screenshot.png)](images/screenshot.png)

---

## 功能特性

### 富文本编辑

- **标题**（H1–H6）、**粗体**、_斜体_、~~删除线~~、`行内代码`、引用块、分割线
- **有序列表 / 无序列表 / 任务列表**（点击复选框切换完成状态）
- **链接**：悬停显示预览弹框，可直接修改链接文本和 URL；支持 `@/` workspace 路径、`#` 页内锚点跳转，以及 `file.md#27` 行号跳转
- **路径自动补全**：在 inline code 中输入 `@/`、`./`、`../` 等前缀，自动显示路径补全建议；分级目录浏览，带彩色文件类型图标

### 表格

- 完整的 GFM 表格支持
- **网格选择器**：悬停表格图标后拖拽选择行×列数再插入，无需手动输入
- 悬停行/列边框显示 **+ 插入线**，一键在任意位置插入行或列
- 行/列 **拖拽 handle**，点击选中整行/整列，拖拽即可重新排序

### 代码块

- 语法高亮（支持 20+ 语言）
- 顶部语言选择器（含搜索筛选）
- 一键复制代码按钮
- 拖拽底部 handle 调整代码块显示高度
- 全屏编辑器，含语法高亮；关闭时写回文档

### Mermaid 图表

- 流程图、时序图、甘特图、类图等内联渲染
- 源码与预览之间一键切换
- 支持缩放、平移（拖拽 / 触控板捏合），以及全屏 lightbox

### 图片

- 支持从剪贴板**粘贴**、**拖放**文件，或通过**文件选择器**插入图片
- 本地存储（MD5 去重），或配置自定义服务器上传地址
- 点击图片选中，再次点击放大到 lightbox 预览
- 工具栏支持编辑 alt 文本、重命名文件、删除图片

### 自定义主题

- 支持通过 `markdownWysiwyg.customThemes` 配置项自定义主题颜色
- 在 `.vscode/settings.json` 中定义自定义主题名称和 VS Code 颜色 ID
- 通过命令面板选择自定义主题："选择 Markdown 主题"
- 详见 [自定义主题配置](i18n/docs/zh-cn/custom-themes.md)

![](./images/mdTheme.gif)

### 目录（TOC）

- 自动从文档标题生成目录面板
- 窗口宽度充足时自动展开；点击侧边 Tab 手动切换
- 点击条目平滑滚动至对应标题

### 工具栏

- **顶部固定工具栏**：标题级别、加粗、斜体、删除线、有序/无序列表、任务列表、引用、代码块、表格 — 窗口收窄时自动折叠为溢出下拉菜单
- **选中文字浮动工具栏**：选中文字后弹出，支持快速格式化及发送到 Claude
- **表格工具栏**：选中行/列后弹出，支持对齐、插入/删除行列

### 搜索与替换

- **`Cmd+F`**（macOS）/ **`Ctrl+F`**（Windows）：唤出 FindBar，在文档内搜索关键词
- **拖拽调整大小**：拖动底部 handle 可展开替换输入框
- **正则表达式**和**区分大小写**切换按钮
- 使用 CSS Custom Highlight API 实时高亮所有匹配项，颜色跟随 VS Code 主题
- `Enter` / `Shift+Enter` 上下导航，`Esc` 关闭

### Claude 集成

- **`Option+K`**（macOS）/ **`Alt+K`**（Windows）：将光标所在段落发送到 Claude 对话，自动附带精确文件行号
- 选中文字后点击工具栏「发送到 Claude」按钮，同样附带行号范围
- 自动识别 Claude 终端 / Claude VSCode 扩展 / VSCode 内置 Chat，三级降级兜底

### 自动保存

- 默认停止编辑 **1 秒**后自动写盘，无需手动 `Cmd+S` / `Ctrl+S`
- 支持关闭自动保存，手动保存（标题栏显示 `●`）
- 外部文件变更自动同步到编辑器（如 `git checkout`、其他编辑器修改）

---

## 快速上手

安装扩展后，在 VSCode 中打开任意 `.md` / `.markdown` 文件，将自动以 WYSIWYG 模式打开。

| 操作                 | 方式                                      |
| -------------------- | ----------------------------------------- |
| 切换到文本编辑器     | 点击标题栏 👁 图标，或右键文件 → 打开方式 |
| 切换回 WYSIWYG       | 点击标题栏 👁 图标                        |
| 插入表格（网格选择） | 悬停表格图标，拖拽选择行×列数             |
| 插入行/列            | 鼠标悬浮表格行/列边框，点击 **+**         |
| 拖拽重排行/列        | 悬浮 **⠿** handle 后拖拽                  |
| 选中整行/列          | 点击 **⠿** handle                         |
| 路径自动补全         | 在 inline code 中输入 `@/`、`./` 或 `../` |
| 发送段落到 Claude    | `Option+K`（macOS）/ `Alt+K`（Windows）   |
| 文档内搜索           | `Cmd+F`（macOS）/ `Ctrl+F`（Windows）     |
| 手动保存             | `Cmd+S`（macOS）/ `Ctrl+S`（Windows）     |

---

## 设置

| 设置项                               | 类型    | 默认值      | 说明                                                                   |
| ------------------------------------ | ------- | ----------- | ---------------------------------------------------------------------- |
| `markdownWysiwyg.autoSave`           | boolean | `true`      | 编辑后自动写盘                                                         |
| `markdownWysiwyg.autoSaveDelay`      | number  | `1000`      | 自动保存防抖延迟（毫秒）                                               |
| `markdownWysiwyg.defaultMode`        | string  | `"preview"` | 打开 `.md` 的默认模式：`preview`（WYSIWYG）或 `markdown`（文本编辑器） |
| `markdownWysiwyg.codeBlockMaxHeight` | number  | `600`       | 代码块最大显示高度（像素）                                             |
| `markdownWysiwyg.editorMaxWidth`     | number  | `900`       | 编辑器内容最大宽度（像素）                                             |
| `markdownWysiwyg.fontFamily`         | string  | `""`        | 编辑器字体，留空继承 VSCode 编辑器字体                                 |
| `markdownWysiwyg.imageStorage`       | string  | `"local"`   | 图片存储模式：`local`（本地保存）或 `server`（上传至自定义 URL）       |
| `markdownWysiwyg.imageLocalPath`     | string  | `""`        | 本地图片存储路径（相对于 workspace 根目录）                            |
| `markdownWysiwyg.colorTheme`         | string  | `"auto"`    | 颜色主题：`auto` 跟随 VSCode，或设置为特定主题 ID                      |
| `markdownWysiwyg.tableWrap`          | string  | `"normal"`  | 表格单元格文本换行：`normal`、`aggressive` 或 `none`                   |
| `markdownWysiwyg.customThemes`       | array   | `[]`        | 自定义颜色主题数组。详见 [自定义主题配置](i18n/docs/zh-cn/custom-themes.md)       |

---

## 环境要求

- VSCode **1.80.0** 及以上

---

## 已知限制

- 许多markdown私有格式尚未支持
- 部分复杂 Markdown 扩展语法（如脚注、数学公式）尚未支持
- **全局搜索跳转**：点击 `.md` 文件的全局搜索结果时，若同时打开多个 `.md` 文件，WYSIWYG 编辑器可能无法精确跳转到匹配行

---

## 许可证

[MIT License](LICENSE)
