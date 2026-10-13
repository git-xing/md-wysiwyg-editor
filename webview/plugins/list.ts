import { schemaCtx } from "@milkdown/core";
import { keymap } from "@milkdown/prose/keymap";
import { Plugin, TextSelection } from "@milkdown/prose/state";
import { liftListItem } from "@milkdown/prose/schema-list";
import { $prose } from "@milkdown/utils";

function isEmptyListItem(item: any): boolean {
    return (
        item.childCount === 1 &&
        item.firstChild?.type.name === "paragraph" &&
        item.firstChild.content.size === 0
    );
}

// 列表 Backspace：空列表项优先删除；非空列表项行首则上升一级/转普通段落
export const listLiftPlugin = $prose((ctx) => {
    const schema = ctx.get(schemaCtx);
    const listItemType = schema.nodes["list_item"];
    if (!listItemType) {
        return new Plugin({});
    }
    const doLift = liftListItem(listItemType);
    const deleteEmptyListItem = (state: any, dispatch: any): boolean => {
        const { selection } = state;
        if (!selection.empty) {
            return false;
        }
        const { $from } = selection;
        if ($from.parentOffset !== 0) {
            return false;
        }

        let listItemDepth = -1;
        for (let d = $from.depth; d >= 0; d--) {
            if ($from.node(d).type === listItemType) {
                listItemDepth = d;
                break;
            }
        }
        if (listItemDepth < 0) {
            return false;
        }
        const item = $from.node(listItemDepth);
        const list = $from.node(listItemDepth - 1);
        if (!isEmptyListItem(item) || list.childCount <= 1) {
            return false;
        }

        if (dispatch) {
            const from = $from.before(listItemDepth);
            const to = $from.after(listItemDepth);
            const itemIndex = $from.index(listItemDepth - 1);
            const tr = state.tr.delete(from, to);
            const targetPos = itemIndex > 0 ? Math.max(0, from - 1) : Math.min(from, tr.doc.content.size);
            tr.setSelection(TextSelection.near(tr.doc.resolve(targetPos), itemIndex > 0 ? -1 : 1));
            dispatch(tr);
        }
        return true;
    };

    return keymap({
        Backspace: (state, dispatch) => {
            const { selection } = state;
            if (!selection.empty) {
                return false;
            }
            const { $from } = selection;
            if ($from.parentOffset !== 0) {
                return false;
            }

            if (deleteEmptyListItem(state, dispatch)) {
                return true;
            }

            let listItemDepth = -1;
            for (let d = $from.depth; d >= 0; d--) {
                if ($from.node(d).type === listItemType) {
                    listItemDepth = d;
                    break;
                }
            }
            if (listItemDepth < 0) {
                return false;
            }

            return doLift(state, dispatch);
        },
        Delete: deleteEmptyListItem,
    });
});

// 列表 spread 规范化：编辑后若列表项只含单个块级子节点，自动将 spread 重置为 false
// 防止删除嵌套子列表后，原 loose list 的 spread:true 残留导致序列化时插入多余空行
// 仅对实际变更范围内的列表节点做规范化，避免编辑表格时全文档列表间距被重置
export const listSpreadNormalizePlugin = $prose((ctx) => {
    const schema = ctx.get(schemaCtx);
    return new Plugin({
        appendTransaction(transactions, _oldState, newState) {
            if (!transactions.some((tr) => tr.docChanged)) return null;

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
            // 多步事务中，前面 step 的位置可能超出最终文档范围（如撤销整篇替换）
            maxTo = Math.min(maxTo, newState.doc.content.size);
            if (minFrom > maxTo) return null;

            const tr = newState.tr;
            let changed = false;

            newState.doc.nodesBetween(minFrom, maxTo, (node, pos) => {
                if (
                    node.type !== schema.nodes.bullet_list &&
                    node.type !== schema.nodes.ordered_list
                ) {
                    return;
                }
                let listNeedsSpread = false;
                let offset = 1;
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
