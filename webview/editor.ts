import {
    commandsCtx,
    defaultValueCtx,
    Editor,
    editorViewCtx,
    nodeViewCtx,
    remarkStringifyOptionsCtx,
    rootCtx,
    schemaCtx,
} from "@milkdown/core";
import {
    toggleStrongCommand,
    toggleEmphasisCommand,
    toggleInlineCodeCommand,
} from "@milkdown/preset-commonmark";
import { toggleStrikethroughCommand } from "@milkdown/preset-gfm";
import { listener, listenerCtx } from "@milkdown/plugin-listener";
import { prism, prismConfig } from "@milkdown/plugin-prism";
import { commonmark } from "@milkdown/preset-commonmark";
import { gfm } from "@milkdown/preset-gfm";
import type { EditorView } from "@milkdown/prose/view";
import { history, undo, redo } from "@milkdown/prose/history";
import { keymap } from "@milkdown/prose/keymap";
import { Plugin, NodeSelection, TextSelection } from "@milkdown/prose/state";
import { CellSelection, TableMap } from "@milkdown/prose/tables";
import { liftListItem } from "@milkdown/prose/schema-list";
import { $prose } from "@milkdown/utils";

// 调试日志开关：可通过 setLogTableSel(true/false) 动态切换（无需重载页面）
let logTableSel = Boolean(window.__i18n?.debugMode);
export function setLogTableSel(enabled: boolean): void {
    logTableSel = enabled;
}

// 注册 ProseMirror history 插件（支持 undo/redo）
const historyPlugin = $prose(() => history());
// 注册快捷键：Mod-z = undo，Mod-Shift-z / Mod-y = redo
const historyKeymapPlugin = $prose(() =>
    keymap({
        "Mod-z": undo,
        "Mod-y": redo,
        "Mod-Shift-z": redo,
    }),
);

// 列表 Backspace：光标在行首时，层级 ≥2 → 上升一级；层级 1 → 同样上升（变为普通段落）
const listLiftPlugin = $prose((ctx) => {
    const schema = ctx.get(schemaCtx);
    const listItemType = schema.nodes["list_item"];
    if (!listItemType) {
        return new Plugin({});
    }
    const doLift = liftListItem(listItemType);
    return keymap({
        Backspace: (state, dispatch) => {
            const { selection } = state;
            if (!selection.empty) {
                return false;
            }
            const { $from } = selection;
            // 仅当光标在段落行首时触发
            if ($from.parentOffset !== 0) {
                return false;
            }
            // 确认当前在 list_item 内
            let inList = false;
            for (let d = $from.depth; d >= 0; d--) {
                if ($from.node(d).type === listItemType) {
                    inList = true;
                    break;
                }
            }
            if (!inList) {
                return false;
            }
            return doLift(state, dispatch);
        },
    });
});

// 代码块 Backspace：光标在代码块后的段落行首时，选中代码块而非进入其内部
const codeBlockBackspacePlugin = $prose(() =>
    keymap({
        Backspace: (state, dispatch) => {
            const { selection } = state;
            if (!selection.empty || selection.$from.parentOffset !== 0) {
                return false;
            }
            const $from = selection.$from;
            const startOfBlock = $from.before($from.depth);
            if (startOfBlock === 0) {
                return false;
            }
            const nodeBefore = state.doc.resolve(startOfBlock).nodeBefore;
            if (!nodeBefore || nodeBefore.type.name !== "code_block") {
                return false;
            }
            if (dispatch) {
                dispatch(
                    state.tr.setSelection(
                        NodeSelection.create(
                            state.doc,
                            startOfBlock - nodeBefore.nodeSize,
                        ),
                    ),
                );
            }
            return true;
        },
    }),
);

