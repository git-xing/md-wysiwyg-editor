/**
 * jsdom 环境 setup：在测试文件加载前注入 acquireVsCodeApi 全局函数，
 * 使 messaging.ts 在模块初始化时能正常调用。
 */
import { vi } from "vitest";

const mockVscodeApi = {
    postMessage: vi.fn(),
    getState: vi.fn(() => null),
    setState: vi.fn(),
};

Object.defineProperty(globalThis, "acquireVsCodeApi", {
    value: () => mockVscodeApi,
    writable: true,
    configurable: true,
});

/** 供测试断言使用 */
export { mockVscodeApi };
