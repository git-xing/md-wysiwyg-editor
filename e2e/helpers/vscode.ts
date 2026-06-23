import { _electron as electron, ElectronApplication, Page, Frame } from '@playwright/test';
import { downloadAndUnzipVSCode } from '@vscode/test-electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

let electronBinary: string;

export async function downloadVSCodeBinary(): Promise<string> {
    if (!electronBinary) {
        electronBinary = await downloadAndUnzipVSCode('stable');
    }
    return electronBinary;
}

export interface LaunchOptions {
    workspacePath?: string;
    fileName?: string;
}

export async function launchVSCode(options: LaunchOptions = {}): Promise<{ app: ElectronApplication; win: Page }> {
    const binary = await downloadVSCodeBinary();

    const timestamp = Date.now();
    const testWorkspace = path.join(os.tmpdir(), `vscode-e2e-${timestamp}`);
    fs.mkdirSync(testWorkspace, { recursive: true });

    const userDataDir = path.join(testWorkspace, 'user-data');
    fs.mkdirSync(userDataDir, { recursive: true });

    const workspacePath = options.workspacePath || path.resolve(__dirname, '..', '..', 'test');

    const app = await electron.launch({
        executablePath: binary,
        args: [
            "--disable-gpu",
            "--no-sandbox",
            "--new-window",
            `--user-data-dir=${userDataDir}`,
            "--disable-extensions",
            "--extensionDevelopmentPath",
            process.cwd(),
            workspacePath,
        ],
    });

    const win = await app.firstWindow();
    await win.waitForLoadState('domcontentloaded');
    await win.waitForTimeout(3000);

    // 关闭 GitHub Copilot 登录弹框
    try {
        const continueBtn = win.locator(".onboarding-a-close-btn");
        await continueBtn.waitFor({ timeout: 5000 });
        await continueBtn.click();
        await win.waitForTimeout(1000);
        const continueBtn2 = win.locator(".codicon-dialog-close");
        await continueBtn2.waitFor({ timeout: 5000 });
        await continueBtn2.click();
    } catch {
        // 弹框不存在，继续
    }

    // 打开测试文件
    if (options.fileName) {
        await win.keyboard.press("Meta+P");
        await win.waitForTimeout(1500);
        await win.keyboard.type(options.fileName, { delay: 50 });
        await win.waitForTimeout(1000);
        await win.keyboard.press("Enter");
    }

    // 用快捷键切换到预览模式
    await win.keyboard.press('Meta+Shift+M');
    await win.waitForTimeout(3000);

    return { app, win };
}

export async function findContentFrame(win: Page): Promise<Frame> {
    await win.waitForTimeout(3000);

    const allFrames = win.frames();

    for (const frame of allFrames) {
        const url = frame.url();
        if (url.includes('vscode-webview')) {
            const childFrames = frame.childFrames();
            const checkFrame = childFrames.length > 0 ? childFrames[0] : frame;
            const hasToc = await checkFrame.evaluate(() => {
                return !!document.querySelector('.toc-panel') || !!document.querySelector('.toc-toggle-tab');
            }).catch(() => false);
            if (hasToc) return checkFrame;
        }
    }

    throw new Error('Could not find extension webview frame');
}
