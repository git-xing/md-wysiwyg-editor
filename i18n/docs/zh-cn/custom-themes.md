# 自定义主题配置

Markdown WYSIWYG Editor 支持自定义主题颜色，可以在 `.vscode/settings.json` 中配置。

## 配置方式

在 `.vscode/settings.json` 中添加 `markdownWysiwyg.customThemes` 配置项：

```json
{
    "markdownWysiwyg.customThemes": [
        {
            "name": "My Custom Theme",
            "colors": {
                "editor.background": "#ffffff",
                "editor.foreground": "#333333"
            }
        }
    ]
}
```

## 配置项说明

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 是 | 主题名称，用于在主题选择列表中显示 |
| `colors` | object | 是 | VS Code 颜色 ID 到颜色值的映射 |

## 颜色 ID 参考

### 编辑器颜色

| 颜色 ID | 说明 |
|---------|------|
| `editor.background` | 编辑器背景色 |
| `editor.foreground` | 编辑器前景色 |
| `editor.selectionBackground` | 选中文本背景色 |
| `editor.inactiveSelectionBackground` | 非活动选区背景色 |
| `editor.lineHighlightBackground` | 当前行高亮背景色 |
| `editorCursor.foreground` | 光标颜色 |
| `editorWhitespace.foreground` | 空白字符颜色 |
| `editorIndentGuide.background` | 缩进参考线颜色 |
| `editorIndentGuide.activeBackground` | 活动缩进参考线颜色 |
| `editorLineNumber.foreground` | 行号颜色 |
| `editorLineNumber.activeForeground` | 活动行号颜色 |
| `editor.findMatchBackground` | 查找匹配背景色 |
| `editor.findMatchHighlightBackground` | 查找匹配高亮背景色 |
| `editorBracketMatch.background` | 括号匹配背景色 |
| `editorBracketMatch.border` | 括号匹配边框色 |

### 代码块与文本

| 颜色 ID | 说明 |
|---------|------|
| `textCodeBlock.background` | 行内代码/代码块背景色 |
| `textLink.foreground` | 链接文字颜色 |
| `textLink.activeForeground` | 链接悬停颜色 |
| `textBlockQuote.border` | 引用块边框颜色 |
| `textBlockQuote.background` | 引用块背景色 |
| `textPreformat.foreground` | 预格式化文本颜色 |

### 侧边栏

| 颜色 ID | 说明 |
|---------|------|
| `sideBar.background` | 侧边栏背景色 |
| `sideBar.foreground` | 侧边栏文字颜色 |
| `sideBar.border` | 侧边栏边框颜色 |
| `sideBarTitle.foreground` | 侧边栏标题颜色 |
| `sideBarSectionHeader.background` | 侧边栏分组标题背景色 |

### 标签页

| 颜色 ID | 说明 |
|---------|------|
| `tab.activeBackground` | 活动标签页背景色 |
| `tab.activeForeground` | 活动标签页文字颜色 |
| `tab.inactiveBackground` | 非活动标签页背景色 |
| `tab.inactiveForeground` | 非活动标签页文字颜色 |
| `tab.border` | 标签页边框颜色 |
| `tab.activeBorderTop` | 活动标签页顶部边框色 |

### 输入框与按钮

| 颜色 ID | 说明 |
|---------|------|
| `input.background` | 输入框背景色 |
| `input.foreground` | 输入框文字颜色 |
| `input.border` | 输入框边框颜色 |
| `input.placeholderForeground` | 输入框占位文字颜色 |
| `button.background` | 按钮背景色 |
| `button.foreground` | 按钮文字颜色 |
| `button.hoverBackground` | 按钮悬停背景色 |
| `dropdown.background` | 下拉框背景色 |
| `dropdown.foreground` | 下拉框文字颜色 |

### 状态栏

| 颜色 ID | 说明 |
|---------|------|
| `statusBar.background` | 状态栏背景色 |
| `statusBar.foreground` | 状态栏文字颜色 |
| `statusBar.border` | 状态栏边框颜色 |
| `statusBar.debuggingBackground` | 调试模式状态栏背景色 |

### 列表与选择

| 颜色 ID | 说明 |
|---------|------|
| `list.activeSelectionBackground` | 列表活动选中背景色 |
| `list.activeSelectionForeground` | 列表面板活动选中文字色 |
| `list.inactiveSelectionBackground` | 列表非活动选中背景色 |
| `list.hoverBackground` | 列表悬停背景色 |
| `list.focusBackground` | 列表聚焦背景色 |

### 面板与标题栏

| 颜色 ID | 说明 |
|---------|------|
| `panel.background` | 面板背景色 |
| `panel.border` | 面板边框颜色 |
| `titleBar.activeBackground` | 标题栏活动背景色 |
| `titleBar.activeForeground` | 标题栏活动文字色 |
| `titleBar.inactiveBackground` | 标题栏非活动背景色 |

### 通知与消息

| 颜色 ID | 说明 |
|---------|------|
| `notifications.background` | 通知背景色 |
| `notifications.foreground` | 通知文字颜色 |
| `notifications.border` | 通知边框颜色 |
| `notificationLink.foreground` | 通知链接颜色 |

### 终端