// 格式化快捷键：Mod-b 粗体、Mod-i 斜体、Mod-Shift-s 删除线、Mod-e 行内代码
// return true 使 ProseMirror 调用 preventDefault，阻止 VSCode 快捷键（如 Cmd+B 侧栏切换）冒泡
const formatKeymapPlugin = $prose((ctx) =>
    keymap({
        "Mod-b": () => {
            ctx.get(commandsCtx).call(toggleStrongCommand.key);
            return true;
        },
        "Mod-i": () => {
            ctx.get(commandsCtx).call(toggleEmphasisCommand.key);
            return true;
        },
        "Mod-Shift-x": () => {
            ctx.get(commandsCtx).call(toggleStrikethroughCommand.key);
            return true;
        },
        "Mod-e": () => {
            const view = ctx.get(editorViewCtx);
            const { state } = view;
            if (!state.selection.empty) {
                ctx.get(commandsCtx).call(toggleInlineCodeCommand.key);
                return true;
            }
            // 无选区：插入零宽空格 + inlineCode mark，光标置入其中
            const codeMark = state.schema.marks["inlineCode"];
            if (!codeMark) { return true; }
            const { from } = state.selection;
            const textNode = state.schema.text("\u200b", [codeMark.create()]);
            const tr = state.tr.insert(from, textNode);
            tr.setSelection(TextSelection.create(tr.doc, from + 1));
            view.dispatch(tr);
            return true;
        },
    }),
);

// 选区变更回调（由 index.ts 注入，用于驱动浮动工具栏）
let _onSelectionChange: ((view: EditorView) => void) | null = null;

export function registerSelectionChangeHandler(
    cb: (view: EditorView) => void,
): void {
    _onSelectionChange = cb;
}

// 诊断日志辅助：从文档位置获取 1-indexed 行列号
function getCellCoords(
    doc: any,
    pos: number,
): { row: number; col: number } | null {
    try {
        const $pos = doc.resolve(pos);
        for (let d = $pos.depth; d >= 0; d--) {
            const typeName = $pos.node(d).type.name;
            if (typeName === "table_cell" || typeName === "table_header") {
                for (let td = d - 1; td >= 0; td--) {
                    if ($pos.node(td).type.name === "table") {
                        const tableNode = $pos.node(td);
                        const tableStart = $pos.start(td);
                        const cellRelPos = $pos.before(d) - tableStart;
                        const map = TableMap.get(tableNode);
                        const rect = map.findCell(cellRelPos);
                        return { row: rect.top + 1, col: rect.left + 1 };
                    }
                }
            }
        }
    } catch {}
    return null;
}

