# Contributing

Contributions are welcome! Here's how to get started.

## Development Setup

```bash
# Prerequisites: Node.js 18+, pnpm 10+
pnpm install
pnpm build
```

Press **F5** in VS Code to launch a debug instance with the extension loaded.

## Project Structure

```
src/           Extension host (Node.js) — VSCode API, file I/O
  i18n/        Translation loader
  utils/       Utility functions (nonce, image service)
webview/       WebView frontend (Browser) — Milkdown editor, UI components
  components/  Reusable UI components (toolbar, table, toc, imageView, ...)
  i18n/        Translation helpers t() / kbd()
  ui/          Shared UI utilities (icons, tooltip)
i18n/          Localized resources
  l10n/        VS Code l10n runtime strings
  webview/     WebView translation files (JSON)
  docs/        Localized documentation
```

## Contributing Translations

We welcome translations for new languages! Here's how to contribute:

### Adding a New Language

1. Create a new JSON file in `i18n/webview/` directory
2. Name the file using the language code (e.g., `fr.json` for French, `de.json` for German)
3. Copy the content from `i18n/webview/en.json` as a template
4. Translate all values to your language
5. Submit a Pull Request

### Translation File Format

```json
{
  "Table of Contents": "目次",
  "Undo": "元に戻す",
  "Redo": "やり直し",
  ...
}
```

- Keys are in English (matching the code's `t('Bold')` calls)
- Values are the translated strings
- Keep the same key structure as `en.json`

### Available Languages

- `en.json` - English (default)
- `zh-cn.json` - Chinese (Simplified)
- `ja.json` - Japanese
- `ko.json` - Korean

### Testing Your Translation

1. Add your translation file to `i18n/webview/`
2. Run `pnpm build`
3. Change VS Code language setting to your language
4. Open a Markdown file and verify the translations

## Code Conventions

- TypeScript everywhere
- WebView ↔ Extension communication **only** through `webview/messaging.ts`
- CSS must use `--vscode-*` variables for theme compatibility
- Use `pnpm` — not `npm` or `yarn`
- Git commit messages: type prefix in English, description in Chinese

## Submitting Changes

1. Fork the repository
2. Create a branch from `dev`: `git checkout -b feature/your-feature`
3. Make changes and run `pnpm build` to verify
4. Open a Pull Request against the **`dev`** branch

## Reporting Bugs

Please use the [Bug Report template](https://github.com/git-xing/md-wysiwyg-editor/issues/new?template=bug_report.md) and include your VS Code version and the Output panel logs.
