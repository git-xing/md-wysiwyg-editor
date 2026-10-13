import { describe, it, expect, beforeEach, vi } from "vitest";
import * as vscode from "vscode";
import { getThemeColors } from "../../src/themeManager";

function mockThemeFile(json: object): void {
    vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(
        new TextEncoder().encode(JSON.stringify(json)),
    );
}

describe("getThemeColors", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("浅色主题未定义 lineHighlightBackground 时 应该 提供默认值以覆盖 VSCode 深色值", async () => {
        // Arrange
        mockThemeFile({ type: "light", colors: { "editor.background": "#FFFFFF" } });

        // Act
        const colors = await getThemeColors("/themes/light.json");

        // Assert
        expect(colors["--vscode-editor-lineHighlightBackground"]).toBe(
            "rgba(128, 128, 128, 0.04)",
        );
    });

    it("主题定义了 lineHighlightBackground 时 应该 保留主题值", async () => {
        // Arrange
        mockThemeFile({
            type: "dark",
            colors: { "editor.lineHighlightBackground": "#242526" },
        });

        // Act
        const colors = await getThemeColors("/themes/dark.json");

        // Assert
        expect(colors["--vscode-editor-lineHighlightBackground"]).toBe("#242526");
    });
});