// 单击表格单元格：将单格 CellSelection 转为 TextSelection，光标定位到点击位置
// 用 appendTransaction 确保修正在首次渲染前同步完成（无绿色闪烁）
// 格内文字拖拽：从点击位到当前鼠标位构造 TextSelection，恢复正常选区
const cellClickFixPlugin = $prose(() => {
    let pendingClickPos: number | null = null;
    let clickIsPlain = true; // mousedown 后未移动 > 4px 时为 true
    let wasCrossCell = false; // 拖拽中是否出现过多格 CellSelection
    let lastGoodCellSelection: CellSelection | null = null; // 最后一次有效的多格 CellSelection
    let multiSelectCount = 0; // 诊断计数器：本次会话的多选次数
    let lastMouseX = 0;
    let lastMouseY = 0;
    let capturedView: EditorView | null = null;

    return new Plugin({
        view(editorView) {
            capturedView = editorView;
            return {
                destroy() {
                    capturedView = null;
                },
            };
        },
        props: {
            handleDOMEvents: {
                mousedown: (view, event) => {
                    if (
                        event.button !== 0 ||
                        event.detail !== 1 ||
                        event.shiftKey ||
                        event.ctrlKey ||
                        event.metaKey
                    ) {
                        pendingClickPos = null;
                        return false;
                    }
                    const cell = (event.target as Element).closest("td, th");
                    if (!cell) {
                        pendingClickPos = null;
                        return false;
                    }
                    const pos = view.posAtCoords({
                        left: event.clientX,
                        top: event.clientY,
                    });
                    pendingClickPos = pos ? pos.pos : null;
                    clickIsPlain = true;
                    wasCrossCell = false;
                    lastGoodCellSelection = null;
                    lastMouseX = event.clientX;
                    lastMouseY = event.clientY;

                    // capture-phase mousemove：在 ProseMirror 处理之前更新鼠标位置
                    const onMove = (mv: MouseEvent) => {
                        lastMouseX = mv.clientX;
                        lastMouseY = mv.clientY;
                        const dx = mv.clientX - event.clientX;
                        const dy = mv.clientY - event.clientY;
                        if (Math.sqrt(dx * dx + dy * dy) > 4) {
                            clickIsPlain = false;
                        }
                    };
                    document.addEventListener("mousemove", onMove, true);

                    const cleanup = () => {
                        document.removeEventListener("mouseup", cleanup, true);
                        document.removeEventListener("mousemove", onMove, true);
                        if (wasCrossCell) {
                            // 跨格拖拽：同步清除，阻止 ProseMirror mouseup dispatch 再触发 appendTransaction
                            pendingClickPos = null;
                            clickIsPlain = true;
                            wasCrossCell = false;
                            // 诊断日志（调试模式）
                            if (logTableSel && lastGoodCellSelection) {
                                const headCoords = capturedView
                                    ? getCellCoords(
                                          capturedView.state.doc,
                                          lastGoodCellSelection.$headCell.pos +
                                              1,
                                      )
                                    : null;
                                let cellCount = 0;
                                lastGoodCellSelection.forEachCell(() => {
                                    cellCount++;
                                });
                                console.log(
                                    `[TableSel] 拖拽结束 ${headCoords ? `${headCoords.row}行${headCoords.col}列` : "?行?列"} 共选中${cellCount}个表格内容`,
                                );
                            }
                            // filterTransaction 在此期间保护 CellSelection 不被 readDOMChange 覆盖
                            // 200ms 后过期（readDOMChange 通常在 20ms 内执行；mousedown 也会立即清除）
                            const savedCellSel = lastGoodCellSelection;
                            setTimeout(() => {
                                if (lastGoodCellSelection === savedCellSel) {
                                    lastGoodCellSelection = null;
                                }
                            }, 200);
                        } else {
                            // 单击 / 格内拖拽：微任务清除，保证 ProseMirror mouseup dispatch 也能修正 CellSelection
                            Promise.resolve().then(() => {
                                pendingClickPos = null;
                                clickIsPlain = true;
                            });
                        }
                    };
                    document.addEventListener("mouseup", cleanup, true);
                    return false;
                },
            },
        },
        filterTransaction(tr, state) {
            // 跨格拖拽结束后的保护窗口（200ms）：阻止 readDOMChange 用 TextSelection 覆盖 CellSelection
            if (!lastGoodCellSelection) {
                return true;
            }
            if (
                state.selection instanceof CellSelection &&
                !(tr.selection instanceof CellSelection)
            ) {
                if (logTableSel) {
                    console.log(
                        "[TableSel] filterTransaction: 已阻止覆盖CellSelection",
                    );
                }
                return false;
            }
            return true;
        },
        appendTransaction(_trs, _oldState, newState) {
            if (pendingClickPos === null) return null;
            const sel = newState.selection;
            if (
                !(sel instanceof CellSelection) ||
                sel.isRowSelection() ||
                sel.isColSelection()
            ) {
                return null;
            }
            // 多格跨格拖拽（anchor ≠ head）：保留 CellSelection，并记录已出现跨格选区
            if (sel.$anchorCell.pos !== sel.$headCell.pos) {
                if (!wasCrossCell && logTableSel) {
                    // 首次检测到跨格：打印开始日志
                    multiSelectCount++;
                    const startCoords =
                        pendingClickPos !== null
                            ? getCellCoords(newState.doc, pendingClickPos)
                            : null;
                    console.log(`[TableSel] 第${multiSelectCount}次多选表格`);
                    console.log(
                        `[TableSel] 开始拖拽 ${startCoords ? `${startCoords.row}行${startCoords.col}列` : "?行?列"}`,
                    );
                }
                wasCrossCell = true;
                lastGoodCellSelection = sel; // 记录最后一次有效多格选区
                return null;
            }
            try {
                if (!clickIsPlain && capturedView) {
                    // 格内拖拽：TextSelection 从原点击位到当前鼠标位
                    const toCoords = capturedView.posAtCoords({
                        left: lastMouseX,
                        top: lastMouseY,
                    });
                    if (toCoords) {
                        const anchorP = Math.min(
                            pendingClickPos,
                            newState.doc.content.size,
                        );
                        const headP = Math.min(
                            toCoords.pos,
                            newState.doc.content.size,
                        );
                        // 同格检查：anchor 与 head 必须在同一 table_cell / table_header 内
                        // 若跨格，说明是跨格拖拽的误判，保留 CellSelection 不转换
                        try {
                            const $a = newState.doc.resolve(anchorP);
                            const $h = newState.doc.resolve(headP);
                            let aCellStart = -1,
                                hCellStart = -1;
                            for (let d = $a.depth; d >= 0; d--) {
                                const n = $a.node(d).type.name;
                                if (
                                    n === "table_cell" ||
                                    n === "table_header"
                                ) {
                                    aCellStart = $a.start(d);
                                    break;
                                }
                            }
                            for (let d = $h.depth; d >= 0; d--) {
                                const n = $h.node(d).type.name;
                                if (
                                    n === "table_cell" ||
                                    n === "table_header"
                                ) {
                                    hCellStart = $h.start(d);
                                    break;
                                }
                            }
                            if (aCellStart !== hCellStart) {
                                return null;
                            } // 跨格 → 不转换
                        } catch {
                            /* ignore, 继续转换 */
                        }
                        return newState.tr.setSelection(
                            TextSelection.create(newState.doc, anchorP, headP),
                        );
                    }
                }
                // 单击：TextSelection 定位到点击位
                const $pos = newState.doc.resolve(
                    Math.min(pendingClickPos, newState.doc.content.size),
                );
                return newState.tr.setSelection(TextSelection.near($pos));
            } catch {
                return null;
            }
        },
    });
});

