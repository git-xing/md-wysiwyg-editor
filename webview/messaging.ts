declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

// acquireVsCodeApi 只能调用一次
const vscode = acquireVsCodeApi();

export function notifyReady(): void {
  vscode.postMessage({ type: 'ready' });
}

export function notifyUpdate(markdown: string): void {
  vscode.postMessage({ type: 'update', content: markdown });
}

export function notifyOpenUrl(url: string): void {
  vscode.postMessage({ type: 'openUrl', url });
}

export function notifySendToClaudeChat(text: string, startLine: number, endLine: number): void {
  vscode.postMessage({ type: 'sendToClaudeChat', text, startLine, endLine });
}

export function notifySwitchToTextEditor(): void {
  vscode.postMessage({ type: 'switchToTextEditor' });
}

export type IncomingMessage =
  | { type: 'init'; content: string; lineMap?: number[] }
  | { type: 'revert'; content: string; lineMap?: number[] }
  | { type: 'lineMapUpdate'; lineMap: number[] }
  | { type: 'setDebugMode'; enabled: boolean };

export function onMessage(handler: (msg: IncomingMessage) => void): void {
  window.addEventListener('message', (event: MessageEvent) => {
    handler(event.data as IncomingMessage);
  });
}
