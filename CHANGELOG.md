# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [0.2.0] - 2026-07-06

### Added

- **Toolbar overflow menu**: when the viewport is too narrow to fit all toolbar icons, excess items automatically collapse into a dropdown menu accessible via the `⋮` button. The menu stays aligned and items appear in their original order.
- **Table grid selector**: hovering the table icon now shows a grid picker — drag to select rows × columns before inserting, instead of always inserting a fixed 3×3 table.
- **FindBar redesign**: drag-to-resize handle, replace input toggle (chevron button), regex and match-case toggle buttons. Search highlight colors now follow the active VS Code theme instead of a hardcoded green.
- **Unified `icon-btn` style**: all icon buttons across the editor (toolbar, code block, link popup, find bar) share a consistent base style via the `.icon-btn` CSS class.
- **Codicon font**: bundled the VS Code codicon font for consistent icon rendering across components.
- **Remote development support**: changed `extensionKind` to `["workspace", "ui"]` so the extension works correctly in Dev Containers, Remote-SSH, and WSL environments.
- **Table grid selector tests**: added Vitest unit tests for the new grid selector component.

### Fixed

- **i18n gaps**: replaced hardcoded Chinese strings in table handle tooltips and the image upload error message with proper `t()` / `vscode.l10n.t()` calls. Added missing translation keys for English and Simplified Chinese.
- **Search highlight colors**: replaced custom CSS variables with VS Code's built-in `--vscode-editor-findMatch*` variables, so highlights adapt to any color theme.

### Changed

- **Toolbar architecture**: refactored from monolithic button creation to a config-driven `ToolbarItemConfig[]` array. Each item declares its type, overflow behavior, and visibility, making it straightforward to add, reorder, or hide toolbar items.
- **FindBar CSS**: converted to CSS nesting syntax for better maintainability.
- **Toolbar CSS**: converted to CSS nesting syntax.
- **Code block buttons**: added `icon-btn` class to mermaid zoom, word-wrap, fullscreen, and code/preview toggle buttons.
- **Link popup buttons**: added `icon-btn` class to open, edit, confirm, and remove buttons.
- **Selection toolbar**: alignment feature temporarily hidden (marked TODO) pending further design.

---

## [0.1.6] - 2026-04-27

### Fixed

- **Scroll position restored on tab switch**: switching away from a Markdown file and back no longer resets the scroll position to the top. The editor now persists the scroll offset via the VS Code WebView state API and restores it when the panel becomes visible again (via `visibilitychange`). Also handles WebView recreation on VS Code restart.

---

## [0.1.5] - 2026-04-08

### Fixed

- **Auto-reload on external file changes**: the editor now instantly reflects changes made by AI tools (e.g. Claude Code) or any external program without needing to close and reopen the file. Previously, writes from the same VS Code Extension Host were silently ignored due to VS Code's internal deduplication; atomic writes (rename-based) also caused the file watcher to stop tracking the file after the first replacement. Fixed by switching to Node.js `fs.watch` on the parent directory.
- **IME input**: prevent Chinese/Japanese/Korean intermediate composition states from triggering premature auto-saves, which caused duplicate or garbled characters.

### Added

- **Image path autocomplete**: type `./`, `../`, or `@/` in the image URL input to get smart path suggestions; image files show a 32 px thumbnail preview in the dropdown.
- **`@/` alias for image paths**: images referenced as `@/images/foo.png` (workspace root) are now correctly displayed in the editor.

---

## [0.1.4] - 2026-04-08

### Fixed

- Fixed the "简体中文" link in the Marketplace README pointing to a non-existent URL (corrected `--baseContentUrl` to include `/blob/main`)
- Fixed incorrect release dates in CHANGELOG for versions 0.1.0–0.1.2

---

## [0.1.3] - 2026-04-07

### Added

- **Path autocomplete**: type `@/`, `./`, or `../` inside inline code to trigger smart path suggestions
- **Hierarchical directory browsing**: path suggestions show the current directory level; selecting a folder drills into the next level
- **File-type icons**: the suggestion dropdown shows color-coded vscode-icons for 9 file types (folder, TypeScript, JavaScript, Markdown, JSON, CSS, HTML, image, and generic file)
- **`#line-number` jump in links**: links such as `README.md#27` or `README.md#27-30` jump directly to the specified line in the target file

---

## [0.1.2] - 2026-04-07

### Added

- **In-editor search** (`Cmd/Ctrl+F`): FindBar with real-time highlighting via CSS Custom Highlight API; navigate with `Enter` / `Shift+Enter`, dismiss with `Esc`
- **Link popup redesign**: single-card UI with view / edit modes; supports `@/` workspace paths and `#anchor` in-page links
- **In-page anchor navigation** (`#heading`): GitHub-compatible slug, smooth scroll
- **Global search navigation**: clicking a VS Code search result scrolls the WYSIWYG editor to the matching position
- **Code block full-screen editor**: textarea + pre overlay with syntax highlighting, fade-in/out animation; writes back to ProseMirror on close
- **Mermaid diagram rendering** (mermaid 11.x): inline preview, code/preview toggle, zoom, pan, full-screen lightbox

---

## [0.1.1] - 2026-04-01

### Added

- **Image support**: paste, drag-and-drop, or file picker to insert images; local storage with MD5 deduplication or custom server upload
- **Image NodeView**: selection border, lightbox zoom, toolbar for alt-text editing, rename, and delete
- **Internationalization**: English + Simplified Chinese; platform-aware shortcuts (Mac ⌘/⇧/⌥ vs Windows Ctrl/Shift/Alt)
- **Settings icon** (gear) in the toolbar opens the VS Code settings panel for this extension

---

## [0.1.0] - 2026-03-31

### Added

- Initial release: WYSIWYG Markdown editor powered by [Milkdown](https://milkdown.dev/) / ProseMirror
- Full GFM table support: insert rows/columns, drag-to-reorder
- Syntax-highlighted code blocks for 20+ languages with height-resize handle
- Auto-generated Table of Contents panel (TOC)
- Floating selection toolbar and table toolbar
- Claude integration: `Option+K` / `Alt+K` sends the current paragraph with precise file line numbers
- Auto-save: writes to disk 1 second after editing stops
