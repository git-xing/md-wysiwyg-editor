import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TableGridSelector } from '../components/toolbar/tableGridSelector';

describe('TableGridSelector', () => {
    let selector: TableGridSelector;
    let anchor: HTMLElement;

    beforeEach(() => {
        selector = new TableGridSelector();
        anchor = document.createElement('button');
        document.body.appendChild(anchor);
    });

    afterEach(() => {
        selector.hide();
        document.body.removeChild(anchor);
    });

    it('should be hidden by default', () => {
        expect(selector.isVisible).toBe(false);
        expect(document.querySelector('.table-grid-selector')).toBeNull();
    });

    it('should show 4x4 grid when shown', () => {
        selector.attachTo(anchor);
        selector.show();

        expect(selector.isVisible).toBe(true);
        const container = document.querySelector('.table-grid-selector');
        expect(container).not.toBeNull();

        const cells = container!.querySelectorAll('.table-grid-selector__cell');
        expect(cells.length).toBe(16);
    });

    it('should highlight cells from (0,0) to target cell on hover', () => {
        selector.attachTo(anchor);
        selector.show();

        const container = document.querySelector('.table-grid-selector')!;
        const grid = container.querySelector('.table-grid-selector__grid')!;
        const gridRect = grid.getBoundingClientRect();

        // Calculate position for cell at (2,1)
        // Cell size = 18px, gap = 2px, so each cell+gap = 20px
        // To hover over cell (2,1), we need to be at position (1*20 + 9, 2*20 + 9) = (29, 49)
        const targetX = gridRect.left + 1 * 20 + 9; // col=1
        const targetY = gridRect.top + 2 * 20 + 9;  // row=2

        const event = new MouseEvent('mousemove', {
            bubbles: true,
            clientX: targetX,
            clientY: targetY
        });
        grid.dispatchEvent(event);

        // Check highlighted cells - should highlight (0,0)-(2,1) = 6 cells
        const selectedCells = container.querySelectorAll('.table-grid-selector__cell--selected');
        expect(selectedCells.length).toBe(6); // (0,0), (0,1), (1,0), (1,1), (2,0), (2,1)
    });

    it('should call onSelect with correct rows and cols on click', async () => {
        const callback = vi.fn();
        selector.onSelect(callback);
        selector.attachTo(anchor);
        selector.show();

        // Wait for animation
        await new Promise(resolve => setTimeout(resolve, 200));

        const container = document.querySelector('.table-grid-selector')!;
        const grid = container.querySelector('.table-grid-selector__grid')!;
        const gridRect = grid.getBoundingClientRect();

        // Calculate position for cell at (3,3)
        const targetX = gridRect.left + 3 * 20 + 9; // col=3
        const targetY = gridRect.top + 3 * 20 + 9;  // row=3

        const event = new MouseEvent('click', {
            bubbles: true,
            clientX: targetX,
            clientY: targetY
        });
        grid.dispatchEvent(event);

        expect(callback).toHaveBeenCalledWith(4, 4);
        expect(selector.isVisible).toBe(false);
    });

    it('should have minimum table size of 2x2', async () => {
        const callback = vi.fn();
        selector.onSelect(callback);
        selector.attachTo(anchor);
        selector.show();

        // Wait for animation
        await new Promise(resolve => setTimeout(resolve, 200));

        const container = document.querySelector('.table-grid-selector')!;
        const grid = container.querySelector('.table-grid-selector__grid')!;
        const gridRect = grid.getBoundingClientRect();

        // Calculate position for cell at (1,1) - minimum 2x2
        const targetX = gridRect.left + 1 * 20 + 9; // col=1
        const targetY = gridRect.top + 1 * 20 + 9;  // row=1

        const event = new MouseEvent('click', {
            bubbles: true,
            clientX: targetX,
            clientY: targetY
        });
        grid.dispatchEvent(event);

        expect(callback).toHaveBeenCalledWith(2, 2);
        expect(selector.isVisible).toBe(false);
    });

    it('should hide after delay when mouse leaves container', async () => {
        selector.attachTo(anchor);
        selector.show();

        // Wait for animation
        await new Promise(resolve => setTimeout(resolve, 200));

        const container = document.querySelector('.table-grid-selector')!;
        container.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));

        // Should still be visible (waiting for delay)
        expect(selector.isVisible).toBe(true);

        // Wait for hide delay (300ms) + animation (150ms)
        await new Promise(resolve => setTimeout(resolve, 500));

        expect(selector.isVisible).toBe(false);
        expect(document.querySelector('.table-grid-selector')).toBeNull();
    });

    it('should not hide when mouse enters container from anchor', () => {
        selector.attachTo(anchor);
        selector.show();

        const container = document.querySelector('.table-grid-selector')!;

        // Simulate mouse entering container
        container.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));

        expect(selector.isVisible).toBe(true);
    });

    it('should hide when hide() is called', async () => {
        selector.attachTo(anchor);
        selector.show();

        // Wait for animation
        await new Promise(resolve => setTimeout(resolve, 200));

        expect(selector.isVisible).toBe(true);

        selector.hide();

        // Should start hiding immediately
        expect(selector.isVisible).toBe(false);

        // Wait for hide animation to complete
        await new Promise(resolve => setTimeout(resolve, 200));

        expect(document.querySelector('.table-grid-selector')).toBeNull();
    });
});
