/**
 * replaceContent 测试：外部写入的内容作为一次可撤销的事务应用。
 */
import { describe, it, expect, vi } from "vitest";
import { editorViewCtx, serializerCtx } from "@milkdown/core";
import { undo, redo } from "@milkdown/prose/history";
import { createEditor, replaceContent } from "../editor";

// jsdom 未实现 ResizeObserver（headingSticky 插件需要）
globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
} as never;

describe("replaceContent", () => {
    it("外部内容可撤销/重做，且不回写磁盘", async () => {
        const container = document.createElement("div");
        document.body.appendChild(container);
        const onUpdate = vi.fn();
        const editor = await createEditor(container, "# Title\n\nold text\n", onUpdate);
        const md = () =>
            editor.action((ctx) => ctx.get(serializerCtx)(ctx.get(editorViewCtx).state.doc));
        const view = editor.action((ctx) => ctx.get(editorViewCtx));

        // 模拟用户已交互，确保 markdownUpdated 不会因"未交互"而被忽略
        document.dispatchEvent(new KeyboardEvent("keydown"));
        replaceContent("Title\n=====\n\n* new text\n* item __b__\n\n***\n");
        expect(md()).toContain("new text");
        // 等待 listener(200ms) + 保存防抖(300ms)：外部内容不应回写
        await new Promise((r) => setTimeout(r, 700));
        expect(onUpdate).not.toHaveBeenCalled();

        expect(undo(view.state, view.dispatch)).toBe(true);
        expect(md()).toContain("old text");
        // 用户撤销属于真实修改，应保存到磁盘
        await new Promise((r) => setTimeout(r, 700));
        expect(onUpdate).toHaveBeenCalledTimes(1);
        expect(onUpdate.mock.calls[0][0]).toContain("old text");

        expect(redo(view.state, view.dispatch)).toBe(true);
        expect(md()).toContain("new text");

        editor.destroy();
    });
});
