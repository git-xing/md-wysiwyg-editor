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
            ctx.get(commandsCtx).call(toggleInlineCodeCommand.key);
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

// 列表 spread 规范化：编辑后若列表项只含单个块级子节点，自动将 spread 重置为 false
// 防止删除嵌套子列表后，原 loose list 的 spread:true 残留导致序列化时插入多余空行
const listSpreadNormalizePlugin = $prose((ctx) => {
    const schema = ctx.get(schemaCtx);
    return new Plugin({
        appendTransaction(transactions, _oldState, newState) {
            if (!transactions.some((tr) => tr.docChanged)) return null;
            const tr = newState.tr;
            let changed = false;
            newState.doc.descendants((node, pos) => {
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
                        !view.state.selection.eq(prevState.selection)
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

import { createCodeBlockView } from "./components/codeBlock";
import { createImageView } from "./components/imageView";

let _editor: Editor | null = null;

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
    let debounceTimer: ReturnType<typeof setTimeout>;
    const debouncedUpdate = (md: string) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => onUpdate(md), 300);
    };

    _editor = await Editor.make()
        .config((ctx) => {
            ctx.set(rootCtx, container);
            ctx.set(defaultValueCtx, initialMarkdown);
            // 保持原始 bullet 标记（`-`），避免序列化后统一改为 `*`
            ctx.update(remarkStringifyOptionsCtx, (prev) => ({
                ...prev,
                bullet: '-' as const,
            }));
            ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
                debouncedUpdate(markdown);
            });
            // 配置 prism：使用我们已注册语言的 refractor 实例
            ctx.set(prismConfig.key, {
                configureRefractor: () => refractor,
            });
            // 注册 code_block NodeView（顶部语言选择 + 复制按钮）
            ctx.set(nodeViewCtx, [
                ["code_block", createCodeBlockView],
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

    return _editor;
}
