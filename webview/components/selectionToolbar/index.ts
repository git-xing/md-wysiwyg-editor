import { commandsCtx } from "@milkdown/core";
import {
    toggleStrongCommand,
    toggleEmphasisCommand,
    toggleInlineCodeCommand,
    turnIntoTextCommand,
    wrapInHeadingCommand,
} from "@milkdown/preset-commonmark";
import type { Node as PMNode, ResolvedPos } from "@milkdown/prose/model";
import { toggleStrikethroughCommand } from "@milkdown/preset-gfm";
import {
    CellSelection,
    deleteRow,
    deleteColumn,
    setCellAttr,
    TableMap,
} from "@milkdown/prose/tables";
import type { Editor } from "@milkdown/core";
import type { EditorView } from "@milkdown/prose/view";
import { TextSelection } from "@milkdown/prose/state";
import {
    IconBold,
    IconItalic,
    IconStrikethrough,
    IconCode,
    IconChevronDown,
    IconSendChat,
    IconAlignLeft,
    IconAlignCenter,
    IconAlignRight,
    IconTrash2,
} from "@/ui/icons";
import { applyTooltip } from "@/ui/tooltip";
import { notifySendToClaudeChat } from "@/messaging";
import { t, kbd } from "@/i18n";
import { createButton, createSeparator } from "@/ui/dom";
import './selectionToolbar.css';

type GetEditor = () => Editor | null;

// 一次性位置覆盖：点击 drag handle 选中行/列时，由 tableHandles 设置鼠标坐标
let pendingPos: { x: number; y: number } | null = null;
export function setPendingToolbarPos(x: number, y: number): void {
    pendingPos = { x, y };
}

function isInTableCell($pos: {
    depth: number;
    node(d: number): { type: { name: string } };
}): boolean {
    for (let d = $pos.depth; d >= 0; d--) {
        const name = $pos.node(d).type.name;
        if (name === "table_cell" || name === "table_header") return true;
    }
    return false;
}

// 内联代码切换：
// - TextSelection → 直接用 Milkdown command（可靠）
// - CellSelection  → 用 forEachCell 逐格处理，解决跨单元格时只应用到最后一格的问题
function applyInlineCodeToSelection(
    view: EditorView,
    getEditor: GetEditor,
): void {
    const { state } = view;
    const sel = state.selection;

    if (!(sel instanceof CellSelection)) {
        callCmd(getEditor, toggleInlineCodeCommand);
        return;
    }

    // CellSelection：用 spec.code===true 可靠定位 code mark，不依赖名称字符串
    const codeMarkType =
        Object.values(state.schema.marks).find(
            (mt) => (mt.spec as { code?: boolean }).code === true,
        ) ??
        state.schema.marks["code"] ??
        state.schema.marks["code_inline"];
    if (!codeMarkType) {
        console.warn(
            "[selectionToolbar] code mark type not found in schema, marks:",
            Object.keys(state.schema.marks),
        );
        callCmd(getEditor, toggleInlineCodeCommand);
        return;
    }

    let hasCode = false;
    sel.forEachCell((node: PMNode) => {
        node.descendants((n: PMNode) => {
            if (n.isText && codeMarkType.isInSet(n.marks)) {
                hasCode = true;
            }
        });
    });

    const tr = state.tr;
    sel.forEachCell((node: PMNode, pos: number) => {
        const from = pos + 1;
        const to = pos + node.nodeSize - 1;
        if (hasCode) {
            tr.removeMark(from, to, codeMarkType);
        } else {
            tr.addMark(from, to, codeMarkType.create());
        }
    });
    view.dispatch(tr);
}

function callCmd<T>(
    getEditor: GetEditor,
    command: { key: unknown },
    payload?: T,
): void {
    const editor = getEditor();
    if (!editor) {
        return;
    }
    editor.action((ctx) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ctx.get(commandsCtx).call(command.key as any, payload as any);
    });
}

function sBtn(
    icon: string,
    title: string,
    onClick: () => void,
): HTMLButtonElement {
    return createButton({ className: "sel-tb-btn", icon, title, tooltipPlacement: "above", onClick });
}

function sSep(): HTMLElement {
    return createSeparator("sel-tb-sep");
}

