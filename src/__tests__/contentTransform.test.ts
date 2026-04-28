import { describe, it, expect } from "vitest";
import {
    extractFrontmatter,
    restoreContentForSave,
} from "../../src/utils/contentTransform";
import { computeLineMap } from "../../src/utils/lineMap";

// ─────────────────────────────────────────────────────────────
// extractFrontmatter
// ─────────────────────────────────────────────────────────────
describe("extractFrontmatter", () => {
    it("标准 frontmatter 正确分离", () => {
        const content = "---\ntitle: Test\ndate: 2024-01-01\n---\n# Hello";
        const { frontmatter, body } = extractFrontmatter(content);
        expect(frontmatter).toBe("---\ntitle: Test\ndate: 2024-01-01\n---\n");
        expect(body).toBe("# Hello");
    });

    it("无 frontmatter 时原样返回正文，frontmatter 为空字符串", () => {
        const content = "# Just a heading\n\nSome text.";
        const { frontmatter, body } = extractFrontmatter(content);
        expect(frontmatter).toBe("");
        expect(body).toBe(content);
    });

    it("空文件返回空 frontmatter 和空 body", () => {
        const { frontmatter, body } = extractFrontmatter("");
        expect(frontmatter).toBe("");
        expect(body).toBe("");
    });

    it("frontmatter 仅含分隔符（无键值对）时不识别（正则要求至少一行内容）", () => {
        // 实现的正则 /^---\r?\n[\s\S]*?\r?\n---\r?\n?/ 需要两个 --- 之间至少有一个换行
        // 纯 ---\n---\n 不满足条件，作为正文返回
        const content = "---\n---\n# Body";
        const { frontmatter, body } = extractFrontmatter(content);
        expect(frontmatter).toBe("");
        expect(body).toBe(content);
    });

    it("多层嵌套 YAML 正确分离", () => {
        const content = "---\nauthor:\n  name: Alice\n  email: a@b.com\ntags:\n  - md\n---\n# Doc";
        const { frontmatter, body } = extractFrontmatter(content);
        expect(body).toBe("# Doc");
        expect(frontmatter).toContain("author:");
    });

    it("Windows CRLF 行尾 frontmatter 正确识别", () => {
        const content = "---\r\ntitle: Test\r\n---\r\n# Body";
        const { frontmatter, body } = extractFrontmatter(content);
        expect(frontmatter).not.toBe("");
        expect(body).toBe("# Body");
    });

    it("frontmatter 中间含空行时正确匹配（贪婪最短）", () => {
        // 第一个 --- 结束符即为 frontmatter 的终止
        const content = "---\ntitle: A\n---\n# H1\n---\nNot frontmatter\n---\n";
        const { frontmatter, body } = extractFrontmatter(content);
        expect(frontmatter).toBe("---\ntitle: A\n---\n");
        expect(body).toContain("# H1");
    });

    it("frontmatter 不在文件开头时不识别", () => {
        const content = "Some text\n---\ntitle: Test\n---\n";
        const { frontmatter, body } = extractFrontmatter(content);
        expect(frontmatter).toBe("");
        expect(body).toBe(content);
    });
});

// ─────────────────────────────────────────────────────────────
// restoreContentForSave
// ─────────────────────────────────────────────────────────────
describe("restoreContentForSave", () => {
    it("将 webviewUri 替换为相对路径", () => {
        const uriMap = new Map([["vscode-resource://host/project/images/photo.png", "./images/photo.png"]]);
        const content = "![alt](vscode-resource://host/project/images/photo.png)";
        const result = restoreContentForSave(content, "", uriMap);
        expect(result).toBe("![alt](./images/photo.png)");
    });

    it("frontmatter 非空时拼接在正文前", () => {
        const frontmatter = "---\ntitle: A\n---\n";
        const result = restoreContentForSave("# Body", frontmatter, new Map());
        expect(result).toBe("---\ntitle: A\n---\n# Body");
    });

    it("多个 webviewUri 全部替换", () => {
        const uriMap = new Map([
            ["vscode-resource://host/img1.png", "./img1.png"],
            ["vscode-resource://host/img2.jpg", "./img2.jpg"],
        ]);
        const content = "![a](vscode-resource://host/img1.png) ![b](vscode-resource://host/img2.jpg)";
        const result = restoreContentForSave(content, "", uriMap);
        expect(result).toBe("![a](./img1.png) ![b](./img2.jpg)");
    });

    it("uriMap 为空时内容原样返回", () => {
        const content = "# Hello";
        const result = restoreContentForSave(content, "", new Map());
        expect(result).toBe(content);
    });

    it("未登记的 URI 保持原样（防止数据丢失）", () => {
        const uriMap = new Map([["vscode-resource://known.png", "./known.png"]]);
        const content = "![a](vscode-resource://unknown.png)";
        const result = restoreContentForSave(content, "", uriMap);
        expect(result).toContain("vscode-resource://unknown.png");
    });

    it("同一 webviewUri 多次出现时全部替换", () => {
        const uriMap = new Map([["vscode-resource://img.png", "./img.png"]]);
        const content = "![1](vscode-resource://img.png) ![2](vscode-resource://img.png)";
        const result = restoreContentForSave(content, "", uriMap);
        expect(result).toBe("![1](./img.png) ![2](./img.png)");
    });
});

// ─────────────────────────────────────────────────────────────
// computeLineMap
// ─────────────────────────────────────────────────────────────
describe("computeLineMap", () => {
    it("空内容返回空数组", () => {
        expect(computeLineMap("")).toEqual([]);
    });

    it("只有空行返回空数组", () => {
        expect(computeLineMap("\n\n\n")).toEqual([]);
    });

    it("单行内容返回 [1]", () => {
        expect(computeLineMap("# Hello")).toEqual([1]);
    });

    it("两个段落（中间空行分隔）返回各段起始行号", () => {
        const content = "# Heading\n\nSome paragraph text.";
        const lineMap = computeLineMap(content);
        expect(lineMap).toEqual([1, 3]);
    });

    it("代码块整体作为一个段落处理", () => {
        const content = "# H\n\n```ts\nconst x = 1;\nconst y = 2;\n```\n\n## H2";
        const lineMap = computeLineMap(content);
        // 期望：行1（标题）、行3（代码块）、行8（H2）
        expect(lineMap[0]).toBe(1);
        expect(lineMap[1]).toBe(3);
        expect(lineMap[2]).toBe(8);
    });

    it("波浪线代码块（~~~）同样正确处理", () => {
        const content = "~~~python\nprint('hello')\n~~~\n\n# After";
        const lineMap = computeLineMap(content);
        expect(lineMap.length).toBe(2);
    });

    it("行号从 1 开始（1-indexed）", () => {
        const content = "paragraph1\n\nparagraph2";
        const lineMap = computeLineMap(content);
        expect(lineMap[0]).toBe(1);
    });

    it("前导空行不计入行号", () => {
        const content = "\n\n# Heading";
        const lineMap = computeLineMap(content);
        expect(lineMap).toEqual([3]);
    });

    it("大文件（1000 行）计算耗时低于 100ms", () => {
        const content = Array.from({ length: 200 }, (_, i) => `## Heading ${i}\n\nContent ${i}`).join("\n\n");
        const start = performance.now();
        computeLineMap(content);
        const elapsed = performance.now() - start;
        expect(elapsed).toBeLessThan(100);
    });
});
