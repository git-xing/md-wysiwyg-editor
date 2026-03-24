# Markdown WYSIWYG Editor

一款基于 [Milkdown](https://milkdown.dev/)（ProseMirror）的 VSCode 所见即所得 Markdown 编辑器扩展，以富文本方式直接编辑 `.md` / `.markdown` 文件，保存结果为标准 Markdown，与任何文本编辑器完全兼容。

***

## 功能特性

### 富文本编辑

* **标题**（H1–H6）、**粗体**、*斜体*、~~删除线~~、`行内代码`、引用块、分割线

* **有序列表 / 无序列表 / 任务列表**（点击复选框切换完成状态）

* **链接**：悬停显示预览弹框，可直接在编辑器内跳转

### 表格

* 完整的 GFM 表格支持

* 悬停行/列边框显示 **+ 插入线**，一键在任意位置插入行或列

* 行/列 **拖拽 handle**，点击选中整行/整列，拖拽即可重新排序

* 输入内容撑大表格后，插入线与 handle 实时跟随更新位置

### 代码块

* 语法高亮（支持 20+ 语言：Bash、C、C++、C#、CSS、Go、HTML、Java、JavaScript、JSON、Markdown、PHP、Python、Ruby、Rust、SQL、Swift、TypeScript、YAML）

* 顶部语言选择器（含搜索筛选）

* 一键复制代码按钮

* 拖拽底部 handle 调整代码块显示高度

### 目录（TOC）

* 自动从文档标题生成目录面板

* 窗口宽度充足时自动展开；点击侧边 Tab 手动切换

* 点击条目平滑滚动至对应标题

### 工具栏

* 顶部固定工具栏：标题级别、加粗、斜体、删除线、有序/无序列表、任务列表、引用、代码块、表格

* **选中文字浮动工具栏**：选中文字后弹出，支持快速格式化及发送到 Claude

* **表格工具栏**：选中行/列后弹出，支持插入/删除行列

### Claude 集成

* **`Option+K`**（macOS）：将光标所在段落发送到 Claude 对话，自动附带精确文件行号

* 选中文字后点击工具栏「发送到 Claude」按钮，同样附带行号范围

* 自动识别 Claude 终端 / Claude VSCode 扩展 / VSCode 内置 Chat，三级降级兜底

### 自动保存

* 默认停止编辑 **1 秒**后自动写盘，无需手动 `Cmd+S`

* 支持关闭自动保存，手动保存（标题栏显示 `●`）

* 外部文件变更自动同步到编辑器（如 `git checkout`、其他编辑器修改）

***

## 快速上手

安装扩展后，在 VSCode 中打开任意 `.md` / `.markdown` 文件，将自动以 WYSIWYG 模式打开。

| 操作           | 方式                       |
| ------------ | ------------------------ |
| 切换到文本编辑器     | 点击标题栏 👁 图标，或右键文件 → 打开方式 |
| 切换回 WYSIWYG  | 点击标题栏 👁 图标              |
| 插入行/列        | 鼠标悬浮表格行/列边框，点击 **+**     |
| 拖拽重排行/列      | 悬浮 **⠿** handle 后拖拽      |
| 选中整行/整列      | 点击 **⠿** handle          |
| 发送段落到 Claude | `Option+K`（macOS）        |
| 手动保存         | `Cmd+S`                  |

***

## 设置

| 设置项                                  | 类型      | 默认值         | 说明                                                   |
| ------------------------------------ | ------- | ----------- | ---------------------------------------------------- |
| `markdownWysiwyg.autoSave`           | boolean | `true`      | 编辑后自动写盘                                              |
| `markdownWysiwyg.autoSaveDelay`      | number  | `1000`      | 自动保存防抖延迟（毫秒）                                         |
| `markdownWysiwyg.defaultMode`        | string  | `"preview"` | 打开 `.md` 的默认模式：`preview`（WYSIWYG）或 `markdown`（文本编辑器） |
| `markdownWysiwyg.codeBlockMaxHeight` | number  | `500`       | 代码块最大显示高度（像素）                                        |
| `markdownWysiwyg.fontFamily`         | string  | `""`        | 编辑器字体，留空继承 VSCode 编辑器字体，示例：`Georgia, serif`          |

***

## 环境要求

* VSCode **1.80.0** 及以上

***

## 已知限制

* 暂不支持图片上传（可手动粘贴 Markdown 图片语法）

* 部分复杂 Markdown 扩展语法（如脚注、数学公式）尚未支持
