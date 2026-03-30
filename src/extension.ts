import * as vscode from "vscode";
import { MarkdownEditorProvider } from "./MarkdownEditorProvider";

export function activate(context: vscode.ExtensionContext) {
    // 追踪终端中运行的 claude 进程（Shell Integration）
    const claudeTerminals = new Set<vscode.Terminal>();
    context.subscriptions.push(
        vscode.window.onDidStartTerminalShellExecution((e) => {
            if (/\bclaude\b/i.test(e.execution.commandLine?.value ?? ""))
                claudeTerminals.add(e.terminal);
        }),
        vscode.window.onDidEndTerminalShellExecution((e) =>
            claudeTerminals.delete(e.terminal),
        ),
        vscode.window.onDidCloseTerminal((t) => claudeTerminals.delete(t)),
    );

    context.subscriptions.push(
        MarkdownEditorProvider.register(context, claudeTerminals),
    );

    // 调试模式：初始化 context 变量
    const initialDebug = vscode.workspace
        .getConfiguration("markdownWysiwyg")
        .get<boolean>("debugMode", false);
    vscode.commands.executeCommand(
        "setContext",
        "markdownWysiwyg.debugModeActive",
        initialDebug,
    );

    // 调试模式开关命令（两个互斥命令，通过 when 条件切换显示，实现 ✓ 前缀效果）
    const toggleDebugMode = () => {
        const cfg = vscode.workspace.getConfiguration("markdownWysiwyg");
        const next = !cfg.get<boolean>("debugMode", false);
        cfg.update("debugMode", next, vscode.ConfigurationTarget.Global);
        vscode.commands.executeCommand(
            "setContext",
            "markdownWysiwyg.debugModeActive",
            next,
        );
        MarkdownEditorProvider.current?.postToAll({
            type: "setDebugMode",
            enabled: next,
        });
    };
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "markdownWysiwyg.debugModeEnable",
            toggleDebugMode,
        ),
        vscode.commands.registerCommand(
            "markdownWysiwyg.debugModeDisable",
            toggleDebugMode,
        ),
    );

    // 监听设置手动变更（从 VSCode 设置 UI 修改时同步）
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration("markdownWysiwyg.debugMode")) {
                const v = vscode.workspace
                    .getConfiguration("markdownWysiwyg")
                    .get<boolean>("debugMode", false);
                vscode.commands.executeCommand(
                    "setContext",
                    "markdownWysiwyg.debugModeActive",
                    v,
                );
                MarkdownEditorProvider.current?.postToAll({
                    type: "setDebugMode",
                    enabled: v,
                });
            }
        }),
    );

    // 关闭预览：WYSIWYG → 文本编辑器
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "markdownWysiwyg.switchToTextEditor",
            async (uri?: vscode.Uri) => {
                let target =
                    uri ?? vscode.window.activeTextEditor?.document.uri;
                if (!target) {
                    // Custom Editor 激活时 activeTextEditor 为 undefined，从 tab 组找活跃的 CustomEditor tab
                    for (const group of vscode.window.tabGroups.all) {
                        const activeTab = group.activeTab;
                        if (activeTab?.input instanceof vscode.TabInputCustom) {
                            target = (activeTab.input as vscode.TabInputCustom)
                                .uri;
                            break;
                        }
                    }
                }
                if (!target) {
                    return;
                }
                await vscode.commands.executeCommand(
                    "vscode.openWith",
                    target,
                    "default",
                );
                // 关闭原来的自定义编辑器 tab（避免新旧两个 tab 并存）
                for (const group of vscode.window.tabGroups.all) {
                    for (const tab of group.tabs) {
                        if (
                            tab.input instanceof vscode.TabInputCustom &&
                            (
                                tab.input as vscode.TabInputCustom
                            ).uri.toString() === target.toString()
                        ) {
                            await vscode.window.tabGroups.close(tab);
                            return;
                        }
                    }
                }
            },
        ),
    );

    // 打开预览：文本编辑器 → WYSIWYG
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "markdownWysiwyg.switchToPreview",
            async (uri?: vscode.Uri) => {
                const target =
                    uri ?? vscode.window.activeTextEditor?.document.uri;
                if (!target) {
                    return;
                }
                await vscode.commands.executeCommand(
                    "vscode.openWith",
                    target,
                    MarkdownEditorProvider.viewType,
                );
                // 关闭原来的文本编辑器 tab
                for (const group of vscode.window.tabGroups.all) {
                    for (const tab of group.tabs) {
                        if (
                            tab.input instanceof vscode.TabInputText &&
                            (
                                tab.input as vscode.TabInputText
                            ).uri.toString() === target.toString()
                        ) {
                            await vscode.window.tabGroups.close(tab);
                            return;
                        }
                    }
                }
            },
        ),
    );
}

export function deactivate() {}
