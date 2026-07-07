# Custom Theme Configuration

Markdown WYSIWYG Editor supports custom color themes that can be configured in `.vscode/settings.json`.

## Configuration

Add the `markdownWysiwyg.customThemes` setting to `.vscode/settings.json`:

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

## Configuration Options

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | string | Yes | Theme name displayed in the theme selection list |
| `colors` | object | Yes | VS Code color ID to color value mapping |

## Color ID Reference

### Editor Colors

| Color ID | Description |
|----------|-------------|
| `editor.background` | Editor background color |
| `editor.foreground` | Editor foreground color |
| `editor.selectionBackground` | Selected text background |
| `editor.inactiveSelectionBackground` | Inactive selection background |
| `editor.lineHighlightBackground` | Current line highlight background |
| `editorCursor.foreground` | Cursor color |
| `editorWhitespace.foreground` | Whitespace character color |
| `editorIndentGuide.background` | Indent guide color |
| `editorIndentGuide.activeBackground` | Active indent guide color |
| `editorLineNumber.foreground` | Line number color |
| `editorLineNumber.activeForeground` | Active line number color |
| `editor.findMatchBackground` | Find match background |
| `editor.findMatchHighlightBackground` | Find match highlight background |
| `editorBracketMatch.background` | Bracket match background |
| `editorBracketMatch.border` | Bracket match border |

### Code Blocks & Text

| Color ID | Description |
|----------|-------------|
| `textCodeBlock.background` | Inline code / code block background |
| `textLink.foreground` | Link text color |
| `textLink.activeForeground` | Link hover color |
| `textBlockQuote.border` | Blockquote border color |
| `textBlockQuote.background` | Blockquote background |
| `textPreformat.foreground` | Preformatted text color |

### Sidebar

| Color ID | Description |
|----------|-------------|
| `sideBar.background` | Sidebar background color |
| `sideBar.foreground` | Sidebar text color |
| `sideBar.border` | Sidebar border color |
| `sideBarTitle.foreground` | Sidebar title color |
| `sideBarSectionHeader.background` | Sidebar section header background |

### Tabs

| Color ID | Description |
|----------|-------------|
| `tab.activeBackground` | Active tab background |
| `tab.activeForeground` | Active tab text color |
| `tab.inactiveBackground` | Inactive tab background |
| `tab.inactiveForeground` | Inactive tab text color |
| `tab.border` | Tab border color |
| `tab.activeBorderTop` | Active tab top border |

### Input & Buttons

| Color ID | Description |
|----------|-------------|
| `input.background` | Input box background |
| `input.foreground` | Input box text color |
| `input.border` | Input box border color |
| `input.placeholderForeground` | Input placeholder text color |
| `button.background` | Button background color |
| `button.foreground` | Button text color |
| `button.hoverBackground` | Button hover background |
| `dropdown.background` | Dropdown background color |
| `dropdown.foreground` | Dropdown text color |

### Status Bar

| Color ID | Description |
|----------|-------------|
| `statusBar.background` | Status bar background |
| `statusBar.foreground` | Status bar text color |
| `statusBar.border` | Status bar border color |
| `statusBar.debuggingBackground` | Debug mode status bar background |

### Lists & Selection

| Color ID | Description |
|----------|-------------|
| `list.activeSelectionBackground` | Active selection background |
| `list.activeSelectionForeground` | Active selection text color |
| `list.inactiveSelectionBackground` | Inactive selection background |
| `list.hoverBackground` | List hover background |
| `list.focusBackground` | List focus background |

### Panel & Title Bar

| Color ID | Description |
|----------|-------------|
| `panel.background` | Panel background color |
| `panel.border` | Panel border color |
| `titleBar.activeBackground` | Title bar active background |
| `titleBar.activeForeground` | Title bar active text color |
| `titleBar.inactiveBackground` | Title bar inactive background |

### Notifications

| Color ID | Description |
|----------|-------------|
| `notifications.background` | Notification background |
| `notifications.foreground` | Notification text color |
| `notifications.border` | Notification border color |
| `notificationLink.foreground` | Notification link color |

### Terminal

| Color ID | Description |
|----------|-------------|
| `terminal.background` | Terminal background color |
| `terminal.foreground` | Terminal text color |
| `terminal.ansiBlack` | Terminal ANSI black |
| `terminal.ansiRed` | Terminal ANSI red |
| `terminal.ansiGreen` | Terminal ANSI green |
| `terminal.ansiYellow` | Terminal ANSI yellow |
| `terminal.ansiBlue` | Terminal ANSI blue |
| `terminal.ansiMagenta` | Terminal ANSI magenta |
| `terminal.ansiCyan` | Terminal ANSI cyan |
| `terminal.ansiWhite` | Terminal ANSI white |

## Color Formats

Supported color formats:

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

## Example Configurations

### Dark Theme (GitHub Dark style)
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

### Light Theme (Apple Style)
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

### Dark Purple Theme
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

## Usage

1. Add the custom theme configuration to `.vscode/settings.json`
2. Press `Cmd+Shift+P` (macOS) or `Ctrl+Shift+P` (Windows)
3. Type "Select Color Theme"
4. Find the custom theme with 🎨 icon in the theme list
5. Select the theme

## Notes

- Theme names must be unique for identification in settings
- Color values use standard CSS color formats (e.g., `#ffffff`, `rgb(255, 255, 255)`)
- After modifying the configuration, reload the window or restart VSCode for changes to take effect
- If multiple themes with the same name are configured, only the first one will be used
- Some color IDs may require restarting VSCode to fully take effect

## More Color IDs

For the complete list of VSCode color IDs, please refer to:
- [VSCode Theme Color Reference](https://code.visualstudio.com/api/references/theme-color)
