/**
 * shared/messages.ts
 * WebView ↔ Extension 双向消息类型的唯一权威来源。
 * 两侧均从此处导入，禁止各自内联重复定义。
 */

/** 图片元数据：磁盘相对路径 + WebView 可访问 URI + 文件名 */
export type ProjectImage = {
    relPath: string;
    webviewUri: string;
    name: string;
};

/**
 * WebView → Extension 方向的消息。
 * 所有字段反映发送方的实际约束：发送方必须提供的字段不得写成可选。
 */
export type ToExtensionMessage =
    | { type: "ready" }
    | { type: "update"; content: string }
    | { type: "openUrl"; url: string }
    | { type: "openFile"; path: string }
    | { type: "sendToClaudeChat"; text: string; startLine: number; endLine: number }
    | { type: "switchToTextEditor" }
    | { type: "openSettings" }
    | { type: "uploadImage"; id: string; data: Uint8Array; mimeType: string; altText: string }
    | { type: "getProjectImages"; id: string }
    | { type: "renameImage"; id: string; webviewUri: string; newBasename: string };

/**
 * Extension → WebView 方向的消息。
 * lineMap 在 init/revert 中为可选：Extension 始终发送，但 WebView 侧用 `?? []` 兜底以防万一。
 */
export type ToWebviewMessage =
    | { type: "init"; content: string; lineMap?: number[] }
    | { type: "revert"; content: string; lineMap?: number[] }
    | { type: "lineMapUpdate"; lineMap: number[] }
    | { type: "setDebugMode"; enabled: boolean }
    | { type: "imageUploaded"; id: string; url: string }
    | { type: "imageUploadError"; id: string; error: string }
    | { type: "projectImagesList"; id: string; images: ProjectImage[] }
    | { type: "imageRenamed"; id: string; oldWebviewUri: string; newWebviewUri: string }
    | { type: "imageRenameError"; id: string; error: string };
