import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockVscodeApi } from "./setup";
import {
    addFrontmatterHeader,
    addSkillFrontmatterHeader,
    parseFrontmatter,
    renderFrontmatterPanel,
    serializeFrontmatter,
} from "../components/frontmatter";

const eventManager = {
    onDocument: vi.fn(),
};

const blockListMarkdown = `---
name: mcp-browser-helper
description: Browser helper for MCP workflows
allowed-tools:
  - Bash
  - Read
  - "mcp__browser__navigate"
---

# MCP Browser Helper

---

This horizontal rule belongs to the Markdown body.
`;

const inlineListMarkdown = `---
name: inline-tools
description: Inline list syntax should be accepted
allowed-tools: [Bash, Read, "mcp__foo__bar"]
---

# Inline Tools
`;

const emptyListMarkdown = `---
name: empty-tools
description: Empty tools should remain editable as a list
allowed-tools: []
---

# Empty Tools
`;

const quotedScalarsMarkdown = `---
name: "quoted-skill"
description: "Use when values contain: colon and # marker"
version: "1.0"
---

# Quoted Scalars
`;

const noFrontmatterMarkdown = `# No Frontmatter

This Markdown file starts directly with content.
`;

describe("frontmatter panel", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '<main><div id="editor"></div></main>';
    });

    it("parses block list frontmatter", () => {
        const entries = parseFrontmatter(blockListMarkdown);

        expect(entries).toEqual([
            { kind: "scalar", key: "name", value: "mcp-browser-helper" },
            { kind: "scalar", key: "description", value: "Browser helper for MCP workflows" },
            { kind: "list", key: "allowed-tools", items: ["Bash", "Read", "mcp__browser__navigate"] },
        ]);
    });

    it("parses inline list frontmatter and serializes to block list", () => {
        const entries = parseFrontmatter(inlineListMarkdown);

        expect(entries).toEqual([
            { kind: "scalar", key: "name", value: "inline-tools" },
            { kind: "scalar", key: "description", value: "Inline list syntax should be accepted" },
            { kind: "list", key: "allowed-tools", items: ["Bash", "Read", "mcp__foo__bar"] },
        ]);
        expect(serializeFrontmatter([entries[2]])).toBe(`---
allowed-tools:
  - Bash
  - Read
  - mcp__foo__bar
---
`);
    });

    it("parses empty list frontmatter as an editable list", () => {
        const entries = parseFrontmatter(emptyListMarkdown);

        expect(entries).toContainEqual({ kind: "list", key: "allowed-tools", items: [] });
    });

    it("parses quoted scalar values used by skill definitions", () => {
        const entries = parseFrontmatter(quotedScalarsMarkdown);

        expect(entries).toEqual([
            { kind: "scalar", key: "name", value: "quoted-skill" },
            { kind: "scalar", key: "description", value: "Use when values contain: colon and # marker" },
            { kind: "scalar", key: "version", value: "1.0" },
        ]);
    });

    it("returns no entries for Markdown without frontmatter", () => {
        expect(parseFrontmatter(noFrontmatterMarkdown)).toEqual([]);
    });

    it("does not render inline create actions when frontmatter is missing", () => {
        const entries = parseFrontmatter(noFrontmatterMarkdown);
        renderFrontmatterPanel(serializeFrontmatter(entries), eventManager as any);

        expect(document.querySelector("#frontmatter-panel")).toBeNull();
    });

    it("creates plain frontmatter from toolbar action when no frontmatter exists", () => {
        renderFrontmatterPanel(undefined, eventManager as any);

        addFrontmatterHeader();

        expect(mockVscodeApi.postMessage).toHaveBeenCalledWith({
            type: "frontmatterUpdate",
            frontmatter: `---
title: ""
---
`,
        });
        expect(document.querySelectorAll(".frontmatter-table tr")).toHaveLength(1);
    });

    it("creates skill definition frontmatter from toolbar action when no frontmatter exists", () => {
        renderFrontmatterPanel(undefined, eventManager as any);

        addSkillFrontmatterHeader();

        expect(mockVscodeApi.postMessage).toHaveBeenCalledWith({
            type: "frontmatterUpdate",
            frontmatter: `---
name: ""
description: ""
allowed-tools: []
---
`,
        });
        expect(document.querySelectorAll(".frontmatter-table tr")).toHaveLength(3);
    });

    it("does not add frontmatter templates when frontmatter already exists", () => {
        renderFrontmatterPanel(`---
title: Demo
---
`, eventManager as any);

        vi.clearAllMocks();
        addFrontmatterHeader();
        addSkillFrontmatterHeader();

        expect(mockVscodeApi.postMessage).not.toHaveBeenCalled();
        expect(document.querySelectorAll(".frontmatter-table tr")).toHaveLength(1);
    });

    it("adds and serializes list items from the panel", () => {
        renderFrontmatterPanel(`---
allowed-tools: []
---
`, eventManager as any);

        document.querySelector<HTMLElement>(".fm-list-add-btn")?.dispatchEvent(new MouseEvent("mousedown", {
            bubbles: true,
        }));
        const item = document.querySelector<HTMLElement>(".fm-list-item-text");
        expect(item).not.toBeNull();
        item!.textContent = "Bash";
        item!.dispatchEvent(new FocusEvent("blur", { bubbles: true }));

        expect(mockVscodeApi.postMessage).toHaveBeenLastCalledWith({
            type: "frontmatterUpdate",
            frontmatter: `---
allowed-tools:
  - Bash
---
`,
        });
    });

    it("converts scalar value rows to list rows", () => {
        renderFrontmatterPanel(`---
custom: Bash, Read
---
`, eventManager as any);

        document.querySelector<HTMLElement>(".fm-kind-toggle-btn")?.dispatchEvent(new MouseEvent("mousedown", {
            bubbles: true,
        }));

        expect(document.querySelectorAll(".fm-list-item-text")).toHaveLength(2);
        expect(mockVscodeApi.postMessage).toHaveBeenLastCalledWith({
            type: "frontmatterUpdate",
            frontmatter: `---
custom:
  - Bash
  - Read
---
`,
        });
    });

    it("keeps row action buttons out of the tab order", () => {
        renderFrontmatterPanel(`---
allowed-tools: []
---
`, eventManager as any);

        expect(document.querySelector<HTMLButtonElement>(".fm-kind-toggle-btn")?.tabIndex).toBe(-1);
        expect(document.querySelector<HTMLButtonElement>(".fm-delete-btn")?.tabIndex).toBe(-1);
    });

    it("removes the panel after deleting the last frontmatter row", () => {
        renderFrontmatterPanel(`---
title: Demo
---
`, eventManager as any);

        document.querySelector<HTMLElement>(".fm-delete-btn")?.dispatchEvent(new MouseEvent("mousedown", {
            bubbles: true,
        }));

        expect(mockVscodeApi.postMessage).toHaveBeenLastCalledWith({
            type: "frontmatterUpdate",
            frontmatter: "",
        });
        expect(document.querySelector("#frontmatter-panel")).toBeNull();
    });

    it("does not create a blank list item when deleting another item while editing", () => {
        renderFrontmatterPanel(`---
allowed-tools:
  - Bash
  - Read
---
`, eventManager as any);

        const items = document.querySelectorAll<HTMLElement>(".fm-list-item-text");
        items[0].textContent = "";
        const deleteButtons = document.querySelectorAll<HTMLElement>(".fm-list-delete-btn");
        deleteButtons[1].dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        items[0].dispatchEvent(new FocusEvent("blur", { bubbles: true }));

        expect(mockVscodeApi.postMessage).toHaveBeenLastCalledWith({
            type: "frontmatterUpdate",
            frontmatter: `---
allowed-tools: []
---
`,
        });
        expect(document.querySelectorAll(".fm-list-item-text")).toHaveLength(0);
    });

    it("keeps the focused list item value when deleting another item", () => {
        renderFrontmatterPanel(`---
allowed-tools:
  - 1
  - 2
---
`, eventManager as any);

        document.querySelector<HTMLElement>(".fm-list-add-btn")?.dispatchEvent(new MouseEvent("mousedown", {
            bubbles: true,
        }));
        const items = document.querySelectorAll<HTMLElement>(".fm-list-item-text");
        items[2].textContent = "3";

        const deleteButtons = document.querySelectorAll<HTMLElement>(".fm-list-delete-btn");
        deleteButtons[1].dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

        expect(mockVscodeApi.postMessage).toHaveBeenLastCalledWith({
            type: "frontmatterUpdate",
            frontmatter: `---
allowed-tools:
  - "1"
  - "3"
---
`,
        });
        expect(Array.from(document.querySelectorAll<HTMLElement>(".fm-list-item-text")).map(el => el.textContent)).toEqual(["1", "3"]);
    });
});
