# Markdown WYSIWYG Editor

English | [简体中文](README.zh-CN.md) | [GitHub](https://github.com/git-xing/md-wysiwyg-editor)

A VSCode WYSIWYG Markdown editor extension powered by [Milkdown](https://milkdown.dev/) (ProseMirror). Edit `.md` / `.markdown` files as rich text and save as standard Markdown — fully compatible with any text editor.

***

## Features

### Rich Text Editing

- **Headings** (H1–H6), **bold**, *italic*, ~~strikethrough~~, `inline code`, blockquote, horizontal rule
- **Ordered / Unordered / Task lists** (click checkbox to toggle completion)
- **Links**: hover to show a popup for editing link text and URL inline; supports `@/` workspace paths and `#anchor` in-page jumps

### Tables

- Full GFM table support
- Hover row/column borders to show **+ insert lines** — click to insert a row or column anywhere
- **Drag handles** on rows/columns: click to select, drag to reorder
- Insert lines and handles update in real time as the table grows

### Code Blocks

- Syntax highlighting for 20+ languages: Bash, C, C++, C#, CSS, Go, HTML, Java, JavaScript, JSON, Markdown, PHP, Python, Ruby, Rust, SQL, Swift, TypeScript, YAML
- Language picker with search filter
- One-click copy button
- Drag the bottom handle to resize the code block height

### Table of Contents (TOC)

- Auto-generated from document headings
- Auto-opens when the window is wide enough; toggle manually via the side tab
- Click an entry to smooth-scroll to the heading

### Toolbars

- **Top toolbar**: heading level, bold, italic, strikethrough, ordered/unordered list, task list, blockquote, code block, table
- **Floating selection toolbar**: appears on text selection; supports quick formatting and Send to Claude
- **Table toolbar**: appears on row/column selection; supports alignment and delete operations

### Claude Integration

- **`Option+K`** (macOS) / **`Alt+K`** (Windows): sends the paragraph under the cursor to Claude with precise file line numbers
- Select text and click "Send to Claude" in the toolbar — also attaches line range
- Automatically detects Claude terminal / Claude VSCode extension / VS Code built-in Chat with three-level fallback

### In-Editor Search

- **`Cmd+F`** (macOS) / **`Ctrl+F`** (Windows): opens the FindBar to search within the document
- Matches highlighted in real time using the CSS Custom Highlight API
- Navigate matches with `Enter` / `Shift+Enter`, dismiss with `Esc`

### Auto Save

- Automatically writes to disk **1 second** after editing stops — no need to press `Cmd+S` / `Ctrl+S`
- Can be disabled; manual save shows `●` in the tab title
- External file changes (e.g. `git checkout`, other editors) sync automatically to the editor

***

## Getting Started

After installing the extension, open any `.md` / `.markdown` file in VS Code — it opens in WYSIWYG mode automatically.

| Action                   | How                                                            |
| ------------------------ | -------------------------------------------------------------- |
| Switch to text editor    | Click the 👁 icon in the title bar, or right-click → Open With |
| Switch back to WYSIWYG   | Click the 👁 icon in the title bar                             |
| Insert row/column        | Hover a table row/column border, click **+**                   |
| Reorder rows/columns     | Hover the **⠿** handle, then drag                              |
| Select entire row/column | Click the **⠿** handle                                         |
| Send paragraph to Claude | `Option+K` (macOS) / `Alt+K` (Windows)                         |
| Manual save              | `Cmd+S` (macOS) / `Ctrl+S` (Windows)                           |

***

## Settings

| Setting                              | Type    | Default     | Description                                                                               |
| ------------------------------------ | ------- | ----------- | ----------------------------------------------------------------------------------------- |
| `markdownWysiwyg.autoSave`           | boolean | `true`      | Automatically save to disk after editing                                                  |
| `markdownWysiwyg.autoSaveDelay`      | number  | `1000`      | Debounce delay in milliseconds for auto-save                                              |
| `markdownWysiwyg.defaultMode`        | string  | `"preview"` | Default mode when opening `.md`: `preview` (WYSIWYG) or `markdown` (text editor)          |
| `markdownWysiwyg.codeBlockMaxHeight` | number  | `500`       | Maximum code block height in pixels                                                       |
| `markdownWysiwyg.fontFamily`         | string  | `""`        | Editor font family; leave empty to inherit VS Code editor font. Example: `Georgia, serif` |

***

## Requirements

- VS Code **1.80.0** or later

***

## Known Limitations

- Image upload is not supported (paste Markdown image syntax manually)
- Some advanced Markdown extensions (footnotes, math formulas) are not yet supported
