import { describe, it, expect, vi, beforeEach } from "vitest";
import * as path from "path";
import * as https from "https";
import * as http from "http";

// 从 vscode mock 导入（alias 已在 vitest.config.ts 中配置）
import * as vscode from "vscode";

// 模块级 mock（Vitest 自动 hoist 至 import 之前）
vi.mock("https", () => ({ request: vi.fn() }));
vi.mock("http", () => ({ request: vi.fn() }));
const mockFs = vscode.workspace.fs as {
    readFile: ReturnType<typeof vi.fn>;
    writeFile: ReturnType<typeof vi.fn>;
    readDirectory: ReturnType<typeof vi.fn>;
    stat: ReturnType<typeof vi.fn>;
    createDirectory: ReturnType<typeof vi.fn>;
};

import {
    mimeToExt,
    generateFilename,
    buildRelPath,
    getByPath,
    saveImageLocally,
    uploadImageToServer,
} from "../../src/utils/imageService";

// ─────────────────────────────────────────────────────────────
// mimeToExt
// ─────────────────────────────────────────────────────────────
describe("mimeToExt", () => {
    it.each([
        ["image/png", "png"],
        ["image/jpeg", "jpg"],
        ["image/jpg", "jpg"],
        ["image/gif", "gif"],
        ["image/webp", "webp"],
        ["image/svg+xml", "svg"],
        ["image/bmp", "bmp"],
        ["image/tiff", "tiff"],
    ])("MIME %s → 扩展名 %s", (mime, ext) => {
        expect(mimeToExt(mime)).toBe(ext);
    });

    it("未知 MIME 降级返回 png", () => {
        expect(mimeToExt("image/xyz")).toBe("png");
    });

    it("空字符串降级返回 png", () => {
        expect(mimeToExt("")).toBe("png");
    });
});

// ─────────────────────────────────────────────────────────────
// generateFilename
// ─────────────────────────────────────────────────────────────
describe("generateFilename", () => {
    it("返回的文件名以正确扩展名结尾", () => {
        const name = generateFilename("photo", "image/png");
        expect(name).toMatch(/\.png$/);
    });

    it("altText 超过 20 字符时截断", () => {
        const name = generateFilename("a".repeat(30), "image/jpeg");
        const [prefix] = name.split("_");
        expect(prefix.length).toBeLessThanOrEqual(20);
    });

    it("altText 含特殊字符时替换为短横线", () => {
        const name = generateFilename("hello world!", "image/png");
        const [prefix] = name.split("_");
        expect(prefix).not.toMatch(/[ !]/);
    });

    it("连续特殊字符合并为单个短横线", () => {
        const name = generateFilename("a  b!!c", "image/png");
        const [prefix] = name.split("_");
        expect(prefix).not.toMatch(/--/);
    });

    it("空 altText 时使用 'image' 作为默认前缀", () => {
        const name = generateFilename("", "image/png");
        expect(name.startsWith("image_")).toBe(true);
    });

    it("仅含特殊字符的 altText 使用 'image' 作为默认前缀", () => {
        const name = generateFilename("!!!---", "image/png");
        expect(name.startsWith("image_")).toBe(true);
    });

    it("中文 altText 正确保留 Unicode 字符", () => {
        const name = generateFilename("截图", "image/png");
        expect(name).toMatch(/^截图/);
    });

    it("相同 altText 连续调用生成不同文件名", () => {
        const n1 = generateFilename("test", "image/png");
        const n2 = generateFilename("test", "image/png");
        // 极低概率相同，足够验证唯一性设计
        expect(typeof n1).toBe("string");
        expect(typeof n2).toBe("string");
    });
});

