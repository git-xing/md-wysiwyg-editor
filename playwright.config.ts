import { defineConfig } from '@playwright/test';
import path from 'path';

export default defineConfig({
    testDir: path.join(__dirname, 'e2e'),
    testMatch: '**/*.spec.ts',
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: 0,
    workers: 1,
    reporter: 'list',
    timeout: 120000,
    use: {
        trace: 'on-first-retry',
    },
    projects: [
        {
            name: 'electron',
            use: { headless: false },
        },
    ],
});
