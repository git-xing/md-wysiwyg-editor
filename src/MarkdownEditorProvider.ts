import * as path from "path";
import * as vscode from "vscode";
import { MarkdownDocument } from "./MarkdownDocument";
import { getNonce } from "./utils/getNonce";
import { ZH_CN_WEBVIEW } from "./i18n/webviewTranslations";
import { saveImageLocally, uploadImageToServer } from "./utils/imageService";

function computeLineMap(content: string): number[] {
    const lines = content.split('\n');
    const map: number[] = [];
    let i = 0;
    while (i < lines.length) {
        while (i < lines.length && lines[i].trim() === '') i++;
        if (i >= lines.length) break;
        map.push(i + 1);
        const fenceMatch = lines[i].trimStart().match(/^(`{3,}|~{3,})/);
        if (fenceMatch) {
            const fence = fenceMatch[1];
            i++;
            while (i < lines.length && !lines[i].trimStart().startsWith(fence)) i++;
            if (i < lines.length) i++;
        } else {
            while (i < lines.length && lines[i].trim() !== '') i++;
        }
    }
    return map;
}


export class MarkdownEditorProvider
    implements vscode.CustomEditorProvider<MarkdownDocument> {
    public static readonly viewType = "markdownWysiwyg.editor";

    private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<
        vscode.CustomDocumentEditEvent<MarkdownDocument>
    >();
    public readonly onDidChangeCustomDocument =
        this._onDidChangeCustomDocument.event;

    // 自动保存防抖定时器（key: document uri string）
    private readonly _autoSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();

    // 记录每个 document 对应的 webviewPanel（用于 revert 时推送新内容）
    private readonly _webviewPanels = new Map<string, vscode.WebviewPanel>();

    // 已执行过 keepEditor（pin tab）的 uri，避免重复执行
    private readonly _pinnedDocuments = new Set<string>();

    // 记录最近一次我们自己写盘的时间，用于避免自身保存触发文件监听 revert
    private readonly _lastSaveTimes = new Map<string, number>();

    // 图片 webviewUri → relPath 映射（key: docUri.toString()）
    private readonly _imageUriMaps = new Map<string, Map<string, string>>();

    public static current: MarkdownEditorProvider | null = null;

    public postToAll(msg: object): void {
        for (const panel of this._webviewPanels.values()) {
            panel.webview.postMessage(msg);
        }
    }

    public static register(
        context: vscode.ExtensionContext,
        claudeTerminals: Set<vscode.Terminal>,
    ): vscode.Disposable {
        const provider = new MarkdownEditorProvider(context, claudeTerminals);
        MarkdownEditorProvider.current = provider;
        return vscode.window.registerCustomEditorProvider(
            MarkdownEditorProvider.viewType,
            provider,
            {
                webviewOptions: {
                    retainContextWhenHidden: true,
                },
                supportsMultipleEditorsPerDocument: false,
            },
        );
    }

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly claudeTerminals: Set<vscode.Terminal>,
    ) {}

    async openCustomDocument(
        uri: vscode.Uri,
        _openContext: vscode.CustomDocumentOpenContext,
        _token: vscode.CancellationToken,
    ): Promise<MarkdownDocument> {
        return MarkdownDocument.create(uri);
    }

    async resolveCustomEditor(
        document: MarkdownDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken,
    ): Promise<void> {
        // 保存 panel 引用（revert 时推送内容用）
        const uriKey = document.uri.toString();
        this._webviewPanels.set(uriKey, webviewPanel);
        webviewPanel.onDidDispose(() => {
            this._webviewPanels.delete(uriKey);
            this._pinnedDocuments.delete(uriKey);
            this._imageUriMaps.delete(uriKey);
            // 清理残余定时器
            const timer = this._autoSaveTimers.get(uriKey);
            if (timer !== undefined) {
                clearTimeout(timer);
                this._autoSaveTimers.delete(uriKey);
            }
        });

        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.context.extensionUri, "dist"),
                // 允许访问 workspace 文件夹（本地图片显示）
                ...(vscode.workspace.workspaceFolders?.map(f => f.uri) ?? []),
                // 允许访问 .md 文件所在目录（workspace 外或 untitled）
                vscode.Uri.joinPath(document.uri, '..'),
            ],
        };
        webviewPanel.webview.html = this._getHtmlForWebview(
            webviewPanel.webview,
        );

        webviewPanel.webview.onDidReceiveMessage(
            async (message: { type: string; content?: string; url?: string; text?: string; startLine?: number; endLine?: number; id?: string; data?: Uint8Array; mimeType?: string; altText?: string; webviewUri?: string; newBasename?: string }) => {
                const panel = webviewPanel;
                switch (message.type) {
                    case "ready": {
                        const initContent = document.getText();
                        const displayContent = this._prepareContentForDisplay(initContent, document, webviewPanel, uriKey);
                        webviewPanel.webview.postMessage({
                            type: "init",
                            content: displayContent,
                            lineMap: computeLineMap(initContent),
                        });
                        break;
                    }
                    case "update":
                        if (message.content !== undefined) {
                            document.update(this._prepareContentForSave(message.content, uriKey));
                            // 首次编辑时 pin tab（移除斜体预览状态）
                            if (!this._pinnedDocuments.has(uriKey)) {
                                this._pinnedDocuments.add(uriKey);
                                vscode.commands.executeCommand('workbench.action.keepEditor');
                            }
                            this._scheduleAutoSaveOrMarkDirty(document);
                        }
                        break;
                    case "openUrl":
                        if (message.url) {
                            vscode.env.openExternal(vscode.Uri.parse(message.url));
                        }
                        break;
                    case "openFile":
                        if (message.path) {
                            const docDir = path.dirname(document.uri.fsPath);
                            const absPath = path.resolve(docDir, message.path);
                            vscode.commands.executeCommand("vscode.open", vscode.Uri.file(absPath));
                        }
                        break;
                    case "switchToTextEditor":
                        vscode.commands.executeCommand('markdownWysiwyg.switchToTextEditor', document.uri);
                        break;
                    case "sendToClaudeChat":
                        if (message.text) {
                            await this._handleSendToClaudeChat(
                                document, webviewPanel,
                                message.text,
                                message.startLine ?? 1,
                                message.endLine   ?? (message.startLine ?? 1),
                            );
                        }
                        break;
                    case "openSettings":
                        vscode.commands.executeCommand('workbench.action.openSettings', 'markdownWysiwyg');
                        break;
                    case "uploadImage":
                        if (message.id && message.data) {
                            this._handleImageUpload(
                                document, panel,
                                message.id,
                                message.data,
                                message.mimeType ?? 'image/png',
                                message.altText ?? '',
                            ).catch(() => {});
                        }
                        break;
                    case "getProjectImages":
                        if (message.id) {
                            this._handleGetProjectImages(document, panel, uriKey, message.id).catch(() => {});
                        }
                        break;
                    case "renameImage":
                        if (message.id && message.webviewUri && message.newBasename) {
                            this._handleImageRename(
                                document, panel, uriKey,
                                message.id,
                                message.webviewUri,
                                message.newBasename,
                            ).catch(() => {});
                        }
                        break;
                }
            },
        );

        // defaultMode 设置为 markdown 时，立即切换到文本编辑器
        const defaultMode = vscode.workspace
            .getConfiguration("markdownWysiwyg")
            .get<string>("defaultMode", "preview");
        if (defaultMode === "markdown") {
            setImmediate(() => {
                vscode.commands.executeCommand(
                    "vscode.openWith",
                    document.uri,
                    "default",
                );
            });
        }

        // 监听外部文件变化，自动同步到 WebView
        const watcher = vscode.workspace.createFileSystemWatcher(document.uri.fsPath);
        watcher.onDidChange(async () => {
            // 如果是我们自己刚保存导致的变化（1.5 秒内），跳过
            const lastSave = this._lastSaveTimes.get(uriKey) ?? 0;
            if (Date.now() - lastSave < 1500) { return; }
            const cts = new vscode.CancellationTokenSource();
            try {
                await document.revert(cts.token);
                const panel = this._webviewPanels.get(uriKey);
                if (panel) {
                    const revertContent = document.getText();
                    const displayContent = this._prepareContentForDisplay(revertContent, document, panel, uriKey);
                    panel.webview.postMessage({ type: "revert", content: displayContent, lineMap: computeLineMap(revertContent) });
                }
            } finally {
                cts.dispose();
            }
        });
        // panel 关闭时同步销毁 watcher
        webviewPanel.onDidDispose(() => { watcher.dispose(); });
    }

    private _scheduleAutoSaveOrMarkDirty(document: MarkdownDocument): void {
        const config = vscode.workspace.getConfiguration("markdownWysiwyg");
        const autoSave = config.get<boolean>("autoSave", true);
        const delay = config.get<number>("autoSaveDelay", 1000);
        const uriKey = document.uri.toString();

        if (autoSave) {
            // 防抖自动保存：停止编辑 delay ms 后写盘，不显示 ● 标记
            const existing = this._autoSaveTimers.get(uriKey);
            if (existing !== undefined) {
                clearTimeout(existing);
            }
            this._autoSaveTimers.set(
                uriKey,
                setTimeout(async () => {
                    this._autoSaveTimers.delete(uriKey);
                    const cts = new vscode.CancellationTokenSource();
                    try {
                        this._lastSaveTimes.set(uriKey, Date.now());
                        await document.save(cts.token);
                        const panel = this._webviewPanels.get(uriKey);
                        if (panel) {
                            panel.webview.postMessage({ type: "lineMapUpdate", lineMap: computeLineMap(document.getText()) });
                        }
                    } finally {
                        cts.dispose();
                    }
                }, delay),
            );
        } else {
            // 手动保存模式：标记 dirty，等待 Cmd+S
            this._onDidChangeCustomDocument.fire({
                document,
                label: "Edit",
                undo: () => { /* TODO */ },
                redo: () => { /* TODO */ },
            });
        }
    }

    private async _handleSendToClaudeChat(
        document: MarkdownDocument,
        webviewPanel: vscode.WebviewPanel,
        text: string,
        startLine: number,
        endLine: number,
    ): Promise<void> {
        const relPath = vscode.workspace.asRelativePath(document.uri);
        const mentionStr = startLine === endLine
            ? `@${relPath}#${startLine}`
            : `@${relPath}#${startLine}-${endLine}`;
        let success = false;
        console.log('[sendToClaudeChat] 触发，文件:', relPath, '行:', startLine, '-', endLine);

        try {
            // 路径 A：终端 Claude
            // 判断依据：state.shell 缺失 → VSCode 无法识别为标准 shell → 可能是 claude CLI
            const isClaudeLikeTerminal = (t: vscode.Terminal) =>
                !(t.state as { shell?: string }).shell;

            const claudeTerminal =
                [...this.claudeTerminals].at(-1)                          // ① Shell Integration 检测
                ?? vscode.window.terminals.find(isClaudeLikeTerminal)     // ② state.shell 缺失
                ?? undefined;  // 不兜底到 activeTerminal，避免误发到普通 shell
            if (claudeTerminal) {
                claudeTerminal.sendText(mentionStr, false);
                await vscode.commands.executeCommand('workbench.action.terminal.focus');
                success = true;
                console.log('[sendToClaudeChat] 发送到终端完成');
            }

            // 路径 B：VSCode Claude 扩展
            if (!success) {
                // Fix 3：临时文本编辑器在同列打开（避免新建列导致布局闪烁）
                // 使用 preview: false 避免替换处于预览状态的 custom editor tab
                const textDoc    = await vscode.workspace.openTextDocument(document.uri);
                const textEditor = await vscode.window.showTextDocument(textDoc, {
                    viewColumn:    webviewPanel.viewColumn,
                    preview:       false,
                    preserveFocus: false,
                });
                const setSelection = () => {
                    textEditor.selection = new vscode.Selection(
                        new vscode.Position(startLine - 1, 0),
                        new vscode.Position(endLine   - 1, 9999),
                    );
                };
                setSelection();

                // Fix 2：检查 Claude 是否已打开，分两条路径避免 activeTextEditor 丢失
                const claudeOpen = vscode.window.tabGroups.all.some(g =>
                    g.tabs.some(t =>
                        t.input instanceof vscode.TabInputWebview &&
                        (t.input as vscode.TabInputWebview).viewType.includes('claudeVSCodePanel')
                    )
                );
                console.log('[sendToClaudeChat] claudeOpen:', claudeOpen);

                if (claudeOpen) {
                    await vscode.commands.executeCommand('claude-vscode.focus');
                } else {
                    await vscode.commands.executeCommand('claude-vscode.editor.openLast');
                    await new Promise(r => setTimeout(r, 700));
                    await vscode.window.showTextDocument(textDoc, {
                        viewColumn:    textEditor.viewColumn,
                        preview:       false,
                        preserveFocus: false,
                    });
                    setSelection();
                    await vscode.commands.executeCommand('claude-vscode.insertAtMention');
                }
                success = true;

                // 关闭临时文本编辑器
                for (const group of vscode.window.tabGroups.all) {
                    for (const tab of group.tabs) {
                        if (tab.input instanceof vscode.TabInputText &&
                            (tab.input as vscode.TabInputText).uri.toString() === document.uri.toString()) {
                            await vscode.window.tabGroups.close(tab);
                            break;
                        }
                    }
                }
                // 将 custom editor 带回前台（避免临时文本编辑器关闭后 custom editor 不可见）
                webviewPanel.reveal(webviewPanel.viewColumn, false);
                console.log('[sendToClaudeChat] 完成');
            }
        } catch (_e) {
            console.log('[sendToClaudeChat] 失败:', _e);
        }

        if (!success) {
            // 路径 C：兜底 VSCode 内置 chat
            const query = `@${relPath}\n\n${text}`;
            console.log('[sendToClaudeChat] 兜底 chat.open');
            try {
                await vscode.commands.executeCommand('workbench.action.chat.open', { query });
            } catch (_e) {
                vscode.window.showErrorMessage(vscode.l10n.t('Cannot open chat: please install Claude extension or GitHub Copilot'));
            }
        }
    }

    async saveCustomDocument(
        document: MarkdownDocument,
        cancellation: vscode.CancellationToken,
    ): Promise<void> {
        // 清理自动保存定时器（Cmd+S 直接保存，不需要再等定时器）
        const uriKey = document.uri.toString();
        const timer = this._autoSaveTimers.get(uriKey);
        if (timer !== undefined) {
            clearTimeout(timer);
            this._autoSaveTimers.delete(uriKey);
        }
        this._lastSaveTimes.set(uriKey, Date.now());
        await document.save(cancellation);
        const panel = this._webviewPanels.get(uriKey);
        if (panel) {
            panel.webview.postMessage({ type: "lineMapUpdate", lineMap: computeLineMap(document.getText()) });
        }
    }

    async saveCustomDocumentAs(
        document: MarkdownDocument,
        destination: vscode.Uri,
        cancellation: vscode.CancellationToken,
    ): Promise<void> {
        await document.saveAs(destination, cancellation);
    }

    async revertCustomDocument(
        document: MarkdownDocument,
        cancellation: vscode.CancellationToken,
    ): Promise<void> {
        await document.revert(cancellation);
        // 推送新内容给 WebView，触发编辑器重建
        const uriKey = document.uri.toString();
        const panel = this._webviewPanels.get(uriKey);
        if (panel) {
            const revertContent = document.getText();
            const displayContent = this._prepareContentForDisplay(revertContent, document, panel, uriKey);
            panel.webview.postMessage({
                type: "revert",
                content: displayContent,
                lineMap: computeLineMap(revertContent),
            });
        }
    }

    async backupCustomDocument(
        document: MarkdownDocument,
        context: vscode.CustomDocumentBackupContext,
        cancellation: vscode.CancellationToken,
    ): Promise<vscode.CustomDocumentBackup> {
        return document.backup(context.destination, cancellation);
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const cfg = vscode.workspace.getConfiguration("markdownWysiwyg");
        const maxHeight = cfg.get<number>("codeBlockMaxHeight", 500);
        const editorMaxWidth = cfg.get<number>("editorMaxWidth", 900);
        const fontFamily = cfg.get<string>("fontFamily", "");
        const imageSelectionColor = cfg.get<string>("imageSelectionColor", "rgba(52, 211, 153, 0.6)");
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(
                this.context.extensionUri,
                "dist",
                "webview.js",
            ),
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(
                this.context.extensionUri,
                "dist",
                "webview.css",
            ),
        );
        const nonce = getNonce();

        const lang = vscode.env.language.toLowerCase();
        const isMac = process.platform === 'darwin';
        const translations = lang.startsWith('zh') ? ZH_CN_WEBVIEW : {};
        const debugMode = cfg.get<boolean>("debugMode", false);
        const i18nScript = `window.__i18n=${JSON.stringify({ translations, isMac, debugMode })};`;

        return `<!DOCTYPE html>
<html lang="${vscode.env.language}">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             style-src ${webview.cspSource} 'unsafe-inline';
             script-src 'nonce-${nonce}';
             img-src ${webview.cspSource} https: data:;">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Markdown Editor</title>
  <link rel="stylesheet" href="${styleUri}">
  <style>:root { --code-block-max-height: ${maxHeight}px; --editor-max-width: ${editorMaxWidth}px;${fontFamily ? ` --custom-font-family: ${fontFamily};` : ''} --image-selection-color: ${imageSelectionColor}; }</style>
</head>
<body>
  <div class="editor-topbar"></div>
  <div id="editor"></div>
  <script nonce="${nonce}">${i18nScript}</script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }

    private _prepareContentForDisplay(
        content: string,
        document: MarkdownDocument,
        panel: vscode.WebviewPanel,
        uriKey: string,
    ): string {
        if (document.uri.scheme !== 'file') { return content; }
        const mdDir = path.dirname(document.uri.fsPath);
        const uriMap = this._imageUriMaps.get(uriKey) ?? new Map<string, string>();
        this._imageUriMaps.set(uriKey, uriMap);
        return content.replace(/!\[([^\]]*)\]\(([^)\s"]+)/g, (match, alt, src) => {
            if (/^(https?:|data:|vscode-resource:|vscode-webview-)/.test(src)) { return match; }
            try {
                const absPath = path.resolve(mdDir, src);
                const webviewUri = panel.webview.asWebviewUri(vscode.Uri.file(absPath)).toString();
                uriMap.set(webviewUri, src);
                return `![${alt}](${webviewUri}`;
            } catch {
                return match;
            }
        });
    }

    private _prepareContentForSave(content: string, uriKey: string): string {
        const uriMap = this._imageUriMaps.get(uriKey);
        if (!uriMap || uriMap.size === 0) { return content; }
        let result = content;
        for (const [webviewUri, relPath] of uriMap) {
            result = result.split(webviewUri).join(relPath);
        }
        return result;
    }

    private async _handleImageUpload(
        document: MarkdownDocument,
        panel: vscode.WebviewPanel,
        id: string,
        data: Uint8Array,
        mimeType: string,
        altText: string,
    ): Promise<void> {
        const uriKey = document.uri.toString();
        const cfg = vscode.workspace.getConfiguration('markdownWysiwyg', document.uri);
        const storage = cfg.get<string>('imageStorage', 'local');
        try {
            let url: string;
            if (storage === 'server') {
                url = await uploadImageToServer(cfg, data, mimeType, altText);
            } else {
                const { relPath, absUri } = await saveImageLocally(document.uri, cfg, data, mimeType, altText);
                const webviewUri = panel.webview.asWebviewUri(absUri);
                url = webviewUri.toString();
                // 存储映射，供保存时将 webviewUri 替换回 relPath
                const uriMap = this._imageUriMaps.get(uriKey) ?? new Map<string, string>();
                this._imageUriMaps.set(uriKey, uriMap);
                uriMap.set(url, relPath);
            }
            panel.webview.postMessage({ type: 'imageUploaded', id, url });
        } catch (e) {
            const errMsg = e instanceof Error ? e.message : String(e);
            panel.webview.postMessage({ type: 'imageUploadError', id, error: errMsg });
            vscode.window.showErrorMessage(vscode.l10n.t('Image upload failed: {0}', errMsg));
        }
    }

    private async _handleGetProjectImages(
        document: MarkdownDocument,
        panel: vscode.WebviewPanel,
        uriKey: string,
        id: string,
    ): Promise<void> {
        const cfg = vscode.workspace.getConfiguration('markdownWysiwyg', document.uri);
        const customPath = cfg.get<string>('imageLocalPath', '').trim();
        const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.tiff', '.ico']);
        const CANDIDATE_DIRS = ['images', 'imgs', 'assets/images', 'assets'];

        let targetDir: vscode.Uri | null = null;

        if (customPath) {
            if (path.isAbsolute(customPath)) {
                targetDir = vscode.Uri.file(customPath);
            } else {
                const wsFolder = vscode.workspace.getWorkspaceFolder(document.uri);
                targetDir = wsFolder
                    ? vscode.Uri.joinPath(wsFolder.uri, customPath)
                    : vscode.Uri.joinPath(document.uri, '..', customPath);
            }
        } else if (document.uri.scheme === 'file') {
            const mdDir = vscode.Uri.joinPath(document.uri, '..');
            const wsFolder = vscode.workspace.getWorkspaceFolder(document.uri);
            const searchRoots = wsFolder ? [wsFolder.uri, mdDir] : [mdDir];
            outer: for (const root of searchRoots) {
                for (const candidate of CANDIDATE_DIRS) {
                    const candidateUri = vscode.Uri.joinPath(root, candidate);
                    try {
                        const stat = await vscode.workspace.fs.stat(candidateUri);
                        if (stat.type === vscode.FileType.Directory) {
                            targetDir = candidateUri;
                            break outer;
                        }
                    } catch { /* not found */ }
                }
            }
        }

        const images: Array<{ relPath: string; webviewUri: string; name: string }> = [];

        if (targetDir) {
            const mdDir = document.uri.scheme === 'file' ? path.dirname(document.uri.fsPath) : '';
            const uriMap = this._imageUriMaps.get(uriKey) ?? new Map<string, string>();
            this._imageUriMaps.set(uriKey, uriMap);
            try {
                const entries = await vscode.workspace.fs.readDirectory(targetDir);
                for (const [name, type] of entries) {
                    if (type !== vscode.FileType.File) { continue; }
                    const ext = path.extname(name).toLowerCase();
                    if (!IMAGE_EXTS.has(ext)) { continue; }
                    const fileUri = vscode.Uri.joinPath(targetDir, name);
                    const wvUri = panel.webview.asWebviewUri(fileUri).toString();
                    let relPath = name;
                    if (mdDir) {
                        const rel = path.relative(mdDir, fileUri.fsPath).replace(/\\/g, '/');
                        relPath = rel.startsWith('.') ? rel : './' + rel;
                    }
                    uriMap.set(wvUri, relPath);
                    images.push({ relPath, webviewUri: wvUri, name });
                }
            } catch { /* directory not accessible */ }
        }

        panel.webview.postMessage({ type: 'projectImagesList', id, images });
    }

    private async _handleImageRename(
        document: MarkdownDocument,
        panel: vscode.WebviewPanel,
        uriKey: string,
        id: string,
        webviewUri: string,
        newBasename: string,
    ): Promise<void> {
        const uriMap = this._imageUriMaps.get(uriKey);
        if (!uriMap) {
            panel.webview.postMessage({ type: 'imageRenameError', id, error: 'URI map not found' });
            return;
        }

        const oldRelPath = uriMap.get(webviewUri);
        if (!oldRelPath) {
            panel.webview.postMessage({ type: 'imageRenameError', id, error: 'Image not found in URI map' });
            return;
        }

        try {
            const mdDir = path.dirname(document.uri.fsPath);
            const oldAbsPath = path.resolve(mdDir, oldRelPath);
            const oldUri = vscode.Uri.file(oldAbsPath);

            // 验证文件存在
            await vscode.workspace.fs.stat(oldUri);

            // 安全化新文件名：去除非法字符，保留原扩展名
            const oldExt = path.extname(oldAbsPath);
            const safeBasename = newBasename
                .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
                .replace(/\.+$/, '')
                .trim();
            if (!safeBasename) {
                panel.webview.postMessage({ type: 'imageRenameError', id, error: 'Invalid filename' });
                return;
            }

            const dir = path.dirname(oldAbsPath);
            let targetUri = vscode.Uri.file(path.join(dir, safeBasename + oldExt));

            // 检查目标文件是否已存在，若存在则提示用户，不自动覆盖
            try {
                await vscode.workspace.fs.stat(targetUri);
                // stat 成功说明文件已存在
                const errMsg = vscode.l10n.t('A file named "{0}" already exists.', safeBasename + oldExt);
                panel.webview.postMessage({ type: 'imageRenameError', id, error: errMsg });
                vscode.window.showErrorMessage(errMsg);
                return;
            } catch { /* 文件不存在，正常继续 */ }

            await vscode.workspace.fs.rename(oldUri, targetUri);

            // 更新 URI 映射
            const rel = path.relative(mdDir, targetUri.fsPath).replace(/\\/g, '/');
            const newRelPath = rel.startsWith('.') ? rel : './' + rel;
            const newWebviewUri = panel.webview.asWebviewUri(targetUri).toString();

            uriMap.delete(webviewUri);
            uriMap.set(newWebviewUri, newRelPath);

            panel.webview.postMessage({ type: 'imageRenamed', id, oldWebviewUri: webviewUri, newWebviewUri });
        } catch (e) {
            const errMsg = e instanceof Error ? e.message : String(e);
            panel.webview.postMessage({ type: 'imageRenameError', id, error: errMsg });
            vscode.window.showErrorMessage(vscode.l10n.t('Image rename failed: {0}', errMsg));
        }
    }
}