// 判断 CellSelection 是否选中了表格第一行（表头）
function isFirstRow(sel: CellSelection): boolean {
    const $anchor = sel.$anchorCell;
    for (let d = $anchor.depth; d >= 0; d--) {
        if ($anchor.node(d).type.name === "table") {
            return $anchor.index(d) === 0;
        }
    }
    return false;
}

// 判断 CellSelection 是否选中了表格所有行（全选表格）
function isAllRowsSelected(sel: CellSelection): boolean {
    if (!sel.isRowSelection()) {
        return false;
    }
    const $anchor = sel.$anchorCell;
    const $head = sel.$headCell;
    for (let d = $anchor.depth; d >= 0; d--) {
        if ($anchor.node(d).type.name === "table") {
            const map = TableMap.get($anchor.node(d));
            const selRows = Math.abs($anchor.index(d) - $head.index(d)) + 1;
            return selRows >= map.height;
        }
    }
    return false;
}

// 判断 CellSelection 是否选中了表格所有列
function isAllColsSelected(sel: CellSelection): boolean {
    if (!sel.isColSelection()) {
        return false;
    }
    const $anchor = sel.$anchorCell;
    const $head = sel.$headCell;
    for (let d = $anchor.depth; d >= 0; d--) {
        if ($anchor.node(d).type.name === "table") {
            const tableNode = $anchor.node(d);
            const map = TableMap.get(tableNode);
            const tableStart = $anchor.start(d);
            try {
                const anchorRect = map.findCell($anchor.pos - tableStart);
                const headRect = map.findCell($head.pos - tableStart);
                const minCol = Math.min(anchorRect.left, headRect.left);
                const maxCol = Math.max(anchorRect.right, headRect.right);
                return minCol === 0 && maxCol >= map.width;
            } catch {
                return false;
            }
        }
    }
    return false;
}

// 判断整个表格是否被选中
function isEntireTableSelected(sel: CellSelection): boolean {
    return isAllRowsSelected(sel) || isAllColsSelected(sel);
}

