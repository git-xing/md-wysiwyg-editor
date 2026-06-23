import { test as base, expect, ElectronApplication, Page, Frame } from '@playwright/test';
import { launchVSCode, findContentFrame, LaunchOptions } from '../helpers/vscode';

export interface VSCodeFixtures {
    vsCodeWin: Page;
    contentFrame: Frame;
}

export interface VSCodeTestOptions {
    fileName: string;
}

let electronApp: ElectronApplication | null = null;
let vsCodeWin: Page | null = null;
let contentFrame: Frame | null = null;
let currentFileName: string | null = null;

export const test = base.extend<VSCodeFixtures & VSCodeTestOptions>({
    fileName: ['sample.md', { option: true }],

    vsCodeWin: async ({ fileName }, use) => {
        if (!vsCodeWin || currentFileName !== fileName) {
            if (electronApp) {
                await electronApp.close();
                electronApp = null;
                vsCodeWin = null;
                contentFrame = null;
            }
            const result = await launchVSCode({ fileName });
            electronApp = result.app;
            vsCodeWin = result.win;
            currentFileName = fileName;
        }
        await use(vsCodeWin);
    },

    contentFrame: async ({ vsCodeWin }, use) => {
        if (!contentFrame) {
            contentFrame = await findContentFrame(vsCodeWin);
        }
        await use(contentFrame);
    },
});

test.afterAll(async () => {
    if (electronApp) {
        await electronApp.close();
        electronApp = null;
        vsCodeWin = null;
        contentFrame = null;
        currentFileName = null;
    }
});

export { expect };
