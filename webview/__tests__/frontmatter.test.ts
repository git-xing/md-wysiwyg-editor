import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
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

const FIXTURE_DIR = path.resolve(process.cwd(), "webview/__tests__/fixtures/frontmatter");

function readFixture(name: string): string {
    return readFileSync(path.join(FIXTURE_DIR, name), "utf8");
}

describe("frontmatter panel", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '<main><div id="editor"></div></main>';
    });

    it("parses block list frontmatter", () => {
        const entries = parseFrontmatter(readFixture("skill-block-list.md"));

        expect(entries).toEqual([
            { kind: "scalar", key: "name", value: "mcp-browser-helper" },
            { kind: "scalar", key: "description", value: "Browser helper for MCP workflows" },
            { kind: "list", key: "allowed-tools", items: ["Bash", "Read", "mcp__browser__navigate"] },
        ]);
    });

    it("parses inline list frontmatter and serializes to block list", () => {
        const entries = parseFrontmatter(readFixture("skill-inline-list.md"));

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
        const entries = parseFrontmatter(readFixture("skill-empty-list.md"));

        expect(entries).toContainEqual({ kind: "list", key: "allowed-tools", items: [] });
    });

    it("parses quoted scalar values used by skill definitions", () => {
        const entries = parseFrontmatter(readFixture("skill-quoted-scalars.md"));

        expect(entries).toEqual([
            { kind: "scalar", key: "name", value: "quoted-skill" },
            { kind: "scalar", key: "description", value: "Use when values contain: colon and # marker" },
            { kind: "scalar", key: "version", value: "1.0" },
        ]);
    });

    it("parses nested object frontmatter", () => {
        const entries = parseFrontmatter(readFixture("skill-metadata-object.md"));

        expect(entries).toEqual([
            { kind: "scalar", key: "name", value: "glab" },
            { kind: "scalar", key: "description", value: "Expert guidance for using the GitLab CLI (glab)" },
            {
                kind: "object",
                key: "metadata",
                fields: [
                    { kind: "scalar", key: "version", value: "1.0.1" },
                    { kind: "scalar", key: "platform", value: "macos/linux" },
                    { kind: "scalar", key: "category", value: "cli-tool" },
                ],
            },
        ]);
        expect(serializeFrontmatter(entries)).toBe(`---
name: glab
description: Expert guidance for using the GitLab CLI (glab)
metadata:
  version: "1.0.1"
  platform: macos/linux
  category: cli-tool
---
`);
    });

    it("returns no entries for Markdown without frontmatter", () => {
        expect(parseFrontmatter(readFixture("no-frontmatter.md"))).toEqual([]);
    });

    it("does not render inline create actions when frontmatter is missing", () => {
        const entries = parseFrontmatter(readFixture("no-frontmatter.md"));
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

    it("turns a scalar row into list chips by adding a value", () => {
        renderFrontmatterPanel(`---
custom: Bash
---
`, eventManager as any);

        document.querySelector<HTMLElement>(".fm-list-add-btn")?.dispatchEvent(new MouseEvent("mousedown", {
            bubbles: true,
        }));
        const items = document.querySelectorAll<HTMLElement>(".fm-list-item-text");
        items[1].textContent = "Read";
        items[1].dispatchEvent(new FocusEvent("blur", { bubbles: true }));

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

        const addValueBtn = document.querySelector<HTMLButtonElement>(".fm-list-add-btn");
        expect(addValueBtn?.tabIndex).toBe(-1);
        expect(addValueBtn?.textContent?.trim()).toBe("");
        expect(addValueBtn?.dataset.tooltip).toBe("Add field");
        expect(document.querySelector<HTMLButtonElement>(".fm-delete-btn")?.tabIndex).toBe(-1);
    });

    it("turns list chips back into a scalar row when one value remains", () => {
        renderFrontmatterPanel(`---
allowed-tools:
  - Bash
  - Read
---
`, eventManager as any);

        document.querySelector<HTMLElement>(".fm-list-delete-btn")?.dispatchEvent(new MouseEvent("mousedown", {
            bubbles: true,
        }));

        expect(document.querySelector(".fm-list-value")).toBeNull();
        expect(document.querySelector(".fm-scalar-input")?.textContent).toBe("Read");
        expect(mockVscodeApi.postMessage).toHaveBeenLastCalledWith({
            type: "frontmatterUpdate",
            frontmatter: `---
allowed-tools: Read
---
`,
        });
    });

    it("hides delete tooltip when deleting a list item", () => {
        renderFrontmatterPanel(`---
allowed-tools:
  - Bash
  - Read
---
`, eventManager as any);

        const deleteBtn = document.querySelector<HTMLElement>(".fm-list-delete-btn")!;
        deleteBtn.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
        expect(document.querySelector<HTMLElement>(".custom-tooltip")?.style.display).toBe("block");

        deleteBtn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

        expect(document.querySelector<HTMLElement>(".custom-tooltip")?.style.display).toBe("none");
    });

    it("turns a blank added list chip back into a scalar row on blur", () => {
        renderFrontmatterPanel(`---
custom: Bash
---
`, eventManager as any);

        document.querySelector<HTMLElement>(".fm-list-add-btn")?.dispatchEvent(new MouseEvent("mousedown", {
            bubbles: true,
        }));
        const items = document.querySelectorAll<HTMLElement>(".fm-list-item-text");
        items[1].dispatchEvent(new FocusEvent("blur", { bubbles: true }));

        expect(document.querySelector(".fm-list-value")).toBeNull();
        expect(document.querySelector(".fm-scalar-input")?.textContent).toBe("Bash");
        expect(mockVscodeApi.postMessage).toHaveBeenLastCalledWith({
            type: "frontmatterUpdate",
            frontmatter: `---
custom: Bash
---
`,
        });
    });

    it("treats a lone br in scalar value as empty for placeholder display", () => {
        renderFrontmatterPanel(`---
title: ""
---
`, eventManager as any);

        const input = document.querySelector<HTMLElement>(".fm-scalar-input")!;
        input.innerHTML = "<br>";
        input.dispatchEvent(new InputEvent("input", { bubbles: true }));

        expect(input.classList.contains("fm-editable-empty")).toBe(true);

        input.dispatchEvent(new FocusEvent("blur", { bubbles: true }));

        expect(input.innerHTML).toBe("");
        expect(input.classList.contains("fm-editable-empty")).toBe(true);
    });

    it("removes a row when its key is empty after blur", () => {
        renderFrontmatterPanel(`---
title: Demo
description: Text
---
`, eventManager as any);

        const key = document.querySelector<HTMLElement>(".fm-key")!;
        key.textContent = "";
        key.dispatchEvent(new InputEvent("input", { bubbles: true }));
        key.dispatchEvent(new FocusEvent("blur", { bubbles: true }));

        expect(document.querySelectorAll(".frontmatter-table tr")).toHaveLength(1);
        expect(document.querySelector<HTMLElement>(".fm-key")?.textContent).toBe("description");
        expect(mockVscodeApi.postMessage).toHaveBeenLastCalledWith({
            type: "frontmatterUpdate",
            frontmatter: `---
description: Text
---
`,
        });
    });

    it("creates a single editable list item when adding a field from an empty scalar value", () => {
        renderFrontmatterPanel(`---
custom: ""
---
`, eventManager as any);

        document.querySelector<HTMLElement>(".fm-list-add-btn")?.dispatchEvent(new MouseEvent("mousedown", {
            bubbles: true,
        }));

        const items = document.querySelectorAll<HTMLElement>(".fm-list-item-text");
        expect(items).toHaveLength(1);
        expect(items[0].classList.contains("fm-editable-empty")).toBe(true);
    });

    it("edits nested object scalar fields", () => {
        renderFrontmatterPanel(readFixture("skill-metadata-object.md"), eventManager as any);

        const values = document.querySelectorAll<HTMLElement>(".fm-object-val");
        values[1].textContent = "linux";
        values[1].dispatchEvent(new FocusEvent("blur", { bubbles: true }));

        expect(mockVscodeApi.postMessage).toHaveBeenLastCalledWith({
            type: "frontmatterUpdate",
            frontmatter: `---
name: glab
description: Expert guidance for using the GitLab CLI (glab)
metadata:
  version: "1.0.1"
  platform: linux
  category: cli-tool
---
`,
        });
    });

    it("converts a scalar row to an object row from the UI", () => {
        renderFrontmatterPanel(`---
metadata: version
---
`, eventManager as any);

        document.querySelector<HTMLElement>(".fm-object-toggle-btn")?.dispatchEvent(new MouseEvent("mousedown", {
            bubbles: true,
        }));

        expect(document.querySelector(".fm-object-value")).not.toBeNull();
        expect(document.querySelector(".fm-object-children")).not.toBeNull();
        expect(mockVscodeApi.postMessage).toHaveBeenLastCalledWith({
            type: "frontmatterUpdate",
            frontmatter: `---
metadata:
  value: version
---
`,
        });
    });

    it("adds an object row from the UI", () => {
        renderFrontmatterPanel(`---
title: Demo
---
`, eventManager as any);

        document.querySelectorAll<HTMLElement>(".fm-add-btn")[1].dispatchEvent(new MouseEvent("mousedown", {
            bubbles: true,
        }));

        expect(document.querySelectorAll(".frontmatter-table tr")).toHaveLength(2);
        expect(document.querySelector(".fm-object-value")).not.toBeNull();
        expect(document.querySelector(".fm-object-children")).not.toBeNull();
        expect(mockVscodeApi.postMessage).toHaveBeenLastCalledWith({
            type: "frontmatterUpdate",
            frontmatter: `---
title: Demo
metadata: {}
---
`,
        });
    });

    it("adds nested object fields from the UI", () => {
        renderFrontmatterPanel(`---
metadata: {}
---
`, eventManager as any);

        document.querySelector<HTMLElement>(".fm-object-add-btn")?.dispatchEvent(new MouseEvent("mousedown", {
            bubbles: true,
        }));
        const key = document.querySelector<HTMLElement>(".fm-object-key")!;
        const value = document.querySelector<HTMLElement>(".fm-object-val")!;
        key.textContent = "version";
        key.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
        value.textContent = "1.0.1";
        value.dispatchEvent(new FocusEvent("blur", { bubbles: true }));

        expect(mockVscodeApi.postMessage).toHaveBeenLastCalledWith({
            type: "frontmatterUpdate",
            frontmatter: `---
metadata:
  version: "1.0.1"
---
`,
        });
    });

    it("renders nested object rows expanded by default", () => {
        renderFrontmatterPanel(readFixture("skill-metadata-object.md"), eventManager as any);

        expect(document.querySelector(".fm-object-children")).not.toBeNull();
        expect(Array.from(document.querySelectorAll<HTMLElement>(".fm-object-key")).map(el => el.textContent)).toEqual([
            "version",
            "platform",
            "category",
        ]);
        expect(mockVscodeApi.postMessage).not.toHaveBeenCalled();
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
allowed-tools: ""
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
