import {
    addRowAfter,
    addRowBefore,
    addColumnAfter,
    addColumnBefore,
    TableMap,
    CellSelection,
} from "@milkdown/prose/tables";
import { TextSelection } from "@milkdown/prose/state";
import type { EditorView } from "@milkdown/prose/view";
import { IconPlus } from "./icons";

// ── 调试模式：由 Extension 侧通过设置/菜单控制，默认关闭 ───────────────
let debugMode: boolean = (window as any).__i18n?.debugMode ?? false;
export function setDebugMode(enabled: boolean): void { debugMode = enabled; }

type GetView = () => EditorView | null;

export function setupTableAddButtons(
    container: HTMLElement,
    getView: GetView,
): void {
    // 横向高亮线（插入行）
    const lineH = document.createElement("div");
    lineH.className = "table-add-line table-add-line--h";
    lineH.style.display = "none";
    document.body.appendChild(lineH);

    // 纵向高亮线（插入列·右边框）
    const lineV = document.createElement("div");
    lineV.className = "table-add-line table-add-line--v";
    lineV.style.display = "none";
    document.body.appendChild(lineV);

    // 纵向高亮线（插入列·左边框，仅第一列）
    const lineVL = document.createElement("div");
    lineVL.className = "table-add-line table-add-line--v";
    lineVL.style.display = "none";
    document.body.appendChild(lineVL);

    // + 按钮：插入行（显示在横线最左侧，表格外）
    const btnRow = document.createElement("button");
    btnRow.className = "table-add-btn";
    btnRow.innerHTML = IconPlus;
    btnRow.style.display = "none";
    document.body.appendChild(btnRow);

    // + 按钮：插入列·右边框（显示在竖线最顶部，表格外）
    const btnCol = document.createElement("button");
    btnCol.className = "table-add-btn";
    btnCol.innerHTML = IconPlus;
    btnCol.style.display = "none";
    document.body.appendChild(btnCol);

    // + 按钮：插入列·左边框（显示在竖线最顶部，表格外）
    const btnColLeft = document.createElement("button");
    btnColLeft.className = "table-add-btn";
    btnColLeft.innerHTML = IconPlus;
    btnColLeft.style.display = "none";
    document.body.appendChild(btnColLeft);

    // ── DEBUG：触发范围可视化叠层（始终创建，由 debugMode 控制显隐）────────
    const dbgZoneStyle = (el: HTMLElement) => {
        el.style.cssText = `
            position: fixed; pointer-events: none; z-index: 9999;
            background: rgba(255,0,0,0.08);
            border: 1.5px solid red;
            box-sizing: border-box;
            display: none;
        `;
        document.body.appendChild(el);
    };
    const dbgBtnStyle = (el: HTMLElement) => {
        el.style.cssText = `
            position: fixed; pointer-events: none; z-index: 10000;
            border: 1.5px solid red;
            box-sizing: border-box;
            border-radius: 0;
            width: 24px; height: 24px;
            display: none;
        `;
        document.body.appendChild(el);
    };
    const dbgTop    = document.createElement("div");
    const dbgBottom = document.createElement("div");
    const dbgRight  = document.createElement("div");
    const dbgLeft   = document.createElement("div");
    dbgZoneStyle(dbgTop);
    dbgZoneStyle(dbgBottom);
    dbgZoneStyle(dbgRight);
    dbgZoneStyle(dbgLeft);

    const dbgBtnRow     = document.createElement("div");
    const dbgBtnCol     = document.createElement("div");
    const dbgBtnColLeft = document.createElement("div");
    dbgBtnStyle(dbgBtnRow);
    dbgBtnStyle(dbgBtnCol);
    dbgBtnStyle(dbgBtnColLeft);

    let rowAction: (() => void) | null = null;
    let colAction: (() => void) | null = null;
    let colLeftAction: (() => void) | null = null;

    // 本模块所有浮层，用于合成事件命中测试
    const floaters = [lineH, lineV, lineVL, btnRow, btnCol, btnColLeft];

    // 记录最后鼠标位置，供 ResizeObserver 触发合成事件使用
    let lastMouseX = 0;
    let lastMouseY = 0;
    let tableResizeObserver: ResizeObserver | null = null;
    let observedTable: HTMLElement | null = null; // 防止同一表格重复创建 ResizeObserver

    function startObservingTable(tableEl: HTMLElement): void {
        if (tableEl === observedTable) { return; } // 已在观察同一表格，跳过
        tableResizeObserver?.disconnect();
        observedTable = tableEl;
        tableResizeObserver = new ResizeObserver(() => {
            container.dispatchEvent(
                new MouseEvent('mousemove', { clientX: lastMouseX, clientY: lastMouseY, bubbles: true }),
            );
        });
        tableResizeObserver.observe(tableEl);
    }

    function stopObservingTable(): void {
        tableResizeObserver?.disconnect();
        tableResizeObserver = null;
        observedTable = null;
    }

    // 延迟隐藏：允许鼠标跨过空隙移入浮层
    let hideTimer: ReturnType<typeof setTimeout> | null = null;
    function scheduleHide(): void {
        if (hideTimer) { return; }
        hideTimer = setTimeout(() => { hideAll(); hideTimer = null; }, 150);
    }
    function cancelHide(): void {
        if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    }

    const THRESHOLD_UP = 5;   // 边框内侧灵敏度（px）
    const THRESHOLD_DOWN = 6; // 边框外侧灵敏度（px）

    container.addEventListener("mousemove", (e) => {
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        const view = getView();
        if (!view) {
            hideAll();
            return;
        }

        // 先尝试 closest(td/th)；合成事件（ResizeObserver 派发）的 target=container，需要 elementFromPoint 补救
        let cell = (e.target as Element).closest("td, th") as HTMLElement | null;
        if (!cell) {
            const realEl = document.elementFromPoint(e.clientX, e.clientY);
            if (realEl) {
                // 鼠标在本模块浮层上（插入线/按钮）→ 取消隐藏并返回，不重置状态
                if (floaters.some(f => f === realEl || f.contains(realEl))) {
                    cancelHide(); return;
                }
                cell = (realEl as Element).closest("td, th") as HTMLElement | null;
            }
            if (!cell) { scheduleHide(); return; }
        }

        const r = cell.getBoundingClientRect();
        const isFirstRow = (cell.closest("tr") as HTMLTableRowElement).rowIndex === 0;
        const nearBottom =
            e.clientY >= r.bottom - THRESHOLD_UP &&
            e.clientY <= r.bottom + THRESHOLD_DOWN;
        const nearTop =
            !isFirstRow &&
            e.clientY >= r.top - THRESHOLD_DOWN &&
            e.clientY <= r.top + THRESHOLD_UP;
        const nearRight =
            e.clientX >= r.right - THRESHOLD_UP &&
            e.clientX <= r.right + THRESHOLD_DOWN;
        const nearLeft =
            e.clientX >= r.left - THRESHOLD_DOWN &&
            e.clientX <= r.left + THRESHOLD_UP;

        // ── DEBUG：实时更新触发范围叠层 ──────────────────────────────────
        if (debugMode && dbgTop && dbgBottom && dbgRight && dbgLeft) {
            // 顶边触发带（非第一行）：top - THRESHOLD_DOWN ~ top + THRESHOLD_UP
            if (!isFirstRow) {
                dbgTop.style.left   = `${r.left}px`;
                dbgTop.style.width  = `${r.right - r.left}px`;
                dbgTop.style.top    = `${r.top - THRESHOLD_DOWN}px`;
                dbgTop.style.height = `${THRESHOLD_UP + THRESHOLD_DOWN}px`;
                dbgTop.style.display = "block";
            } else {
                dbgTop.style.display = "none";
            }

            // 底边触发带：bottom - THRESHOLD_UP ~ bottom + THRESHOLD_DOWN
            dbgBottom.style.left   = `${r.left}px`;
            dbgBottom.style.width  = `${r.right - r.left}px`;
            dbgBottom.style.top    = `${r.bottom - THRESHOLD_UP}px`;
            dbgBottom.style.height = `${THRESHOLD_UP + THRESHOLD_DOWN}px`;
            dbgBottom.style.display = "block";

            // 右边触发带：right - THRESHOLD_UP ~ right + THRESHOLD_DOWN
            dbgRight.style.top    = `${r.top}px`;
            dbgRight.style.height = `${r.bottom - r.top}px`;
            dbgRight.style.left   = `${r.right - THRESHOLD_UP}px`;
            dbgRight.style.width  = `${THRESHOLD_UP + THRESHOLD_DOWN}px`;
            dbgRight.style.display = "block";

            // 左边触发带：left - THRESHOLD_DOWN ~ left + THRESHOLD_UP
            dbgLeft.style.top    = `${r.top}px`;
            dbgLeft.style.height = `${r.bottom - r.top}px`;
            dbgLeft.style.left   = `${r.left - THRESHOLD_DOWN}px`;
            dbgLeft.style.width  = `${THRESHOLD_UP + THRESHOLD_DOWN}px`;
            dbgLeft.style.display = "block";
        }
        // ────────────────────────────────────────────────────────────────

        if (!nearBottom && !nearTop && !nearRight && !nearLeft) {
            scheduleHide();
            return;
        }

        cancelHide(); // 确认近边框、即将显示插入线时才取消隐藏定时器

        const table = cell.closest("table") as HTMLElement | null;
        if (!table) {
            hideAll();
            return;
        }

        // 开始观察表格尺寸变化以同步 overlay 位置
        // 注意：不调用 hideAll()，改为选择性隐藏，避免 hide→show 循环导致闪烁
        startObservingTable(table);
        if (!nearBottom && !nearTop) { lineH.style.display = 'none'; btnRow.style.display = 'none'; if (dbgBtnRow)     { dbgBtnRow.style.display = 'none'; } }
        if (!nearRight)  { lineV.style.display = 'none'; btnCol.style.display = 'none'; if (dbgBtnCol)     { dbgBtnCol.style.display = 'none'; } }
        if (!nearLeft)   { lineVL.style.display = 'none'; btnColLeft.style.display = 'none'; if (dbgBtnColLeft) { dbgBtnColLeft.style.display = 'none'; } }

        if (nearBottom) {
            // 用首尾单元格计算横线实际范围
            const row = cell.closest("tr") as HTMLElement;
            const firstCell = row.firstElementChild as HTMLElement;
            const lastCell = row.lastElementChild as HTMLElement;
            const lineLeft = firstCell.getBoundingClientRect().left;
            const lineRight = lastCell.getBoundingClientRect().right;

            lineH.style.left = `${lineLeft}px`;
            lineH.style.width = `${lineRight - lineLeft}px`;
            lineH.style.top = `${r.bottom - 1}px`;
            lineH.style.display = "block";

            // + 按钮在横线最左侧，紧贴表格
            btnRow.style.left = `${lineLeft - 24}px`;
            btnRow.style.top = `${r.bottom - 12}px`;
            btnRow.style.display = "flex";
            if (debugMode && dbgBtnRow) {
                dbgBtnRow.style.left = btnRow.style.left;
                dbgBtnRow.style.top  = btnRow.style.top;
                dbgBtnRow.style.display = "block";
            }

            rowAction = () => {
                const v = getView();
                if (!v) { return; }
                setCursor(v, cell);
                const v2 = getView();
                if (!v2) { return; }
                addRowAfter(v2.state, v2.dispatch);
                const v3 = getView();
                if (v3) { selectNewRow(v3, cell); }
            };
        }

        if (nearTop) {
            const row = cell.closest("tr") as HTMLElement;
            const firstCell = row.firstElementChild as HTMLElement;
            const lastCell = row.lastElementChild as HTMLElement;
            const lineLeft = firstCell.getBoundingClientRect().left;
            const lineRight = lastCell.getBoundingClientRect().right;

            lineH.style.left = `${lineLeft}px`;
            lineH.style.width = `${lineRight - lineLeft}px`;
            lineH.style.top = `${r.top - 1}px`;
            lineH.style.display = "block";

            btnRow.style.left = `${lineLeft - 24}px`;
            btnRow.style.top = `${r.top - 12}px`;
            btnRow.style.display = "flex";
            if (debugMode && dbgBtnRow) {
                dbgBtnRow.style.left = btnRow.style.left;
                dbgBtnRow.style.top  = btnRow.style.top;
                dbgBtnRow.style.display = "block";
            }

            rowAction = () => {
                const v = getView();
                if (!v) { return; }
                setCursor(v, cell);
                const v2 = getView();
                if (!v2) { return; }
                addRowBefore(v2.state, v2.dispatch);
                const v3 = getView();
                if (v3) { selectNewRowBefore(v3, cell); }
            };
        }

        if (nearRight) {
            // 用首尾行的同列单元格计算纵线实际范围
            const colIdx = (cell as HTMLTableCellElement).cellIndex;
            const allRows = Array.from(
                table.querySelectorAll("tr"),
            ) as HTMLElement[];
            const topCell = allRows[0]?.querySelectorAll("td, th")[colIdx] as
                | HTMLElement
                | undefined;
            const botCell = allRows[allRows.length - 1]?.querySelectorAll(
                "td, th",
            )[colIdx] as HTMLElement | undefined;
            if (!topCell || !botCell) {
                return;
            }

            const { top: lineTop, bottom: lineBottom } = table.getBoundingClientRect();

            lineV.style.left = `${r.right - 1}px`;
            lineV.style.top = `${lineTop}px`;
            lineV.style.height = `${lineBottom - lineTop}px`;
            lineV.style.display = "block";

            // + 按钮在竖线最顶部，紧贴表格
            btnCol.style.left = `${r.right - 12}px`;
            btnCol.style.top = `${lineTop - 24}px`;
            btnCol.style.display = "flex";
            if (debugMode && dbgBtnCol) {
                dbgBtnCol.style.left = btnCol.style.left;
                dbgBtnCol.style.top  = btnCol.style.top;
                dbgBtnCol.style.display = "block";
            }

            colAction = () => {
                const v = getView();
                if (!v) {
                    return;
                }
                setCursor(v, cell);
                const v2 = getView();
                if (!v2) {
                    return;
                }
                addColumnAfter(v2.state, v2.dispatch);
                // 选中新插入的列
                const v3 = getView();
                if (v3) {
                    selectNewCol(v3, cell);
                }
            };
        }

        if (nearLeft) {
            // 左边框：在当前列之前插入列
            const colIdx = (cell as HTMLTableCellElement).cellIndex;
            const allRows = Array.from(
                table.querySelectorAll("tr"),
            ) as HTMLElement[];
            const topCell = allRows[0]?.querySelectorAll("td, th")[colIdx] as
                | HTMLElement
                | undefined;
            const botCell = allRows[allRows.length - 1]?.querySelectorAll(
                "td, th",
            )[colIdx] as HTMLElement | undefined;
            if (!topCell || !botCell) {
                return;
            }

            const { top: lineTop, bottom: lineBottom } = table.getBoundingClientRect();

            lineVL.style.left = `${r.left - 1}px`;
            lineVL.style.top = `${lineTop}px`;
            lineVL.style.height = `${lineBottom - lineTop}px`;
            lineVL.style.display = "block";

            // + 按钮垂直居中于插入线，右边缘紧贴左边框
            btnColLeft.style.left = `${r.left - 12}px`;
            btnColLeft.style.top = `${lineTop - 24}px`;
            btnColLeft.style.display = "flex";
            if (debugMode && dbgBtnColLeft) {
                dbgBtnColLeft.style.left = btnColLeft.style.left;
                dbgBtnColLeft.style.top  = btnColLeft.style.top;
                dbgBtnColLeft.style.display = "block";
            }

            colLeftAction = () => {
                const v = getView();
                if (!v) {
                    return;
                }
                setCursor(v, cell);
                const v2 = getView();
                if (!v2) {
                    return;
                }
                addColumnBefore(v2.state, v2.dispatch);
                // 选中新插入的列
                const v3 = getView();
                if (v3) {
                    selectNewColAt(v3, cell, colIdx);
                }
            };
        }
    });

    btnRow.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        rowAction?.();
        hideAll();
    });

    btnCol.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        colAction?.();
        hideAll();
    });

    btnColLeft.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        colLeftAction?.();
        hideAll();
    });

    // 鼠标离开编辑器容器时隐藏（允许移向 6 个浮层元素本身）
    container.addEventListener("mouseleave", (e) => {
        if (!floaters.some((f) => f.contains(e.relatedTarget as Node | null))) {
            scheduleHide();
        }
    });

    floaters.forEach((f) => {
        // 鼠标进入浮层时取消待执行的隐藏
        f.addEventListener("mouseenter", () => cancelHide());

        f.addEventListener("mouseleave", ((e: MouseEvent) => {
            const rel = e.relatedTarget as Node | null;
            if (
                !container.contains(rel) &&
                !floaters.some((o) => o !== f && o.contains(rel))
            ) {
                scheduleHide();
            }
        }) as EventListener);
    });

    // addRowBefore 后选中新插入的行（原行被推后，新行在 index-1 处）
    function selectNewRowBefore(view: EditorView, refCell: Element): void {
        try {
            const pos = view.posAtDOM(refCell, 0);
            const $pos = view.state.doc.resolve(Math.min(pos, view.state.doc.content.size));
            let tableDepth = -1;
            for (let d = $pos.depth; d >= 0; d--) {
                if ($pos.node(d).type.name === "table") { tableDepth = d; break; }
            }
            if (tableDepth < 0) { return; }
            const tableNode = $pos.node(tableDepth);
            const tableStart = $pos.start(tableDepth);
            const map = TableMap.get(tableNode);
            const rowIdx = Math.max($pos.index(tableDepth) - 1, 0);
            const $anchor = view.state.doc.resolve(tableStart + map.positionAt(rowIdx, 0, tableNode));
            const $head   = view.state.doc.resolve(tableStart + map.positionAt(rowIdx, map.width - 1, tableNode));
            view.dispatch(view.state.tr.setSelection(new CellSelection($anchor, $head)));
        } catch { /* ignore */ }
    }

    function selectNewRow(view: EditorView, refCell: Element): void {
        try {
            const pos = view.posAtDOM(refCell, 0);
            const $pos = view.state.doc.resolve(
                Math.min(pos, view.state.doc.content.size),
            );
            let tableDepth = -1;
            for (let d = $pos.depth; d >= 0; d--) {
                if ($pos.node(d).type.name === "table") {
                    tableDepth = d;
                    break;
                }
            }
            if (tableDepth < 0) {
                return;
            }
            const tableNode = $pos.node(tableDepth);
            const tableStart = $pos.start(tableDepth);
            const map = TableMap.get(tableNode);
            const rowIdx = Math.min($pos.index(tableDepth) + 1, map.height - 1);
            const $anchor = view.state.doc.resolve(
                tableStart + map.positionAt(rowIdx, 0, tableNode),
            );
            const $head = view.state.doc.resolve(
                tableStart + map.positionAt(rowIdx, map.width - 1, tableNode),
            );
            view.dispatch(
                view.state.tr.setSelection(new CellSelection($anchor, $head)),
            );
        } catch {
            /* ignore */
        }
    }

    function selectNewCol(view: EditorView, refCell: Element): void {
        try {
            const pos = view.posAtDOM(refCell, 0);
            const $pos = view.state.doc.resolve(
                Math.min(pos, view.state.doc.content.size),
            );
            let tableDepth = -1;
            for (let d = $pos.depth; d >= 0; d--) {
                if ($pos.node(d).type.name === "table") {
                    tableDepth = d;
                    break;
                }
            }
            if (tableDepth < 0) {
                return;
            }
            const tableNode = $pos.node(tableDepth);
            const tableStart = $pos.start(tableDepth);
            const map = TableMap.get(tableNode);
            const rowDepth = tableDepth + 1;
            const colIdx = Math.min($pos.index(rowDepth) + 1, map.width - 1);
            const $anchor = view.state.doc.resolve(
                tableStart + map.positionAt(0, colIdx, tableNode),
            );
            const $head = view.state.doc.resolve(
                tableStart + map.positionAt(map.height - 1, colIdx, tableNode),
            );
            view.dispatch(
                view.state.tr.setSelection(new CellSelection($anchor, $head)),
            );
        } catch {
            /* ignore */
        }
    }

    function selectNewColAt(
        view: EditorView,
        refCell: Element,
        colIdx: number,
    ): void {
        try {
            const pos = view.posAtDOM(refCell, 0);
            const $pos = view.state.doc.resolve(
                Math.min(pos, view.state.doc.content.size),
            );
            let tableDepth = -1;
            for (let d = $pos.depth; d >= 0; d--) {
                if ($pos.node(d).type.name === "table") {
                    tableDepth = d;
                    break;
                }
            }
            if (tableDepth < 0) {
                return;
            }
            const tableNode = $pos.node(tableDepth);
            const tableStart = $pos.start(tableDepth);
            const map = TableMap.get(tableNode);
            const safeCol = Math.min(colIdx, map.width - 1);
            const $anchor = view.state.doc.resolve(
                tableStart + map.positionAt(0, safeCol, tableNode),
            );
            const $head = view.state.doc.resolve(
                tableStart + map.positionAt(map.height - 1, safeCol, tableNode),
            );
            view.dispatch(
                view.state.tr.setSelection(new CellSelection($anchor, $head)),
            );
        } catch {
            /* ignore */
        }
    }

    function setCursor(view: EditorView, cell: Element): void {
        try {
            const pos = view.posAtDOM(cell, 0);
            const safePos = Math.min(pos, view.state.doc.content.size);
            view.dispatch(
                view.state.tr.setSelection(
                    TextSelection.create(view.state.doc, safePos),
                ),
            );
        } catch {
            /* ignore */
        }
    }

    function hideAll(): void {
        stopObservingTable();
        lineH.style.display = "none";
        lineV.style.display = "none";
        lineVL.style.display = "none";
        btnRow.style.display = "none";
        btnCol.style.display = "none";
        btnColLeft.style.display = "none";
        if (debugMode) {
            dbgBtnRow?.style.setProperty("display", "none");
            dbgBtnCol?.style.setProperty("display", "none");
            dbgBtnColLeft?.style.setProperty("display", "none");
            dbgTop?.style.setProperty("display", "none");
            dbgBottom?.style.setProperty("display", "none");
            dbgRight?.style.setProperty("display", "none");
            dbgLeft?.style.setProperty("display", "none");
        }
        rowAction = null;
        colAction = null;
        colLeftAction = null;
    }

    // 滚动时隐藏所有 overlay，防止 position:fixed 元素脱离表格
    window.addEventListener("scroll", () => hideAll(), { capture: true });
}
