import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";

const themeMocks = vi.hoisted(() => ({
    getAllThemes: vi.fn(),
    getThemeColors: vi.fn(),
    getAutoThemeColors: vi.fn(),
    getCustomThemes: vi.fn(),
}));

vi.mock("../themeManager", () => themeMocks);

import { MarkdownEditorProvider } from "../MarkdownEditorProvider";

const staleTheme = {
    id: "github-dark-default",
    label: "GitHub Dark Default",
    uiTheme: "vs-dark",
    path: "/themes/github-dark.json",
    extensionId: "github.github-vscode-theme",
};

const staleThemeColors = {
    "--vscode-editor-background": "#0d1117",
    "--vscode-editor-foreground": "#e6edf3",
};

function configureTheme(themeId: string): void {
    vi.mocked(vscode.workspace.getConfiguration).mockImplementation(
        (section?: string) =>
            ({
                get: vi.fn((key: string, defaultValue?: unknown) => {
                    if (
                        section === "markdownWysiwyg" &&
                        key === "colorTheme"
                    ) {
                        return themeId;
                    }
                    if (
                        section === undefined &&
                        key === "workbench.colorTheme"
                    ) {
                        return staleTheme.label;
                    }
                    return defaultValue;
                }),
            }) as unknown as vscode.WorkspaceConfiguration,
    );
}

function createProvider(): MarkdownEditorProvider {
    return new MarkdownEditorProvider(
        {} as vscode.ExtensionContext,
        new Set<vscode.Terminal>(),
    );
}

describe("MarkdownEditorProvider 主题应用", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        themeMocks.getAllThemes.mockReturnValue([staleTheme]);
        themeMocks.getThemeColors.mockResolvedValue(staleThemeColors);
        themeMocks.getAutoThemeColors.mockReturnValue({});
        themeMocks.getCustomThemes.mockReturnValue([]);
    });

    it("auto 与过时的 workbench.colorTheme 并存 应该清除主题覆盖", async () => {
        configureTheme("auto");
        const provider = createProvider();
        const postToAll = vi.spyOn(provider, "postToAll");

        await provider.applyThemeToAll();

        expect(postToAll).toHaveBeenCalledWith({
            type: "setTheme",
            colors: {},
        });
        expect(themeMocks.getAllThemes).not.toHaveBeenCalled();
        expect(themeMocks.getThemeColors).not.toHaveBeenCalled();
    });

    it("显式主题 ID 应该继续加载对应主题颜色", async () => {
        configureTheme(staleTheme.id);
        const provider = createProvider();
        const postToAll = vi.spyOn(provider, "postToAll");

        await provider.applyThemeToAll();

        expect(themeMocks.getAllThemes).toHaveBeenCalledOnce();
        expect(themeMocks.getThemeColors).toHaveBeenCalledWith(
            staleTheme.path,
        );
        expect(postToAll).toHaveBeenCalledWith({
            type: "setTheme",
            colors: staleThemeColors,
        });
    });
});