// ─── 比较规范化辅助函数 ─────────────────────────────────────────────────────

const SEP_ROW_RE  = /^\|[\s\-:|]+\|$/;
const TABLE_ROW_RE = /^\|.*\|$/;

// 规范化分隔行：折叠 dash、规范化单元格空格，只保留对齐冒号
// | :----- | :----: | → |:-|:-:|   两侧格式不同时视为等价
function normalizeSepRow(line: string): string {
    const t = line.trim();
    const cells = t.split('|').slice(1, -1).map(c => {
        return c.trim().replace(/(:?)-+(:?)/g, (_: string, a: string, b: string) => (a ?? '') + '-' + (b ?? ''));
    });
    return '|' + cells.join('|') + '|';
}

// 规范化相邻 strong 拆分：**a** **b** → **a b**（内容语义相同视为等价）
// remark-stringify 在 strong 节点含 link 子节点时会输出两段 **...**
function normalizeSplitStrong(line: string): string {
    let prev: string;
    do {
        prev = line;
        line = line.replace(
            /\*\*((?:[^*]|\*(?!\*))*)\*\* \*\*((?:[^*]|\*(?!\*))*)\*\*/g,
            '**$1 $2**',
        );
    } while (line !== prev);
    return line;
}

// 规范化表格数据行：去除单元格内多余空格，<br /> 等价于空单元格
// | 水果     |   价格   | → |水果|价格|
function normalizeTableDataRow(line: string): string {
    const t = line.trim();
    const cells = t.split('|').slice(1, -1).map(c => {
        const v = c.trim();
        return v === '<br />' ? '' : v;
    });
    return '|' + cells.join('|') + '|';
}

