/**
 * 表格网格选择器组件
 * 类似 Word/Google Docs 的表格插入交互：hover 弹出 4×4 网格，鼠标移动高亮选中区域，点击插入对应大小的表格
 */

import { t } from "@/i18n";

export class TableGridSelector {
    private container: HTMLElement;
    private grid: HTMLElement;
    private sizeLabel: HTMLElement;
    private gridCells: HTMLElement[] = [];
    private onSelectCallback: ((rows: number, cols: number) => void) | null = null;
    private hideTimer: ReturnType<typeof setTimeout> | null = null;
    private anchor: HTMLElement | null = null;
    private _isVisible = false;
    private currentRows = 2;
    private currentCols = 2;
    private static readonly MAX_ROWS = 8;
    private static readonly MAX_COLS = 8;
    private static readonly CELL_SIZE = 18;
    private static readonly GAP = 2;

    constructor() {
        this.container = document.createElement('div');
        this.container.className = 'table-grid-selector';
        this.createTitle();
        this.grid = document.createElement('div');
        this.grid.className = 'table-grid-selector__grid';
        this.container.appendChild(this.grid);
        this.sizeLabel = this.createSizeLabel();
        this.container.appendChild(this.sizeLabel);
        this.createGrid();
        this.bindEvents();
    }

    private createTitle(): void {
        const title = document.createElement('div');
        title.className = 'table-grid-selector__title';
        title.textContent = t('Insert Table');
        this.container.appendChild(title);
    }

    private createSizeLabel(): HTMLElement {
        const label = document.createElement('div');
        label.className = 'table-grid-selector__size-label';
        label.textContent = '4 x 4';
        return label;
    }

    private updateSizeLabel(rows: number, cols: number): void {
        this.sizeLabel.textContent = `${rows} x ${cols}`;
    }

    private createGrid(): void {
        this.grid.innerHTML = '';
        this.gridCells = [];

        for (let row = 0; row < this.currentRows; row++) {
            for (let col = 0; col < this.currentCols; col++) {
                const cell = this.createCell(row, col);
                this.grid.appendChild(cell);
                this.gridCells.push(cell);
            }
        }

        this.updateGridLayout();
    }

    private createCell(row: number, col: number): HTMLElement {
        const cell = document.createElement('div');
        cell.className = 'table-grid-selector__cell';
        cell.dataset.row = String(row);
        cell.dataset.col = String(col);
        return cell;
    }

    private updateGridLayout(): void {
        this.grid.style.gridTemplateColumns = `repeat(${this.currentCols}, 18px)`;
        this.grid.style.gridTemplateRows = `repeat(${this.currentRows}, 18px)`;
    }

    private bindEvents(): void {
        // 鼠标移入容器时取消延迟隐藏
        this.container.addEventListener('mouseenter', () => {
            this.cancelHideTimer();
        });

        // 鼠标移出容器时延迟隐藏（给鼠标时间从container移动到icon）
        this.container.addEventListener('mouseleave', () => {
            this.startHideTimer();
        });

        // 鼠标在网格容器上移动时计算最近的cell
        this.grid.addEventListener('mousemove', (e) => {
            const { row, col } = this.getCellFromPosition(e.clientX, e.clientY);
            if (row >= 0 && col >= 0) {
                this.expandGrid(row, col);
                this.highlightCells(row, col);
                // 确保最小显示 2 x 2
                const displayRows = Math.max(2, row + 1);
                const displayCols = Math.max(2, col + 1);
                this.updateSizeLabel(displayRows, displayCols);
            }
        });

        // 点击网格容器时触发选择
        this.grid.addEventListener('click', (e) => {
            const { row, col } = this.getCellFromPosition(e.clientX, e.clientY);
            if (row >= 0 && col >= 0) {
                this.selectCell(row, col);
            }
        });
    }

    private getCellFromPosition(clientX: number, clientY: number): { row: number; col: number } {
        const gridRect = this.grid.getBoundingClientRect();
        const relX = clientX - gridRect.left;
        const relY = clientY - gridRect.top;
        
        // 计算鼠标所在的行列（考虑gap）
        const cellWithGap = TableGridSelector.CELL_SIZE + TableGridSelector.GAP;
        const col = Math.floor(relX / cellWithGap);
        const row = Math.floor(relY / cellWithGap);
        
        // 检查是否在有效范围内（包括最后一个cell的右/下边缘）
        const maxCol = this.currentCols - 1;
        const maxRow = this.currentRows - 1;
        
        // 检查是否在gap区域（超出最后一个cell）
        const isInGapX = relX > (maxCol + 1) * cellWithGap - TableGridSelector.GAP;
        const isInGapY = relY > (maxRow + 1) * cellWithGap - TableGridSelector.GAP;
        
        if (col < 0 || row < 0 || isInGapX || isInGapY) {
            return { row: -1, col: -1 };
        }
        
        return { row: Math.min(row, maxRow), col: Math.min(col, maxCol) };
    }

