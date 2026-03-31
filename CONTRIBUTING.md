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
  i18n/        WebView translation data
  utils/       Utility functions (nonce, image service)
webview/       WebView frontend (Browser) — Milkdown editor, UI components
  components/  Reusable UI components (toolbar, table, toc, imageView, ...)
  i18n/        Translation helpers t() / kbd()
  ui/          Shared UI utilities (icons, tooltip)
docs/          Development documentation
```

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