// 规范化围栏代码块开始行：``` javascript → ```javascript（去除语言前的空格）
function normalizeFenceOpen(line: string): string {
    return line.replace(/^(\s*`{3,})\s+/, '$1');
}

function normLineForCompare(line: string): string {
    const t = line.trim();
    if (SEP_ROW_RE.test(t))   return normalizeSepRow(line);
    if (TABLE_ROW_RE.test(t)) return normalizeTableDataRow(line);
    if (/^`{3,}/.test(t))     return normalizeFenceOpen(line);
    return normalizeSplitStrong(line);
}

// ─── 最小化差异合并 ──────────────────────────────────────────────────────────
//
// 将 remark-stringify 的全量序列化结果与原始文件做 LCS 差量合并：
// - 空行不参与比较，直接保留原文件中的空行
// - 表格分隔行纳入比较，但用 normalizeSepRow 忽略 dash 宽度；
//   对齐标记（:---:）改变时照常应用（表格对齐操作生效）
// - adjacent strong 拆分（**a** **b** ↔ **a b**）视为等价，不应用
// - 真正的内容变化（文字增删改）通过 LCS 精确定位并应用
function applyMinimalChanges(saved: string, serialized: string): string {
    interface SigLine { text: string; lineIdx: number }

    function sigLines(md: string): SigLine[] {
        return md.split('\n').reduce<SigLine[]>((acc, line, i) => {
            if (line.trim() !== '') acc.push({ text: line, lineIdx: i });
            return acc;
        }, []);
    }

    const savedSig  = sigLines(saved);
    const serialSig = sigLines(serialized);
    const n = savedSig.length, m = serialSig.length;

    // LCS dp（Uint16Array 控制内存，典型 md 文件不超过 65535 非空行）
    const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = 1; i <= n; i++)
        for (let j = 1; j <= m; j++)
            dp[i][j] = normLineForCompare(savedSig[i - 1].text) === normLineForCompare(serialSig[j - 1].text)
                ? dp[i - 1][j - 1] + 1
                : Math.max(dp[i - 1][j], dp[i][j - 1]);

    // 回溯 → 编辑序列
    type Edit =
        | { op: 'keep'; saved: SigLine; serial: SigLine }
        | { op: 'del';  saved: SigLine }
        | { op: 'ins';  serial: SigLine };
    const edits: Edit[] = [];
    {
        let i = n, j = m;
        while (i > 0 || j > 0) {
            if (i > 0 && j > 0 &&
                normLineForCompare(savedSig[i - 1].text) === normLineForCompare(serialSig[j - 1].text)) {
                edits.unshift({ op: 'keep', saved: savedSig[i - 1], serial: serialSig[j - 1] });
                i--; j--;
            } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
                edits.unshift({ op: 'ins', serial: serialSig[j - 1] });
                j--;
            } else {
                edits.unshift({ op: 'del', saved: savedSig[i - 1] });
                i--;
            }
        }
    }

    // 编辑序列 → 文件级修改指令
    const replacements = new Map<number, string>();   // lineIdx → newText
    const toDelete      = new Set<number>();
    const insertAfter   = new Map<number, string[]>(); // lineIdx (-1=头部) → lines

    let lastSavedLineIdx = -1;
    let e = 0;
    while (e < edits.length) {
        const edit = edits[e];
        const next = edits[e + 1];
        if (edit.op === 'del' && next?.op === 'ins') {
            // del + ins = 替换
            replacements.set(edit.saved.lineIdx, next.serial.text);
            lastSavedLineIdx = edit.saved.lineIdx;
            e += 2;
        } else if (edit.op === 'del') {
            toDelete.add(edit.saved.lineIdx);
            lastSavedLineIdx = edit.saved.lineIdx;
            e++;
        } else if (edit.op === 'ins') {
            const bucket = insertAfter.get(lastSavedLineIdx) ?? [];
            bucket.push(edit.serial.text);
            insertAfter.set(lastSavedLineIdx, bucket);
            e++;
        } else { // keep
            lastSavedLineIdx = edit.saved.lineIdx;
            e++;
        }
    }

    if (toDelete.size === 0 && replacements.size === 0 && insertAfter.size === 0) return saved;

    // 重建文件
    const savedLines = saved.split('\n');
    const result: string[] = [...(insertAfter.get(-1) ?? [])];
    for (let lineIdx = 0; lineIdx < savedLines.length; lineIdx++) {
        if (toDelete.has(lineIdx)) continue;
        result.push(replacements.has(lineIdx) ? replacements.get(lineIdx)! : savedLines[lineIdx]);
        for (const ins of (insertAfter.get(lineIdx) ?? [])) result.push(ins);
    }
    return result.join('\n');
}

// 自定义表格序列化：每列保持自然宽度，不对齐列宽
// 覆盖 remark-gfm 默认的 table handler（后者会对所有列做等宽重排，
// 导致编辑单个单元格时整张表格格式全部改变）
// state.enter/exit 维护 mdast-util-to-markdown 的上下文栈，影响特殊字符的转义规则
function serializeTableNoAlign(node: any, _parent: any, state: any): string {
    const tableExit = state.enter('table');
    const lines: string[] = [];

    for (let rowIdx = 0; rowIdx < node.children.length; rowIdx++) {
        const row = node.children[rowIdx];
        const rowExit = state.enter('tableRow');

        const cellValues: string[] = row.children.map((cell: any) => {
            const cellExit = state.enter('tableCell');
            const phrasingExit = state.enter('phrasing');
            const value = state.containerPhrasing(cell, { before: '|', after: '|' });
            phrasingExit();
            cellExit();
            return value;
        });

        rowExit();
        lines.push('| ' + cellValues.join(' | ') + ' |');

        // 表头行后插入分隔行，保留原始对齐标记（:---:、---:、:---、---）
        if (rowIdx === 0) {
            const aligns: (string | null)[] = node.align ?? [];
            const seps = row.children.map((_: any, j: number) => {
                const a = aligns[j] ?? null;
                if (a === 'center') return ':---:';
                if (a === 'right') return '---:';
                if (a === 'left') return ':---';
                return '---';
            });
            lines.push('|' + seps.join('|') + '|');
        }
    }

    tableExit();
    return lines.join('\n');
}

