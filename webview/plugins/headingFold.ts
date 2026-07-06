import type { EditorView } from "@milkdown/prose/view";
import { Decoration, DecorationSet } from "@milkdown/prose/view";
import { Plugin, PluginKey, TextSelection } from "@milkdown/prose/state";
import { $prose } from "@milkdown/utils";
import { setBlockType } from "@milkdown/prose/commands";
import { IconChevronDown, IconChevronRight } from "../ui/icons";
import { applyTooltip, hideTooltip } from "../ui/tooltip";
import { t } from "../i18n";

export type HeadingFoldMeta = { type: "toggle"; pos: number };
type HeadingFoldRange = { from: number; to: number };

export const headingFoldPluginKey = new PluginKey<Set<number>>("heading-fold");

type ProseNodeLike = {
    type: { name: string };
    attrs?: Record<string, unknown>;
    nodeSize: number;
};

function isHeadingNode(node: ProseNodeLike | null | undefined): node is ProseNodeLike {
    return node?.type.name === "heading";
}

function getHeadingLevel(node: { attrs?: Record<string, unknown> }): number {
    const level = node.attrs?.["level"];
    return typeof level === "number" ? level : 1;
}

function findHeadingFoldRange(doc: any, headingPos: number, headingLevel: number): HeadingFoldRange | null {
    const headingNode = doc.nodeAt(headingPos);
    if (!isHeadingNode(headingNode)) {
        return null;
    }

    const from = headingPos + headingNode.nodeSize;
    let to = doc.content.size;
    doc.forEach((node: any, offset: number) => {
        if (offset <= headingPos || !isHeadingNode(node)) {
            return;
        }
        if (getHeadingLevel(node) <= headingLevel && to === doc.content.size) {
            to = offset;
        }
    });

    return from < to ? { from, to } : null;
}

function cleanFoldedHeadingPositions(doc: any, folded: Iterable<number>): Set<number> {
    const next = new Set<number>();
    for (const pos of folded) {
        if (isHeadingNode(doc.nodeAt(pos))) {
            next.add(pos);
        }
    }
    return next;
}

function createHeadingFoldGutter(
    view: EditorView,
    headingPos: number,
    level: number,
    collapsed: boolean,
    foldable: boolean,
): HTMLElement {
    const gutter = document.createElement("span");
    gutter.className = `heading-fold-gutter${foldable ? " heading-fold-gutter--foldable" : ""}`;
    gutter.contentEditable = "false";

    const marker = document.createElement("span");
    marker.className = "heading-fold-marker";
    marker.textContent = `#H${level}`;
    marker.style.cursor = "pointer";
    marker.style.padding = "2px 6px";
    marker.style.borderRadius = "3px";

    marker.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        showHeadingLevelDropdown(view, marker, headingPos);
    });

    if (!foldable) {
        gutter.appendChild(marker);
        return gutter;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "icon-btn heading-fold-toggle";
    button.innerHTML = collapsed ? IconChevronRight : IconChevronDown;
    const tipText = collapsed ? t("Expand content") : t("Collapse content");
    button.setAttribute("aria-label", tipText);
    button.setAttribute("aria-expanded", collapsed ? "false" : "true");
    applyTooltip(button, tipText, { placement: "above" });

    button.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();
    });
    button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        const node = view.state.doc.nodeAt(headingPos);
        if (!isHeadingNode(node)) {
            return;
        }

        const tr = view.state.tr
            .setMeta(headingFoldPluginKey, { type: "toggle", pos: headingPos } satisfies HeadingFoldMeta)
            .setMeta("addToHistory", false);

        if (!collapsed) {
            const range = findHeadingFoldRange(view.state.doc, headingPos, getHeadingLevel(node));
            if (
                range &&
                view.state.selection.from < range.to &&
                view.state.selection.to > range.from
            ) {
                tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(headingPos + 1, tr.doc.content.size))));
            }
        }

        view.dispatch(tr);
        view.focus();
        hideTooltip();
    });

    gutter.appendChild(button);
    gutter.appendChild(marker);
    return gutter;
}

