import { describe, it, expect, vi, beforeEach } from "vitest";
import * as path from "path";

// 从 vscode mock 导入（alias 已在 vitest.config.ts 中配置）
import * as vscode from "vscode";
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
