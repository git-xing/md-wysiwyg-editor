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

        // 输入搜索关键词
        const searchInput = contentFrame.locator('.find-bar__input');
        await searchInput.fill('Heading');
        await vsCodeWin.waitForTimeout(500);

        // 检查搜索结果计数
        const resultCount = await contentFrame.evaluate(() => {
            const count = document.querySelector('.find-bar__count');
            return count ? count.textContent : '';
        });

        // 搜索应该有结果（Heading 在测试文件中存在）
        expect(resultCount).toContain('/');
        expect(resultCount).not.toBe('No results');

        await closeSearch(contentFrame, vsCodeWin);
    });

    test('区分大小写搜索', async ({ contentFrame, vsCodeWin }) => {
        await openSearch(contentFrame, vsCodeWin);

        // 点击区分大小写按钮
        const caseBtn = contentFrame.locator('.find-bar__btn[aria-label*="Case"]');
        await caseBtn.click();
        await vsCodeWin.waitForTimeout(300);

        // 验证按钮状态
        const isCaseActive = await contentFrame.evaluate(() => {
            const btn = document.querySelector('.find-bar__btn[aria-label*="Case"]');
            return btn ? btn.getAttribute('aria-pressed') === 'true' : false;
        });
        expect(isCaseActive).toBe(true);

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
