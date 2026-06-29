import type { EditorView } from "@milkdown/prose/view";

type EventCallback = (data: unknown) => void;

interface MarkdownEditorAPI {
    on(event: string, callback: EventCallback): void;
    off(event: string, callback: EventCallback): void;
    getContent(): string;
    setContent(content: string): void;
    insertText(text: string): void;
    getSelection(): { text: string; from: number; to: number } | null;
    focus(): void;
    scrollToLine(line: number): void;
    getHeadings(): Array<{ level: number; text: string; pos: number }>;
    getTheme(): Record<string, string>;
}

const listeners = new Map<string, Set<EventCallback>>();
let _view: EditorView | null = null;

function emit(event: string, data: unknown): void {
    const cbs = listeners.get(event);
    if (cbs) {
        for (const cb of cbs) {
            try {
                cb(data);
            } catch {
                /* ignore */
            }
        }
    }
}

function createAPI(): MarkdownEditorAPI {
    return {
        on(event, callback) {
            if (!listeners.has(event)) {
                listeners.set(event, new Set());
            }
            listeners.get(event)!.add(callback);
        },
        off(event, callback) {
            listeners.get(event)?.delete(callback);
        },
        getContent() {
            return _view?.state.doc.textContent ?? "";
        },
        setContent(content) {
            if (!_view) {
                return;
            }
            const schema = _view.state.schema;
            const doc = schema.nodeFromJSON({
                type: "doc",
                content: [
                    {
                        type: "paragraph",
                        content: [{ type: "text", text: content }],
                    },
                ],
            });
            const tr = _view.state.tr.replaceWith(
                0,
                _view.state.doc.content.size,
                doc.content,
            );
            _view.dispatch(tr);
        },
        insertText(text) {
            if (!_view) {
                return;
            }
            const { from } = _view.state.selection;
            const tr = _view.state.tr.insertText(text, from);
            _view.dispatch(tr);
        },
        getSelection() {
            if (!_view) {
                return null;
            }
            const { from, to } = _view.state.selection;
            if (from === to) {
                return null;
            }
            return { text: _view.state.doc.textBetween(from, to), from, to };
        },
        focus() {
            _view?.focus();
        },
        scrollToLine(line) {
            if (!_view) {
                return;
            }
            const dom = _view.dom;
            const paragraphs = dom.querySelectorAll(
                "p, h1, h2, h3, h4, h5, h6, pre, blockquote, li",
            );
            const target = paragraphs[Math.min(line, paragraphs.length - 1)];
            if (target) {
                target.scrollIntoView({ behavior: "smooth", block: "start" });
            }
        },
        getHeadings() {
            if (!_view) {
                return [];
            }
            const headings: Array<{
                level: number;
                text: string;
                pos: number;
            }> = [];
            _view.state.doc.nodesBetween(
                0,
                _view.state.doc.content.size,
                (node, pos) => {
                    if (node.type.name === "heading") {
                        headings.push({
                            level: node.attrs["level"] as number,
                            text: node.textContent,
                            pos,
                        });
                    }
                },
            );
            return headings;
        },
        getTheme() {
            return (window as any).__themeColors ?? {};
        },
    };
}

export function initAPI(view: EditorView): void {
    _view = view;
    (window as any).MarkdownEditor = createAPI();
    emit("ready", null);
}

export function emitContentChange(content: string): void {
    emit("contentChange", content);
}

export function emitSave(): void {
    emit("save", null);
}
