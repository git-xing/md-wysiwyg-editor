import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
    {
        extends: "./vitest.config.ts",
        test: {
            name: "extension",
            environment: "node",
            include: ["src/__tests__/**/*.test.ts", "shared/__tests__/**/*.test.ts"],
        },
    },
    {
        extends: "./vitest.config.ts",
        test: {
            name: "webview",
            environment: "jsdom",
            include: ["webview/__tests__/**/*.test.ts"],
            setupFiles: ["./webview/__tests__/setup.ts"],
        },
    },
]);
