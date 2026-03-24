import { TableMap, CellSelection } from '@milkdown/prose/tables';
import type { Node as PMNode } from '@milkdown/prose/model';
import type { EditorView } from '@milkdown/prose/view';
import { applyTooltip, hideTooltip } from './tooltip';
import { setPendingToolbarPos } from './selectionToolbar';

type GetView = () => EditorView | null;

export function setupTableHandles(
  container: HTMLElement,
  getView: GetView,
): void {
  // ── 行 handle（悬停行时显示在行的左侧外部）────────────────
  const rowHandle = document.createElement('div');
  rowHandle.className = 'table-handle table-handle--row';
  rowHandle.textContent = '⠿';
  document.body.appendChild(rowHandle);
  applyTooltip(rowHandle, '点击选中整行 · 拖拽重排', { placement: 'above' });

  // ── 列 handle（悬停列时显示在列的顶部外部）────────────────
  const colHandle = document.createElement('div');
  colHandle.className = 'table-handle table-handle--col';
  colHandle.textContent = '⠿';
  document.body.appendChild(colHandle);
  applyTooltip(colHandle, '点击选中整列 · 拖拽重排', { placement: 'above' });

  // ── 拖拽指示线 ───────────────────────────────────────────
  const dragLineH = document.createElement('div');
  dragLineH.className = 'table-drag-line table-drag-line--h';
  document.body.appendChild(dragLineH);

  const dragLineV = document.createElement('div');
  dragLineV.className = 'table-drag-line table-drag-line--v';
  document.body.appendChild(dragLineV);

  // ── 拖拽 ghost（跟随鼠标移动的半透明行/列覆盖层）──────────
  const dragGhost = document.createElement('div');
  dragGhost.className = 'table-drag-ghost';
  dragGhost.style.display = 'none';
  document.body.appendChild(dragGhost);

  // ── 延迟隐藏：允许鼠标跨过空隙移入浮层 ─────────────────
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  function scheduleHide(): void {
    if (hideTimer) { return; }
    hideTimer = setTimeout(() => { hideHandles(); hideTimer = null; }, 150);
  }
  function cancelHide(): void {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  }

  // ── 当前悬停状态 ─────────────────────────────────────────
  let currentCell: HTMLElement | null = null;

  // ── 记录最后鼠标位置，供 ResizeObserver 触发合成事件使用 ──
  let lastMouseX = 0;
  let lastMouseY = 0;
  let tableResizeObserver: ResizeObserver | null = null;

  function startObservingTable(tableEl: HTMLElement): void {
    tableResizeObserver?.disconnect();
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
  }

  // ── 本模块浮层（用于合成事件命中测试） ──────────────────
  const floaters = [rowHandle, colHandle, dragLineH, dragLineV, dragGhost];

  // ── 拖拽状态 ─────────────────────────────────────────────
  type DragKind = 'row' | 'col';
  interface DragState {
    kind: DragKind;
    fromIdx: number;
    tablePos: number;
    tableNode: PMNode;
    startX: number;
    startY: number;
    startTime: number;
    dragging: boolean;
    allRows: HTMLElement[];
    allCols: HTMLElement[];
    ghostStartX: number;
    ghostStartY: number;
  }
  let drag: DragState | null = null;

  // ── 鼠标在 container 内移动：更新 handle 位置 ───────────
  // 与 tableAddButtons 的边框阈值保持一致
  const BORDER_THRESHOLD = 9;

  container.addEventListener('mousemove', (e) => {
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    if (drag) { return; } // 拖拽中不更新 handle 显示
    let cell = (e.target as Element).closest('td, th') as HTMLElement | null;
    if (!cell) {
      // 合成事件（ResizeObserver 派发）的 target=container，用 elementFromPoint 补救
      const realEl = document.elementFromPoint(e.clientX, e.clientY);
      if (realEl) {
        if (floaters.some(f => f === realEl || f.contains(realEl))) {
          cancelHide(); return;
        }
        cell = (realEl as Element).closest('td, th') as HTMLElement | null;
      }
      if (!cell) { scheduleHide(); return; }
    }

    const table = cell.closest('table') as HTMLElement | null;
    if (!table) { scheduleHide(); return; }

    // 鼠标接近单元格边框时：隐藏 handle，让插入线接管
    const cellRect = cell.getBoundingClientRect();
    const colIdx = (cell as HTMLTableCellElement).cellIndex;
    const nearBorder =
      e.clientY >= cellRect.bottom - BORDER_THRESHOLD ||
      e.clientX >= cellRect.right - BORDER_THRESHOLD;
      // 左边框不检测：rowHandle 就在左边框外侧，需要允许鼠标经过该区域到达 handle
    if (nearBorder) { hideHandles(); return; }

    cancelHide();
    currentCell = cell;
    startObservingTable(table);

    const row = cell.closest('tr') as HTMLElement;

    // 行 handle：显示在当前行第一个单元格的左侧外部
    const firstCellRect = (row.firstElementChild as HTMLElement).getBoundingClientRect();
    rowHandle.style.left    = `${firstCellRect.left - 18}px`;  // 18px 宽，紧贴左边框
    rowHandle.style.top     = `${firstCellRect.top + (firstCellRect.height - 20) / 2}px`;
    rowHandle.style.display = 'flex';

    // 列 handle：显示在当前列首行单元格的顶部外部
    const allRows = Array.from(table.querySelectorAll('tr')) as HTMLElement[];
    const topCellEl = allRows[0]?.querySelectorAll('td, th')[colIdx] as HTMLElement | undefined;
    if (topCellEl) {
      const topCellRect = topCellEl.getBoundingClientRect();
      colHandle.style.left    = `${topCellRect.left + (topCellRect.width - 20) / 2}px`;
      colHandle.style.top     = `${topCellRect.top - 18}px`;   // 18px 高，紧贴上边框
      colHandle.style.display = 'flex';
    }
  });

  // 鼠标离开容器时隐藏（允许移到 handle 本身）
  container.addEventListener('mouseleave', (e) => {
    if (!floaters.some(f => f.contains(e.relatedTarget as Node | null))) {
      scheduleHide();
    }
  });

  floaters.forEach(f => {
    // 鼠标进入浮层时取消待执行的隐藏
    f.addEventListener('mouseenter', () => cancelHide());

    f.addEventListener('mouseleave', (e) => {
      const rel = e.relatedTarget as Node | null;
      if (!container.contains(rel) && !floaters.some(o => o !== f && o.contains(rel))) {
        scheduleHide();
      }
    });
  });

  // ── 行 handle mousedown ──────────────────────────────────
  rowHandle.addEventListener('mousedown', (e) => {
    hideTooltip();
    e.preventDefault();
    e.stopPropagation();
    if (!currentCell) { return; }
    startDrag(e, 'row', currentCell);
  });

  // ── 列 handle mousedown ──────────────────────────────────
  colHandle.addEventListener('mousedown', (e) => {
    hideTooltip();
    e.preventDefault();
    e.stopPropagation();
    if (!currentCell) { return; }
    startDrag(e, 'col', currentCell);
  });

  // ── 开始拖拽 ────────────────────────────────────────────
  function startDrag(e: MouseEvent, kind: DragKind, cell: HTMLElement): void {
    const view = getView();
    if (!view) { return; }

    const table = cell.closest('table') as HTMLElement | null;
    if (!table) { return; }

    // 获取 table 在 ProseMirror 文档中的位置
    let tablePos = -1;
    try {
      const pos = view.posAtDOM(table, 0);
      const $pos = view.state.doc.resolve(Math.min(pos, view.state.doc.content.size));
      for (let d = $pos.depth; d >= 0; d--) {
        if ($pos.node(d).type.name === 'table') {
          tablePos = $pos.before(d);
          break;
        }
      }
    } catch { return; }
    if (tablePos < 0) { return; }

    const tableNode = view.state.doc.nodeAt(tablePos);
    if (!tableNode) { return; }

    // 计算当前行/列索引
    const allRows = Array.from(table.querySelectorAll('tr')) as HTMLElement[];
    const row = cell.closest('tr') as HTMLElement;
    const fromIdx = allRows.indexOf(row);
    const colIdx  = (cell as HTMLTableCellElement).cellIndex;

    const firstRow = allRows[0];
    const allCols = firstRow ? Array.from(firstRow.querySelectorAll('td, th')) as HTMLElement[] : [];

    // 计算 ghost 初始位置
    let ghostStartX = 0;
    let ghostStartY = 0;

    if (kind === 'row') {
      const rowRect  = row.getBoundingClientRect();
      const firstC   = row.firstElementChild as HTMLElement;
      const lastC    = row.lastElementChild as HTMLElement;
      const gLeft    = firstC.getBoundingClientRect().left;
      const gRight   = lastC.getBoundingClientRect().right;
      dragGhost.style.left   = `${gLeft}px`;
      dragGhost.style.top    = `${rowRect.top}px`;
      dragGhost.style.width  = `${gRight - gLeft}px`;
      dragGhost.style.height = `${rowRect.height}px`;
      ghostStartX = gLeft;
      ghostStartY = rowRect.top;
    } else {
      const topCell = allRows[0]?.querySelectorAll('td, th')[colIdx] as HTMLElement | undefined;
      const botCell = allRows[allRows.length - 1]?.querySelectorAll('td, th')[colIdx] as HTMLElement | undefined;
      if (topCell && botCell) {
        const tRect = topCell.getBoundingClientRect();
        const bRect = botCell.getBoundingClientRect();
        dragGhost.style.left   = `${tRect.left}px`;
        dragGhost.style.top    = `${tRect.top}px`;
        dragGhost.style.width  = `${tRect.width}px`;
        dragGhost.style.height = `${bRect.bottom - tRect.top}px`;
        ghostStartX = tRect.left;
        ghostStartY = tRect.top;
      }
    }

    drag = {
      kind,
      fromIdx: kind === 'row' ? fromIdx : colIdx,
      tablePos,
      tableNode,
      startX: e.clientX,
      startY: e.clientY,
      startTime: Date.now(),
      dragging: false,
      allRows,
      allCols,
      ghostStartX,
      ghostStartY,
    };

    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);
  }

  // ── 拖拽移动 ─────────────────────────────────────────────
  function onDragMove(e: MouseEvent): void {
    if (!drag) { return; }

    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;

    if (!drag.dragging && Math.sqrt(dx * dx + dy * dy) > 8) {
      drag.dragging = true;
    }
    if (!drag.dragging) { return; }

    // 更新 ghost 位置（跟随鼠标移动）
    dragGhost.style.display = 'block';
    if (drag.kind === 'row') {
      dragGhost.style.top = `${drag.ghostStartY + (e.clientY - drag.startY)}px`;
    } else {
      dragGhost.style.left = `${drag.ghostStartX + (e.clientX - drag.startX)}px`;
    }

    if (drag.kind === 'row') {
      const targetIdx = findTargetRow(e.clientY, drag.allRows);
      if (targetIdx < 0) { dragLineH.style.display = 'none'; return; }

      const targetRow = drag.allRows[targetIdx];
      const targetRect = targetRow.getBoundingClientRect();
      const firstCell = targetRow.firstElementChild as HTMLElement | undefined;
      const lastRow = drag.allRows[drag.allRows.length - 1];
      const lastCell = lastRow.lastElementChild as HTMLElement | undefined;
      if (!firstCell || !lastCell) { return; }

      const lineLeft  = firstCell.getBoundingClientRect().left;
      const lineRight = lastCell.getBoundingClientRect().right;
      const lineY = e.clientY < targetRect.top + targetRect.height / 2
        ? targetRect.top
        : targetRect.bottom;

      dragLineH.style.left    = `${lineLeft}px`;
      dragLineH.style.width   = `${lineRight - lineLeft}px`;
      dragLineH.style.top     = `${lineY - 1}px`;
      dragLineH.style.display = 'block';
      dragLineV.style.display = 'none';

    } else {
      const targetIdx = findTargetCol(e.clientX, drag.allCols);
      if (targetIdx < 0) { dragLineV.style.display = 'none'; return; }

      const targetCol = drag.allCols[targetIdx];
      if (!targetCol) { return; }
      const targetRect = targetCol.getBoundingClientRect();
      const topCell = drag.allRows[0]?.querySelectorAll('td, th')[targetIdx] as HTMLElement | undefined;
      const botCell = drag.allRows[drag.allRows.length - 1]?.querySelectorAll('td, th')[targetIdx] as HTMLElement | undefined;
      if (!topCell || !botCell) { return; }

      const lineTop    = topCell.getBoundingClientRect().top;
      const lineBottom = botCell.getBoundingClientRect().bottom;
      const lineX = e.clientX < targetRect.left + targetRect.width / 2
        ? targetRect.left
        : targetRect.right;

      dragLineV.style.top     = `${lineTop}px`;
      dragLineV.style.height  = `${lineBottom - lineTop}px`;
      dragLineV.style.left    = `${lineX - 1}px`;
      dragLineV.style.display = 'block';
      dragLineH.style.display = 'none';
    }
  }

  // ── 拖拽结束 ─────────────────────────────────────────────
  function onDragEnd(e: MouseEvent): void {
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragEnd);
    dragLineH.style.display  = 'none';
    dragLineV.style.display  = 'none';
    dragGhost.style.display  = 'none';

    if (!drag) { return; }
    const d = drag;
    drag = null;

    const view = getView();
    if (!view) { return; }

    const elapsed = Date.now() - d.startTime;
    if (!d.dragging || elapsed < 150) {
      // 未拖拽或快速触碰（< 150ms）→ 点击：选中整行或整列
      if (currentCell) {
        setPendingToolbarPos(e.clientX, e.clientY);
        d.kind === 'row'
          ? selectEntireRow(view, currentCell)
          : selectEntireCol(view, currentCell);
      }
      return;
    }

    // 执行重排
    if (d.kind === 'row') {
      const toIdx = findTargetRow(e.clientY, d.allRows);
      if (toIdx >= 0 && toIdx !== d.fromIdx) {
        if (d.fromIdx === 0) { return; } // 禁止移动表头
        const insertBefore = e.clientY < d.allRows[toIdx]!.getBoundingClientRect().top
          + d.allRows[toIdx]!.getBoundingClientRect().height / 2;
        const finalTo = insertBefore ? toIdx : toIdx + 1;
        const adjustedTo = finalTo > d.fromIdx ? finalTo - 1 : finalTo;
        if (adjustedTo === 0 || adjustedTo === d.fromIdx) { return; }
        moveRow(view, d.tablePos, d.fromIdx, adjustedTo);
        selectRowByIndex(view, d.tablePos, adjustedTo);
      }
    } else {
      const toIdx = findTargetCol(e.clientX, d.allCols);
      if (toIdx >= 0 && toIdx !== d.fromIdx) {
        const insertBefore = e.clientX < d.allCols[toIdx]!.getBoundingClientRect().left
          + d.allCols[toIdx]!.getBoundingClientRect().width / 2;
        const finalTo = insertBefore ? toIdx : toIdx + 1;
        const adjustedTo = finalTo > d.fromIdx ? finalTo - 1 : finalTo;
        if (adjustedTo === d.fromIdx) { return; }
        moveCol(view, d.tablePos, d.fromIdx, adjustedTo);
        selectColByIndex(view, d.tablePos, adjustedTo);
      }
    }
  }

  // ── 定位辅助 ─────────────────────────────────────────────
  function findTargetRow(clientY: number, rows: HTMLElement[]): number {
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!.getBoundingClientRect();
      if (clientY >= r.top && clientY <= r.bottom) { return i; }
    }
    // 鼠标在最后一行下方：返回最后一行索引，触发"插入到末尾"逻辑
    if (rows.length > 0) {
      const lastR = rows[rows.length - 1]!.getBoundingClientRect();
      if (clientY > lastR.bottom) { return rows.length - 1; }
    }
    return -1;
  }

  function findTargetCol(clientX: number, cols: HTMLElement[]): number {
    for (let i = 0; i < cols.length; i++) {
      const r = cols[i]!.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right) { return i; }
    }
    if (cols.length > 0) {
      // 鼠标在最左列左边：返回第 0 列，触发"插入到最前"逻辑
      const firstR = cols[0]!.getBoundingClientRect();
      if (clientX < firstR.left) { return 0; }
      // 鼠标在最右列右边：返回最后一列索引，触发"插入到末尾"逻辑
      const lastR = cols[cols.length - 1]!.getBoundingClientRect();
      if (clientX > lastR.right) { return cols.length - 1; }
    }
    return -1;
  }

  // ── 点击选中整行 ─────────────────────────────────────────
  function selectEntireRow(view: EditorView, cell: HTMLElement): void {
    try {
      const pos = view.posAtDOM(cell, 0);
      const $pos = view.state.doc.resolve(Math.min(pos, view.state.doc.content.size));
      let tableDepth = -1;
      for (let d = $pos.depth; d >= 0; d--) {
        if ($pos.node(d).type.name === 'table') { tableDepth = d; break; }
      }
      if (tableDepth < 0) { return; }
      const tableNode = $pos.node(tableDepth);
      const tableStart = $pos.start(tableDepth);
      const map = TableMap.get(tableNode);
      const rowIdx = $pos.index(tableDepth);
      const $anchor = view.state.doc.resolve(tableStart + map.positionAt(rowIdx, 0, tableNode));
      const $head   = view.state.doc.resolve(tableStart + map.positionAt(rowIdx, map.width - 1, tableNode));
      view.dispatch(view.state.tr.setSelection(new CellSelection($anchor, $head)));
      view.focus();
    } catch { /* ignore */ }
  }

  // ── 点击选中整列 ─────────────────────────────────────────
  function selectEntireCol(view: EditorView, cell: HTMLElement): void {
    try {
      const pos = view.posAtDOM(cell, 0);
      const $pos = view.state.doc.resolve(Math.min(pos, view.state.doc.content.size));
      let tableDepth = -1;
      for (let d = $pos.depth; d >= 0; d--) {
        if ($pos.node(d).type.name === 'table') { tableDepth = d; break; }
      }
      if (tableDepth < 0) { return; }
      const tableNode = $pos.node(tableDepth);
      const tableStart = $pos.start(tableDepth);
      const map = TableMap.get(tableNode);
      const colIdx = (cell as HTMLTableCellElement).cellIndex;
      const $anchor = view.state.doc.resolve(tableStart + map.positionAt(0, colIdx, tableNode));
      const $head   = view.state.doc.resolve(tableStart + map.positionAt(map.height - 1, colIdx, tableNode));
      view.dispatch(view.state.tr.setSelection(new CellSelection($anchor, $head)));
      view.focus();
    } catch { /* ignore */ }
  }

  // ── 按索引选中行（拖拽完成后调用，不依赖 DOM）───────────
  function selectRowByIndex(view: EditorView, tablePos: number, rowIdx: number): void {
    try {
      const tableNode = view.state.doc.nodeAt(tablePos);
      if (!tableNode) { return; }
      const map = TableMap.get(tableNode);
      const tableStart = tablePos + 1;
      const $anchor = view.state.doc.resolve(tableStart + map.positionAt(rowIdx, 0, tableNode));
      const $head   = view.state.doc.resolve(tableStart + map.positionAt(rowIdx, map.width - 1, tableNode));
      view.dispatch(view.state.tr.setSelection(new CellSelection($anchor, $head)));
      view.focus();
    } catch { /* ignore */ }
  }

  // ── 按索引选中列（拖拽完成后调用，不依赖 DOM）───────────
  function selectColByIndex(view: EditorView, tablePos: number, colIdx: number): void {
    try {
      const tableNode = view.state.doc.nodeAt(tablePos);
      if (!tableNode) { return; }
      const map = TableMap.get(tableNode);
      const tableStart = tablePos + 1;
      const $anchor = view.state.doc.resolve(tableStart + map.positionAt(0, colIdx, tableNode));
      const $head   = view.state.doc.resolve(tableStart + map.positionAt(map.height - 1, colIdx, tableNode));
      view.dispatch(view.state.tr.setSelection(new CellSelection($anchor, $head)));
      view.focus();
    } catch { /* ignore */ }
  }

  // ── 行重排事务 ───────────────────────────────────────────
  function moveRow(view: EditorView, tablePos: number, from: number, to: number): void {
    try {
      const tableNode = view.state.doc.nodeAt(tablePos);
      if (!tableNode) { return; }
      const rows: PMNode[] = [];
      tableNode.forEach(r => rows.push(r));
      const [row] = rows.splice(from, 1);
      rows.splice(to, 0, row);
      const newTable = tableNode.type.create(tableNode.attrs, rows, tableNode.marks);
      view.dispatch(
        view.state.tr.replaceWith(tablePos, tablePos + tableNode.nodeSize, newTable),
      );
    } catch { /* ignore */ }
  }

  // ── 列重排事务 ───────────────────────────────────────────
  function moveCol(view: EditorView, tablePos: number, from: number, to: number): void {
    try {
      const tableNode = view.state.doc.nodeAt(tablePos);
      if (!tableNode) { return; }
      const newRows: PMNode[] = [];
      tableNode.forEach(row => {
        const cells: PMNode[] = [];
        row.forEach(c => cells.push(c));
        const [cell] = cells.splice(from, 1);
        cells.splice(to, 0, cell);
        newRows.push(row.type.create(row.attrs, cells, row.marks));
      });
      const newTable = tableNode.type.create(tableNode.attrs, newRows, tableNode.marks);
      view.dispatch(
        view.state.tr.replaceWith(tablePos, tablePos + tableNode.nodeSize, newTable),
      );
    } catch { /* ignore */ }
  }

  // ── 隐藏 handle ──────────────────────────────────────────
  function hideHandles(): void {
    stopObservingTable();
    rowHandle.style.display = 'none';
    colHandle.style.display = 'none';
    currentCell = null;
  }

  // ── 滚动时隐藏所有 overlay ───────────────────────────────
  window.addEventListener('scroll', () => {
    hideHandles();
    dragGhost.style.display  = 'none';
    dragLineH.style.display  = 'none';
    dragLineV.style.display  = 'none';
  }, { capture: true });
}
