import * as vscode from "vscode";
import { MarkdownEditorProvider } from "./MarkdownEditorProvider";

/**
 * 根据 defaultMode 同步 workbench.editorAssociations：
 * - "markdown" → 注入 "*.md"/"*.markdown": "default"，让文本编辑器直接打开，不触发自定义编辑器
 * - "preview"  → 删除上述条目，恢复 package.json 中 priority:default 生效
 */
function syncEditorAssociation(mode: string): void {
    const wbConfig = vscode.workspace.getConfiguration("workbench");
    const current: Record<string, string> = {
        ...(wbConfig.get<Record<string, string>>("editorAssociations") ?? {}),
    };
    if (mode === "markdown") {
        current["*.md"] = "default";
        current["*.markdown"] = "default";
    } else {
        // preview 模式：删除 association，依赖 package.json 的 priority:default 自动生效
        delete current["*.md"];
        delete current["*.markdown"];
    }
    wbConfig.update("editorAssociations", current, vscode.ConfigurationTarget.Global);
}

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

    // 激活时同步一次 editorAssociations
    const initialMode = vscode.workspace
        .getConfiguration("markdownWysiwyg")
        .get<string>("defaultMode", "preview");
    syncEditorAssociation(initialMode);

    // priority:option 下不自动接管文件打开，用 onDidChangeTabs 监听文本 tab 并切换到 WYSIWYG
    // diff 视图只产生 TabInputTextDiff，不会触发此逻辑
    context.subscriptions.push(
        vscode.window.tabGroups.onDidChangeTabs(async (event) => {
            const mode = vscode.workspace
                .getConfiguration("markdownWysiwyg")
                .get<string>("defaultMode", "preview");
            if (mode !== "preview") { return; }

            for (const tab of event.opened) {
                if (!(tab.input instanceof vscode.TabInputText)) { continue; }
                const uri = (tab.input as vscode.TabInputText).uri;
                if (uri.scheme !== "file") { continue; }
                if (!/\.(md|markdown)$/i.test(uri.fsPath)) { continue; }

                const uriStr = uri.toString();
                if (MarkdownEditorProvider.suppressAutoSwitch.has(uriStr)) { continue; }

                // 先关文本 tab，再开 WYSIWYG（与 switchToPreview 命令保持一致）
                const isPreview = tab.isPreview;
                const viewCol = tab.group.viewColumn;
                await vscode.window.tabGroups.close(tab);
                await vscode.commands.executeCommand(
                    "vscode.openWith",
                    uri,
                    MarkdownEditorProvider.viewType,
                    { viewColumn: viewCol, preview: isPreview },
                );
            }
        }),
    );

    // 监听文本编辑器激活事件：捕获全局搜索导航时短暂出现的 .md 文本编辑器光标位置
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (!editor) { return; }
            const { uri } = editor.document;
            if (!uri.fsPath.endsWith('.md')) { return; }
            // 切换到文本编辑器期间（suppressNavFromTextEditor 已设置），跳过行号回传
            // 避免主动切走时行号被反馈给 WebView 触发多余的 scrollToLine
            if (MarkdownEditorProvider.current?.isNavFromTextEditorSuppressed) { return; }
            const line = editor.selection.active.line + 1; // 转为 1-indexed
            if (line >= 1) {
                MarkdownEditorProvider.current?.setPendingNavigation(uri.fsPath, line);
            }
        }),
    );

    // 拦截 revealLine 命令：全局搜索点击结果时 VS Code 会调此命令导航到指定行。
    // 若当前有 .md 自定义编辑器 tab（遍历所有 group），则转发给 WebView；否则回退到文本编辑器行为。
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'revealLine',
            (args: { lineNumber: number; at?: string }) => {
                console.log('[revealLine] 触发，lineNumber:', args.lineNumber, 'at:', args.at);
                const targetLine = args.lineNumber + 1; // 转为 1-indexed
                // 始终写入全局兜底：确保 onDidChangeViewState（含延迟检查）能消费到
                MarkdownEditorProvider.current?.setGlobalRevealLine(targetLine);
                // 同时：若当前有 active 的 .md 自定义 tab 且已初始化，直接发送（不等 viewState）
                for (const group of vscode.window.tabGroups.all) {
                    for (const tab of group.tabs) {
                        if (tab.input instanceof vscode.TabInputCustom) {
                            const uri = (tab.input as vscode.TabInputCustom).uri;
                            if (uri.fsPath.endsWith('.md') && tab.isActive) {
                                console.log('[revealLine] 找到 active .md 自定义 tab，fsPath:', uri.fsPath);
                                MarkdownEditorProvider.current?.setPendingNavigation(uri.fsPath, targetLine);
                                return;
                            }
                        }
                    }
                }
                console.log('[revealLine] 未找到 active .md 自定义 tab，等待 viewState 延迟消费');
                // 回退：文本编辑器使用 revealRange
                const editor = vscode.window.activeTextEditor;
                if (editor) {
                    const pos = new vscode.Position(args.lineNumber, 0);
                    const revealType =
                        args.at === 'top' ? vscode.TextEditorRevealType.AtTop
                        : args.at === 'center' ? vscode.TextEditorRevealType.InCenter
                        : vscode.TextEditorRevealType.Default;
                    editor.revealRange(new vscode.Range(pos, pos), revealType);
                }
            },
        ),
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
            if (e.affectsConfiguration("markdownWysiwyg.defaultMode")) {
                const mode = vscode.workspace
                    .getConfiguration("markdownWysiwyg")
                    .get<string>("defaultMode", "preview");
                syncEditorAssociation(mode);
            }
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
                            target = (activeTab.input as vscode.TabInputCustom).uri;
                            break;
                        }
                    }
                }
                if (!target) { return; }

                const provider = MarkdownEditorProvider.current;
                // 优先方案：向 WebView 请求当前滚动行号，WebView 会上报位置后自行触发切换
                // 这样菜单按钮和 Cmd+Shift+M 快捷键行为一致（均携带行号，不主动关闭自定义编辑器 tab）
                if (provider) {
                    provider.postToPanel(target, { type: "requestSwitchToTextEditor" });
                    return;
                }

                // 兜底：面板不存在时，直接打开文本编辑器（不携带行号）
                await vscode.commands.executeCommand("vscode.openWith", target, "default");
            },
        ),
    );

    // 打开预览：文本编辑器 → WYSIWYG
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "markdownWysiwyg.switchToPreview",
            async (uri?: vscode.Uri) => {
                const activeEditor = vscode.window.activeTextEditor;
                const target = uri ?? activeEditor?.document.uri;
                if (!target) {
                    return;
                }
                // 切换前保存当前光标行号，供 WYSIWYG 面板激活时定位
                const currentLine = activeEditor?.selection.active.line ?? -1;
                if (currentLine >= 0) {
                    MarkdownEditorProvider.current?.setPendingNavigation(target.fsPath, currentLine + 1);
                }
                // 读取文本编辑器 tab 的 preview 状态和所在列，关闭前保存
                let isPreview = false;
                let viewCol: vscode.ViewColumn = vscode.ViewColumn.Active;
                let textTab: vscode.Tab | undefined;
                for (const group of vscode.window.tabGroups.all) {
                    for (const tab of group.tabs) {
                        if (
                            tab.input instanceof vscode.TabInputText &&
                            (tab.input as vscode.TabInputText).uri.toString() === target.toString()
                        ) {
                            isPreview = tab.isPreview;
                            viewCol = group.viewColumn;
                            textTab = tab;
                            break;
                        }
                    }
                }
                // 先关文本编辑器 tab，再开 WYSIWYG，避免两个 tab 并存的闪烁
                if (textTab) {
                    await vscode.window.tabGroups.close(textTab);
                }
                await vscode.commands.executeCommand(
                    "vscode.openWith",
                    target,
                    MarkdownEditorProvider.viewType,
                    { viewColumn: viewCol, preview: isPreview },
                );
            },
        ),
    );
}

export function deactivate() {}
