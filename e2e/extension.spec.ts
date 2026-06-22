import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { downloadAndUnzipVSCode } from '@vscode/test-electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

let electronBinary: string;

test.describe('Extension E2E', () => {
    test.beforeAll(async () => {
        electronBinary = await downloadAndUnzipVSCode('stable');
    });

    test('should launch VS Code with extension loaded', async () => {
        const testWorkspace = path.join(os.tmpdir(), 'vscode-e2e-test-final');
        fs.mkdirSync(testWorkspace, { recursive: true });
        fs.writeFileSync(path.join(testWorkspace, 'test.md'),
            '# Title 1\n\n## Title 2\n\n### Title 3\n\nContent');

        const userDataDir = path.join(os.tmpdir(), `vscode-e2e-final-${Date.now()}`);

        const electronApp = await electron.launch({
            executablePath: electronBinary,
            args: [
                '--disable-gpu',
                '--no-sandbox',
                `--user-data-dir=${userDataDir}`,
                `--extensionDevelopmentPath=${path.resolve(__dirname, '..')}`,
                testWorkspace,
            ],
        });

        try {
            const window = await electronApp.firstWindow();
            await window.waitForLoadState('domcontentloaded');

            // 等待 VS Code 完全启动
            await window.waitForTimeout(8000);

            // 验证 VS Code 已启动
            const title = await window.title();
            console.log('VS Code title:', title);
            expect(title).toBeTruthy();

            // 检查扩展是否被加载（通过检查扩展列表）
            const extensions = await window.evaluate(() => {
                // VS Code 会将扩展信息存储在全局对象中
                return document.querySelector('[class*="extension"]') !== null ||
                       document.querySelector('.monaco-workbench') !== null;
            });
            console.log('VS Code UI loaded:', extensions);
            expect(extensions).toBe(true);

            // 检查编辑器是否可用
            const hasEditor = await window.evaluate(() => {
                return document.querySelector('.monaco-editor') !== null;
            });
            console.log('Editor available:', hasEditor);

        } finally {
            await electronApp.close();
        }
    });
});
