import { Plugin, PluginKey } from "@milkdown/prose/state";
import { Decoration, DecorationSet } from "@milkdown/prose/view";
import { $prose } from "@milkdown/utils";

export const alignmentPluginKey = new PluginKey<Map<number, string>>("alignment");

const DIV_ALIGN_RE = /^<div\s+align=["'](\w+)["']\s*>([\s\S]*?)<\/div>$/i;

function parseDivAlign(raw: string): { align: string; text: string } | null {
    const m = raw.match(DIV_ALIGN_RE);
    if (!m) return null;
    const align = m[1].toLowerCase();
    if (align !== "left" && align !== "center" && align !== "right") return null;
    const text = m[2].replace(/<br\s*\/?>/gi, "\n").trim();
    return { align, text };
}

export const alignmentPlugin = $prose(() => {
    return new Plugin<Map<number, string>>({
        key: alignmentPluginKey,
        state: {
            init: () => new Map<number, string>(),
            apply(tr, value) {
                const meta = tr.getMeta(alignmentPluginKey) as
                    | { action: "set"; pos: number; align: string }
                    | { action: "_bulk"; alignments: Map<number, string> }
                    | undefined;

                if (meta?.action === "_bulk") {
                    return new Map(meta.alignings);
                }

                let next = new Map<number, string>();
                for (const [pos, align] of value) {
                    const mapped = tr.mapping.map(pos);
                    if (mapped >= 0 && mapped < tr.doc.content.size) {
                        next.set(mapped, align);
                    }
                }

                if (meta?.action === "set") {
                    const mappedPos = tr.mapping.map(meta.pos);
                    if (meta.align) {
                        next.set(mappedPos, meta.align);
                    } else {
                        next.delete(mappedPos);
                    }
                }

                return next;
            },
        },
        appendTransaction(trs, _oldState, newState) {
            const pluginState = this.getState(newState) as Map<number, string>;
            if (!pluginState) return null;

            let foundOffset = -1;
            let foundAlign = "";
            let foundText = "";

            newState.doc.forEach((node, offset) => {
                if (foundOffset >= 0) return;
                if (node.type.name !== "html") return;
                if (pluginState.has(offset)) return;
                const raw = (node.attrs as any)?.value ?? "";
                const parsed = parseDivAlign(raw);
                if (!parsed) return;
                foundOffset = offset;
                foundAlign = parsed.align;
                foundText = parsed.text;
            });

            if (foundOffset < 0) return null;

            const paraType = newState.schema.nodes["paragraph"];
            if (!paraType) return null;

            const textNode = foundText
                ? newState.schema.text(foundText)
                : undefined;
            const newPara = paraType.create({}, textNode ? [textNode] : []);

            const nodeAtPos = newState.doc.nodeAt(foundOffset);
            if (!nodeAtPos) return null;

            const tr = newState.tr.replaceWith(foundOffset, foundOffset + nodeAtPos.nodeSize, newPara);
            const newAlignments = new Map(pluginState);
            newAlignments.set(foundOffset, foundAlign);
            tr.setMeta(alignmentPluginKey, { action: "_bulk", alignments: newAlignments });
            return tr;
        },
        props: {
            decorations(state) {
                const alignments = alignmentPluginKey.getState(state);
                if (!alignments || alignments.size === 0) return DecorationSet.empty;

                const decorations: Decoration[] = [];
                state.doc.forEach((node, offset) => {
                    if (node.type.name === "paragraph") {
                        const align = alignments.get(offset);
                        if (align) {
                            decorations.push(
                                Decoration.node(offset, offset + node.nodeSize, {
                                    style: `text-align: ${align}`,
                                }),
                            );
                        }
                    }
                });

                return DecorationSet.create(state.doc, decorations);
            },
        },
    });
});
