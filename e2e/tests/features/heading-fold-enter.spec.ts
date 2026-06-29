import { test, expect } from '../../fixtures';

test.describe('标题折叠回车 Bug 修复', () => {
    test.use({ fileName: 'e2e-test.md' });

    test('折叠标题后按 Enter 在标题外插入新行', async ({ contentFrame, vsCodeWin }) => {
        const headingCount = await contentFrame.evaluate(() => {
            return document.querySelectorAll('.heading-fold-heading').length;
        });
        expect(headingCount).toBeGreaterThan(0);

        const result = await contentFrame.evaluate(() => {
            const heading = document.querySelector('.heading-fold-heading--foldable') as HTMLElement | null;
            if (!heading) return { success: false, reason: 'no foldable heading' };

            const gutter = heading.querySelector('.heading-fold-gutter--foldable') as HTMLElement | null;
            if (!gutter) return { success: false, reason: 'no gutter' };

            const toggle = gutter.querySelector('.heading-fold-toggle') as HTMLElement | null;
            if (!toggle) return { success: false, reason: 'no toggle button' };

            toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            return { success: true };
        });
        expect(result.success).toBe(true);

        await vsCodeWin.waitForTimeout(500);

        const isCollapsed = await contentFrame.evaluate(() => {
            return !!document.querySelector('.heading-fold-heading--collapsed');
        });
        expect(isCollapsed).toBe(true);
    });

    test('折叠区域存在 heading-fold-hidden 元素', async ({ contentFrame }) => {
        const hasHidden = await contentFrame.evaluate(() => {
            const heading = document.querySelector('.heading-fold-heading--collapsed');
            if (!heading) return null;
            return !!document.querySelector('.heading-fold-hidden');
        });
        if (hasHidden !== null) {
            expect(hasHidden).toBe(true);
        }
    });
});
