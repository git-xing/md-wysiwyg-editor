import * as path from "path";
import * as vscode from "vscode";

export interface ThemeInfo {
    id: string;
    label: string;
    uiTheme: string;
    path: string;
    extensionId: string;
}

export interface ThemeColors {
    [key: string]: string;
}

/** 自定义主题接口 */
export interface CustomTheme {
    name: string;
    colors: Record<string, string>;
}

/** 获取用户自定义主题 */
export function getCustomThemes(): CustomTheme[] {
    const config = vscode.workspace.getConfiguration("markdownWysiwyg");
    return config.get<CustomTheme[]>("customThemes", []);
}

// 解析颜色字符串为 RGB 值
function parseColor(color: string): { r: number; g: number; b: number; a: number } | null {
    if (!color) return null;
    color = color.trim();
    
    // 处理 rgba(r, g, b, a) 格式
    const rgbaMatch = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/);
    if (rgbaMatch) {
        return {
            r: parseInt(rgbaMatch[1]),
            g: parseInt(rgbaMatch[2]),
            b: parseInt(rgbaMatch[3]),
            a: rgbaMatch[4] ? parseFloat(rgbaMatch[4]) : 1,
        };
    }
    
    // 处理 #RRGGBB 格式
    const hexMatch = color.match(/^#([0-9a-f]{6})$/i);
    if (hexMatch) {
        const hex = hexMatch[1];
        return {
            r: parseInt(hex.slice(0, 2), 16),
            g: parseInt(hex.slice(2, 4), 16),
            b: parseInt(hex.slice(4, 6), 16),
            a: 1,
        };
    }
    
    // 处理 #RGB 格式
    const hexShortMatch = color.match(/^#([0-9a-f]{3})$/i);
    if (hexShortMatch) {
        const hex = hexShortMatch[1];
        return {
            r: parseInt(hex[0] + hex[0], 16),
            g: parseInt(hex[1] + hex[1], 16),
            b: parseInt(hex[2] + hex[2], 16),
            a: 1,
        };
    }
    
    return null;
}

// 检测两个颜色是否相似（差异太小）
function colorsAreSimilar(color1: string, color2: string): boolean {
    const c1 = parseColor(color1);
    const c2 = parseColor(color2);
    
    if (!c1 || !c2) return false;
    
    // 计算颜色差异（加权欧氏距离）
    const dr = c1.r - c2.r;
    const dg = c1.g - c2.g;
    const db = c1.b - c2.b;
    const distance = Math.sqrt(dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11);
    
    // 如果差异小于 30，认为颜色太接近
    return distance < 30;
}

const THEME_COLOR_KEYS = [
    "editor.background",
    "editor.foreground",
    "editor.lineHighlightBackground",
    "editor.selectionBackground",
    "editor.inactiveSelectionBackground",
    "editorCursor.foreground",
    "editorWhitespace.foreground",
    "editorIndentGuide.background",
    "editorIndentGuide.activeBackground",
    "editorLineNumber.foreground",
    "editorLineNumber.activeForeground",
    "editorBracketMatch.background",
    "editorBracketMatch.border",
    "editor.findMatchBackground",
    "editor.findMatchHighlightBackground",
    "editorSuggestWidget.background",
    "editorSuggestWidget.border",
    "editorSuggestWidget.foreground",
    "editorSuggestWidget.highlightForeground",
    "editorSuggestWidget.selectedBackground",
    "editorHoverWidget.background",
    "editorHoverWidget.border",
    "editorHoverWidget.foreground",
    "textBlockQuote.background",
    "textBlockQuote.border",
    "textCodeBlock.background",
    "textLink.foreground",
    "textLink.activeForeground",
    "textPreformat.foreground",
    "textSeparator.foreground",
    "titleBar.activeBackground",
    "titleBar.activeForeground",
    "titleBar.inactiveBackground",
    "titleBar.inactiveForeground",
    "titleBar.border",
    "activityBar.background",
    "activityBar.foreground",
    "activityBar.inactiveForeground",
    "activityBar.border",
    "activityBarBadge.background",
    "activityBarBadge.foreground",
    "sideBar.background",
    "sideBar.foreground",
    "sideBar.border",
    "sideBarTitle.foreground",
    "sideBarSectionHeader.background",
    "sideBarSectionHeader.foreground",
    "sideBarSectionHeader.border",
    "list.activeSelectionBackground",
    "list.activeSelectionForeground",
    "list.inactiveSelectionBackground",
    "list.inactiveSelectionForeground",
    "list.hoverBackground",
    "list.hoverForeground",
    "list.focusBackground",
    "list.focusForeground",
    "list.highlightForeground",
    "list.errorForeground",
    "list.warningForeground",
    "input.background",
    "input.foreground",
    "input.border",
    "input.placeholderForeground",
    "inputOption.activeBorder",
    "inputValidation.errorBackground",
    "inputValidation.errorBorder",
    "inputValidation.warningBackground",
    "inputValidation.warningBorder",
    "dropdown.background",
    "dropdown.foreground",
    "dropdown.border",
    "button.background",
    "button.foreground",
    "button.hoverBackground",
    "button.secondaryBackground",
    "button.secondaryForeground",
    "button.secondaryHoverBackground",
    "badge.background",
    "badge.foreground",
    "scrollbar.shadow",
    "scrollbarSlider.background",
    "scrollbarSlider.hoverBackground",
    "scrollbarSlider.activeBackground",
    "progressBar.background",
    "panel.background",
    "panel.border",
    "panelTitle.activeBorder",
    "panelTitle.activeForeground",
    "panelTitle.inactiveForeground",
    "statusBar.background",
    "statusBar.foreground",
    "statusBar.border",
    "statusBar.debuggingBackground",
    "statusBar.debuggingForeground",
    "statusBar.noFolderBackground",
    "statusBar.noFolderForeground",
    "statusBarItem.activeBackground",
    "statusBarItem.hoverBackground",
    "statusBarItem.prominentBackground",
    "statusBarItem.prominentHoverBackground",
    "tab.activeBackground",
    "tab.activeForeground",
    "tab.activeBorder",
    "tab.activeBorderTop",
    "tab.inactiveBackground",
    "tab.inactiveForeground",
    "tab.inactiveModifiedBorder",
    "tab.border",
    "tab.hoverBackground",
    "tab.hoverBorder",
    "editorGroupHeader.tabsBackground",
    "editorGroupHeader.tabsBorder",
    "editorGroupHeader.noTabsBackground",
    "editorGroup.border",
    "terminal.background",
    "terminal.foreground",
    "terminal.ansiBlack",
    "terminal.ansiRed",
    "terminal.ansiGreen",
    "terminal.ansiYellow",
    "terminal.ansiBlue",
    "terminal.ansiMagenta",
    "terminal.ansiCyan",
    "terminal.ansiWhite",
    "terminal.ansiBrightBlack",
    "terminal.ansiBrightRed",
    "terminal.ansiBrightGreen",
    "terminal.ansiBrightYellow",
    "terminal.ansiBrightBlue",
    "terminal.ansiBrightMagenta",
    "terminal.ansiBrightCyan",
    "terminal.ansiBrightWhite",
    "notifications.background",
    "notifications.foreground",
    "notifications.border",
    "notificationLink.foreground",
    "gitDecoration.modifiedResourceForeground",
    "gitDecoration.deletedResourceForeground",
    "gitDecoration.untrackedResourceForeground",
    "gitDecoration.ignoredResourceForeground",
    "gitDecoration.conflictingResourceForeground",
    "gitDecoration.addedResourceForeground",
    "gitDecoration.submoduleResourceForeground",
    "debugToolBar.background",
    "debugToolBar.border",
    "debugExceptionWidget.background",
    "debugExceptionWidget.border",
    "editorWidget.background",
    "editorWidget.foreground",
    "editorWidget.border",
    "editorWidget.resizeBorder",
    "peekView.border",
    "peekViewEditor.background",
    "peekViewEditor.matchHighlightBackground",
    "peekViewResult.background",
    "peekViewResult.fileForeground",
    "peekViewResult.lineForeground",
    "peekViewResult.matchHighlightBackground",
    "peekViewResult.selectionBackground",
    "peekViewResult.selectionForeground",
    "peekViewTitle.background",
    "peekViewTitleDescription.foreground",
    "peekViewTitleLabel.foreground",
    "menu.background",
    "menu.foreground",
    "menu.selectionBackground",
    "menu.selectionForeground",
    "menu.border",
    "menubar.selectionBackground",
    "menubar.selectionForeground",
    "menubar.selectionBorder",
    "minimap.background",
    "minimap.selectionHighlight",
    "minimap.findMatchHighlight",
    "minimapSlider.background",
    "minimapSlider.hoverBackground",
    "minimapSlider.activeBackground",
    "checkbox.background",
    "checkbox.foreground",
    "checkbox.border",
    "breadcrumb.foreground",
    "breadcrumb.focusForeground",
    "breadcrumb.activeSelectionForeground",
    "breadcrumbPicker.background",
];

export function getAllThemes(): ThemeInfo[] {
    const seen = new Set<string>();
    const themes: ThemeInfo[] = [];

    for (const ext of vscode.extensions.all) {
        const contributes = ext.packageJSON?.contributes;
        if (!contributes?.themes) continue;

        for (const theme of contributes.themes) {
            const key = `${theme.label}|${theme.uiTheme}`;
            if (seen.has(key)) continue;
            seen.add(key);

            themes.push({
                id: theme.id || theme.label,
                label: theme.label,
                uiTheme: theme.uiTheme || "vs-dark",
                path: path.join(ext.extensionPath, theme.path),
                extensionId: ext.id,
            });
        }
    }

    return themes.sort((a, b) => a.label.localeCompare(b.label));
}

export async function getThemeColors(themePath: string): Promise<ThemeColors> {
    try {
        const uri = vscode.Uri.file(themePath);
        const content = await vscode.workspace.fs.readFile(uri);
        const text = new TextDecoder().decode(content);
        const themeJson = JSON.parse(text);

        const colors: ThemeColors = {};

        // 先提取主题文件中定义的所有颜色
        if (themeJson.colors) {
            for (const [key, value] of Object.entries(themeJson.colors)) {
                if (typeof value === "string") {
                    colors[`--vscode-${key.replace(/\./g, "-")}`] = value;
                }
            }
        }

        // 确保 THEME_COLOR_KEYS 中的所有颜色都被包含
        // 如果主题文件中没有定义，使用默认值
        const isLight = themeJson.type === "light" || themeJson.type === "vs";
        const defaults: Record<string, string> = {
            "editor.background": isLight ? "#ffffff" : "#1e1e1e",
            "editor.foreground": isLight ? "#333333" : "#d4d4d4",
            // 内置浅色主题（Light Modern / Light+）未定义此项；若不提供，表格偶数行会沿用 VSCode 当前深色主题的值
            "editor.lineHighlightBackground": "rgba(128, 128, 128, 0.04)",
            "checkbox.background": isLight ? "#ffffff" : "#3c3c3c",
            "checkbox.foreground": isLight ? "#333333" : "#cccccc",
            "checkbox.border": isLight ? "#919191" : "#3c3c3c",
            "textBlockQuote.background": isLight ? "rgba(0, 0, 0, 0.05)" : "rgba(128, 128, 128, 0.1)",
            "textBlockQuote.border": isLight ? "#007acc" : "#007acc",
            "textCodeBlock.background": isLight ? "rgba(0, 0, 0, 0.05)" : "rgba(128, 128, 128, 0.1)",
            "toolbar.hoverBackground": isLight ? "rgba(0, 0, 0, 0.1)" : "rgba(128, 128, 128, 0.2)",
            "toolbar.activeBackground": isLight ? "rgba(0, 0, 0, 0.15)" : "rgba(128, 128, 128, 0.3)",
            "panel.border": isLight ? "#e0e0e0" : "#3c3c3c",
            "descriptionForeground": isLight ? "#717171" : "#a9a9a9",
            "errorForeground": isLight ? "#a1260d" : "#f48771",
            "editorLineNumber.foreground": isLight ? "#237893" : "#858585",
            "editorLineNumber.activeForeground": isLight ? "#333333" : "#c6c6c6",
            "editor.selectionBackground": isLight ? "rgba(0, 0, 0, 0.1)" : "rgba(255, 255, 255, 0.1)",
            "editor.inactiveSelectionBackground": isLight ? "rgba(0, 0, 0, 0.05)" : "rgba(255, 255, 255, 0.05)",
            "editorCursor.foreground": isLight ? "#333333" : "#d4d4d4",
            "editorWhitespace.foreground": isLight ? "rgba(0, 0, 0, 0.1)" : "rgba(255, 255, 255, 0.1)",
            "editorIndentGuide.background": isLight ? "rgba(0, 0, 0, 0.1)" : "rgba(255, 255, 255, 0.1)",
            "editorIndentGuide.activeBackground": isLight ? "rgba(0, 0, 0, 0.2)" : "rgba(255, 255, 255, 0.2)",
            "input.background": isLight ? "#ffffff" : "#3c3c3c",
            "input.foreground": isLight ? "#333333" : "#cccccc",
            "input.border": isLight ? "#cecece" : "#3c3c3c",
            "input.placeholderForeground": isLight ? "#999999" : "#a9a9a9",
            "dropdown.background": isLight ? "#ffffff" : "#3c3c3c",
            "dropdown.foreground": isLight ? "#333333" : "#cccccc",
            "dropdown.border": isLight ? "#cecece" : "#3c3c3c",
            "button.background": isLight ? "#007acc" : "#0e639c",
            "button.foreground": isLight ? "#ffffff" : "#ffffff",
            "button.hoverBackground": isLight ? "#0069b3" : "#1177bb",
            "list.activeSelectionBackground": isLight ? "rgba(0, 0, 0, 0.1)" : "rgba(255, 255, 255, 0.1)",
            "list.activeSelectionForeground": isLight ? "#333333" : "#ffffff",
            "list.hoverBackground": isLight ? "rgba(0, 0, 0, 0.05)" : "rgba(255, 255, 255, 0.05)",
            "list.hoverForeground": isLight ? "#333333" : "#ffffff",
            "statusBar.background": isLight ? "#007acc" : "#0e639c",
            "statusBar.foreground": isLight ? "#ffffff" : "#ffffff",
            "statusBar.border": isLight ? "#007acc" : "#0e639c",
            "tab.activeBackground": isLight ? "#ffffff" : "#1e1e1e",
            "tab.activeForeground": isLight ? "#333333" : "#ffffff",
            "tab.inactiveBackground": isLight ? "#ececec" : "#2d2d2d",
            "tab.inactiveForeground": isLight ? "#717171" : "#a9a9a9",
            "tab.border": isLight ? "#e0e0e0" : "#252526",
            "terminal.background": isLight ? "#ffffff" : "#1e1e1e",
            "terminal.foreground": isLight ? "#333333" : "#cccccc",
            "terminal.ansiBlack": isLight ? "#000000" : "#000000",
            "terminal.ansiRed": isLight ? "#cd3131" : "#f44747",
            "terminal.ansiGreen": isLight ? "#00bc00" : "#6a9955",
            "terminal.ansiYellow": isLight ? "#949800" : "#d7ba7d",
            "terminal.ansiBlue": isLight ? "#0451a5" : "#569cd6",
            "terminal.ansiMagenta": isLight ? "#bc05bc" : "#d16d9e",
            "terminal.ansiCyan": isLight ? "#0598bc" : "#56b6c2",
            "terminal.ansiWhite": isLight ? "#555555" : "#d4d4d4",
            "terminal.ansiBrightBlack": isLight ? "#666666" : "#808080",
            "terminal.ansiBrightRed": isLight ? "#cd3131" : "#f44747",
            "terminal.ansiBrightGreen": isLight ? "#14ce14" : "#6a9955",
            "terminal.ansiBrightYellow": isLight ? "#b5ba00" : "#d7ba7d",
            "terminal.ansiBrightBlue": isLight ? "#0451a5" : "#569cd6",
            "terminal.ansiBrightMagenta": isLight ? "#bc05bc" : "#d16d9e",
            "terminal.ansiBrightCyan": isLight ? "#0598bc" : "#56b6c2",
            "terminal.ansiBrightWhite": isLight ? "#a5a5a5" : "#d4d4d4",
            "menu.background": isLight ? "#ffffff" : "#252526",
            "menu.foreground": isLight ? "#333333" : "#cccccc",
            "menu.selectionBackground": isLight ? "rgba(0, 0, 0, 0.1)" : "rgba(255, 255, 255, 0.1)",
            "menu.selectionForeground": isLight ? "#333333" : "#ffffff",
            "menu.border": isLight ? "#e0e0e0" : "#454545",
            "notifications.background": isLight ? "#ffffff" : "#252526",
            "notifications.foreground": isLight ? "#333333" : "#cccccc",
            "notifications.border": isLight ? "#e0e0e0" : "#454545",
            "notificationLink.foreground": isLight ? "#007acc" : "#3794ff",
        };

        for (const key of THEME_COLOR_KEYS) {
            const cssVar = `--vscode-${key.replace(/\./g, "-")}`;
            if (!colors[cssVar]) {
                const defaultVal = defaults[key];
                if (defaultVal) {
                    colors[cssVar] = defaultVal;
                }
            }
        }

        // 检测选中背景色是否与背景色太接近，如果是则使用备用颜色
        const bgVar = "--vscode-editor-background";
        const selVar = "--vscode-editor-selectionBackground";
        const inactiveSelVar = "--vscode-editor-inactiveSelectionBackground";
        
        if (colors[bgVar] && colors[selVar]) {
            if (colorsAreSimilar(colors[bgVar], colors[selVar])) {
                // 使用明显的蓝色作为备用选中颜色
                colors[selVar] = isLight ? "rgba(0, 120, 215, 0.3)" : "rgba(38, 79, 120, 0.6)";
                if (colors[inactiveSelVar]) {
                    colors[inactiveSelVar] = isLight ? "rgba(0, 120, 215, 0.15)" : "rgba(38, 79, 120, 0.4)";
                }
            }
        }

        return colors;
    } catch (e) {
        console.error("[ThemeManager] Failed to read theme:", e);
        return {};
    }
}

export function getAutoThemeColors(): ThemeColors {
    // 返回空对象，让 webview 从 getComputedStyle 获取 VSCode 当前注入的变量值
    return {};
}

export function getThemeTypeString(): string {
    const themeKind = vscode.window.activeColorTheme.kind;
    switch (themeKind) {
        case vscode.ColorThemeKind.Light:
            return "light";
        case vscode.ColorThemeKind.Dark:
            return "dark";
        case vscode.ColorThemeKind.HighContrast:
            return "hc-dark";
        case vscode.ColorThemeKind.HighContrastLight:
            return "hc-light";
        default:
            return "dark";
    }
}