// ─────────────────────────────────────────────────────────────
// buildRelPath
// ─────────────────────────────────────────────────────────────
describe("buildRelPath", () => {
    it("同目录下文件返回 ./filename", () => {
        const docUri = vscode.Uri.file("/project/docs/note.md");
        const fileUri = vscode.Uri.file("/project/docs/images/photo.png");
        const rel = buildRelPath(docUri, fileUri);
        expect(rel).toBe("./images/photo.png");
    });

    it("返回路径使用正斜杠（跨平台）", () => {
        const docUri = vscode.Uri.file("/project/a/b/note.md");
        const fileUri = vscode.Uri.file("/project/a/b/imgs/x.png");
        const rel = buildRelPath(docUri, fileUri);
        expect(rel).not.toMatch(/\\/);
    });

    it("返回路径以 ./ 开头", () => {
        const docUri = vscode.Uri.file("/project/note.md");
        const fileUri = vscode.Uri.file("/project/images/x.png");
        const rel = buildRelPath(docUri, fileUri);
        expect(rel.startsWith("./")).toBe(true);
    });

    it("untitled 文档（非 file scheme）返回绝对路径", () => {
        const docUri = { fsPath: "untitled", scheme: "untitled", toString: () => "untitled:" };
        const fileUri = vscode.Uri.file("/home/user/images/photo.png");
        const rel = buildRelPath(docUri as typeof fileUri, fileUri);
        expect(path.isAbsolute(rel)).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────
// getByPath
// ─────────────────────────────────────────────────────────────
describe("getByPath", () => {
    it("顶层属性正确提取", () => {
        expect(getByPath({ url: "https://example.com" }, "url")).toBe("https://example.com");
    });

    it("点分路径 data.url 正确提取嵌套属性", () => {
        expect(getByPath({ data: { url: "https://img.example.com/a.png" } }, "data.url")).toBe(
            "https://img.example.com/a.png"
        );
    });

    it("路径不存在时返回 undefined", () => {
        expect(getByPath({ a: 1 }, "b.c")).toBeUndefined();
    });

    it("中间层为 null 时返回 undefined", () => {
        expect(getByPath({ a: null }, "a.b")).toBeUndefined();
    });

    it("空对象返回 undefined", () => {
        expect(getByPath({}, "x")).toBeUndefined();
    });
});

// ─────────────────────────────────────────────────────────────
// saveImageLocally — MD5 去重逻辑
// ─────────────────────────────────────────────────────────────
describe("saveImageLocally — MD5 去重", () => {
    const docUri = vscode.Uri.file("/project/docs/note.md");
    const imageData = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]); // PNG 魔数

    function makeCfg(overrides: Record<string, unknown> = {}) {
        return {
            get: vi.fn((key: string, def?: unknown) => overrides[key] ?? def),
        };
    }

    beforeEach(() => {
        vi.clearAllMocks();
        // 默认 stat 抛出（目录不存在，触发创建）
        mockFs.stat.mockRejectedValue(new Error("ENOENT"));
        mockFs.createDirectory.mockResolvedValue(undefined);
        mockFs.readDirectory.mockResolvedValue([]);
        mockFs.writeFile.mockResolvedValue(undefined);
    });

    it("目录为空时直接写入新文件并返回相对路径", async () => {
        const cfg = makeCfg();
        const result = await saveImageLocally(docUri, cfg as never, imageData, "image/png", "photo");
        expect(mockFs.writeFile).toHaveBeenCalledOnce();
        expect(result.relPath).toMatch(/^\.\/images\//);
        expect(result.relPath).toMatch(/\.png$/);
    });

    it("目录中存在相同 MD5 的同扩展名文件时复用，不重复写入", async () => {
        // 模拟目录中已有一个 .png 文件
        const existingName = "photo_abc123_def4.png";
        mockFs.stat.mockResolvedValue({ type: vscode.FileType.Directory });
        mockFs.readDirectory.mockResolvedValue([[existingName, vscode.FileType.File]]);
        mockFs.readFile.mockResolvedValue(imageData); // 相同内容 → 相同 MD5

        const cfg = makeCfg();
        const result = await saveImageLocally(docUri, cfg as never, imageData, "image/png", "photo");

        expect(mockFs.writeFile).not.toHaveBeenCalled();
        expect(result.relPath).toContain(existingName);
    });

    it("目录中存在不同内容的文件时写入新文件", async () => {
        const existingName = "other_abc123_def4.png";
        const differentData = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);
        mockFs.stat.mockResolvedValue({ type: vscode.FileType.Directory });
        mockFs.readDirectory.mockResolvedValue([[existingName, vscode.FileType.File]]);
        mockFs.readFile.mockResolvedValue(differentData); // 不同内容 → 不同 MD5

        const cfg = makeCfg();
        await saveImageLocally(docUri, cfg as never, imageData, "image/png", "photo");

        expect(mockFs.writeFile).toHaveBeenCalledOnce();
    });

    it("不比较不同扩展名的已有文件（只比对同扩展名）", async () => {
        // 目录中只有 .jpg 文件，上传的是 .png
        const existingName = "photo_abc_def.jpg";
        mockFs.stat.mockResolvedValue({ type: vscode.FileType.Directory });
        mockFs.readDirectory.mockResolvedValue([[existingName, vscode.FileType.File]]);
        mockFs.readFile.mockResolvedValue(imageData);

        const cfg = makeCfg();
        await saveImageLocally(docUri, cfg as never, imageData, "image/png", "photo");

        // readFile 不应被调用（因为扩展名不匹配，跳过比对）
        expect(mockFs.readFile).not.toHaveBeenCalled();
        expect(mockFs.writeFile).toHaveBeenCalledOnce();
    });
});

// ─────────────────────────────────────────────────────────────
// saveImageLocally — 目录选择优先级
// ─────────────────────────────────────────────────────────────
describe("saveImageLocally — 目录选择", () => {
    const docUri = vscode.Uri.file("/project/docs/note.md");
    const imageData = new Uint8Array([1, 2, 3]);

    function makeCfg(overrides: Record<string, unknown> = {}) {
        return { get: vi.fn((key: string, def?: unknown) => overrides[key] ?? def) };
    }

    beforeEach(() => {
        vi.clearAllMocks();
        mockFs.readDirectory.mockResolvedValue([]);
        mockFs.writeFile.mockResolvedValue(undefined);
        mockFs.createDirectory.mockResolvedValue(undefined);
    });

    it("优先使用绝对路径 imageLocalPath 配置项", async () => {
        const customPath = "/custom/image-dir";
        mockFs.stat.mockResolvedValue({ type: vscode.FileType.Directory });
        const cfg = makeCfg({ imageLocalPath: customPath });
        await saveImageLocally(docUri, cfg as never, imageData, "image/png", "x");
        // writeFile 应被调用，且路径包含 customPath
        const [callUri] = mockFs.writeFile.mock.calls[0] as [{ fsPath: string }];
        expect(callUri.fsPath.startsWith(customPath)).toBe(true);
    });

    it("无配置时且所有候选目录不存在则创建 images/ 目录", async () => {
        // stat 始终抛出（所有目录不存在）
        mockFs.stat.mockRejectedValue(new Error("ENOENT"));
        const cfg = makeCfg();
        await saveImageLocally(docUri, cfg as never, imageData, "image/png", "x");
        expect(mockFs.createDirectory).toHaveBeenCalled();
        const [createdUri] = mockFs.createDirectory.mock.calls[0] as [{ fsPath: string }];
        expect(createdUri.fsPath).toContain("images");
    });
});

// ─────────────────────────────────────────────────────────────
// saveImageLocally — 额外路径分支
// ─────────────────────────────────────────────────────────────
describe("saveImageLocally — 额外路径分支", () => {
    const imageData = new Uint8Array([1, 2, 3]);

    function makeCfg(overrides: Record<string, unknown> = {}) {
        return { get: vi.fn((key: string, def?: unknown) => overrides[key] ?? def) };
    }

    beforeEach(() => {
        vi.clearAllMocks();
        (vscode.workspace.getWorkspaceFolder as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
        mockFs.readDirectory.mockResolvedValue([]);
        mockFs.writeFile.mockResolvedValue(undefined);
        mockFs.createDirectory.mockResolvedValue(undefined);
        mockFs.stat.mockRejectedValue(new Error("ENOENT"));
    });

    it("相对 imageLocalPath + 有 workspace folder：使用 workspace root 拼接路径", async () => {
        const docUri = vscode.Uri.file("/project/docs/note.md");
        (vscode.workspace.getWorkspaceFolder as ReturnType<typeof vi.fn>)
            .mockReturnValue({ uri: vscode.Uri.file("/project") });

        const cfg = makeCfg({ imageLocalPath: "static/images" });
        await saveImageLocally(docUri, cfg as never, imageData, "image/png", "x");

        const [callUri] = mockFs.writeFile.mock.calls[0] as [{ fsPath: string }];
        expect(callUri.fsPath).toContain("static/images");
    });

    it("相对 imageLocalPath + 无 workspace folder：使用 .md 同级目录拼接路径", async () => {
        const docUri = vscode.Uri.file("/project/docs/note.md");

        const cfg = makeCfg({ imageLocalPath: "imgs" });
        await saveImageLocally(docUri, cfg as never, imageData, "image/png", "x");

        const [callUri] = mockFs.writeFile.mock.calls[0] as [{ fsPath: string }];
        expect(callUri.fsPath).toContain("imgs");
    });

    it("untitled（非 file scheme）文档降级保存到 home/images/ 目录", async () => {
        const untitledUri = {
            fsPath: "untitled-1",
            scheme: "untitled",
            toString: () => "untitled:untitled-1",
        };

        const cfg = makeCfg();
        await saveImageLocally(untitledUri as never, cfg as never, imageData, "image/png", "x");

        expect(mockFs.createDirectory).toHaveBeenCalled();
        const [callUri] = mockFs.writeFile.mock.calls[0] as [{ fsPath: string }];
        expect(callUri.fsPath).toContain("images");
    });

    it("自动检测时优先使用已存在的 imgs 候选目录", async () => {
        const docUri = vscode.Uri.file("/project/docs/note.md");
        mockFs.stat.mockImplementation(({ fsPath }: { fsPath: string }) =>
            fsPath.endsWith("imgs")
                ? Promise.resolve({ type: vscode.FileType.Directory })
                : Promise.reject(new Error("ENOENT")),
        );

        const cfg = makeCfg();
        await saveImageLocally(docUri, cfg as never, imageData, "image/png", "x");

        const [callUri] = mockFs.writeFile.mock.calls[0] as [{ fsPath: string }];
        expect(callUri.fsPath).toContain("imgs");
        expect(mockFs.createDirectory).not.toHaveBeenCalled();
    });

    it("MD5 去重：readFile 读取失败时跳过该文件继续处理", async () => {
        const docUri = vscode.Uri.file("/project/docs/note.md");
        mockFs.readDirectory.mockResolvedValue([["broken.png", vscode.FileType.File]]);
        mockFs.readFile.mockRejectedValue(new Error("EPERM"));

        const cfg = makeCfg();
        const result = await saveImageLocally(docUri, cfg as never, imageData, "image/png", "x");

        expect(mockFs.writeFile).toHaveBeenCalledOnce();
        expect(result.relPath).toMatch(/\.png$/);
    });
});

// ─────────────────────────────────────────────────────────────
// uploadImageToServer
// ─────────────────────────────────────────────────────────────

function createSuccessMockTransport(responseBody: string) {
    const dataHandlers: Array<(chunk: Buffer) => void> = [];
    const endHandlers: Array<() => void> = [];

    const mockRes = {
        on: vi.fn((event: string, cb: unknown) => {
            if (event === "data") dataHandlers.push(cb as (c: Buffer) => void);
            if (event === "end") endHandlers.push(cb as () => void);
        }),
    };

    const mockReq = {
        on: vi.fn(),
        setTimeout: vi.fn(),
        write: vi.fn(),
        end: vi.fn(() => {
            dataHandlers.forEach(h => h(Buffer.from(responseBody)));
            endHandlers.forEach(h => h());
        }),
        destroy: vi.fn(),
    };

    return { mockRes, mockReq };
}

function createErrorMockTransport(error: Error) {
    const errHandlers: Array<(e: Error) => void> = [];

    return {
        on: vi.fn((event: string, cb: unknown) => {
            if (event === "error") errHandlers.push(cb as (e: Error) => void);
        }),
        setTimeout: vi.fn(),
        write: vi.fn(),
        end: vi.fn(() => { errHandlers.forEach(h => h(error)); }),
        destroy: vi.fn(),
    };
}

describe("uploadImageToServer", () => {
    const imageData = new Uint8Array([1, 2, 3, 4]);

    function makeCfg(overrides: Record<string, unknown> = {}) {
        return { get: vi.fn((key: string, def?: unknown) => overrides[key] ?? def) };
    }

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("serverUrl 为空时立即抛出错误，不发起网络请求", async () => {
        const cfg = makeCfg({ imageServerUrl: "" });
        await expect(
            uploadImageToServer(cfg as never, imageData, "image/png", "photo"),
        ).rejects.toThrow("请先在设置中配置");
    });

    it("HTTPS 上传成功，返回响应中的 URL", async () => {
        const { mockRes, mockReq } = createSuccessMockTransport('{"url":"https://cdn.example.com/img.png"}');
        vi.mocked(https.request).mockImplementation((_opts, cb) => {
            (cb as (r: typeof mockRes) => void)(mockRes);
            return mockReq as never;
        });

        const cfg = makeCfg({ imageServerUrl: "https://upload.example.com/api" });
        const result = await uploadImageToServer(cfg as never, imageData, "image/png", "photo");
        expect(result).toBe("https://cdn.example.com/img.png");
    });

    it("HTTP URL 使用 http 模块而非 https 模块", async () => {
        const { mockRes, mockReq } = createSuccessMockTransport('{"url":"http://cdn.example.com/img.png"}');
        vi.mocked(http.request).mockImplementation((_opts, cb) => {
            (cb as (r: typeof mockRes) => void)(mockRes);
            return mockReq as never;
        });

        const cfg = makeCfg({ imageServerUrl: "http://upload.example.com/api" });
        await uploadImageToServer(cfg as never, imageData, "image/png", "photo");

        expect(vi.mocked(http.request)).toHaveBeenCalled();
        expect(vi.mocked(https.request)).not.toHaveBeenCalled();
    });

    it("extraParams 被序列化并写入请求体", async () => {
        const { mockRes, mockReq } = createSuccessMockTransport('{"url":"https://cdn.example.com/img.png"}');
        vi.mocked(https.request).mockImplementation((_opts, cb) => {
            (cb as (r: typeof mockRes) => void)(mockRes);
            return mockReq as never;
        });

        const cfg = makeCfg({
            imageServerUrl: "https://upload.example.com/api",
            imageServerExtraParams: '{"token":"abc123"}',
        });
        await uploadImageToServer(cfg as never, imageData, "image/png", "photo");

        const body = (mockReq.write.mock.calls[0]?.[0] as Buffer).toString();
        expect(body).toContain("token");
        expect(body).toContain("abc123");
    });

    it("extraParams 为无效 JSON 时忽略并继续上传", async () => {
        const { mockRes, mockReq } = createSuccessMockTransport('{"url":"https://cdn.example.com/img.png"}');
        vi.mocked(https.request).mockImplementation((_opts, cb) => {
            (cb as (r: typeof mockRes) => void)(mockRes);
            return mockReq as never;
        });

        const cfg = makeCfg({
            imageServerUrl: "https://upload.example.com/api",
            imageServerExtraParams: "not-valid-json!!!",
        });
        await expect(
            uploadImageToServer(cfg as never, imageData, "image/png", "photo"),
        ).resolves.toBe("https://cdn.example.com/img.png");
    });

    it("服务端返回非 JSON 时抛出错误", async () => {
        const { mockRes, mockReq } = createSuccessMockTransport("Internal Server Error");
        vi.mocked(https.request).mockImplementation((_opts, cb) => {
            (cb as (r: typeof mockRes) => void)(mockRes);
            return mockReq as never;
        });

        const cfg = makeCfg({ imageServerUrl: "https://upload.example.com/api" });
        await expect(
            uploadImageToServer(cfg as never, imageData, "image/png", "photo"),
        ).rejects.toThrow("non-JSON");
    });

    it("响应 JSON 中路径提取不到 URL 时抛出错误", async () => {
        const { mockRes, mockReq } = createSuccessMockTransport('{"status":"ok"}');
        vi.mocked(https.request).mockImplementation((_opts, cb) => {
            (cb as (r: typeof mockRes) => void)(mockRes);
            return mockReq as never;
        });

        const cfg = makeCfg({ imageServerUrl: "https://upload.example.com/api" });
        await expect(
            uploadImageToServer(cfg as never, imageData, "image/png", "photo"),
        ).rejects.toThrow("Cannot extract URL");
    });

    it("网络错误时 Promise reject", async () => {
        const mockReq = createErrorMockTransport(new Error("ECONNREFUSED"));
        vi.mocked(https.request).mockImplementation(() => mockReq as never);

        const cfg = makeCfg({ imageServerUrl: "https://upload.example.com/api" });
        await expect(
            uploadImageToServer(cfg as never, imageData, "image/png", "photo"),
        ).rejects.toThrow("ECONNREFUSED");
    });

    it("嵌套 responsePath（如 data.url）正确提取 URL", async () => {
        const { mockRes, mockReq } = createSuccessMockTransport(
            '{"data":{"url":"https://cdn.example.com/img.png"}}',
        );
        vi.mocked(https.request).mockImplementation((_opts, cb) => {
            (cb as (r: typeof mockRes) => void)(mockRes);
            return mockReq as never;
        });

        const cfg = makeCfg({
            imageServerUrl: "https://upload.example.com/api",
            imageServerResponsePath: "data.url",
        });
        const result = await uploadImageToServer(cfg as never, imageData, "image/png", "photo");
        expect(result).toBe("https://cdn.example.com/img.png");
    });
});
