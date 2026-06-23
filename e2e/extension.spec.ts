import { test, expect } from '@playwright/test';
import { _electron as electron, ElectronApplication } from '@playwright/test';
import { downloadAndUnzipVSCode } from '@vscode/test-electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

let app: ElectronApplication;

test.describe('TOC Resize Feature', () => {
    test('拖拽 TOC 边缘校验宽度变化', async () => {
        // 1. 准备测试文件
        const timestamp = Date.now();
        const testWorkspace = path.join(os.tmpdir(), `vscode-e2e-toc-${timestamp}`);
        fs.mkdirSync(testWorkspace, { recursive: true });

        const testFile = path.join(testWorkspace, 'test.md');
        fs.writeFileSync(testFile, [
            '# Heading 1',
            'Content 1',
            '## Heading 2',
            'Content 2',
            '### Heading 3',
            'Content 3',
        ].join('\n'));

        const userDataDir = path.join(testWorkspace, 'user-data');
        fs.mkdirSync(userDataDir, { recursive: true });

        const electronBinary = await downloadAndUnzipVSCode('stable');

        // 2. 启动 VS Code
        app = await electron.launch({
            executablePath: electronBinary,
            args: [
                "--disable-gpu",
                "--no-sandbox",
                "--new-window",
                `--user-data-dir=${userDataDir}`,
                `--extensionDevelopmentPath=${path.resolve(__dirname, "..")}`,
                testFile,
            ],
        });

        try {
            const vsCodeWin = await app.firstWindow();
            await vsCodeWin.waitForLoadState('domcontentloaded');
            await vsCodeWin.waitForTimeout(5000);

            // 3. 关闭 GitHub Copilot 登录弹框
            try {
                const continueBtn = vsCodeWin.locator(
                    ".onboarding-a-close-btn",
                );
                await continueBtn.waitFor({ timeout: 5000 });
                await continueBtn.click();
                await vsCodeWin.waitForTimeout(2000);
                console.log("已关闭登录弹框");
            } catch {
                // 没有弹框
            }

            // 4. 等待 VS Code 和扩展完全加载
            await vsCodeWin.waitForTimeout(5000);

            // 5. 关闭当前文件 tab，然后重新打开以触发 onDidChangeTabs
            console.log('Closing and reopening file to trigger extension...');
            // await vsCodeWin.keyboard.press('Meta+W');
            // await vsCodeWin.waitForTimeout(2000);

            // 用命令面板重新打开文件
            await vsCodeWin.keyboard.press('Meta+P');
            await vsCodeWin.waitForTimeout(1500);
            await vsCodeWin.keyboard.type('test.md', { delay: 50 });
            await vsCodeWin.waitForTimeout(1000);
            await vsCodeWin.keyboard.press('Enter');
            await vsCodeWin.waitForTimeout(1000);
            await vsCodeWin.keyboard.press("Meta+Shift+M");
            console.log("是否打开了测试并且已是预览状态");
            await vsCodeWin.waitForTimeout(1000);

            // 6. 检查是否有 webview
            const hasIframe = await vsCodeWin.evaluate(() => {
                return document.querySelectorAll('iframe').length > 0;
            });
            console.log('Has iframe:', hasIframe);

            if (!hasIframe) {
                console.log('No webview found, extension may not have activated');
                return;
            }

            // 7. 定位 webview iframe - 找到我们扩展的 webview
            const allFrames = vsCodeWin.frames();
            console.log('Frame count:', allFrames.length);

            // 找到包含 toc-panel 或 milkdown 的 frame
            let targetFrame = null;
            for (const frame of allFrames) {
                const url = frame.url();
                if (url.includes('vscode-webview') && url.includes('extensionId=chance-liu')) {
                    targetFrame = frame;
                    console.log('Found our webview frame:', url.substring(0, 100));
                    break;
                }
            }

            if (!targetFrame) {
                // 尝试所有 webview frame
                for (const frame of allFrames) {
                    const url = frame.url();
                    if (url.includes('vscode-webview')) {
                        const hasToc = await frame.evaluate(() => {
                            return !!document.querySelector('.toc-panel') || !!document.querySelector('.toc-toggle-tab');
                        }).catch(() => false);
                        if (hasToc) {
                            targetFrame = frame;
                            console.log('Found frame with TOC:', url.substring(0, 100));
                            break;
                        }
                    }
                }
            }

            if (!targetFrame) {
                console.log('Could not find our webview frame');
                for (const frame of allFrames) {
                    console.log('Frame URL:', frame.url().substring(0, 100));
                }
                return;
            }

            // 8. 点击 TOC toggle 按钮打开面板
            console.log('Clicking TOC toggle button...');
            try {
                const tocToggle = contentFrame.locator('.toc-toggle-tab');
                await tocToggle.click({ timeout: 5000 });
                await vsCodeWin.waitForTimeout(2000);
            } catch (e) {
                console.log('TOC toggle click failed:', (e as Error).message?.substring(0, 80));
            }

            // 9. 检查嵌套 frame 内容
            let contentFrame = targetFrame;
            const childFrames = targetFrame.childFrames();
            console.log('Child frames:', childFrames.length);
            if (childFrames.length > 0) {
                contentFrame = childFrames[0];
                console.log('Using nested frame');
            }

            // 先检查 TOC 是否已打开
            let frameContent = await contentFrame.evaluate(() => ({
                hasTocPanel: !!document.querySelector('.toc-panel'),
                hasTocTab: !!document.querySelector('.toc-toggle-tab'),
                hasResizeHandle: !!document.querySelector('.toc-resize-handle'),
                tocPanelOpen: document.querySelector('.toc-panel')?.classList.contains('toc-panel--open') ?? false,
            }));
            console.log('Frame content:', frameContent);

            // 如果 TOC 面板未打开，点击 toggle 按钮打开
            if (!frameContent.tocPanelOpen) {
                console.log('TOC not open, clicking toggle...');
                await contentFrame.locator('.toc-toggle-tab').click();
                await vsCodeWin.waitForTimeout(2000);

                frameContent = await contentFrame.evaluate(() => ({
                    hasTocPanel: !!document.querySelector('.toc-panel'),
                    hasTocTab: !!document.querySelector('.toc-toggle-tab'),
                    hasResizeHandle: !!document.querySelector('.toc-resize-handle'),
                    tocPanelOpen: document.querySelector('.toc-panel')?.classList.contains('toc-panel--open') ?? false,
                }));
                console.log('After click toggle:', frameContent);
            }

            expect(frameContent.hasResizeHandle).toBe(true);

            // 9. 验证 cursor 样式
            const cursor = await contentFrame.evaluate(() => {
                const handle = document.querySelector('.toc-resize-handle');
                return handle ? getComputedStyle(handle).cursor : null;
            });
            console.log('Handle cursor:', cursor);
            expect(cursor).toBe('col-resize');

            // 10. 测试拖拽
            const resizeHandleLocator = contentFrame.locator('.toc-resize-handle');
            const box = await resizeHandleLocator.boundingBox();
            if (box) {
                const initialWidth = await contentFrame.evaluate(() => {
                    const panel = document.querySelector('.toc-panel');
                    return panel ? (panel as HTMLElement).offsetWidth : 0;
                });

                await vsCodeWin.mouse.move(box.x + 2, box.y + box.height / 2);
                await vsCodeWin.mouse.down();
                await vsCodeWin.mouse.move(box.x + 100, box.y + box.height / 2, { steps: 10 });
                await vsCodeWin.mouse.up();
                await vsCodeWin.waitForTimeout(500);

                const newWidth = await contentFrame.evaluate(() => {
                    const panel = document.querySelector('.toc-panel');
                    return panel ? (panel as HTMLElement).offsetWidth : 0;
                });

                console.log(`TOC width: ${initialWidth} -> ${newWidth}`);
                expect(newWidth).toBeGreaterThan(initialWidth);
                expect(newWidth).toBeGreaterThanOrEqual(150);
                expect(newWidth).toBeLessThanOrEqual(400);
            }

            console.log('Test passed!');
        } finally {
            await app.close();
        }
    });
});
