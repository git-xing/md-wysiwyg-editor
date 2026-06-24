/**
 * keyboardShortcuts.ts
 * 
 * 职责：注册和处理编辑器的键盘快捷键
 * 
 * 本模块处理以下快捷键：
 * - Cmd/Ctrl+F：打开查找栏（预填当前选区文字）
 * - Cmd/Ctrl+Shift+M：切换到文本编辑器（附带当前视口行号）
 * - Option+Alt+K：将选中内容或当前块发送给 Claude（带精确行号）
 */

import type { EditorView } from "@milkdown/prose/view";
import { CellSelection } from "@milkdown/prose/tables";
import {
    notifySendToClaudeChat,
    notifySwitchToTextEditor,
} from "./messaging";
import {
    getBlockContainerText,
    findLineInOriginalSource,
    getCellRowSourceLine,
} from "./components/selectionToolbar";
import type { FindBarController } from "./components/findBar";
import type { EventManager } from "./eventManager";

/** 初始化键盘快捷键 */
export function initKeyboardShortcuts(
    eventManager: EventManager,
    getEditorView: () => EditorView | null,
    getLineMap: () => number[],
    getMarkdownSource: () => string,
    getFirstVisibleSourceLine: (view: EditorView, lineMap: number[]) => number,
    findBar: FindBarController,
): void {
    // Cmd/Ctrl+F：打开查找栏（预填当前选区文字）
    eventManager.onShortcut(
        { code: "KeyF", metaOrCtrl: true, stopPropagation: true },
        () => {
            const view = getEditorView();
            let initialQuery: string | undefined;
            if (view) {
                const { selection, doc } = view.state;
                if (!selection.empty) {
                    const text = doc.textBetween(selection.from, selection.to);
                    if (text.trim()) { initialQuery = text; }
                }
            }
            findBar.open(initialQuery);
        },
    );

    // Cmd/Ctrl+Shift+M：切换到文本编辑器（附带当前视口顶部行号，供文本编辑器定位）
    eventManager.onShortcut(
        { code: "KeyM", metaOrCtrl: true, shift: true },
        () => {
            const view = getEditorView();
            const lineMap = getLineMap();
            const line = view ? getFirstVisibleSourceLine(view, lineMap) : undefined;
            notifySwitchToTextEditor(line);
        },
    );

    // Option+K 快捷键：把光标所在顶层块发送给 Claude
    // 有文字选区时发送选中文字 + 精确行号；无选区时发送整个顶层块
    eventManager.onShortcut(
        { code: "KeyK", alt: true },
        () => {
            const view = getEditorView();
            if (!view) {
                return;
            }
            const lineMap = getLineMap();
            const markdownSource = getMarkdownSource();
            const { selection } = view.state;
            const $from = view.state.doc.resolve(selection.from);
            const topBlockIdx = $from.index(0);
            const topBlock = view.state.doc.child(topBlockIdx);
            const textBefore = view.state.doc.textBetween(0, $from.before(1), "\n");
            const fallbackStart = (textBefore.match(/\n/g) ?? []).length + 1;
            const blockStartLine = lineMap[topBlockIdx] ?? fallbackStart;

            if (!selection.empty) {
                // 有文字选区：发送选中文字 + 精确行号
                const text = view.state.doc.textBetween(
                    selection.from,
                    selection.to,
                    "\n",
                );
                if (!text.trim()) {
                    return;
                }

                let startLine: number;
                let endLine: number;

                if (selection instanceof CellSelection) {
                    // 用 $anchorCell.pos / $headCell.pos 保证在单元格内部
                    const anchorLine = getCellRowSourceLine(
                        view.state.doc,
                        selection.$anchorCell.pos,
                        () => markdownSource,
                    );
                    const headLine = getCellRowSourceLine(
                        view.state.doc,
                        selection.$headCell.pos,
                        () => markdownSource,
                    );
                    if (anchorLine !== null && headLine !== null) {
                        startLine = Math.min(anchorLine, headLine);
                        endLine = Math.max(anchorLine, headLine);
                    } else {
                        startLine = anchorLine ?? headLine ?? blockStartLine;
                        endLine = startLine;
                    }
                } else {
                    // 普通文本选区：优先用文本搜索，失败时降级 lineMap+偏移
                    const $fromPos = view.state.doc.resolve(selection.from);
                    const $toPos = view.state.doc.resolve(selection.to);
                    const startBlockText = getBlockContainerText($fromPos);
                    const endBlockText = getBlockContainerText($toPos);
                    startLine = findLineInOriginalSource(markdownSource, startBlockText);
                    endLine = findLineInOriginalSource(markdownSource, endBlockText);

                    if (startLine === -1) {
                        // 逐字搜索选中文本首行
                        const firstLine = text.trim().split("\n")[0].trim();
                        if (firstLine.length >= 2) {
                            const idx = markdownSource
                                .split("\n")
                                .findIndex((l) => l.includes(firstLine));
                            if (idx >= 0) {
                                startLine = idx + 1;
                            }
                        }
                    }
                    if (startLine === -1) {
                        const isFenced = topBlock.type.name === "code_block";
                        const blockContentStart = $from.before(1) + 1;
                        const textBeforeInBlock = view.state.doc.textBetween(
                            blockContentStart,
                            selection.from,
                            "\n",
                        );
                        const linesIntoBlock = (
                            textBeforeInBlock.match(/\n/g) ?? []
                        ).length;
                        startLine =
                            blockStartLine + (isFenced ? 1 : 0) + linesIntoBlock;
                    }
                    if (endLine === -1) {
                        endLine = startLine + (text.match(/\n/g) ?? []).length;
                    }
                }

                notifySendToClaudeChat(text, startLine, endLine);
            } else {
                // 无选区：发送整个顶层块
                const text = topBlock.textContent;
                if (!text.trim()) {
                    return;
                }
                const endLine = blockStartLine + text.split("\n").length - 1;
                notifySendToClaudeChat(text, blockStartLine, endLine);
            }
        },
    );
}
