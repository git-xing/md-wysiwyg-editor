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

    test('should launch VS Code and show editor', async () => {
        const extensionPath = path.resolve(__dirname, '..');
        const testWorkspace = path.join(os.tmpdir(), 'vscode-e2e-test');
        if (!fs.existsSync(testWorkspace)) {
            fs.mkdirSync(testWorkspace, { recursive: true });
        }

        const testFile = path.join(testWorkspace, 'test.md');
        fs.writeFileSync(testFile, '# Test\n\nHello World');

        const userDataDir = path.join(os.tmpdir(), 'vscode-e2e-user-data');
        if (!fs.existsSync(userDataDir)) {
            fs.mkdirSync(userDataDir, { recursive: true });
        }

        const electronApp = await electron.launch({
            executablePath: electronBinary,
            args: [
                '--disable-gpu',
                '--no-sandbox',
                `--user-data-dir=${userDataDir}`,
                `--extensionDevelopmentPath=${extensionPath}`,
                testWorkspace,
            ],
        });

        try {
            const window = await electronApp.firstWindow();
            await window.waitForLoadState('domcontentloaded');
            await window.waitForTimeout(5000);

            const title = await window.title();
            console.log('Window title:', title);
            expect(title).toContain('vscode-e2e-test');

            const editor = window.locator('.monaco-editor .view-lines');
            await expect(editor).toBeVisible({ timeout: 30000 });
        } finally {
            await electronApp.close();
        }
    });
});
