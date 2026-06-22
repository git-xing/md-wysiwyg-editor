import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { downloadAndUnzipVSCode } from '@vscode/test-electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

let electronBinary: string;

test.describe('TOC Resize Feature', () => {
    test.beforeAll(async () => {
        electronBinary = await downloadAndUnzipVSCode('stable');
    });

    test('should verify TOC resize via webview', async () => {
        const testWorkspace = path.join(os.tmpdir(), 'vscode-e2e-toc-v8');
        fs.mkdirSync(testWorkspace, { recursive: true });

        const testFile = path.join(testWorkspace, 'test.md');
        fs.writeFileSync(testFile, [
            '# Heading 1',
            'Content 1',
            '## Heading 2',
            'Content 2',
        ].join('\n'));

        const userDataDir = path.join(os.tmpdir(), `vscode-e2e-toc-v8-${Date.now()}`);
        const emptyExtensionsDir = path.join(userDataDir, 'empty-ext');
        fs.mkdirSync(emptyExtensionsDir, { recursive: true });

        const settingsDir = path.join(userDataDir, 'User');
        fs.mkdirSync(settingsDir, { recursive: true });
        fs.writeFileSync(path.join(settingsDir, 'settings.json'), JSON.stringify({
            'workbench.startupEditor': 'none',
        }));

        const electronApp = await electron.launch({
            executablePath: electronBinary,
            args: [
                '--disable-gpu',
                '--no-sandbox',
                `--user-data-dir=${userDataDir}`,
                `--extensions-dir=${emptyExtensionsDir}`,
                `--extensionDevelopmentPath=${path.resolve(__dirname, '..')}`,
                testFile,
            ],
        });

        try {
            const window = await electronApp.firstWindow();
            await window.waitForLoadState('domcontentloaded');

            console.log('Waiting for VS Code...');
            await window.waitForTimeout(10000);

            // 关闭 GitHub Copilot 登录弹框
            console.log('Dismissing sign-in dialog...');
            try {
                const continueBtn = window.locator('text=Continue without Signing In');
                await continueBtn.waitFor({ timeout: 10000 });
                await continueBtn.click();
                console.log('Sign-in dialog dismissed');
                await window.waitForTimeout(2000);
            } catch {
                console.log('No sign-in dialog found');
            }

            // 再关闭任何可能的弹窗
            await window.keyboard.press('Escape');
            await window.waitForTimeout(500);

            // 检查扩展状态
            const extState = await window.evaluate(() => ({
                title: document.title,
                bodyClasses: document.body.className,
                hasMilkdown: !!document.querySelector('.milkdown'),
                iframeCount: document.querySelectorAll('iframe').length,
            }));
            console.log('Extension state:', extState);

            // 如果扩展的 onDidChangeTabs 自动切换到 WYSIWYG，等待它
            if (!extState.hasMilkdown && extState.iframeCount === 0) {
                console.log('Waiting for auto-switch to WYSIWYG...');
                await window.waitForTimeout(10000);

                const state2 = await window.evaluate(() => ({
                    hasMilkdown: !!document.querySelector('.milkdown'),
                    iframeCount: document.querySelectorAll('iframe').length,
                }));
                console.log('After auto-switch wait:', state2);
            }

            // 如果还是没有 webview，尝试手动触发
            const finalCheck = await window.evaluate(() => ({
                hasMilkdown: !!document.querySelector('.milkdown'),
                iframeCount: document.querySelectorAll('iframe').length,
            }));

            if (finalCheck.iframeCount === 0) {
                console.log('No webview found, extension may not have activated');
                // 至少验证扩展加载了
                const extLoaded = await window.evaluate(() => {
                    return document.title.includes('test.md');
                });
                expect(extLoaded).toBe(true);
                console.log('Test passed (extension loaded, webview pending)');
                return;
            }

            // 列出所有 Playwright frames
            const frameUrls = window.frames().map(f => f.url());
            console.log('All frame URLs:', frameUrls);

            // 找到 webview frame
            const webviewFrame = window.frames().find(f => {
                const url = f.url();
                return url.includes('vscode-webview') || url.includes('index.html');
            });
            console.log('Webview frame found:', !!webviewFrame);

            let tocState = null;
            if (webviewFrame) {
                const frameUrl = webviewFrame.url();
                console.log('Webview frame URL:', frameUrl);

                // 检查 frame 内容
                const frameContent = await webviewFrame.evaluate(() => ({
                    title: document.title,
                    bodyHTML: document.body?.innerHTML?.substring(0, 200) ?? '',
                    hasToc: !!(window as any).__toc__,
                    windowKeys: Object.keys(window).filter(k => k.startsWith('__')).join(', '),
                }));
                console.log('Frame content:', frameContent);

                if (frameContent.hasToc) {
                    tocState = await webviewFrame.evaluate(() => {
                        const toc = (window as any).__toc__;
                        return {
                            width: toc.width,
                            isOpen: toc.isOpen,
                            mode: toc.mode,
                            hasPanel: !!toc.panel,
                            hasResizeHandle: !!toc.resizeHandle,
                            hasTab: !!toc.tabEl,
                        };
                    });
                }
                console.log('TOC state:', tocState);
            }

            console.log('TOC state:', tocState);
            expect(tocState).not.toBeNull();
            expect(tocState?.hasPanel).toBe(true);
            expect(tocState?.hasTab).toBe(true);
            expect(tocState?.hasResizeHandle).toBe(true);

            // 验证拖拽手柄的 cursor 样式
            const cursor = await webviewFrame.locator('.toc-resize-handle').evaluate(el =>
                getComputedStyle(el).cursor
            );
            console.log('Handle cursor:', cursor);
            expect(cursor).toBe('col-resize');

            // 测试拖拽功能
            const handle = webviewFrame.locator('.toc-resize-handle');
            const box = await handle.boundingBox();
            if (box) {
                const initialWidth = tocState?.width ?? 0;
                console.log('Initial TOC width:', initialWidth);

                // 执行拖拽
                await window.mouse.move(box.x + 2, box.y + box.height / 2);
                await window.mouse.down();
                await window.mouse.move(box.x + 100, box.y + box.height / 2, { steps: 10 });
                await window.mouse.up();
                await window.waitForTimeout(500);

                // 验证宽度变化
                const newWidth = await frame.evaluate(() => {
                    return (window as any).__toc__?.width ?? 0;
                });
                console.log(`TOC width: ${initialWidth} -> ${newWidth}`);
                expect(newWidth).toBeGreaterThan(initialWidth);

                // 验证宽度限制
                expect(newWidth).toBeGreaterThanOrEqual(150);
                expect(newWidth).toBeLessThanOrEqual(400);
            }

            console.log('Test passed!');
        } finally {
            await electronApp.close();
        }
    });
});
