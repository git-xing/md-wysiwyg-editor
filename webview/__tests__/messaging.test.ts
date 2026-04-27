/**
 * messaging.ts 测试：验证消息发送函数是否以正确格式调用 postMessage。
 * acquireVsCodeApi 已在 setup.ts 中注入到 globalThis。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockVscodeApi } from "./setup";

// 延迟导入，确保 acquireVsCodeApi 在 setup.ts 中已完成注入
const {
    notifyReady,
    notifyUpdate,
    notifyOpenUrl,
    notifyOpenFile,
    notifySendToClaudeChat,
    notifySwitchToTextEditor,
    notifyUploadImage,
    notifyGetProjectImages,
    notifyGetPathSuggestions,
    notifyResolveImagePath,
    notifyRenameImage,
    notifyOpenSettings,
} = await import("../../webview/messaging");

describe("messaging — postMessage 格式验证", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("notifyReady 发送 { type: 'ready' }", () => {
        notifyReady();
        expect(mockVscodeApi.postMessage).toHaveBeenCalledWith({ type: "ready" });
    });

    it("notifyUpdate 携带 content 字段", () => {
        notifyUpdate("# Hello");
        expect(mockVscodeApi.postMessage).toHaveBeenCalledWith({
            type: "update",
            content: "# Hello",
        });
    });

    it("notifyOpenUrl 携带 url 字段", () => {
        notifyOpenUrl("https://example.com");
        expect(mockVscodeApi.postMessage).toHaveBeenCalledWith({
            type: "openUrl",
            url: "https://example.com",
        });
    });

    it("notifyOpenFile 携带 path 字段", () => {
        notifyOpenFile("./docs/README.md");
        expect(mockVscodeApi.postMessage).toHaveBeenCalledWith({
            type: "openFile",
            path: "./docs/README.md",
        });
    });

    it("notifySendToClaudeChat 携带 text/startLine/endLine", () => {
        notifySendToClaudeChat("selected text", 10, 20);
        expect(mockVscodeApi.postMessage).toHaveBeenCalledWith({
            type: "sendToClaudeChat",
            text: "selected text",
            startLine: 10,
            endLine: 20,
        });
    });

    it("notifySwitchToTextEditor 不带 line 时不发送 line 字段", () => {
        notifySwitchToTextEditor();
        const msg = mockVscodeApi.postMessage.mock.calls[0][0] as Record<string, unknown>;
        expect(msg.type).toBe("switchToTextEditor");
        expect("line" in msg).toBe(false);
    });

    it("notifySwitchToTextEditor 携带 line 时发送 line 字段", () => {
        notifySwitchToTextEditor(42);
        expect(mockVscodeApi.postMessage).toHaveBeenCalledWith({
            type: "switchToTextEditor",
            line: 42,
        });
    });

    it("notifyUploadImage 携带所有必需字段", () => {
        const data = new Uint8Array([1, 2, 3]);
        notifyUploadImage("req-001", data, "image/png", "photo");
        expect(mockVscodeApi.postMessage).toHaveBeenCalledWith({
            type: "uploadImage",
            id: "req-001",
            data,
            mimeType: "image/png",
            altText: "photo",
        });
    });

    it("notifyGetProjectImages 携带 id 字段", () => {
        notifyGetProjectImages("img-list-1");
        expect(mockVscodeApi.postMessage).toHaveBeenCalledWith({
            type: "getProjectImages",
            id: "img-list-1",
        });
    });

    it("notifyGetPathSuggestions 携带 id 和 query", () => {
        notifyGetPathSuggestions("path-req-1", "./docs/");
        expect(mockVscodeApi.postMessage).toHaveBeenCalledWith({
            type: "getPathSuggestions",
            id: "path-req-1",
            query: "./docs/",
        });
    });

    it("notifyResolveImagePath 携带 id 和 relPath", () => {
        notifyResolveImagePath("resolve-1", "./images/photo.png");
        expect(mockVscodeApi.postMessage).toHaveBeenCalledWith({
            type: "resolveImagePath",
            id: "resolve-1",
            relPath: "./images/photo.png",
        });
    });

    it("notifyRenameImage 携带 id/webviewUri/newBasename", () => {
        notifyRenameImage("rename-1", "vscode-resource://img.png", "new-name.png");
        expect(mockVscodeApi.postMessage).toHaveBeenCalledWith({
            type: "renameImage",
            id: "rename-1",
            webviewUri: "vscode-resource://img.png",
            newBasename: "new-name.png",
        });
    });

    it("notifyOpenSettings 发送 { type: 'openSettings' }", () => {
        notifyOpenSettings();
        expect(mockVscodeApi.postMessage).toHaveBeenCalledWith({ type: "openSettings" });
    });
});