// 列表 spread 规范化：编辑后若列表项只含单个块级子节点，自动将 spread 重置为 false
// 防止删除嵌套子列表后，原 loose list 的 spread:true 残留导致序列化时插入多余空行
// 仅对实际变更范围内的列表节点做规范化，避免编辑表格时全文档列表间距被重置
const listSpreadNormalizePlugin = $prose((ctx) => {
    const schema = ctx.get(schemaCtx);
    return new Plugin({
        appendTransaction(transactions, _oldState, newState) {
            if (!transactions.some((tr) => tr.docChanged)) return null;

            // 收集所有变更在新文档中的位置范围
            let minFrom = newState.doc.content.size;
            let maxTo = 0;
            for (const tr of transactions) {
                if (!tr.docChanged) continue;
                for (const step of tr.steps) {
                    step.getMap().forEach((_os, _oe, newStart, newEnd) => {
                        if (newStart < minFrom) minFrom = newStart;
                        if (newEnd > maxTo) maxTo = newEnd;
                    });
                }
            }
            if (minFrom > maxTo) return null;

            const tr = newState.tr;
            let changed = false;

            // nodesBetween 会访问与范围重叠的所有节点（含祖先节点如 bullet_list）
            newState.doc.nodesBetween(minFrom, maxTo, (node, pos) => {
                if (
                    node.type !== schema.nodes.bullet_list &&
                    node.type !== schema.nodes.ordered_list
                )
                    return;
                let listNeedsSpread = false;
                let offset = 1; // 跳过列表节点自身的开标记
                node.forEach((item) => {
                    const itemNeedsSpread = item.childCount > 1;
                    if (item.attrs.spread !== itemNeedsSpread) {
                        tr.setNodeMarkup(pos + offset, undefined, {
                            ...item.attrs,
                            spread: itemNeedsSpread,
                        });
                        changed = true;
                    }
                    if (itemNeedsSpread) listNeedsSpread = true;
                    offset += item.nodeSize;
                });
                if (node.attrs.spread !== listNeedsSpread) {
                    tr.setNodeMarkup(pos, undefined, {
                        ...node.attrs,
                        spread: listNeedsSpread,
                    });
                    changed = true;
                }
            });
            return changed ? tr : null;
        },
    });
});

const selectionPlugin = $prose(
    () =>
        new Plugin({
            view: () => ({
                update(view, prevState) {
                    if (
                        _onSelectionChange &&
                        (!view.state.selection.eq(prevState.selection) ||
                         !view.state.doc.eq(prevState.doc))
                    ) {
                        _onSelectionChange(view);
                    }
                    if (
                        logTableSel &&
                        prevState.selection instanceof CellSelection &&
                        !(view.state.selection instanceof CellSelection)
                    ) {
                        console.trace("[TableSel] 取消表格选中");
                    }
                },
            }),
        }),
);

import { refractor } from "./highlighter";

import DOMPurify from "dompurify";
import { createCodeBlockView } from "./components/codeBlock";
import { createImageView } from "./components/imageView";

// ── HTML inline NodeView ───────────────────────────────────────────────────
// Milkdown 的 html 节点（atom, inline）默认以 textContent 显示原始标签。
// 此 NodeView 用 DOMPurify 净化后渲染真实 HTML，实现只读预览。
function createHtmlView(node: { attrs: Record<string, string> }) {
    const dom = document.createElement("span");
    dom.className = "html-inline";
    dom.dataset["type"] = "html";
    const raw = node.attrs["value"] ?? "";
    dom.innerHTML = DOMPurify.sanitize(raw, {
        USE_PROFILES: { html: true },
        ADD_ATTR: ["align", "style", "width", "height"],
    });
    return {
        dom,
        ignoreMutation: () => true,
        stopEvent: () => false,
    };
}

let _editor: Editor | null = null;

// 上次保存/加载的 Markdown 原文（含用户原始格式：空行、分隔线宽度等）
// 用于在自动保存时做最小化差异合并，避免全量序列化改变未编辑区域的格式
let _savedMarkdown = '';

// 用户是否已与编辑器产生交互（键盘/鼠标/粘贴等）
// 每次 createEditor() 重置为 false，避免"仅打开文件即触发自动保存"
let _hasUserInteracted = false;
let _interactionListenerAdded = false;

