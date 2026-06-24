import { test, expect } from '../../fixtures';
import { Frame, Page } from '@playwright/test';

async function openSearch(contentFrame: Frame, vsCodeWin: Page) {
    await vsCodeWin.keyboard.press('Meta+F');
    await vsCodeWin.waitForTimeout(1000);
}

async function closeSearch(contentFrame: Frame, vsCodeWin: Page) {
    await vsCodeWin.keyboard.press('Escape');
    await vsCodeWin.waitForTimeout(500);
}

test.describe('Search Feature (Command+F)', () => {
    test('快捷键打开搜索框', async ({ contentFrame, vsCodeWin }) => {
        // 初始状态：搜索框不应该可见
        const initialVisible = await contentFrame.evaluate(() => {
            const bar = document.querySelector('.find-bar');
            return bar ? bar.classList.contains('find-bar--visible') : false;
        });
        expect(initialVisible).toBe(false);

        // 按 Command+F 打开搜索
        await openSearch(contentFrame, vsCodeWin);

        // 搜索框应该出现
        const isVisible = await contentFrame.evaluate(() => {
            const bar = document.querySelector('.find-bar');
            return bar ? bar.classList.contains('find-bar--visible') : false;
        });
        expect(isVisible).toBe(true);
    });

    test('搜索框包含输入框和按钮', async ({ contentFrame, vsCodeWin }) => {
        await openSearch(contentFrame, vsCodeWin);

        // 检查搜索框结构
        const searchStructure = await contentFrame.evaluate(() => {
            const input = document.querySelector('.find-bar__input');
            const btnPrev = document.querySelector('.find-bar__btn[aria-label*="Previous"]');
            const btnNext = document.querySelector('.find-bar__btn[aria-label*="Next"]');
            const btnClose = document.querySelector('.find-bar__btn[aria-label="Close"]');
            const btnCase = document.querySelector('.find-bar__btn[aria-label*="Case"]');
            return {
                hasInput: !!input,
                hasPrevBtn: !!btnPrev,
                hasNextBtn: !!btnNext,
                hasCloseBtn: !!btnClose,
                hasCaseBtn: !!btnCase,
            };
        });

        expect(searchStructure.hasInput).toBe(true);
        expect(searchStructure.hasPrevBtn).toBe(true);
        expect(searchStructure.hasNextBtn).toBe(true);
        expect(searchStructure.hasCloseBtn).toBe(true);
        expect(searchStructure.hasCaseBtn).toBe(true);

        await closeSearch(contentFrame, vsCodeWin);
    });

    test('Escape 关闭搜索框', async ({ contentFrame, vsCodeWin }) => {
        await openSearch(contentFrame, vsCodeWin);

        // 确认搜索框已打开
        const isVisibleBefore = await contentFrame.evaluate(() => {
            const bar = document.querySelector('.find-bar');
            return bar ? bar.classList.contains('find-bar--visible') : false;
        });
        expect(isVisibleBefore).toBe(true);

        // 按 Escape 关闭
        await closeSearch(contentFrame, vsCodeWin);

        // 搜索框应该关闭
        const isVisibleAfter = await contentFrame.evaluate(() => {
            const bar = document.querySelector('.find-bar');
            return bar ? bar.classList.contains('find-bar--visible') : false;
        });
        expect(isVisibleAfter).toBe(false);
    });

    test('输入关键词并搜索', async ({ contentFrame, vsCodeWin }) => {
        await openSearch(contentFrame, vsCodeWin);

        // 输入搜索关键词（使用文件中实际存在的内容）
        const searchInput = contentFrame.locator('.find-bar__input');
        await searchInput.fill('标题');
        await vsCodeWin.waitForTimeout(500);

        // 检查搜索结果计数
        const resultCount = await contentFrame.evaluate(() => {
            const count = document.querySelector('.find-bar__count');
            return count ? count.textContent : '';
        });

        // 搜索应该有结果（标题 在测试文件中存在）
        expect(resultCount).toContain('/');
        expect(resultCount).not.toBe('No results');

        await closeSearch(contentFrame, vsCodeWin);
    });

    test('区分大小写搜索', async ({ contentFrame, vsCodeWin }) => {
        await openSearch(contentFrame, vsCodeWin);

        // 输入小写关键词搜索（TypeScriptjava 包含 typescript）
        const searchInput = contentFrame.locator('.find-bar__input');
        await searchInput.fill('typescript');
        await vsCodeWin.waitForTimeout(500);

        // 记录不区分大小写的结果数
        const countBefore = await contentFrame.evaluate(() => {
            const count = document.querySelector('.find-bar__count');
            return count ? count.textContent : '';
        });
        expect(countBefore).toContain('/');

        // 开启区分大小写
        const caseBtn = contentFrame.locator('.find-bar__btn[aria-label*="Case"]');
        await caseBtn.click();
        await vsCodeWin.waitForTimeout(500);

        // 验证按钮状态
        const isCaseActive = await contentFrame.evaluate(() => {
            const btn = document.querySelector('.find-bar__btn[aria-label*="Case"]');
            return btn ? btn.getAttribute('aria-pressed') === 'true' : false;
        });
        expect(isCaseActive).toBe(true);

        // 记录区分大小写后的结果数
        const countAfter = await contentFrame.evaluate(() => {
            const count = document.querySelector('.find-bar__count');
            return count ? count.textContent : '';
        });

        // 区分大小写后应该没有结果（文件中是 TypeScriptjava，不是 typescript）
        expect(countAfter).toBe('No results');

        await closeSearch(contentFrame, vsCodeWin);
    });

    test('搜索结果切换 - 下一个', async ({ contentFrame, vsCodeWin }) => {
        await openSearch(contentFrame, vsCodeWin);

        // 输入有多个匹配的关键词
        const searchInput = contentFrame.locator('.find-bar__input');
        await searchInput.fill('标题');
        await vsCodeWin.waitForTimeout(500);

        // 获取初始结果位置
        const initialCount = await contentFrame.evaluate(() => {
            const count = document.querySelector('.find-bar__count');
            return count ? count.textContent : '';
        });
        expect(initialCount).toContain('1/');

        // 按 Enter 跳到下一个
        await searchInput.press('Enter');
        await vsCodeWin.waitForTimeout(300);

        // 验证结果位置变化
        const afterNextCount = await contentFrame.evaluate(() => {
            const count = document.querySelector('.find-bar__count');
            return count ? count.textContent : '';
        });
        expect(afterNextCount).toContain('2/');

        await closeSearch(contentFrame, vsCodeWin);
    });

    test('搜索结果切换 - 上一个', async ({ contentFrame, vsCodeWin }) => {
        await openSearch(contentFrame, vsCodeWin);

        // 输入有多个匹配的关键词
        const searchInput = contentFrame.locator('.find-bar__input');
        await searchInput.fill('标题');
        await vsCodeWin.waitForTimeout(500);

        // 先跳到第2个
        await searchInput.press('Enter');
        await vsCodeWin.waitForTimeout(300);

        const countAt2 = await contentFrame.evaluate(() => {
            const count = document.querySelector('.find-bar__count');
            return count ? count.textContent : '';
        });
        expect(countAt2).toContain('2/');

        // 按 Shift+Enter 跳回上一个
        await searchInput.press('Shift+Enter');
        await vsCodeWin.waitForTimeout(300);

        // 验证回到第1个
        const countAt1 = await contentFrame.evaluate(() => {
            const count = document.querySelector('.find-bar__count');
            return count ? count.textContent : '';
        });
        expect(countAt1).toContain('1/');

        await closeSearch(contentFrame, vsCodeWin);
    });

    test('Enter 切换下一个，Shift+Enter 切换上一个', async ({ contentFrame, vsCodeWin }) => {
        await openSearch(contentFrame, vsCodeWin);

        // 输入有多个匹配的关键词
        const searchInput = contentFrame.locator('.find-bar__input');
        await searchInput.fill('标题');
        await vsCodeWin.waitForTimeout(500);

        // 按 Enter 跳到下一个
        await searchInput.press('Enter');
        await vsCodeWin.waitForTimeout(300);

        const countAfterEnter = await contentFrame.evaluate(() => {
            const count = document.querySelector('.find-bar__count');
            return count ? count.textContent : '';
        });
        expect(countAfterEnter).toContain('2/');

        // 按 Shift+Enter 跳回上一个
        await searchInput.press('Shift+Enter');
        await vsCodeWin.waitForTimeout(300);

        const countAfterShiftEnter = await contentFrame.evaluate(() => {
            const count = document.querySelector('.find-bar__count');
            return count ? count.textContent : '';
        });
        expect(countAfterShiftEnter).toContain('1/');

        await closeSearch(contentFrame, vsCodeWin);
    });

    test('点击关闭按钮关闭搜索框', async ({ contentFrame, vsCodeWin }) => {
        await openSearch(contentFrame, vsCodeWin);

        // 确认搜索框已打开
        const isVisibleBefore = await contentFrame.evaluate(() => {
            const bar = document.querySelector('.find-bar');
            return bar ? bar.classList.contains('find-bar--visible') : false;
        });
        expect(isVisibleBefore).toBe(true);

        // 点击关闭按钮
        const closeBtn = contentFrame.locator('.find-bar__btn[aria-label="Close"]');
        await closeBtn.click();
        await vsCodeWin.waitForTimeout(500);

        // 搜索框应该关闭
        const isVisibleAfter = await contentFrame.evaluate(() => {
            const bar = document.querySelector('.find-bar');
            return bar ? bar.classList.contains('find-bar--visible') : false;
        });
        expect(isVisibleAfter).toBe(false);
    });
});
