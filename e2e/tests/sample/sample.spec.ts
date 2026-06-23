import { test, expect } from '../../fixtures';

test.describe('Sample Test with different file', () => {
    test.use({ fileName: 'sidebar.md' });

    test('打开 sidebar.md 文件', async ({ contentFrame }) => {
        const hasContent = await contentFrame.evaluate(() => {
            return document.body.innerHTML.length > 0;
        });
        expect(hasContent).toBe(true);
    });
});