/** 去掉常见 markdown 标记，用于与原始内容做模糊比较 */
function normalizeForSearch(s: string): string {
    return s
        .replace(/^#{1,6}\s+/m, "")
        .replace(/\*+/g, "")
        .replace(/~+/g, "")
        .replace(/`/g, "")
        .replace(/^\s*[-*+]\s+/m, "")
        .replace(/^\s*\d+\.\s+/m, "")
        .replace(/^\s*>\s*/gm, "")
        .replace(/\|/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

/** 获取光标所在的最深块级容器节点的完整文本内容 */
export function getBlockContainerText($pos: ResolvedPos): string {
    for (let d = $pos.depth; d >= 1; d--) {
        const node = $pos.node(d);
        if (node.isBlock && node.type.name !== "doc") {
            const text = node.textContent.trim();
            if (text.length >= 3) return text;
        }
    }
    return "";
}

/** CellSelection 专用：直接从表格结构计算单元格所在的源码行号（1-indexed），失败返回 null */
export function getCellRowSourceLine(
    doc: any,
    posInsideCell: number,
    getMarkdownSource: () => string,
): number | null {
    try {
        const $pos = doc.resolve(posInsideCell);
        let tableDepth = -1,
            cellDepth = -1;
        for (let d = $pos.depth; d >= 0; d--) {
            const name = $pos.node(d).type.name;
            if (name === "table") {
                tableDepth = d;
                break;
            }
            if (name === "table_cell" || name === "table_header") {
                cellDepth = d;
            }
        }
        if (tableDepth < 0 || cellDepth < 0) {
            return null;
        }
        const tableNode = $pos.node(tableDepth);
        const tableStart = $pos.start(tableDepth);
        const tableMap = TableMap.get(tableNode);
        const cellRelPos = $pos.before(cellDepth) - tableStart;
        const rect = tableMap.findCell(cellRelPos);
        const rowIdx = rect.top; // 0-indexed: 0=header, 1=first data row...

        // 从 header row 提取单元格文本，在源码中精确定位表格起始行（绕过 lineMap 索引错位）
        const headerRow = tableNode.firstChild;
        if (!headerRow) {
            return null;
        }
        const headerTexts: string[] = [];
        headerRow.forEach((cell: any) => {
            const text = cell.textContent.trim();
            if (text.length >= 2) {
                headerTexts.push(text);
            }
        });
        if (headerTexts.length === 0) {
            return null;
        }

        const source = getMarkdownSource();
        const srcLines = source.split("\n");
        let tableStartLine = -1;
        for (let i = 0; i < srcLines.length; i++) {
            const line = srcLines[i];
            if (!line.includes("|")) {
                continue;
            }
            if (headerTexts.every((t) => line.includes(t))) {
                tableStartLine = i + 1; // 1-indexed
                break;
            }
        }
        if (tableStartLine === -1) {
            return null;
        }

        // GFM table: header(rowIdx=0)→tableStartLine, separator 占一行, data row N→tableStartLine+N+1
        return tableStartLine + rowIdx + (rowIdx > 0 ? 1 : 0);
    } catch {
        return null;
    }
}

/** 在原始 markdown 中搜索块文本所在行号（1-indexed），未找到返回 -1 */
export function findLineInOriginalSource(
    source: string,
    blockText: string,
): number {
    if (!blockText || blockText.length < 3) return -1;
    const normalizedBlock = normalizeForSearch(blockText).slice(0, 60);
    if (normalizedBlock.length < 3) return -1;
    const lines = source.split("\n");
    for (let i = 0; i < lines.length; i++) {
        if (normalizeForSearch(lines[i]).includes(normalizedBlock))
            return i + 1;
    }
    return -1;
}

/** 调试用：对任意 doc 位置运行行号计算，返回诊断数据 */
export function sampleDocPosition(
    view: EditorView,
    docPos: number,
    getLineMapFn: () => number[],
    getMarkdownSourceFn: () => string,
): {
    pos: number;
    nodeType: string;
    nodeIdx: number;
    lineMapVal: number | undefined;
    srcAtMap: string;
    line: number;
    via: string;
    pmSnip: string;
    srcAtCalc: string;
    ok: boolean;
} {
    const doc = view.state.doc;
    const pos = Math.max(1, Math.min(docPos, doc.content.size - 1));
    const $from = doc.resolve(pos);
    const depth1Node = $from.depth >= 1 ? $from.node(1) : $from.node(0);
    const nodeType = depth1Node.type.name;
    const nodeIdx = $from.index(0);
    const lineMap = getLineMapFn();
    const lineMapVal = lineMap[nodeIdx];
    const source = getMarkdownSourceFn();
    const srcLines = source.split("\n");
    const srcAtMap =
        lineMapVal !== undefined ? (srcLines[lineMapVal - 1] ?? "") : "";
    const blockText = getBlockContainerText($from);
    let line: number;
    let via: string;
    const found = findLineInOriginalSource(source, blockText);
    if (found !== -1) {
        line = found;
        via = "textSearch";
    } else if (lineMapVal) {
        line = lineMapVal;
        via = "lineMapFallback";
    } else {
        const textBefore = doc.textBetween(0, pos, "\n");
        line = (textBefore.match(/\n/g) ?? []).length + 1;
        via = "countFallback";
    }
    const srcAtCalc = srcLines[line - 1] ?? "";
    const pmSnip = depth1Node.textContent.slice(0, 50);
    const ok = normalizeForSearch(srcAtCalc).includes(
        normalizeForSearch(pmSnip).slice(0, 20),
    );
    return {
        pos,
        nodeType,
        nodeIdx,
        lineMapVal,
        srcAtMap,
        line,
        via,
        pmSnip,
        srcAtCalc,
        ok,
    };
}

export function setupSelectionToolbar(
    getView: () => EditorView | null,
    getEditor: () => Editor | null,
    getLineMap: () => number[],
    getMarkdownSource: () => string,
): { onSelectionChange(view: EditorView): void } {
    let lastView: EditorView | null = null;
    let isDragging = false;

    document.addEventListener(
        "mousedown",
        (e) => {
            const target = e.target as Element;
            if (target.closest?.(".milkdown")) {
                isDragging = true;
            }
        },
        true,
    );

    document.addEventListener(
        "mouseup",
        () => {
            if (!isDragging) {
                return;
            }
            isDragging = false;
            if (lastView) {
                showAndPosition(lastView);
            }
        },
        true,
    );

    const toolbar = document.createElement("div");
    toolbar.className = "sel-toolbar";
    toolbar.style.display = "none";
    document.body.appendChild(toolbar);

    // ── 格式下拉（文字模式 / 非表格专属）──────────
    const fmtWrap = document.createElement("div");
    fmtWrap.className = "sel-tb-fmt-wrap";

    const fmtBtn = document.createElement("button");
    fmtBtn.className = "sel-tb-btn sel-tb-fmt-btn";
    fmtBtn.innerHTML = `<span class="sel-tb-fmt-label">P</span>${IconChevronDown}`;
    fmtBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
    });

    const fmtMenu = document.createElement("div");
    fmtMenu.className = "sel-tb-fmt-menu";
    fmtMenu.style.display = "none";

    const formats: [string, string, () => void][] = [
        [t("Paragraph"), "P", () => callCmd(getEditor, turnIntoTextCommand)],
        [
            t("Heading 1"),
            "H1",
            () => callCmd(getEditor, wrapInHeadingCommand, 1),
        ],
        [
            t("Heading 2"),
            "H2",
            () => callCmd(getEditor, wrapInHeadingCommand, 2),
        ],
        [
            t("Heading 3"),
            "H3",
            () => callCmd(getEditor, wrapInHeadingCommand, 3),
        ],
        [
            t("Heading 4"),
            "H4",
            () => callCmd(getEditor, wrapInHeadingCommand, 4),
        ],
        [
            t("Heading 5"),
            "H5",
            () => callCmd(getEditor, wrapInHeadingCommand, 5),
        ],
        [
            t("Heading 6"),
            "H6",
            () => callCmd(getEditor, wrapInHeadingCommand, 6),
        ],
    ];

    const fmtItems: HTMLElement[] = [];

    formats.forEach(([, shortLabel, action]) => {
        const item = document.createElement("div");
        item.className = "sel-tb-fmt-item";
        item.textContent = shortLabel;
        item.addEventListener("mousedown", (e) => {
            e.preventDefault();
            e.stopPropagation();
            action();
            fmtMenu.style.display = "none";
            // 格式命令执行后刷新激活状态（事务在下一帧 applied）
            requestAnimationFrame(() => {
                const v = getView();
                if (v && toolbar.style.display !== "none") {
                    showAndPosition(v);
                }
            });
        });
        fmtMenu.appendChild(item);
        fmtItems.push(item);
    });

    let fmtHideTimer: ReturnType<typeof setTimeout> | null = null;

    fmtWrap.addEventListener("mouseenter", () => {
        if (fmtHideTimer) {
            clearTimeout(fmtHideTimer);
            fmtHideTimer = null;
        }
        // 空间检测：默认在上方，空间不足则切换到下方
        const rect = fmtBtn.getBoundingClientRect();
        const approxH = formats.length * 30;
        if (rect.top < approxH + 16) {
            fmtMenu.style.bottom = "auto";
            fmtMenu.style.top = "calc(100% + 6px)";
        } else {
            fmtMenu.style.top = "auto";
            fmtMenu.style.bottom = "calc(100% + 6px)";
        }
        fmtMenu.style.display = "flex";
    });
    fmtWrap.addEventListener("mouseleave", () => {
        fmtHideTimer = setTimeout(() => {
            fmtMenu.style.display = "none";
        }, 100);
    });
    fmtMenu.addEventListener("mouseenter", () => {
        if (fmtHideTimer) {
            clearTimeout(fmtHideTimer);
            fmtHideTimer = null;
        }
    });

    fmtWrap.appendChild(fmtBtn);
    fmtWrap.appendChild(fmtMenu);
    toolbar.appendChild(fmtWrap);

    const textFmtSep = sSep();
    toolbar.appendChild(textFmtSep);

    // ── 内联格式按钮（文字 + 表格模式都显示）──────
    const boldBtn = sBtn(IconBold, t("Bold") + " " + kbd("Mod-b"), () =>
        callCmd(getEditor, toggleStrongCommand),
    );
    const italicBtn = sBtn(IconItalic, t("Italic") + " " + kbd("Mod-i"), () =>
        callCmd(getEditor, toggleEmphasisCommand),
    );
    const strikeBtn = sBtn(
        IconStrikethrough,
        t("Strikethrough") + " " + kbd("Mod-Shift-x"),
        () => callCmd(getEditor, toggleStrikethroughCommand),
    );
    const codeBtn = sBtn(
        IconCode,
        t("Inline Code") + " " + kbd("Mod-e"),
        () => {
            const v = getView();
            if (v) {
                applyInlineCodeToSelection(v, getEditor);
            }
        },
    );
    toolbar.appendChild(boldBtn);
    toolbar.appendChild(italicBtn);
    toolbar.appendChild(strikeBtn);
    toolbar.appendChild(codeBtn);

    const textInlineSep = sSep();
    toolbar.appendChild(textInlineSep);

    // ── 发送到 Claude（始终存在）────────────────────
    const sendBtn = sBtn(IconSendChat, t("Send to Claude"), () => {
        const view = getView();
        if (!view) {
            return;
        }
        const { selection } = view.state;
        let text = view.state.doc.textBetween(
            selection.from,
            selection.to,
            "\n",
        );

        // CellSelection 内容为空（如选中空列）→ 回退到父表格内容
        if (!text.trim() && selection instanceof CellSelection) {
            const $anchor = (selection as CellSelection).$anchorCell;
            for (let d = $anchor.depth; d >= 0; d--) {
                if ($anchor.node(d).type.name === "table") {
                    const tableStart = $anchor.before(d);
                    const tableEnd = tableStart + $anchor.node(d).nodeSize;
                    text = view.state.doc.textBetween(
                        tableStart + 1,
                        tableEnd - 1,
                        "\n",
                        "\t",
                    );
                    break;
                }
            }
        }

        if (!text.trim()) {
            hideToolbar();
            return;
        }

        // 行号计算：CellSelection 直接从表格结构算，其余用文本搜索
        const $from = view.state.doc.resolve(selection.from);
        const $to = view.state.doc.resolve(selection.to);
        let startLine: number;
        let endLine: number;
        if (selection instanceof CellSelection) {
            // 用 $anchorCell.pos / $headCell.pos 保证在单元格内部
            // （selection.to-1 可能落在行间位置而非格内，导致 getCellRowSourceLine 返回 null）
            const anchorLine = getCellRowSourceLine(
                view.state.doc,
                selection.$anchorCell.pos,
                getMarkdownSource,
            );
            const headLine = getCellRowSourceLine(
                view.state.doc,
                selection.$headCell.pos,
                getMarkdownSource,
            );
            if (anchorLine !== null && headLine !== null) {
                startLine = Math.min(anchorLine, headLine);
                endLine = Math.max(anchorLine, headLine);
            } else {
                startLine =
                    anchorLine ?? headLine ?? getLineMap()[$from.index(0)] ?? 1;
                endLine = startLine;
            }
        } else {
            const source = getMarkdownSource();
            const startBlockText = getBlockContainerText($from);
            const endBlockText = getBlockContainerText($to);
            startLine = findLineInOriginalSource(source, startBlockText);
            endLine = findLineInOriginalSource(source, endBlockText);
            if (startLine === -1) {
                // 逐字搜索选中文本首行（适用于代码块内容等 normalizeForSearch 会破坏的场景）
                const firstLine = text.trim().split("\n")[0].trim();
                if (firstLine.length >= 2) {
                    const srcLines = source.split("\n");
                    const idx = srcLines.findIndex((l) =>
                        l.includes(firstLine),
                    );
                    if (idx >= 0) {
                        startLine = idx + 1;
                    }
                }
            }
            if (startLine === -1) {
                const map = getLineMap();
                const textBefore = view.state.doc.textBetween(
                    0,
                    selection.from,
                    "\n",
                );
                const fallbackStart =
                    (textBefore.match(/\n/g) ?? []).length + 1;
                startLine = map[$from.index(0)] ?? fallbackStart;
            }
            if (endLine === -1) {
                // 逐字搜索最后一行
                const lastLine = text.trim().split("\n").slice(-1)[0].trim();
                if (lastLine.length >= 2) {
                    const srcLines = source.split("\n");
                    const idx = srcLines.findIndex((l) => l.includes(lastLine));
                    if (idx >= 0) {
                        endLine = idx + 1;
                    }
                }
            }
            if (endLine === -1) {
                const map = getLineMap();
                endLine = map[$to.index(0)] ?? startLine;
            }
        }

        notifySendToClaudeChat(text, startLine, endLine);
        hideToolbar();
    });
    toolbar.appendChild(sendBtn);

    // ── 表格模式元素（对齐 + 删除，初始全部隐藏）──
    const tableSep = sSep();
    tableSep.style.display = "none";
    toolbar.appendChild(tableSep);

    // 对齐下拉（单图标 hover 展开）
    const alignWrap = document.createElement("div");
    alignWrap.className = "sel-tb-fmt-wrap";
    alignWrap.style.display = "none";

    const alignBtn = document.createElement("button");
    alignBtn.className = "sel-tb-btn sel-tb-fmt-btn";
    alignBtn.innerHTML = IconAlignLeft + IconChevronDown;
    alignBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
    });

    const alignMenu = document.createElement("div");
    alignMenu.className = "sel-tb-fmt-menu";
    alignMenu.style.display = "none";

    const alignDefs: [string, string, string][] = [
        [IconAlignLeft, t("Align Left"), "left"],
        [IconAlignCenter, t("Align Center"), "center"],
        [IconAlignRight, t("Align Right"), "right"],
    ];
    alignDefs.forEach(([icon, title, value]) => {
        const item = document.createElement("div");
        item.className = "sel-tb-fmt-item sel-tb-align-item";
        item.innerHTML = icon;
        applyTooltip(item as HTMLElement, title, { placement: "above" });
        item.addEventListener("mousedown", (e) => {
            e.preventDefault();
            e.stopPropagation();
            const view = getView();
            if (!view) {
                return;
            }
            setCellAttr("alignment", value)(view.state, view.dispatch);
            alignMenu.style.display = "none";
        });
        alignMenu.appendChild(item);
    });

    let alignHideTimer: ReturnType<typeof setTimeout> | null = null;
    alignWrap.addEventListener("mouseenter", () => {
        if (alignHideTimer) {
            clearTimeout(alignHideTimer);
            alignHideTimer = null;
        }
        // 空间检测：默认在上方，空间不足则切换到下方
        const rect = alignBtn.getBoundingClientRect();
        const approxH = alignDefs.length * 34;
        if (rect.top < approxH + 16) {
            alignMenu.style.bottom = "auto";
            alignMenu.style.top = "calc(100% + 6px)";
        } else {
            alignMenu.style.top = "auto";
            alignMenu.style.bottom = "calc(100% + 6px)";
        }
        alignMenu.style.display = "flex";
    });
    alignWrap.addEventListener("mouseleave", () => {
        alignHideTimer = setTimeout(() => {
            alignMenu.style.display = "none";
        }, 100);
    });
    alignMenu.addEventListener("mouseenter", () => {
        if (alignHideTimer) {
            clearTimeout(alignHideTimer);
            alignHideTimer = null;
        }
    });

    alignWrap.appendChild(alignBtn);
    alignWrap.appendChild(alignMenu);
    toolbar.appendChild(alignWrap);

    const deleteSep = sSep();
    deleteSep.style.display = "none";
    toolbar.appendChild(deleteSep);

    const deleteRowBtn = sBtn(IconTrash2, t("Delete Row"), () => {
        const view = getView();
        if (!view) {
            return;
        }
        const sel = view.state.selection;
        if (!(sel instanceof CellSelection) || isFirstRow(sel)) {
            return;
        }
        deleteRow(view.state, view.dispatch);
        hideToolbar();
        const v2 = getView();
        if (v2) {
            const safePos = Math.min(1, v2.state.doc.content.size - 1);
            v2.dispatch(
                v2.state.tr.setSelection(
                    TextSelection.create(v2.state.doc, safePos),
                ),
            );
        }
    });
    deleteRowBtn.style.display = "none";
    toolbar.appendChild(deleteRowBtn);

    // 清空表头内容（不删除行）
    const clearHeaderBtn = sBtn(IconTrash2, t("Clear Header"), () => {
        const view = getView();
        if (!view) {
            return;
        }
        const sel = view.state.selection;
        if (!(sel instanceof CellSelection) || !isFirstRow(sel)) {
            return;
        }
        const $anchor = sel.$anchorCell;
        for (let d = $anchor.depth; d >= 0; d--) {
            if ($anchor.node(d).type.name === "table") {
                const tableNode = $anchor.node(d);
                const map = TableMap.get(tableNode);
                const tableStart = $anchor.start(d);
                // 收集第 0 行所有单元格的内容范围（从后往前，避免位置偏移）
                const ranges: Array<{ from: number; to: number }> = [];
                for (let col = 0; col < map.width; col++) {
                    const cellPos =
                        tableStart + map.positionAt(0, col, tableNode);
                    const $cell = view.state.doc.resolve(cellPos);
                    const cellNode = $cell.nodeAfter;
                    if (cellNode) {
                        ranges.push({
                            from: cellPos + 1,
                            to: cellPos + 1 + cellNode.content.size,
                        });
                    }
                }
                let tr = view.state.tr;
                for (let i = ranges.length - 1; i >= 0; i--) {
                    const { from, to } = ranges[i];
                    const emptyPara =
                        view.state.schema.nodes["paragraph"]?.createAndFill();
                    if (emptyPara) {
                        tr = tr.replaceWith(from, to, emptyPara);
                    }
                }
                view.dispatch(tr);
                hideToolbar();
                return;
            }
        }
    });
    clearHeaderBtn.style.display = "none";
    toolbar.appendChild(clearHeaderBtn);

    // 删除整个表格（仅整表格选中时显示）
    const deleteTableBtn = sBtn(IconTrash2, t("Delete Table"), () => {
        const view = getView();
        if (!view) {
            return;
        }
        const sel = view.state.selection;
        if (!(sel instanceof CellSelection)) {
            return;
        }
        const $anchor = sel.$anchorCell;
        for (let d = $anchor.depth; d >= 0; d--) {
            if ($anchor.node(d).type.name === "table") {
                const tableStart = $anchor.before(d);
                const tableEnd = tableStart + $anchor.node(d).nodeSize;
                view.dispatch(view.state.tr.delete(tableStart, tableEnd));
                hideToolbar();
                return;
            }
        }
    });
    deleteTableBtn.style.display = "none";
    toolbar.appendChild(deleteTableBtn);

    const deleteColBtn = sBtn(IconTrash2, t("Delete Column"), () => {
        const view = getView();
        if (!view) {
            return;
        }
        deleteColumn(view.state, view.dispatch);
        hideToolbar();
        const v2 = getView();
        if (v2) {
            const safePos = Math.min(1, v2.state.doc.content.size - 1);
            v2.dispatch(
                v2.state.tr.setSelection(
                    TextSelection.create(v2.state.doc, safePos),
                ),
            );
        }
    });
    deleteColBtn.style.display = "none";
    toolbar.appendChild(deleteColBtn);

    // ── 工具栏外部点击关闭（编辑器内点击不关闭，避免 shift+click 扩选后工具栏被隐藏）
    document.addEventListener("mousedown", (e) => {
        const target = e.target as Element;
        const inEditor = !!target.closest?.(".milkdown");
        if (
            toolbar.style.display !== "none" &&
            !toolbar.contains(target as Node) &&
            !inEditor
        ) {
            hideToolbar();
        }
    });

    function hideToolbar(): void {
        toolbar.style.display = "none";
        fmtMenu.style.display = "none";
        alignMenu.style.display = "none";
    }

    function positionToolbar(view: EditorView, from: number, to: number): void {
        const tbW = toolbar.offsetWidth;
        const tbH = toolbar.offsetHeight;
        let leftX: number, topY: number;
        if (pendingPos) {
            const px = pendingPos.x;
            const py = pendingPos.y;
            pendingPos = null;
            leftX = px - tbW / 2;
            topY = py - tbH - 8;
            if (topY < 8) {
                topY = py + 12;
            }
        } else {
            const startC = view.coordsAtPos(from);
            const endC = view.coordsAtPos(to);
            leftX = (startC.left + endC.right) / 2 - tbW / 2;
            topY = startC.top - tbH - 8;
            if (topY < 8) {
                topY = endC.bottom + 8;
            }
        }
        leftX = Math.max(8, Math.min(leftX, window.innerWidth - tbW - 8));
        toolbar.style.left = `${leftX}px`;
        toolbar.style.top = `${topY}px`;
        toolbar.style.visibility = "visible";
    }

    function showAndPosition(view: EditorView): void {
        lastView = view;
        if (isDragging) {
            hideToolbar();
            return;
        }
        const { selection } = view.state;

        // ── 表格 CellSelection 模式 ────────────────────
        if (selection instanceof CellSelection) {
            const isRow = selection.isRowSelection();
            const isCol = selection.isColSelection();

            // 格式下拉在表格模式无意义，隐藏
            fmtWrap.style.display = "none";
            textFmtSep.style.display = "none";

            // 内联格式按钮对所有 CellSelection 都显示
            boldBtn.style.display = "";
            italicBtn.style.display = "";
            strikeBtn.style.display = "";
            codeBtn.style.display = "";
            textInlineSep.style.display = "";

            // 对齐：整列选中（且非整表格）时显示
            const isEntireTable = isEntireTableSelected(
                selection as CellSelection,
            );
            tableSep.style.display = "none";
            alignWrap.style.display = isCol && !isEntireTable ? "" : "none";

            // 删除按钮显示逻辑
            const headerRow = isRow && isFirstRow(selection as CellSelection);
            deleteTableBtn.style.display = isEntireTable ? "" : "none";
            clearHeaderBtn.style.display =
                isRow && headerRow && !isEntireTable ? "" : "none";
            deleteRowBtn.style.display =
                isRow && !headerRow && !isEntireTable ? "" : "none";
            deleteColBtn.style.display = isCol && !isEntireTable ? "" : "none";
            deleteSep.style.display =
                isEntireTable || isRow || isCol ? "" : "none";

            // 定位
            toolbar.style.visibility = "hidden";
            toolbar.style.display = "flex";
            positionToolbar(view, selection.from, selection.to);
            return;
        }

        // ── 文字 TextSelection 模式 ────────────────────
        if (selection.empty || !(selection instanceof TextSelection)) {
            hideToolbar();
            return;
        }

        const { $from } = selection;

        // 代码块内不显示
        for (let d = $from.depth; d >= 0; d--) {
            if ($from.node(d).type.name === "code_block") {
                hideToolbar();
                return;
            }
        }

        const inTable = isInTableCell($from);

        // 格式下拉：表格内隐藏，表格外正常显示
        fmtWrap.style.display = inTable ? "none" : "";
        textFmtSep.style.display = inTable ? "none" : "";

        // 内联格式：始终显示
        boldBtn.style.display = "";
        italicBtn.style.display = "";
        strikeBtn.style.display = "";
        codeBtn.style.display = "";
        textInlineSep.style.display = "";

        // 表格专属元素：隐藏
        tableSep.style.display = "none";
        alignWrap.style.display = "none";
        deleteRowBtn.style.display = "none";
        clearHeaderBtn.style.display = "none";
        deleteTableBtn.style.display = "none";
        deleteColBtn.style.display = "none";
        deleteSep.style.display = "none";

        // 高亮当前格式 + 更新格式按钮图标（仅非表格模式有意义）
        if (!inTable) {
            let activeLevel = 0;
            for (let d = $from.depth; d >= 0; d--) {
                const n = $from.node(d);
                if (n.type.name === "heading") {
                    activeLevel = (n.attrs.level as number) ?? 0;
                    break;
                }
            }
            const labelEl = fmtBtn.querySelector(".sel-tb-fmt-label");
            if (labelEl) {
                labelEl.textContent = formats[activeLevel]?.[1] ?? "P";
            }
            fmtItems.forEach((item, i) => {
                item.classList.toggle(
                    "sel-tb-fmt-item--active",
                    i === 0 ? activeLevel === 0 : i === activeLevel,
                );
            });
        }

        // 定位
        toolbar.style.visibility = "hidden";
        toolbar.style.display = "flex";
        positionToolbar(view, selection.from, selection.to);
    }

    // 滚动时重新计算工具栏位置（使 fixed 工具栏跟随内容滚动）
    window.addEventListener(
        "scroll",
        () => {
            if (toolbar.style.display !== "none" && lastView) {
                showAndPosition(lastView);
            }
        },
        { capture: true },
    );

    return { onSelectionChange: showAndPosition };
}
