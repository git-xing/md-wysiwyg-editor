import type { EditorView } from '@milkdown/prose/view';

type GetView = () => EditorView | null;

// 功能已合并到 selectionToolbar.ts
export function setupTableToolbar(
  _getView: GetView,
): { onSelectionChange(view: EditorView): void } {
  return { onSelectionChange: () => {} };
}
