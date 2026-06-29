import { test, expect } from '../../fixtures';

test.describe('工具栏按钮尺寸', () => {
    test('工具栏按钮高度大于等于 28px', async ({ contentFrame }) => {
        const btnHeight = await contentFrame.evaluate(() => {
            const btn = document.querySelector('.tb-btn');
            return btn ? (btn as HTMLElement).offsetHeight : 0;
        });
        expect(btnHeight).toBeGreaterThanOrEqual(28);
    });

    test('工具栏按钮最小宽度大于等于 30px', async ({ contentFrame }) => {
        const btnWidth = await contentFrame.evaluate(() => {
            const btn = document.querySelector('.tb-btn');
            if (!btn) return 0;
            const style = getComputedStyle(btn);
            return parseFloat(style.minWidth);
        });
        expect(btnWidth).toBeGreaterThanOrEqual(30);
    });

    test('工具栏存在且包含按钮', async ({ contentFrame }) => {
        const toolbarInfo = await contentFrame.evaluate(() => {
            const toolbar = document.querySelector('.toolbar');
            const buttons = toolbar?.querySelectorAll('.tb-btn');
            return {
                exists: !!toolbar,
                buttonCount: buttons?.length ?? 0,
            };
        });
        expect(toolbarInfo.exists).toBe(true);
        expect(toolbarInfo.buttonCount).toBeGreaterThan(0);
    });
});
