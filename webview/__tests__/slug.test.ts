import { describe, it, expect } from "vitest";
import { slugify } from "../../webview/utils/slug";

describe("slugify", () => {
    it("英文转小写", () => {
        expect(slugify("Hello World")).toBe("hello-world");
    });

    it("空格替换为连字符", () => {
        expect(slugify("foo bar baz")).toBe("foo-bar-baz");
    });

    it("中文字符原样保留", () => {
        expect(slugify("二级标题示例")).toBe("二级标题示例");
    });

    it("中英文混合", () => {
        expect(slugify("H2 二级标题示例")).toBe("h2-二级标题示例");
    });

    it("emoji 被移除", () => {
        // emoji 不属于 \p{L}\p{N}_- 范围，会被移除，空格转为 -
        expect(slugify("🚀 Emoji 标题")).toBe("-emoji-标题");
    });

    it("冒号等符号被移除，保留相邻连字符（GitHub 规则）", () => {
        expect(slugify("含特殊字符 : 和 &")).toBe("含特殊字符--和-");
    });

    it("已是小写不变", () => {
        expect(slugify("lowercase")).toBe("lowercase");
    });

    it("空字符串返回空字符串", () => {
        expect(slugify("")).toBe("");
    });

    it("全符号字符串返回空字符串", () => {
        expect(slugify("!!!@@@###")).toBe("");
    });

    it("数字正确保留", () => {
        expect(slugify("Chapter 1")).toBe("chapter-1");
    });

    it("连字符和下划线原样保留", () => {
        expect(slugify("some-_-slug")).toBe("some-_-slug");
    });

    it("日文字符（平假名）正确保留", () => {
        const result = slugify("あいうえお");
        expect(result).toBe("あいうえお");
    });
});