function setupInteractionTracking(): void {
    if (_interactionListenerAdded) return;
    _interactionListenerAdded = true;
    const mark = () => { _hasUserInteracted = true; };
    document.addEventListener('keydown',   mark, { capture: true });
    document.addEventListener('mousedown', mark, { capture: true });
    document.addEventListener('paste',     mark, { capture: true });
    document.addEventListener('drop',      mark, { capture: true });
    document.addEventListener('cut',       mark, { capture: true });
}

export function getEditorView(): EditorView | null {
    if (!_editor) {
        return null;
    }
    return _editor.action((ctx) => ctx.get(editorViewCtx));
}

export async function createEditor(
    container: HTMLElement,
    initialMarkdown: string,
    onUpdate: (markdown: string) => void,
    onRenameImage?: (webviewUri: string, newBasename: string) => Promise<void>,
): Promise<Editor> {
    // Milkdown 的 markdownUpdated 监听器在 create() 完成后异步交付（RAF/microtask），
    // 此时 isSettled 已为 true，会误触发保存。通过 _hasUserInteracted 确保
    // 只有用户真正操作过才允许向 Extension 发送内容更新。
    _hasUserInteracted = false;
    setupInteractionTracking();

    let debounceTimer: ReturnType<typeof setTimeout>;
    // IME 合成期间（compositionstart → compositionend）暂存最新 markdown，
    // 防止拼音中间态被保存到文件
    let isComposing = false;
    let pendingMd: string | null = null;

    const fireUpdate = (md: string) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => onUpdate(md), 300);
    };
    const debouncedUpdate = (md: string) => {
        if (isComposing) {
            pendingMd = md; // 合成中：暂存，等 compositionend 再发
            return;
        }
        fireUpdate(md);
    };

    container.addEventListener('compositionstart', () => {
        isComposing = true;
    });
    container.addEventListener('compositionend', () => {
        isComposing = false;
        if (pendingMd !== null) {
            const md = pendingMd;
            pendingMd = null;
            fireUpdate(md); // 合成完成后立即触发（仍经 300ms 防抖，合并快速连续提交）
        }
    });

    // editor.create() 期间会因设置初始内容而触发 markdownUpdated，
    // 用此标志阻断该初始触发，避免"打开即静默保存"的问题
    let isSettled = false;

    _editor = await Editor.make()
        .config((ctx) => {
            ctx.set(rootCtx, container);
            ctx.set(defaultValueCtx, initialMarkdown);
            // 配置序列化选项，尽量保留原始格式
            ctx.update(remarkStringifyOptionsCtx, (prev) => ({
                ...prev,
                bullet: '-' as const,
                rule: '-' as const,   // 保留 --- 分割线，防止序列化为 ***
                handlers: {
                    ...(prev.handlers ?? {}),
                    // 覆盖 remark-gfm 的 table handler：每列保持自然宽度，
                    // 不重排列宽，避免编辑单个单元格时整表格式全部改变
                    table: serializeTableNoAlign,
                },
            }));
            _savedMarkdown = initialMarkdown;
            ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
                if (!isSettled) return;          // 跳过初始化同步触发
                if (!_hasUserInteracted) return; // 跳过初始化异步触发（RAF/microtask 延迟交付）
                const toSave = applyMinimalChanges(_savedMarkdown, markdown);
                if (toSave === _savedMarkdown) return; // 内容无实质变化，不触发保存
                _savedMarkdown = toSave;
                debouncedUpdate(toSave);
            });
            // 配置 prism：使用我们已注册语言的 refractor 实例
            ctx.set(prismConfig.key, {
                configureRefractor: () => refractor,
            });
            // 注册 code_block NodeView（顶部语言选择 + 复制按钮）
            ctx.set(nodeViewCtx, [
                ["code_block", createCodeBlockView],
                ["html", (node: { attrs: Record<string, string> }) => createHtmlView(node)],
                [
                    "image",
                    (node, view, getPos) =>
                        createImageView(
                            node,
                            view,
                            getPos,
                            undefined,
                            undefined,
                            onRenameImage,
                        ),
                ],
            ]);
        })
        .use(commonmark)
        .use(gfm)
        .use(listener)
        .use(prism)
        .use(historyPlugin)
        .use(historyKeymapPlugin)
        .use(listLiftPlugin)
        .use(codeBlockBackspacePlugin)
        .use(selectionPlugin)
        .use(formatKeymapPlugin)
        .use(cellClickFixPlugin)
        .use(listSpreadNormalizePlugin)
        .create();

    isSettled = true;
    return _editor;
}