    private highlightCells(targetRow: number, targetCol: number): void {
        // 确保高亮区域至少2x2，且不超过当前网格大小
        const maxRow = Math.max(1, Math.min(targetRow, this.currentRows - 1));
        const maxCol = Math.max(1, Math.min(targetCol, this.currentCols - 1));
        
        this.gridCells.forEach((cell) => {
            const row = parseInt(cell.dataset.row || '0', 10);
            const col = parseInt(cell.dataset.col || '0', 10);
            const isSelected = row <= maxRow && col <= maxCol;
            cell.classList.toggle('table-grid-selector__cell--selected', isSelected);
        });
    }

    private expandGrid(row: number, col: number): void {
        // 计算需要的网格大小（至少4×4，最大8×8）
        const targetCols = Math.max(4, Math.min(col + 2, TableGridSelector.MAX_COLS));
        const targetRows = Math.max(4, Math.min(row + 2, TableGridSelector.MAX_ROWS));

        // 如果大小发生变化，重建网格
        if (targetCols !== this.currentCols || targetRows !== this.currentRows) {
            this.currentCols = targetCols;
            this.currentRows = targetRows;
            this.rebuildGrid();
            this.updateContainerPosition();
        }
    }

    private rebuildGrid(): void {
        // 清空网格
        this.grid.innerHTML = '';
        this.gridCells = [];

        // 重新创建所有cell
        for (let row = 0; row < this.currentRows; row++) {
            for (let col = 0; col < this.currentCols; col++) {
                const cell = this.createCell(row, col);
                this.grid.appendChild(cell);
                this.gridCells.push(cell);
            }
        }

        this.updateGridLayout();
    }

    private selectCell(row: number, col: number): void {
        if (this.onSelectCallback) {
            // 确保最小插入2x2表格
            const rows = Math.max(2, row + 1);
            const cols = Math.max(2, col + 1);
            this.onSelectCallback(rows, cols);
        }
        this.hide();
    }

    private startHideTimer(): void {
        this.cancelHideTimer();
        this.hideTimer = setTimeout(() => {
            this.hide();
        }, 300);
    }

    private cancelHideTimer(): void {
        if (this.hideTimer) {
            clearTimeout(this.hideTimer);
            this.hideTimer = null;
        }
    }

    /**
     * 将选择器绑定到指定的锚点元素
     */
    attachTo(anchor: HTMLElement): void {
        this.anchor = anchor;
        // 鼠标进入锚点时显示选择器
        anchor.addEventListener('mouseenter', () => {
            this.cancelHideTimer();
            this.show();
        });
        // 鼠标离开锚点时延迟隐藏（给鼠标时间从icon移动到container）
        anchor.addEventListener('mouseleave', () => {
            this.startHideTimer();
        });
    }

    /**
     * 显示选择器
     */
    show(): void {
        if (this._isVisible) return;
        this._isVisible = true;

        // 重置为初始大小
        this.currentRows = 4;
        this.currentCols = 4;
        this.createGrid();

        // 定位到锚点下方
        this.updateContainerPosition();

        document.body.appendChild(this.container);
        this.clearSelection();

        // 触发动画（需要在下一帧添加visible类）
        requestAnimationFrame(() => {
            this.container.classList.add('table-grid-selector--visible');
        });
    }

    private updateContainerPosition(): void {
        if (!this.anchor) return;

        const rect = this.anchor.getBoundingClientRect();
        const padding = 4;
        const titleHeight = 26;
        const sizeLabelHeight = 22;
        const containerWidth = this.currentCols * (TableGridSelector.CELL_SIZE + TableGridSelector.GAP) - TableGridSelector.GAP + padding * 2;
        const containerHeight = this.currentRows * (TableGridSelector.CELL_SIZE + TableGridSelector.GAP) - TableGridSelector.GAP + padding * 2 + titleHeight + sizeLabelHeight;

        // 检查是否超出右边界
        let left = rect.left;
        if (left + containerWidth > window.innerWidth) {
            left = window.innerWidth - containerWidth - 8;
        }

        // 检查是否超出下边界
        let top = rect.bottom + 4;
        if (top + containerHeight > window.innerHeight) {
            top = rect.top - containerHeight - 4;
        }

        this.container.style.left = `${left}px`;
        this.container.style.top = `${top}px`;
    }

    /**
     * 隐藏选择器
     */
    hide(): void {
        if (!this._isVisible) return;
        this._isVisible = false;
        this.cancelHideTimer();

        // 移除可见类，触发隐藏动画
        this.container.classList.remove('table-grid-selector--visible');
        
        // 等待动画完成后移除容器
        setTimeout(() => {
            if (document.body.contains(this.container)) {
                document.body.removeChild(this.container);
            }
            this.clearSelection();
        }, 150); // 与CSS transition时间一致
    }

    /**
     * 清除所有选中状态
     */
    private clearSelection(): void {
        this.gridCells.forEach((cell) => {
            cell.classList.remove('table-grid-selector__cell--selected');
        });
    }

    /**
     * 注册选择回调
     */
    onSelect(callback: (rows: number, cols: number) => void): void {
        this.onSelectCallback = callback;
    }

    /**
     * 获取当前可见状态
     */
    get isVisible(): boolean {
        return this._isVisible;
    }
}
