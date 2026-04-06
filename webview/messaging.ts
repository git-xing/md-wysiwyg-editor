import type { ToExtensionMessage, ToWebviewMessage, ProjectImage } from "../shared/messages";

export type { ProjectImage };

// Re-export 以保持现有消费者（webview/index.ts 等）对 IncomingMessage 的引用不变
export type IncomingMessage = ToWebviewMessage;

declare function acquireVsCodeApi(): {
    postMessage(message: ToExtensionMessage): void;
    getState(): unknown;
    setState(state: unknown): void;
};

// acquireVsCodeApi 只能调用一次
const vscode = acquireVsCodeApi();

export function notifyReady(): void {
    vscode.postMessage({ type: "ready" });
}

export function notifyUpdate(markdown: string): void {
    vscode.postMessage({ type: "update", content: markdown });
}

export function notifyOpenUrl(url: string): void {
    vscode.postMessage({ type: "openUrl", url });
}

export function notifyOpenFile(relativePath: string): void {
    vscode.postMessage({ type: "openFile", path: relativePath });
}

export function notifySendToClaudeChat(
    text: string,
    startLine: number,
    endLine: number,
): void {
    vscode.postMessage({ type: "sendToClaudeChat", text, startLine, endLine });
}

export function notifySwitchToTextEditor(line?: number): void {
    vscode.postMessage({ type: "switchToTextEditor", ...(line !== undefined ? { line } : {}) });
}

export function notifyOpenSettings(): void {
    vscode.postMessage({ type: "openSettings" });
}

export function notifyUploadImage(
    id: string,
    data: Uint8Array,
    mimeType: string,
    altText: string,
): void {
    vscode.postMessage({ type: "uploadImage", id, data, mimeType, altText });
}

export function notifyGetProjectImages(id: string): void {
    vscode.postMessage({ type: "getProjectImages", id });
}

export function notifyRenameImage(
    id: string,
    webviewUri: string,
    newBasename: string,
): void {
    vscode.postMessage({ type: "renameImage", id, webviewUri, newBasename });
}

export function onMessage(handler: (msg: IncomingMessage) => void): void {
    window.addEventListener("message", (event: MessageEvent) => {
        handler(event.data as IncomingMessage);
    });
}
