import {
    defaultValueCtx,
    Editor,
    editorViewCtx,
    nodeViewCtx,
    remarkStringifyOptionsCtx,
    rootCtx,
} from "@milkdown/core";
import { listener, listenerCtx } from "@milkdown/plugin-listener";
import { prism, prismConfig } from "@milkdown/plugin-prism";
import { commonmark } from "@milkdown/preset-commonmark";
import { gfm } from "@milkdown/preset-gfm";
import type { EditorView } from "@milkdown/prose/view";
import DOMPurify from "dompurify";
import { createCodeBlockView } from "./components/codeBlock";
import { createImageView } from "./components/imageView";
import { createPictureView } from "./components/pictureEditor";
import { refractor } from "./highlighter";
import {
    cellClickFixPlugin,
    codeBlockBackspacePlugin,
    codeBlockSelectAllPlugin,
    formatKeymapPlugin,
    headingEmptyDeletePlugin,
    headingFoldPlugin,
    headingStickyPlugin,
    historyKeymapPlugin,
    historyPlugin,
    horizontalRuleKeymapPlugin,
    horizontalRulePlugin,
    listLiftPlugin,
    listSpreadNormalizePlugin,
    selectionPlugin,
    tabKeymapPlugin,
    trailingHrParagraphPlugin,
} from "./plugins";
import { alignmentPlugin, alignmentPluginKey } from "./plugins/alignment";

export { registerSelectionChangeHandler, setLogTableSel } from "./plugins";
import { initAPI, emitContentChange, emitSave } from "./api";

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
    let lastSerialLineIdx = -1;
    let e = 0;
    while (e < edits.length) {
        const edit = edits[e];
        const next = edits[e + 1];
        if (edit.op === 'del' && next?.op === 'ins') {
            // del + ins = 替换
            replacements.set(edit.saved.lineIdx, next.serial.text);
            lastSavedLineIdx = edit.saved.lineIdx;
            lastSerialLineIdx = next.serial.lineIdx;
            e += 2;
        } else if (edit.op === 'del') {
            toDelete.add(edit.saved.lineIdx);
            lastSavedLineIdx = edit.saved.lineIdx;
            e++;
        } else if (edit.op === 'ins') {
            const bucket = insertAfter.get(lastSavedLineIdx) ?? [];
            if (lastSerialLineIdx >= 0) {
                const gap = edit.serial.lineIdx - lastSerialLineIdx - 1;
                for (let i = 0; i < gap; i++) bucket.push('');
            }
            bucket.push(edit.serial.text);
            insertAfter.set(lastSavedLineIdx, bucket);
            lastSerialLineIdx = edit.serial.lineIdx;
            e++;
        } else { // keep
            lastSavedLineIdx = edit.saved.lineIdx;
            lastSerialLineIdx = edit.serial.lineIdx;
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

// ── HTML inline NodeView ───────────────────────────────────────────────────
// Milkdown 的 html 节点（atom, inline）默认以 textContent 显示原始标签。
// 此 NodeView 用 DOMPurify 净化后渲染真实 HTML，实现只读预览。
function createHtmlView(node: { attrs: Record<string, string> }) {
    const raw = node.attrs["value"] ?? "";
    const isBlock = /<div[\s>]/i.test(raw);
    const dom = document.createElement(isBlock ? "div" : "span");
    dom.className = `html-inline${isBlock ? " html-block" : ""}`;
    dom.dataset["type"] = "html";
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
        debounceTimer = setTimeout(() => {
            onUpdate(md);
            emitSave();
        }, 300);
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
                emitContentChange(toSave);
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
                ["picture", (node, view, getPos) => createPictureView(node, view, getPos)],
            ]);
        })
        .use(commonmark)
        .use(gfm)
        .use(listener)
        .use(prism)
        .use(historyPlugin)
        .use(historyKeymapPlugin)
        .use(listLiftPlugin)
        .use(horizontalRulePlugin)
        .use(horizontalRuleKeymapPlugin)
        .use(codeBlockBackspacePlugin)
        .use(codeBlockSelectAllPlugin)
        .use(headingEmptyDeletePlugin)
        .use(selectionPlugin)
        .use(headingFoldPlugin)
        .use(headingStickyPlugin)
        .use(alignmentPlugin)
        .use(formatKeymapPlugin)
        .use(tabKeymapPlugin)
        .use(cellClickFixPlugin)
        .use(listSpreadNormalizePlugin)
        .use(trailingHrParagraphPlugin)
        .create();

    isSettled = true;

    const view = _editor.action((ctx) => ctx.get(editorViewCtx));
    if (view) {
        initAPI(view);
    }

    return _editor;
}
