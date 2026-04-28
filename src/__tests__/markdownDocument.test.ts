import { describe, it, expect, vi, beforeEach } from "vitest";
import * as vscode from "vscode";

const mockFs = vscode.workspace.fs as {
    readFile: ReturnType<typeof vi.fn>;
    writeFile: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
};

import { MarkdownDocument } from "../../src/MarkdownDocument";

const makeUri = (p: string) => vscode.Uri.file(p);
const makeCancellation = (cancelled = false) =>
    ({ isCancellationRequested: cancelled } as vscode.CancellationToken);

describe("MarkdownDocument", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("create()", () => {
        it("从文件读取内容并返回 MarkdownDocument", async () => {
            const content = "# Hello\n\nWorld";
            mockFs.readFile.mockResolvedValue(Buffer.from(content, "utf-8"));
            const doc = await MarkdownDocument.create(makeUri("/project/note.md"));
            expect(doc.getText()).toBe(content);
        });

        it("正确处理 UTF-8 中文内容", async () => {
            const content = "# 标题\n\n正文内容，包含中文字符。";
            mockFs.readFile.mockResolvedValue(Buffer.from(content, "utf-8"));
            const doc = await MarkdownDocument.create(makeUri("/project/note.md"));
            expect(doc.getText()).toBe(content);
        });

        it("空文件返回空字符串", async () => {
            mockFs.readFile.mockResolvedValue(new Uint8Array());
            const doc = await MarkdownDocument.create(makeUri("/project/empty.md"));
            expect(doc.getText()).toBe("");
        });
    });

    describe("update()", () => {
        it("update() 后 getText() 返回新内容", async () => {
            mockFs.readFile.mockResolvedValue(Buffer.from("old content", "utf-8"));
            const doc = await MarkdownDocument.create(makeUri("/project/note.md"));
            doc.update("new content");
            expect(doc.getText()).toBe("new content");
        });
    });

    describe("save()", () => {
        it("将当前内容写入磁盘", async () => {
            mockFs.readFile.mockResolvedValue(Buffer.from("initial", "utf-8"));
            mockFs.writeFile.mockResolvedValue(undefined);
            const doc = await MarkdownDocument.create(makeUri("/project/note.md"));
            doc.update("updated content");
            await doc.save(makeCancellation());
            expect(mockFs.writeFile).toHaveBeenCalledOnce();
            const [, data] = mockFs.writeFile.mock.calls[0] as [unknown, Buffer];
            expect(data.toString("utf-8")).toBe("updated content");
        });

        it("CancellationToken 已取消时跳过写盘", async () => {
            mockFs.readFile.mockResolvedValue(Buffer.from("initial", "utf-8"));
            const doc = await MarkdownDocument.create(makeUri("/project/note.md"));
            await doc.save(makeCancellation(true));
            expect(mockFs.writeFile).not.toHaveBeenCalled();
        });
    });

    describe("revert()", () => {
        it("revert() 后 getText() 返回磁盘最新内容", async () => {
            mockFs.readFile
                .mockResolvedValueOnce(Buffer.from("original", "utf-8"))
                .mockResolvedValueOnce(Buffer.from("reverted from disk", "utf-8"));
            const doc = await MarkdownDocument.create(makeUri("/project/note.md"));
            doc.update("in-memory edit");
            await doc.revert(makeCancellation());
            expect(doc.getText()).toBe("reverted from disk");
        });
    });

    describe("backup()", () => {
        it("将内容写入 destination 并返回 backup 对象", async () => {
            mockFs.readFile.mockResolvedValue(Buffer.from("content", "utf-8"));
            mockFs.writeFile.mockResolvedValue(undefined);
            const doc = await MarkdownDocument.create(makeUri("/project/note.md"));
            const dest = makeUri("/tmp/backup.md");
            const backup = await doc.backup(dest, makeCancellation());
            expect(backup.id).toBe(dest.toString());
            expect(mockFs.writeFile).toHaveBeenCalledOnce();
        });

        it("backup.delete() 删除备份文件", async () => {
            mockFs.readFile.mockResolvedValue(Buffer.from("content", "utf-8"));
            mockFs.writeFile.mockResolvedValue(undefined);
            mockFs.delete.mockResolvedValue(undefined);
            const doc = await MarkdownDocument.create(makeUri("/project/note.md"));
            const backup = await doc.backup(makeUri("/tmp/backup.md"), makeCancellation());
            await backup.delete();
            expect(mockFs.delete).toHaveBeenCalledOnce();
        });

        it("backup.delete() 文件不存在时不抛出错误", async () => {
            mockFs.readFile.mockResolvedValue(Buffer.from("content", "utf-8"));
            mockFs.writeFile.mockResolvedValue(undefined);
            mockFs.delete.mockRejectedValue(new Error("ENOENT"));
            const doc = await MarkdownDocument.create(makeUri("/project/note.md"));
            const backup = await doc.backup(makeUri("/tmp/backup.md"), makeCancellation());
            await expect(backup.delete()).resolves.not.toThrow();
        });
    });

    describe("uri 属性", () => {
        it("uri 与创建时传入的 uri 一致", async () => {
            const uri = makeUri("/project/note.md");
            mockFs.readFile.mockResolvedValue(Buffer.from("", "utf-8"));
            const doc = await MarkdownDocument.create(uri);
            expect(doc.uri.fsPath).toBe(uri.fsPath);
        });
    });
});