function buildHeadingFoldDecorations(doc: any, folded: ReadonlySet<number>): DecorationSet {
    const decorations: Decoration[] = [];
    const hiddenRanges: HeadingFoldRange[] = [];

    doc.forEach((node: any, offset: number) => {
        if (!isHeadingNode(node)) {
            return;
        }

        const level = getHeadingLevel(node);
        const collapsed = folded.has(offset);
        const range = findHeadingFoldRange(doc, offset, level);
        const foldable = Boolean(range);

        decorations.push(
            Decoration.node(offset, offset + node.nodeSize, {
                class: `heading-fold-heading${foldable ? " heading-fold-heading--foldable" : ""}${collapsed ? " heading-fold-heading--collapsed" : ""}`,
                "data-heading-level": String(level),
            }),
        );
        decorations.push(
            Decoration.widget(
                offset + 1,
                (view) => createHeadingFoldGutter(view, offset, level, collapsed, foldable),
                {
                    key: `heading-fold-gutter-${offset}-${level}-${collapsed ? "closed" : "open"}-${foldable ? "foldable" : "leaf"}`,
                    side: -1,
                },
            ),
        );

        if (collapsed && range) {
            hiddenRanges.push(range);
        }
    });

    if (hiddenRanges.length > 0) {
        doc.forEach((node: any, offset: number) => {
            if (hiddenRanges.some((range) => offset >= range.from && offset < range.to)) {
                decorations.push(
                    Decoration.node(offset, offset + node.nodeSize, {
                        class: "heading-fold-hidden",
                    }),
                );
            }
        });
    }

    return decorations.length > 0 ? DecorationSet.create(doc, decorations) : DecorationSet.empty;
}

function isHeadingElement(element: Element | null): element is HTMLElement {
    return element instanceof HTMLElement && element.matches("h1,h2,h3,h4,h5,h6");
}

function findSectionHeadingPosAt(view: EditorView, pos: number): number | null {
    let headingPos: number | null = null;
    const searchTo = Math.min(Math.max(pos, 0), view.state.doc.content.size);

    view.state.doc.nodesBetween(0, searchTo, (node, nodePos) => {
        if (!isHeadingNode(node)) {
            return;
        }

        const range = findHeadingFoldRange(view.state.doc, nodePos, getHeadingLevel(node));
        if (range && nodePos <= pos && pos < range.to) {
            headingPos = nodePos;
        }
    });

    return headingPos;
}

function getHeadingGutter(heading: HTMLElement | null): HTMLElement | null {
    return heading?.querySelector<HTMLElement>(".heading-fold-gutter--foldable") ?? null;
}

function getHeadingElementAtPos(view: EditorView, pos: number): HTMLElement | null {
    const dom = view.nodeDOM(pos);
    return isHeadingElement(dom as Element | null) ? dom as HTMLElement : null;
}

function showHeadingLevelDropdown(view: EditorView, anchor: HTMLElement, headingPos: number): void {
    document.querySelectorAll(".heading-level-dropdown").forEach(el => el.remove());

    const dropdown = document.createElement("div");
    dropdown.className = "heading-level-dropdown";

    const levels: [string, number | null][] = [
        ["P", null], ["H1", 1], ["H2", 2], ["H3", 3], ["H4", 4], ["H5", 5], ["H6", 6],
    ];

    const node = view.state.doc.nodeAt(headingPos);
    const currentLevel = node?.attrs?.["level"] as number | undefined;

    levels.forEach(([label, level]) => {
        const item = document.createElement("div");
        item.className = "heading-level-dropdown-item";
        item.textContent = label;
        if (level === currentLevel || (level === null && !currentLevel)) {
            item.classList.add("heading-level-dropdown-item--active");
        }
        item.addEventListener("mousedown", (e) => {
            e.preventDefault();
            e.stopPropagation();
            const schema = view.state.schema;
            const headingType = schema.nodes["heading"];
            const paragraphType = schema.nodes["paragraph"];
            console.log("[headingFold] dropdown click:", { level, headingType: !!headingType, paragraphType: !!paragraphType, selFrom: view.state.selection.from, selNode: view.state.selection.$from.node().type.name });
            if (!headingType || !paragraphType) return;
            if (level === null) {
                const result = setBlockType(paragraphType)(view.state, view.dispatch);
                console.log("[headingFold] setBlockType(paragraph) result:", result);
            } else {
                const result = setBlockType(headingType, { level })(view.state, view.dispatch);
                console.log("[headingFold] setBlockType(heading, level:", level, ") result:", result);
            }
            dropdown.remove();
        });
        dropdown.appendChild(item);
    });

    const rect = anchor.getBoundingClientRect();
    dropdown.style.position = "fixed";
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.top = `${rect.bottom + 4}px`;
    dropdown.style.zIndex = "10000";
    document.body.appendChild(dropdown);

    const close = (e: MouseEvent) => {
        if (!dropdown.contains(e.target as Node)) {
            dropdown.remove();
            document.removeEventListener("mousedown", close);
        }
    };
    setTimeout(() => document.addEventListener("mousedown", close), 0);
}

