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
        const emptyExtDir = path.join(testWorkspace, 'empty-ext');
        fs.mkdirSync(userDataDir, { recursive: true });
        fs.mkdirSync(emptyExtDir, { recursive: true });

        const electronBinary = await downloadAndUnzipVSCode('stable');

        // 2. 启动 VS Code，用空扩展目录只加载我们的扩展
        app = await electron.launch({
            executablePath: electronBinary,
            args: [
                '--disable-gpu',
                '--no-sandbox',
                '--new-window',
                `--user-data-dir=${userDataDir}`,
                `--extensions-dir=${emptyExtDir}`,
                `--extensionDevelopmentPath=${path.resolve(__dirname, '..')}`,
                testFile,
            ],
        });

        try {
            const vsCodeWin = await app.firstWindow();
            await vsCodeWin.waitForLoadState('domcontentloaded');
            await vsCodeWin.waitForTimeout(8000);

            // 3. 关闭 GitHub Copilot 登录弹框
            try {
                const continueBtn = vsCodeWin.locator('text=Continue without Signing In');
                await continueBtn.waitFor({ timeout: 5000 });
                await continueBtn.click();
                await vsCodeWin.waitForTimeout(2000);
            } catch {
                // 没有弹框，继续
            }

            // 4. 等待扩展自动切换到 WYSIWYG
            await vsCodeWin.waitForTimeout(8000);

            // 5. 检查是否有 webview
            const hasIframe = await vsCodeWin.evaluate(() => {
                return document.querySelectorAll('iframe').length > 0;
            });
            console.log('Has iframe:', hasIframe);

            if (!hasIframe) {
                // 尝试通过命令面板切换
                await vsCodeWin.keyboard.press('F1');
                await vsCodeWin.waitForTimeout(1000);
                await vsCodeWin.keyboard.type('switchToPreview', { delay: 50 });
                await vsCodeWin.waitForTimeout(1000);
                await vsCodeWin.keyboard.press('Enter');
                await vsCodeWin.waitForTimeout(8000);
            }

            // 6. 定位 webview iframe - 用 frameLocator 定位元素，用 frame 获取 Frame 对象
            const webviewLocator = vsCodeWin.frameLocator('iframe').first();
            const webviewFrame = vsCodeWin.frames().find(f => f.url().includes('vscode-webview'));

            if (webviewFrame) {
                // 检查嵌套 iframe
                const nestedInfo = await webviewFrame.evaluate(() => {
                    const iframes = document.querySelectorAll('iframe');
                    return {
                        iframeCount: iframes.length,
                        iframeSrcs: Array.from(iframes).map(f => f.src?.substring(0, 100)),
                        bodyHTML: document.body?.innerHTML?.substring(0, 300) ?? '',
                    };
                });
                console.log('Nested iframes:', nestedInfo);

                // 如果有嵌套 iframe，尝试访问
                if (nestedInfo.iframeCount > 0) {
                    const nestedFrame = webviewFrame.childFrames()[0];
                    if (nestedFrame) {
                        const nestedContent = await nestedFrame.evaluate(() => ({
                            hasTocPanel: !!document.querySelector('.toc-panel'),
                            hasTocTab: !!document.querySelector('.toc-toggle-tab'),
                            hasResizeHandle: !!document.querySelector('.toc-resize-handle'),
                            bodyHTML: document.body?.innerHTML?.substring(0, 300) ?? '',
                        }));
                        console.log('Nested frame content:', nestedContent);
                    }
                }
            }

            // 7. 等待 TOC 拖拽手柄出现
            const resizeHandle = webviewLocator.locator('.toc-resize-handle');
            await expect(resizeHandle).toBeVisible({ timeout: 10000 });

            // 8. 验证 cursor 样式
            const cursor = await resizeHandle.evaluate(el =>
                getComputedStyle(el).cursor
            );
            expect(cursor).toBe('col-resize');

            // 9. 获取初始宽度
            const tocPanel = webviewFrame.locator('.toc-panel');
            const initialWidth = await tocPanel.evaluate(el => el.offsetWidth);
            console.log('Initial TOC width:', initialWidth);

            // 10. 拖拽调整宽度
            const box = await resizeHandle.boundingBox();
            if (box) {
                await vsCodeWin.mouse.move(box.x + 2, box.y + box.height / 2);
                await vsCodeWin.mouse.down();
                await vsCodeWin.mouse.move(box.x + 100, box.y + box.height / 2, { steps: 10 });
                await vsCodeWin.mouse.up();
                await vsCodeWin.waitForTimeout(500);
            }

            // 11. 验证宽度变化
            const newWidth = await tocPanel.evaluate(el => el.offsetWidth);
            console.log(`TOC width: ${initialWidth} -> ${newWidth}`);
            expect(newWidth).toBeGreaterThan(initialWidth);

            // 12. 验证宽度限制
            expect(newWidth).toBeGreaterThanOrEqual(150);
            expect(newWidth).toBeLessThanOrEqual(400);

            console.log('Test passed!');
        } finally {
            await app.close();
        }
    });
});
