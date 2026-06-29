import { test, expect } from '../../fixtures';

test.describe('标题折叠下拉选择器', () => {
    test.use({ fileName: 'e2e-test.md' });

    async function openDropdown(contentFrame: any, vsCodeWin: any) {
        await contentFrame.evaluate(() => {
            const marker = document.querySelector('.heading-fold-marker') as HTMLElement;
            if (marker) marker.click();
        });
        await vsCodeWin.waitForTimeout(500);
    }

    test('标题区域存在 heading-fold-marker 元素', async ({ contentFrame }) => {
        const markerCount = await contentFrame.evaluate(() => {
            return document.querySelectorAll('.heading-fold-marker').length;
        });
        expect(markerCount).toBeGreaterThan(0);
    });

    test('heading-fold-marker 有 cursor:pointer 样式', async ({ contentFrame }) => {
        const cursor = await contentFrame.evaluate(() => {
            const marker = document.querySelector('.heading-fold-marker');
            return marker ? getComputedStyle(marker).cursor : null;
        });
        expect(cursor).toBe('pointer');
    });

    test('点击 marker 弹出下拉菜单', async ({ contentFrame, vsCodeWin }) => {
        await openDropdown(contentFrame, vsCodeWin);

        const dropdownExists = await contentFrame.evaluate(() => {
            return !!document.querySelector('.heading-level-dropdown');
        });
        expect(dropdownExists).toBe(true);

        const itemCount = await contentFrame.evaluate(() => {
            return document.querySelectorAll('.heading-level-dropdown-item').length;
        });
        expect(itemCount).toBe(7);
    });

    test('下拉菜单包含 P 和 H1-H6 选项', async ({ contentFrame, vsCodeWin }) => {
        await openDropdown(contentFrame, vsCodeWin);

        const items = await contentFrame.evaluate(() => {
            const elements = document.querySelectorAll('.heading-level-dropdown-item');
            return Array.from(elements).map(el => el.textContent);
        });
        expect(items).toEqual(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
    });

    test('当前标题级别高亮显示', async ({ contentFrame, vsCodeWin }) => {
        await openDropdown(contentFrame, vsCodeWin);

        const hasActive = await contentFrame.evaluate(() => {
            return !!document.querySelector('.heading-level-dropdown-item--active');
        });
        expect(hasActive).toBe(true);
    });

    test('点击下拉选项可切换标题级别', async ({ contentFrame, vsCodeWin }) => {
        await openDropdown(contentFrame, vsCodeWin);

        const result = await contentFrame.evaluate(() => {
            const items = document.querySelectorAll('.heading-level-dropdown-item');
            const h3 = Array.from(items).find(el => el.textContent === 'H3') as HTMLElement;
            if (!h3) return { clicked: false };
            h3.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            return { clicked: true };
        });
        expect(result.clicked).toBe(true);

        await vsCodeWin.waitForTimeout(500);

        const dropdownGone = await contentFrame.evaluate(() => {
            return !document.querySelector('.heading-level-dropdown');
        });
        expect(dropdownGone).toBe(true);
    });

    test('点击下拉外部关闭菜单', async ({ contentFrame, vsCodeWin }) => {
        await openDropdown(contentFrame, vsCodeWin);

        const dropdown = await contentFrame.evaluate(() => {
            return !!document.querySelector('.heading-level-dropdown');
        });
        expect(dropdown).toBe(true);

        await contentFrame.evaluate(() => {
            document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        });
        await vsCodeWin.waitForTimeout(300);

        const dropdownGone = await contentFrame.evaluate(() => {
            return !document.querySelector('.heading-level-dropdown');
        });
        expect(dropdownGone).toBe(true);
    });
});