export const headingFoldPlugin = $prose(() =>
    new Plugin<Set<number>>({
        key: headingFoldPluginKey,
        state: {
            init: () => new Set<number>(),
            apply(tr, value, _oldState, newState) {
                let next = value;

                if (tr.docChanged) {
                    next = new Set<number>();
                    for (const pos of value) {
                        const mapped = tr.mapping.map(pos, -1);
                        if (isHeadingNode(newState.doc.nodeAt(mapped))) {
                            next.add(mapped);
                        }
                    }
                    next = cleanFoldedHeadingPositions(newState.doc, next);
                }

                const meta = tr.getMeta(headingFoldPluginKey) as HeadingFoldMeta | undefined;
                if (meta?.type === "toggle") {
                    next = new Set<number>(next);
                    if (next.has(meta.pos)) {
                        next.delete(meta.pos);
                    } else if (isHeadingNode(newState.doc.nodeAt(meta.pos))) {
                        next.add(meta.pos);
                    }
                }

                return next;
            },
        },
        props: {
            decorations(state) {
                return buildHeadingFoldDecorations(state.doc, headingFoldPluginKey.getState(state) ?? new Set<number>());
            },
            handleKeyDown(view, event) {
                if (event.key !== "Enter") return false;

                const folded = headingFoldPluginKey.getState(view.state);
                if (!folded || folded.size === 0) return false;

                const { $from } = view.state.selection;
                let headingPos: number | null = null;
                let headingTextLen = 0;
                for (let depth = $from.depth; depth >= 0; depth--) {
                    const node = $from.node(depth);
                    if (node.type.name === "heading") {
                        headingPos = $from.before(depth);
                        headingTextLen = node.textContent.length;
                        break;
                    }
                }

                if (headingPos === null || !folded.has(headingPos)) return false;

                const cursorPos = $from.pos;
                const atEnd = cursorPos >= headingPos + 1 + headingTextLen;

                if (!atEnd) return false;

                const tr = view.state.tr
                    .setMeta(headingFoldPluginKey, { type: "toggle", pos: headingPos } satisfies HeadingFoldMeta)
                    .setMeta("addToHistory", false);
                view.dispatch(tr);
                return false;
            },
        },
        view(view) {
            let hoveredGutter: HTMLElement | null = null;

            const clearHoveredGutter = () => {
                hoveredGutter?.classList.remove("heading-fold-gutter--section-hover");
                hoveredGutter = null;
            };

            const setHoveredGutter = (gutter: HTMLElement | null) => {
                if (gutter === hoveredGutter) {
                    return;
                }
                clearHoveredGutter();
                hoveredGutter = gutter;
                hoveredGutter?.classList.add("heading-fold-gutter--section-hover");
            };

            const handleMouseMove = (event: MouseEvent) => {
                const target = event.target as Element | null;
                const directHeading = target?.closest("h1,h2,h3,h4,h5,h6") ?? null;
                if (directHeading && view.dom.contains(directHeading)) {
                    setHoveredGutter(getHeadingGutter(isHeadingElement(directHeading) ? directHeading : null));
                    return;
                }

                const coords = view.posAtCoords({
                    left: event.clientX,
                    top: event.clientY,
                });
                const headingPos = coords ? findSectionHeadingPosAt(view, coords.pos) : null;
                setHoveredGutter(headingPos === null ? null : getHeadingGutter(getHeadingElementAtPos(view, headingPos)));
            };

            view.dom.addEventListener("mousemove", handleMouseMove);
            view.dom.addEventListener("mouseleave", clearHoveredGutter);

            return {
                update() {
                    if (hoveredGutter && !view.dom.contains(hoveredGutter)) {
                        hoveredGutter = null;
                    }
                },
                destroy() {
                    view.dom.removeEventListener("mousemove", handleMouseMove);
                    view.dom.removeEventListener("mouseleave", clearHoveredGutter);
                    clearHoveredGutter();
                },
            };
        },
    }),
);
