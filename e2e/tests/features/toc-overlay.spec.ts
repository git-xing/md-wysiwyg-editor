import { test, expect } from '../../fixtures';

test.describe('小屏目录 overlay 模式', () => {
    test('overlay 模式下打开目录不改变正文位置', async ({ contentFrame, vsCodeWin }) => {
        const initialLeft = await contentFrame.evaluate(() => {
            const editor = document.getElementById('editor');
            return editor ? editor.getBoundingClientRect().left : -1;
        });

        const isOverlay = await contentFrame.evaluate(() => {
            return document.body.classList.contains('toc-overlay');
        });

        if (isOverlay) {
            const tocTab = contentFrame.locator('.toc-toggle-tab');
            const tabVisible = await tocTab.isVisible().catch(() => false);
            if (tabVisible) {
                await tocTab.click();
                await vsCodeWin.waitForTimeout(1000);

                const afterLeft = await contentFrame.evaluate(() => {
                    const editor = document.getElementById('editor');
                    return editor ? editor.getBoundingClientRect().left : -1;
                });

                expect(afterLeft).toBe(initialLeft);
            }
        }
    });

    test('TOC 面板结构正确', async ({ contentFrame }) => {
        const tocInfo = await contentFrame.evaluate(() => {
            const panel = document.querySelector('.toc-panel');
            const tab = document.querySelector('.toc-toggle-tab');
            return {
                hasPanel: !!panel,
                hasTab: !!tab,
                panelClasses: panel?.className ?? '',
            };
        });
        expect(tocInfo.hasPanel).toBe(true);
        expect(tocInfo.hasTab).toBe(true);
    });
});