| 颜色 ID | 说明 |
|---------|------|
| `terminal.background` | 终端背景色 |
| `terminal.foreground` | 终端文字颜色 |
| `terminal.ansiBlack` | 终端 ANSI 黑色 |
| `terminal.ansiRed` | 终端 ANSI 红色 |
| `terminal.ansiGreen` | 终端 ANSI 绿色 |
| `terminal.ansiYellow` | 终端 ANSI 黄色 |
| `terminal.ansiBlue` | 终端 ANSI 蓝色 |
| `terminal.ansiMagenta` | 终端 ANSI 洋红色 |
| `terminal.ansiCyan` | 终端 ANSI 青色 |
| `terminal.ansiWhite` | 终端 ANSI 白色 |

## 颜色格式

支持以下颜色格式：

```json
{
    "colors": {
        "editor.background": "#ffffff",
        "editor.foreground": "rgb(51, 51, 51)",
        "textLink.foreground": "rgba(0, 102, 204, 1)",
        "button.background": "hsl(210, 100%, 40%)"
    }
}
```

## 示例配置

### 深色主题（类似 GitHub Dark）
```json
{
    "markdownWysiwyg.customThemes": [
        {
            "name": "GitHub Dark",
            "colors": {
                "editor.background": "#0d1117",
                "editor.foreground": "#c9d1d9",
                "editor.selectionBackground": "#1f6feb33",
                "editor.lineHighlightBackground": "#161b2208",
                "editorCursor.foreground": "#58a6ff",
                "textLink.foreground": "#58a6ff",
                "textCodeBlock.background": "#161b22",
                "textBlockQuote.border": "#3d444d",
                "textBlockQuote.background": "#161b22",
                "panel.background": "#0d1117",
                "panel.border": "#30363d",
                "sideBar.background": "#010409",
                "sideBar.foreground": "#c9d1d9",
                "tab.activeBackground": "#0d1117",
                "tab.activeForeground": "#f0f6fc",
                "tab.inactiveBackground": "#010409",
                "input.background": "#0d1117",
                "input.foreground": "#c9d1d9",
                "input.border": "#30363d",
                "button.background": "#238636",
                "button.foreground": "#ffffff"
            }
        }
    ]
}
```

### 浅色主题（类似 Apple Style）
```json
{
    "markdownWysiwyg.customThemes": [
        {
            "name": "Apple Light",
            "colors": {
                "editor.background": "#ffffff",
                "editor.foreground": "#1d1d1f",
                "editor.selectionBackground": "#b4d8fc",
                "editor.lineHighlightBackground": "#f5f5f7",
                "editorCursor.foreground": "#007aff",
                "textLink.foreground": "#0066cc",
                "textCodeBlock.background": "#f5f5f7",
                "textBlockQuote.border": "#86868b",
                "textBlockQuote.background": "#f5f5f7",
                "panel.background": "#ffffff",
                "panel.border": "#d2d2d7",
                "sideBar.background": "#f5f5f7",
                "sideBar.foreground": "#1d1d1f",
                "tab.activeBackground": "#ffffff",
                "tab.activeForeground": "#1d1d1f",
                "tab.inactiveBackground": "#f5f5f7",
                "input.background": "#ffffff",
                "input.foreground": "#1d1d1f",
                "input.border": "#d2d2d7",
                "button.background": "#0066cc",
                "button.foreground": "#ffffff"
            }
        }
    ]
}
```

### 暗紫色主题
```json
{
    "markdownWysiwyg.customThemes": [
        {
            "name": "Purple Dark",
            "colors": {
                "editor.background": "#1a1032",
                "editor.foreground": "#e8e0f0",
                "editor.selectionBackground": "#6b4c9a33",
                "editor.lineHighlightBackground": "#2d1f4e08",
                "editorCursor.foreground": "#a78bfa",
                "textLink.foreground": "#a78bfa",
                "textCodeBlock.background": "#2d1f4e",
                "textBlockQuote.border": "#4c3d6e",
                "textBlockQuote.background": "#2d1f4e",
                "panel.background": "#1a1032",
                "panel.border": "#4c3d6e",
                "sideBar.background": "#120b24",
                "sideBar.foreground": "#e8e0f0",
                "tab.activeBackground": "#1a1032",
                "tab.activeForeground": "#f5f0ff",
                "tab.inactiveBackground": "#120b24",
                "input.background": "#1a1032",
                "input.foreground": "#e8e0f0",
                "input.border": "#4c3d6e",
                "button.background": "#6b4c9a",
                "button.foreground": "#ffffff"
            }
        }
    ]
}
```

## 使用方式

1. 在 `.vscode/settings.json` 中配置自定义主题
2. 按 `Cmd+Shift+P`（macOS）或 `Ctrl+Shift+P`（Windows）
3. 输入 "Select Color Theme"
4. 在主题列表中找到带 🎨 图标的自定义主题
5. 选择该主题

## 注意事项

- 主题名称必须唯一，用于在设置中标识主题
- 颜色值使用标准 CSS 颜色格式（如 `#ffffff`、`rgb(255, 255, 255)` 等）
- 修改配置后需要重新加载窗口或重启 VSCode 才能生效
- 如果配置了多个同名主题，只有第一个会被使用
- 部分颜色 ID 可能需要重启 VSCode 才能完全生效

## 获取更多颜色 ID

如需查看完整的 VSCode 颜色 ID 列表，请参考：
- [VSCode Theme Color Reference](https://code.visualstudio.com/api/references/theme-color)
