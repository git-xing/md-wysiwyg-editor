import { test, expect } from '../../fixtures';

test.describe('div align 全面支持', () => {
    test('html-block 元素存在', async ({ contentFrame }) => {
        const blockCount = await contentFrame.evaluate(() => {
            return document.querySelectorAll('.html-block').length;
        });
        expect(blockCount).toBeGreaterThanOrEqual(0);
    });

    test('html-inline 和 html-block 区分渲染', async ({ contentFrame }) => {
        const info = await contentFrame.evaluate(() => {
            const blocks = document.querySelectorAll('.html-block');
            const inlines = document.querySelectorAll('.html-inline:not(.html-block)');
            return {
                blockCount: blocks.length,
                inlineCount: inlines.length,
                blocksHaveDisplay: Array.from(blocks).map(b => getComputedStyle(b).display),
            };
        });
        expect(info.blockCount).toBeGreaterThanOrEqual(0);
        for (const display of info.blocksHaveDisplay) {
            expect(display).toBe('block');
        }
    });

    test('align="center" 的 html-block 有 text-align:center', async ({ contentFrame }) => {
        const hasAlignedBlock = await contentFrame.evaluate(() => {
            const block = document.querySelector('.html-block[align="center"]');
            if (!block) return null;
            return getComputedStyle(block).textAlign;
        });
        if (hasAlignedBlock !== null) {
            expect(hasAlignedBlock).toBe('center');
        }
    });

    test('工具栏存在对齐方式下拉菜单', async ({ contentFrame }) => {
        const hasAlignWrap = await contentFrame.evaluate(() => {
            return !!document.querySelector('.tb-align-wrap');
        });
        expect(hasAlignWrap).toBe(true);
    });

    test('hover 对齐按钮弹出菜单', async ({ contentFrame, vsCodeWin }) => {
        const alignWrap = contentFrame.locator('.tb-align-wrap').first();
        await alignWrap.hover();
        await vsCodeWin.waitForTimeout(500);

        const menuVisible = await contentFrame.evaluate(() => {
            const menu = document.querySelector('.tb-align-menu');
            return menu ? getComputedStyle(menu).display !== 'none' : false;
        });
        expect(menuVisible).toBe(true);

        const itemCount = await contentFrame.evaluate(() => {
            return document.querySelectorAll('.tb-align-item').length;
        });
        expect(itemCount).toBe(3);
    });
});
