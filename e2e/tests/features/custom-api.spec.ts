import { test, expect } from '../../fixtures';

test.describe('自定义 JS API', () => {
    test('window.MarkdownEditor API 对象存在', async ({ contentFrame }) => {
        const hasAPI = await contentFrame.evaluate(() => {
            return typeof (window as any).MarkdownEditor === 'object' && (window as any).MarkdownEditor !== null;
        });
        expect(hasAPI).toBe(true);
    });

    test('API 包含所有必需方法', async ({ contentFrame }) => {
        const methods = await contentFrame.evaluate(() => {
            const api = (window as any).MarkdownEditor;
            return {
                on: typeof api.on,
                off: typeof api.off,
                getContent: typeof api.getContent,
                setContent: typeof api.setContent,
                insertText: typeof api.insertText,
                getSelection: typeof api.getSelection,
                focus: typeof api.focus,
                scrollToLine: typeof api.scrollToLine,
                getHeadings: typeof api.getHeadings,
                getTheme: typeof api.getTheme,
            };
        });
        expect(methods.on).toBe('function');
        expect(methods.off).toBe('function');
        expect(methods.getContent).toBe('function');
        expect(methods.setContent).toBe('function');
        expect(methods.insertText).toBe('function');
        expect(methods.getSelection).toBe('function');
        expect(methods.focus).toBe('function');
        expect(methods.scrollToLine).toBe('function');
        expect(methods.getHeadings).toBe('function');
        expect(methods.getTheme).toBe('function');
    });

    test('getContent 返回非空字符串', async ({ contentFrame }) => {
        const content = await contentFrame.evaluate(() => {
            return (window as any).MarkdownEditor.getContent();
        });
        expect(typeof content).toBe('string');
        expect(content.length).toBeGreaterThan(0);
    });

    test('getHeadings 返回标题列表', async ({ contentFrame }) => {
        const headings = await contentFrame.evaluate(() => {
            return (window as any).MarkdownEditor.getHeadings();
        });
        expect(Array.isArray(headings)).toBe(true);
        if (headings.length > 0) {
            expect(headings[0]).toHaveProperty('level');
            expect(headings[0]).toHaveProperty('text');
            expect(headings[0]).toHaveProperty('pos');
        }
    });

    test('getTheme 返回对象', async ({ contentFrame }) => {
        const theme = await contentFrame.evaluate(() => {
            return (window as any).MarkdownEditor.getTheme();
        });
        expect(typeof theme).toBe('object');
    });
});
