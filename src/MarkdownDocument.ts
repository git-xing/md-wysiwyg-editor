import * as vscode from "vscode";

export class MarkdownDocument implements vscode.CustomDocument {
    private _content: string;
    private _isDirty = false;

    private constructor(
        public readonly uri: vscode.Uri,
        initialContent: string,
    ) {
        this._content = initialContent;
    }

    static async create(uri: vscode.Uri): Promise<MarkdownDocument> {
        const bytes = await vscode.workspace.fs.readFile(uri);
        const content = Buffer.from(bytes).toString("utf-8");
        return new MarkdownDocument(uri, content);
    }

    getText(): string {
        return this._content;
    }

    update(newContent: string): void {
        this._content = newContent;
        this._isDirty = true;
    }

    async save(cancellation: vscode.CancellationToken): Promise<void> {
        if (cancellation.isCancellationRequested) {
            return;
        }
        await vscode.workspace.fs.writeFile(
            this.uri,
            Buffer.from(this._content, "utf-8"),
        );
        this._isDirty = false;
    }

    async saveAs(
        destination: vscode.Uri,
        cancellation: vscode.CancellationToken,
    ): Promise<void> {
        if (cancellation.isCancellationRequested) {
            return;
        }
        await vscode.workspace.fs.writeFile(
            destination,
            Buffer.from(this._content, "utf-8"),
        );
    }

    async revert(_cancellation: vscode.CancellationToken): Promise<void> {
        const bytes = await vscode.workspace.fs.readFile(this.uri);
        this._content = Buffer.from(bytes).toString("utf-8");
        this._isDirty = false;
    }

    async backup(
        destination: vscode.Uri,
        cancellation: vscode.CancellationToken,
    ): Promise<vscode.CustomDocumentBackup> {
        await this.saveAs(destination, cancellation);
        return {
            id: destination.toString(),
            delete: async () => {
                try {
                    await vscode.workspace.fs.delete(destination);
                } catch {
                    // 备份文件不存在时忽略
                }
            },
        };
    }

    dispose(): void {
        // 清理资源（当前无需额外操作）
    }
}
