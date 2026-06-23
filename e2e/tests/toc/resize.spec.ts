import { test, expect } from '../../fixtures';
import { Frame, Page } from '@playwright/test';

async function ensureTocOpen(contentFrame: Frame, vsCodeWin: Page) {
    const tocPanelOpen = await contentFrame.evaluate(() =>
        document.querySelector('.toc-panel')?.classList.contains('toc-panel--open') ?? false
    );
    if (!tocPanelOpen) {
        await contentFrame.locator('.toc-toggle-tab').click();
        await vsCodeWin.waitForTimeout(2000);
    }
}

async function getTocWidth(contentFrame: Frame): Promise<number> {
    return contentFrame.evaluate(() => {
        const panel = document.querySelector('.toc-panel');
        return panel ? (panel as HTMLElement).offsetWidth : 0;
    });
}

test.describe('TOC Resize Feature', () => {
    test.beforeEach(async ({ contentFrame, vsCodeWin }) => {
        await ensureTocOpen(contentFrame, vsCodeWin);
    });

    test('拖拽 TOC 边缘校验宽度变化', async ({ contentFrame, vsCodeWin }) => {
        const frameContent = await contentFrame.evaluate(() => ({
            hasTocPanel: !!document.querySelector('.toc-panel'),
            hasResizeHandle: !!document.querySelector('.toc-resize-handle'),
        }));

        expect(frameContent.hasTocPanel).toBe(true);
        expect(frameContent.hasResizeHandle).toBe(true);

        const cursor = await contentFrame.evaluate(() => {
            const handle = document.querySelector('.toc-resize-handle');
            return handle ? getComputedStyle(handle).cursor : null;
        });
        expect(cursor).toBe('col-resize');

        const resizeHandle = contentFrame.locator('.toc-resize-handle');
        const box = await resizeHandle.boundingBox();
        expect(box).not.toBeNull();

        const initialWidth = await getTocWidth(contentFrame);

        await vsCodeWin.mouse.move(box!.x + 2, box!.y + box!.height / 2);
        await vsCodeWin.mouse.down();
        await vsCodeWin.mouse.move(box!.x + 100, box!.y + box!.height / 2, { steps: 10 });
        await vsCodeWin.mouse.up();
        await vsCodeWin.waitForTimeout(500);

        const newWidth = await getTocWidth(contentFrame);

        expect(newWidth).toBeGreaterThan(initialWidth);
        expect(newWidth).toBeGreaterThanOrEqual(150);
        expect(newWidth).toBeLessThanOrEqual(400);
    });

    test('TOC 宽度不应超过最大限制', async ({ contentFrame, vsCodeWin }) => {
        const resizeHandle = contentFrame.locator('.toc-resize-handle');
        const box = await resizeHandle.boundingBox();
        expect(box).not.toBeNull();

        await vsCodeWin.mouse.move(box!.x + 2, box!.y + box!.height / 2);
        await vsCodeWin.mouse.down();
        await vsCodeWin.mouse.move(box!.x + 500, box!.y + box!.height / 2, { steps: 20 });
        await vsCodeWin.mouse.up();
        await vsCodeWin.waitForTimeout(500);

        const width = await getTocWidth(contentFrame);
        expect(width).toBeLessThanOrEqual(400);
    });

    test('TOC 宽度不应小于最小限制', async ({ contentFrame, vsCodeWin }) => {
        const resizeHandle = contentFrame.locator('.toc-resize-handle');
        const box = await resizeHandle.boundingBox();
        expect(box).not.toBeNull();

        await vsCodeWin.mouse.move(box!.x + box!.width - 2, box!.y + box!.height / 2);
        await vsCodeWin.mouse.down();
        await vsCodeWin.mouse.move(10, box!.y + box!.height / 2, { steps: 20 });
        await vsCodeWin.mouse.up();
        await vsCodeWin.waitForTimeout(500);

        const width = await getTocWidth(contentFrame);
        expect(width).toBeGreaterThanOrEqual(150);
    });
});
