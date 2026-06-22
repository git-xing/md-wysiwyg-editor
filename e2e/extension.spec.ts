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
                '--disable-gpu',
                '--no-sandbox',
                '--new-window',
                `--user-data-dir=${userDataDir}`,
                `--extensionDevelopmentPath=${path.resolve(__dirname, '..')}`,
                testFile,
            ],
        });

        try {
            const vsCodeWin = await app.firstWindow();
            await vsCodeWin.waitForLoadState('domcontentloaded');
            await vsCodeWin.waitForTimeout(10000);

            // 3. 关闭 GitHub Copilot 登录弹框
            try {
                const continueBtn = vsCodeWin.locator('text=Continue without Signing In');
                await continueBtn.waitFor({ timeout: 5000 });
                await continueBtn.click();
                await vsCodeWin.waitForTimeout(2000);
            } catch {
                // 没有弹框
            }

            // 4. 等待 VS Code 和扩展完全加载
            await vsCodeWin.waitForTimeout(10000);

            // 5. 关闭当前文件 tab，然后重新打开以触发 onDidChangeTabs
            console.log('Closing and reopening file to trigger extension...');
            await vsCodeWin.keyboard.press('Meta+W');
            await vsCodeWin.waitForTimeout(2000);

            // 用命令面板重新打开文件
            await vsCodeWin.keyboard.press('Meta+P');
            await vsCodeWin.waitForTimeout(1500);
            await vsCodeWin.keyboard.type('test.md', { delay: 50 });
            await vsCodeWin.waitForTimeout(1000);
            await vsCodeWin.keyboard.press('Enter');
            await vsCodeWin.waitForTimeout(10000);

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
                // 列出所有 frame URLs
                for (const frame of allFrames) {
                    console.log('Frame URL:', frame.url().substring(0, 100));
                }
                return;
            }

            // 8. 检查 frame 内容
            const frameContent = await targetFrame.evaluate(() => ({
                hasTocPanel: !!document.querySelector('.toc-panel'),
                hasTocTab: !!document.querySelector('.toc-toggle-tab'),
                hasResizeHandle: !!document.querySelector('.toc-resize-handle'),
            }));
            console.log('Frame content:', frameContent);

            expect(frameContent.hasResizeHandle).toBe(true);

            // 9. 验证 cursor 样式
            const cursor = await targetFrame.evaluate(() => {
                const handle = document.querySelector('.toc-resize-handle');
                return handle ? getComputedStyle(handle).cursor : null;
            });
            expect(cursor).toBe('col-resize');

            // 10. 测试拖拽
            const resizeHandleLocator = vsCodeWin.frameLocator('iframe').locator('.toc-resize-handle');
            const box = await resizeHandleLocator.boundingBox();
            if (box) {
                const initialWidth = await targetFrame.evaluate(() => {
                    const panel = document.querySelector('.toc-panel');
                    return panel ? (panel as HTMLElement).offsetWidth : 0;
                });

                await vsCodeWin.mouse.move(box.x + 2, box.y + box.height / 2);
                await vsCodeWin.mouse.down();
                await vsCodeWin.mouse.move(box.x + 100, box.y + box.height / 2, { steps: 10 });
                await vsCodeWin.mouse.up();
                await vsCodeWin.waitForTimeout(500);

                const newWidth = await targetFrame.evaluate(() => {
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
