import { describe, it, expect } from "vitest";
import { getNonce } from "../../src/utils/getNonce";

describe("getNonce", () => {
    it("返回字符串类型", () => {
        expect(typeof getNonce()).toBe("string");
    });

    it("返回 16 字节的 base64 编码（长度 24）", () => {
        // 16 字节的 base64 编码固定为 24 个字符（含填充 =）
        expect(getNonce()).toHaveLength(24);
    });

    it("只包含合法 base64 字符", () => {
        const nonce = getNonce();
        expect(nonce).toMatch(/^[A-Za-z0-9+/=]+$/);
    });

    it("连续两次调用生成不同的 nonce（唯一性）", () => {
        const n1 = getNonce();
        const n2 = getNonce();
        // 随机性保证极低概率相同；若碰撞则说明随机性失效
        expect(n1).not.toBe(n2);
    });

    it("批量生成 100 个 nonce，全部唯一", () => {
        const nonces = new Set(Array.from({ length: 100 }, () => getNonce()));
        expect(nonces.size).toBe(100);
    });
});
