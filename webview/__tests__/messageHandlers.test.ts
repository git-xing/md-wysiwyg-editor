/**
 * messageHandlers.ts 测试：验证表格换行模式配置的应用逻辑。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { applyTableWrap, createMessageHandlers } from "../messageHandlers";

vi.mock("../components/frontmatter", () => ({ renderFrontmatterPanel: vi.fn() }));

describe("applyTableWrap", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // 清除 CSS 变量
        const root = document.documentElement;
        root.style.removeProperty("--tbl-ow");
    });

    it("aggressive 模式设置 overflow-wrap: anywhere", () => {
        applyTableWrap("aggressive");
        const val = document.documentElement.style.getPropertyValue("--tbl-ow").trim();
        expect(val).toBe("anywhere");
    });

    it("normal 模式设置 overflow-wrap: break-word", () => {
        applyTableWrap("normal");
        const val = document.documentElement.style.getPropertyValue("--tbl-ow").trim();
        expect(val).toBe("break-word");
    });

    it("none 模式设置 overflow-wrap: normal", () => {
        applyTableWrap("none");
        const val = document.documentElement.style.getPropertyValue("--tbl-ow").trim();
        expect(val).toBe("normal");
    });

    it("切换模式时覆盖之前的设置", () => {
        applyTableWrap("aggressive");
        expect(document.documentElement.style.getPropertyValue("--tbl-ow").trim()).toBe("anywhere");

        applyTableWrap("normal");
        expect(document.documentElement.style.getPropertyValue("--tbl-ow").trim()).toBe("break-word");

        applyTableWrap("none");
        expect(document.documentElement.style.getPropertyValue("--tbl-ow").trim()).toBe("normal");
    });
});

describe("revert", () => {
    const makeHandlers = (editor: unknown) => {
        const initEditor = vi.fn(async () => {});
        const applyExternalContent = vi.fn();
        const handlers = createMessageHandlers({
            state: {
                getEditor: () => editor as never,
                setEditor: vi.fn(),
                getLineMap: () => [],
                setLineMap: vi.fn(),
                getMarkdownSource: () => "",
                setMarkdownSource: vi.fn(),
            },
            actions: {
                scrollToSourceLine: vi.fn(),
                getFirstVisibleSourceLine: vi.fn(() => 1),
                initEditor,
                applyExternalContent,
                retryScroll: vi.fn(),
                getEditorView: () => null,
            },
            topbarTb: null,
            themeOverrides: new Set(),
            eventManager: {} as never,
        });
        return { handlers, initEditor, applyExternalContent };
    };
    const msg = { type: "revert", content: "# new", lineMap: [] } as never;
    const container = document.createElement("div");

    it("已有编辑器时原地替换内容，保留 undo 历史", async () => {
        const { handlers, initEditor, applyExternalContent } = makeHandlers({});
        await handlers.revert!(msg, container);
        expect(applyExternalContent).toHaveBeenCalledWith("# new");
        expect(initEditor).not.toHaveBeenCalled();
    });

    it("尚无编辑器时创建编辑器", async () => {
        const { handlers, initEditor, applyExternalContent } = makeHandlers(null);
        await handlers.revert!(msg, container);
        expect(initEditor).toHaveBeenCalledWith(container, "# new");
        expect(applyExternalContent).not.toHaveBeenCalled();
    });
});
