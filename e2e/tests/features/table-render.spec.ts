import { test, expect } from '../../fixtures';

test.describe('表格渲染验证', () => {
    test.use({ fileName: 'toc-test.md' });

    test('toc-test.md 中的表格应渲染为 table 元素', async ({ contentFrame }) => {
        // 等待编辑器加载
        await contentFrame.waitForSelector('.milkdown', { timeout: 15000 });
        
        // 检查是否存在 table 元素
        const tableCount = await contentFrame.evaluate(() => {
            return document.querySelectorAll('table').length;
        });
        console.log(`找到 ${tableCount} 个 table 元素`);
        
        // 检查 html-inline 中是否包含原始表格文本（不应该出现）
        const hasRawTable = await contentFrame.evaluate(() => {
            const htmlInlines = document.querySelectorAll('.html-inline');
            for (const el of htmlInlines) {
                const text = el.textContent || '';
                if (text.includes('| a1 | b1 | c1 |') || 
                    text.includes('|:---|:---|:---|')) {
                    return true;
                }
            }
            return false;
        });
        console.log(`html-inline 中包含原始表格文本: ${hasRawTable}`);
        
        // 验证表格正确渲染
        expect(tableCount).toBeGreaterThanOrEqual(2); // 应该有2个表格
        expect(hasRawTable).toBe(false); // html-inline 中不应该有原始表格文本
    });
});
