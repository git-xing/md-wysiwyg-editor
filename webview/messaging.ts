declare function acquireVsCodeApi(): {
    postMessage(message: unknown): void;
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

export function notifySwitchToTextEditor(): void {
    vscode.postMessage({ type: "switchToTextEditor" });
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

export type IncomingMessage =
    | { type: "init"; content: string; lineMap?: number[] }
    | { type: "revert"; content: string; lineMap?: number[] }
    | { type: "lineMapUpdate"; lineMap: number[] }
    | { type: "setDebugMode"; enabled: boolean }
    | { type: "imageUploaded"; id: string; url: string }
    | { type: "imageUploadError"; id: string; error: string }
    | {
          type: "projectImagesList";
          id: string;
          images: Array<{ relPath: string; webviewUri: string; name: string }>;
      }
    | {
          type: "imageRenamed";
          id: string;
          oldWebviewUri: string;
          newWebviewUri: string;
      }
    | { type: "imageRenameError"; id: string; error: string };

export function onMessage(handler: (msg: IncomingMessage) => void): void {
    window.addEventListener("message", (event: MessageEvent) => {
        handler(event.data as IncomingMessage);
    });
}
