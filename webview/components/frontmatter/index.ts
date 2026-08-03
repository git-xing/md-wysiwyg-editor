/**
 * components/frontmatter/index.ts
 * 
 * 职责：渲染和管理 YAML Frontmatter 可编辑面板
 */

import { IconPlus, IconSettings, IconX } from "../../ui/icons";
import { t } from "../../i18n";
import { notifyFrontmatterUpdate } from "../../messaging";
import { applyTooltip, hideTooltip } from "../../ui/tooltip";
import type { EventManager } from "../../eventManager";

export type FmEntry =
    | { kind: "scalar"; key: string; value: string }
    | { kind: "list"; key: string; items: string[] }
    | { kind: "object"; key: string; fields: FmObjectField[] }
    | { kind: "raw"; key: string; lines: string[] };

type FmObjectField =
    | { kind: "scalar"; key: string; value: string }
    | { kind: "list"; key: string; items: string[] }
    | { kind: "raw"; key: string; lines: string[] };

type EditableField = "key" | "value";

const LIST_KEYS = new Set([
    "allowed-tools",
    "disallowed-tools",
    "arguments",
    "paths",
    "tools",
    "mcpServers",
    "mcp-servers",
    "skills",
]);

const SKILL_TEMPLATE: FmEntry[] = [
    { kind: "scalar", key: "name", value: "" },
    { kind: "scalar", key: "description", value: "" },
    { kind: "list", key: "allowed-tools", items: [] },
];

const FRONTMATTER_TEMPLATE: FmEntry[] = [
    { kind: "scalar", key: "title", value: "" },
];

function stripQuotes(value: string): string {
    const trimmed = value.trim();
    if (trimmed.length >= 2) {
        const first = trimmed[0];
        const last = trimmed[trimmed.length - 1];
        if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
            return trimmed.slice(1, -1);
        }
    }
    return trimmed;
}

function splitInlineList(value: string): string[] {
    const inner = value.trim().slice(1, -1).trim();
    if (!inner) {
        return [];
    }
    const items: string[] = [];
    let current = "";
    let quote: string | null = null;

    for (let i = 0; i < inner.length; i++) {
        const ch = inner[i];
        if ((ch === '"' || ch === "'") && inner[i - 1] !== "\\") {
            quote = quote === ch ? null : quote ?? ch;
            current += ch;
            continue;
        }
        if (ch === "," && !quote) {
            items.push(stripQuotes(current));
            current = "";
            continue;
        }
        current += ch;
    }
    items.push(stripQuotes(current));
    return items.map(item => item.trim()).filter(Boolean);
}

function shouldQuoteYaml(value: string): boolean {
    return (
        value.length === 0 ||
        /^[\s]|[\s]$/.test(value) ||
        /[:#,[\]{}]/.test(value) ||
        /^(true|false|null|yes|no|on|off|\d+(\.\d+)*)$/i.test(value)
    );
}

function formatYamlScalar(value: string): string {
    if (!shouldQuoteYaml(value)) {
        return value;
    }
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function getFrontmatterLines(raw: string): string[] {
    const lines = raw.replace(/\r\n/g, "\n").split("\n");
    const start = lines.findIndex(line => line.trim() === "---");
    let end = -1;
    for (let i = start + 1; i < lines.length; i++) {
        if (lines[i].trim() === "---") {
            end = i;
            break;
        }
    }
    if (start === -1 || end === -1 || end <= start) {
        return [];
    }
    return lines.slice(start + 1, end);
}

function parseObjectFields(lines: string[]): FmObjectField[] | null {
    const fields: FmObjectField[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) {
            continue;
        }
        if (!/^\s{2}\S/.test(line)) {
            return null;
        }

        const match = line.match(/^\s{2}([^:#][^:]*):(?:\s*(.*))?$/);
        if (!match) {
            fields.push({ kind: "raw", key: "", lines: [line] });
            continue;
        }

        const key = match[1].trim();
        const rest = (match[2] ?? "").trim();
        if (!key) {
            continue;
        }

        if (rest.startsWith("[") && rest.endsWith("]")) {
            fields.push({ kind: "list", key, items: splitInlineList(rest) });
            continue;
        }

        const childLines: string[] = [];
        let j = i + 1;
        while (j < lines.length && (/^\s{4}/.test(lines[j]) || !lines[j].trim())) {
            childLines.push(lines[j]);
            j++;
        }

        if (rest === "" && childLines.length > 0) {
            const meaningful = childLines.filter(child => child.trim());
            if (meaningful.every(child => /^\s{4}-\s+/.test(child))) {
                fields.push({
                    kind: "list",
                    key,
                    items: meaningful.map(child => stripQuotes(child.replace(/^\s{4}-\s+/, ""))),
                });
            } else {
                fields.push({ kind: "raw", key, lines: [line, ...childLines] });
            }
            i = j - 1;
            continue;
        }

        fields.push({ kind: "scalar", key, value: stripQuotes(rest) });
    }

    return fields;
}

/** 解析 YAML frontmatter 字符串为 key-value 数组 */
export function parseFrontmatter(raw: string): FmEntry[] {
    const lines = getFrontmatterLines(raw);
    const entries: FmEntry[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) {
            continue;
        }
        if (/^\s/.test(line) || line.trim().startsWith("#")) {
            entries.push({ kind: "raw", key: "", lines: [line] });
            continue;
        }

        const match = line.match(/^([^:#][^:]*):(?:\s*(.*))?$/);
        if (!match) {
            entries.push({ kind: "raw", key: "", lines: [line] });
            continue;
        }

        const key = match[1].trim();
        const rest = (match[2] ?? "").trim();
        if (!key) {
            continue;
        }

        if (rest.startsWith("[") && rest.endsWith("]")) {
            entries.push({ kind: "list", key, items: splitInlineList(rest) });
            continue;
        }

        if (rest === "{}") {
            entries.push({ kind: "object", key, fields: [] });
            continue;
        }

        const childLines: string[] = [];
        let j = i + 1;
        while (j < lines.length && (/^\s/.test(lines[j]) || !lines[j].trim())) {
            childLines.push(lines[j]);
            j++;
        }

        if (rest === "" && childLines.length > 0) {
            const meaningful = childLines.filter(child => child.trim());
            if (meaningful.every(child => /^\s*-\s+/.test(child))) {
                entries.push({
                    kind: "list",
                    key,
                    items: meaningful.map(child => stripQuotes(child.replace(/^\s*-\s+/, ""))),
                });
            } else {
                const objectFields = parseObjectFields(childLines);
                entries.push(objectFields
                    ? { kind: "object", key, fields: objectFields }
                    : { kind: "raw", key, lines: [line, ...childLines] });
            }
            i = j - 1;
            continue;
        }

        if (rest === "" && LIST_KEYS.has(key)) {
            entries.push({ kind: "list", key, items: [] });
            continue;
        }

        entries.push({ kind: "scalar", key, value: stripQuotes(rest) });
    }

    return entries;
}

/** 将 key-value 数组序列化为 YAML frontmatter 字符串 */
export function serializeFrontmatter(entries: FmEntry[]): string {
    if (entries.length === 0) { return ""; }
    const lines = entries.flatMap(entry => {
        if (entry.kind === "raw") {
            return entry.lines;
        }
        if (entry.key.trim().length === 0) {
            return [];
        }
        if (entry.kind === "list") {
            const items = entry.items.map(item => item.trim()).filter(Boolean);
            if (items.length === 0) {
                return [`${entry.key}: []`];
            }
            return [`${entry.key}:`, ...items.map(item => `  - ${formatYamlScalar(item)}`)];
        }
        if (entry.kind === "object") {
            const childLines = entry.fields.flatMap(field => {
                if (field.kind === "raw") {
                    return field.lines;
                }
                if (field.key.trim().length === 0) {
                    return [];
                }
                if (field.kind === "list") {
                    const items = field.items.map(item => item.trim()).filter(Boolean);
                    if (items.length === 0) {
                        return [`  ${field.key}: []`];
                    }
                    return [`  ${field.key}:`, ...items.map(item => `    - ${formatYamlScalar(item)}`)];
                }
                return [`  ${field.key}: ${formatYamlScalar(field.value)}`];
            });
            return childLines.length > 0 ? [`${entry.key}:`, ...childLines] : [`${entry.key}: {}`];
        }
        return [`${entry.key}: ${formatYamlScalar(entry.value)}`];
    });
    if (lines.length === 0) { return ""; }
    return `---\n${lines.join("\n")}\n---\n`;
}

// ── undo/redo ────────────────────────────────────────────────────
let currentFmEntries: FmEntry[] = [];

// ── table ref ────────────────────────────────────────────────────
let _tbody: HTMLTableSectionElement;
let _panel: HTMLElement;
let _eventManager: EventManager;
let suppressListItemBlur = false;

function refreshTable(): void {
    if (!_tbody) {
        return;
    }
    _tbody.innerHTML = '';
    currentFmEntries.forEach((entry, i) => {
        if (entry.kind !== "raw") {
            _tbody.appendChild(createFmRow(entry, i));
        }
    });
}

function normalizeEntriesForEditing(entries: FmEntry[]): FmEntry[] {
    return entries.map(entry => {
        if (entry.kind === "list" && entry.items.length <= 1) {
            return { kind: "scalar", key: entry.key, value: entry.items[0] ?? "" };
        }
        return entry;
    });
}

// ── commit ───────────────────────────────────────────────────────
function commitFrontmatterChange(): void {
    const raw = serializeFrontmatter(currentFmEntries);
    notifyFrontmatterUpdate(raw);
    if (!raw) {
        const panel = document.getElementById('frontmatter-panel');
        panel?.remove();
        const ed = document.getElementById('editor');
        if (ed) { ed.style.paddingTop = ''; }
    }
}

function hasFrontmatterStructure(): boolean {
    return serializeFrontmatter(currentFmEntries).length > 0;
}

function getVisibleEntryIndex(entry: FmEntry): number {
    let rowIndex = -1;
    for (const current of currentFmEntries) {
        if (current.kind !== "raw") {
            rowIndex++;
        }
        if (current === entry) {
            return rowIndex;
        }
    }
    return -1;
}

function normalizeListEntryAfterEdit(entry: Extract<FmEntry, { kind: "list" }>, index: number): void {
    entry.items = entry.items.map(item => item.trim()).filter(Boolean);
    if (entry.items.length <= 1) {
        currentFmEntries[index] = { kind: "scalar", key: entry.key, value: entry.items[0] ?? "" };
    }
}

function getEditableText(el: HTMLElement): string {
    return (el.textContent ?? "").trim();
}

function updateEditablePlaceholder(el: HTMLElement): void {
    el.classList.toggle("fm-editable-empty", getEditableText(el).length === 0);
}

function bindEditablePlaceholder(el: HTMLElement): void {
    updateEditablePlaceholder(el);
    el.addEventListener("input", () => updateEditablePlaceholder(el));
    el.addEventListener("blur", () => {
        if (getEditableText(el).length === 0) {
            el.textContent = "";
        }
        updateEditablePlaceholder(el);
    });
}

function entryValueToObjectFields(entry: Extract<FmEntry, { kind: "scalar" } | { kind: "list" }>): FmObjectField[] {
    if (entry.kind === "list") {
        return entry.items.length > 0 ? [{ kind: "list", key: "items", items: [...entry.items] }] : [];
    }
    return entry.value ? [{ kind: "scalar", key: "value", value: entry.value }] : [];
}

function toggleEntryObject(index: number): void {
    const entry = currentFmEntries[index];
    if (!entry || entry.kind === "raw") {
        return;
    }
    if (entry.kind === "object") {
        currentFmEntries[index] = { kind: "scalar", key: entry.key, value: "" };
    } else {
        currentFmEntries[index] = { kind: "object", key: entry.key, fields: entryValueToObjectFields(entry) };
    }
    commitFrontmatterChange();
    refreshTable();
}

// ── cell binding ─────────────────────────────────────────────────
function bindFmCell(
    td: HTMLElement,
    entry: Extract<FmEntry, { kind: "scalar" } | { kind: "list" } | { kind: "object" }>,
    field: EditableField,
    index: number,
): void {
    td.contentEditable = 'true';
    const value = field === "key" ? entry.key : entry.kind === "scalar" ? entry.value : entry.kind === "list" ? entry.items.join(", ") : "";
    td.textContent = value;
    td.dataset['orig'] = value;
    td.dataset['placeholder'] = field === 'key' ? 'key' : 'value';
    bindEditablePlaceholder(td);

    td.addEventListener('blur', () => {
        const newVal = getEditableText(td);
        if (field === 'key' && newVal.length === 0) {
            currentFmEntries.splice(index, 1);
            commitFrontmatterChange();
            if (serializeFrontmatter(currentFmEntries)) {
                refreshTable();
            }
            return;
        }
        if (newVal !== td.dataset['orig']) {
            if (field === "key") {
                entry.key = newVal;
            } else if (entry.kind === "scalar") {
                entry.value = newVal;
            } else if (entry.kind === "list") {
                entry.items = newVal.split(",").map(item => item.trim()).filter(Boolean);
                refreshTable();
            }
            commitFrontmatterChange();
        }
        td.dataset['orig'] = field === "key" ? entry.key : entry.kind === "scalar" ? entry.value : entry.kind === "list" ? entry.items.join(", ") : "";
    });
}

function createObjectValue(entry: Extract<FmEntry, { kind: "object" }>): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "fm-object-value";
    const children = document.createElement("div");
    children.className = "fm-object-children";

    const refreshObject = (): void => {
        refreshTable();
        commitFrontmatterChange();
        const rowIndex = getVisibleEntryIndex(entry);
        const rows = _tbody.querySelectorAll("tr");
        const row = rows[rowIndex];
        row?.querySelector<HTMLElement>(".fm-object-row:last-of-type .fm-object-key")?.focus();
    };

    entry.fields.forEach((field, fieldIndex) => {
        if (field.kind === "raw") {
            return;
        }

        const row = document.createElement("div");
        row.className = "fm-object-row";

        const key = document.createElement("span");
        key.className = "fm-object-key";
        key.contentEditable = "true";
        key.dataset["placeholder"] = "key";
        key.textContent = field.key;
        bindEditablePlaceholder(key);
        key.addEventListener("blur", () => {
            const next = getEditableText(key);
            if (!next) {
                entry.fields.splice(fieldIndex, 1);
                refreshTable();
                commitFrontmatterChange();
                return;
            }
            if (next !== field.key) {
                field.key = next;
                commitFrontmatterChange();
            }
        });

        const value = document.createElement("span");
        value.className = "fm-object-val";
        value.contentEditable = "true";
        value.dataset["placeholder"] = "value";
        bindEditablePlaceholder(value);
        if (field.kind === "list") {
            value.textContent = field.items.join(", ");
            updateEditablePlaceholder(value);
            value.addEventListener("blur", () => {
                const next = getEditableText(value);
                const items = next ? next.split(",").map(item => item.trim()).filter(Boolean) : [];
                if (items.join(", ") !== field.items.join(", ")) {
                    field.items = items;
                    commitFrontmatterChange();
                }
            });
        } else {
            value.textContent = field.value;
            updateEditablePlaceholder(value);
            value.addEventListener("blur", () => {
                const next = getEditableText(value);
                if (next !== field.value) {
                    field.value = next;
                    commitFrontmatterChange();
                }
            });
        }

        const delBtn = document.createElement("button");
        delBtn.className = "fm-object-delete-btn";
        delBtn.innerHTML = IconX;
        delBtn.tabIndex = -1;
        applyTooltip(delBtn, t("Delete"), { placement: "above" });
        delBtn.addEventListener("mousedown", (e) => {
            e.preventDefault();
            e.stopPropagation();
            hideTooltip();
            entry.fields.splice(fieldIndex, 1);
            refreshTable();
            commitFrontmatterChange();
        });

        row.appendChild(key);
        row.appendChild(value);
        row.appendChild(delBtn);
        children.appendChild(row);
    });

    const addBtn = document.createElement("button");
    addBtn.className = "fm-object-add-btn";
    addBtn.innerHTML = `${IconPlus} <span>${t("Add field")}</span>`;
    addBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        entry.fields.push({ kind: "scalar", key: "", value: "" });
        refreshObject();
    });
    children.appendChild(addBtn);
    wrapper.appendChild(children);

    return wrapper;
}

function createScalarValue(entry: Extract<FmEntry, { kind: "scalar" }>, index: number): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "fm-scalar-value";

    const value = document.createElement("span");
    value.className = "fm-scalar-input";
    value.contentEditable = "true";
    value.dataset["placeholder"] = "value";
    value.textContent = entry.value;
    value.dataset["orig"] = entry.value;
    bindEditablePlaceholder(value);
    value.addEventListener("blur", () => {
        const next = getEditableText(value);
        if (next !== entry.value) {
            entry.value = next;
            commitFrontmatterChange();
        }
        value.dataset["orig"] = entry.value;
    });

    const addBtn = document.createElement("button");
    addBtn.className = "fm-list-add-btn";
    addBtn.innerHTML = IconPlus;
    addBtn.tabIndex = -1;
    applyTooltip(addBtn, t("Add field"), { placement: "above" });
    addBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        hideTooltip();
        const current = getEditableText(value);
        currentFmEntries[index] = {
            kind: "list",
            key: entry.key,
            items: current ? [current, ""] : [""],
        };
        commitFrontmatterChange();
        refreshTable();
        const rows = _tbody.querySelectorAll("tr");
        const row = rows[getVisibleEntryIndex(currentFmEntries[index])];
        row?.querySelector<HTMLElement>(".fm-list-item:last-of-type .fm-list-item-text")?.focus();
    });

    wrapper.appendChild(value);
    wrapper.appendChild(addBtn);
    return wrapper;
}

function createListValue(entry: Extract<FmEntry, { kind: "list" }>, index: number): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "fm-list-value";

    const syncItemsFromDom = (): void => {
        entry.items = Array.from(wrapper.querySelectorAll<HTMLElement>(".fm-list-item-text"))
            .map(el => (el.textContent ?? "").trim());
    };

    entry.items.forEach((item, itemIndex) => {
        const chip = document.createElement("span");
        chip.className = "fm-list-item";

        const text = document.createElement("span");
        text.className = "fm-list-item-text";
        text.contentEditable = "true";
        text.dataset["placeholder"] = "value";
        text.textContent = item;
        bindEditablePlaceholder(text);
        text.addEventListener("blur", () => {
            if (suppressListItemBlur) {
                return;
            }
            const next = getEditableText(text);
            if (!next) {
                entry.items.splice(itemIndex, 1);
                normalizeListEntryAfterEdit(entry, index);
                refreshTable();
                commitFrontmatterChange();
                return;
            }
            if (next !== entry.items[itemIndex]) {
                entry.items[itemIndex] = next;
                commitFrontmatterChange();
            }
        });

        const delBtn = document.createElement("button");
        delBtn.className = "fm-list-delete-btn";
        delBtn.innerHTML = IconX;
        applyTooltip(delBtn, t("Delete"), { placement: "above" });
        delBtn.addEventListener("mousedown", (e) => {
            e.preventDefault();
            e.stopPropagation();
            hideTooltip();
            suppressListItemBlur = true;
            syncItemsFromDom();
            entry.items.splice(itemIndex, 1);
            normalizeListEntryAfterEdit(entry, index);
            refreshTable();
            commitFrontmatterChange();
            setTimeout(() => {
                suppressListItemBlur = false;
            }, 0);
        });

        chip.appendChild(text);
        chip.appendChild(delBtn);
        wrapper.appendChild(chip);
    });

    const addBtn = document.createElement("button");
    addBtn.className = "fm-list-add-btn";
    addBtn.innerHTML = IconPlus;
    addBtn.tabIndex = -1;
    applyTooltip(addBtn, t("Add field"), { placement: "above" });
    addBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        hideTooltip();
        entry.items.push("");
        refreshTable();
        const rows = _tbody.querySelectorAll("tr");
        const row = rows[getVisibleEntryIndex(entry)];
        row?.querySelector<HTMLElement>(".fm-list-item:last-of-type .fm-list-item-text")?.focus();
    });
    wrapper.appendChild(addBtn);

    return wrapper;
}

// ── row ──────────────────────────────────────────────────────────
function createFmRow(entry: FmEntry, index: number): HTMLTableRowElement {
    const tr = document.createElement('tr');
    if (entry.kind === "raw") {
        return tr;
    }

    const tdKey = document.createElement('td');
    tdKey.className = 'fm-key';
    bindFmCell(tdKey, entry, 'key', index);

    const tdVal = document.createElement('td');
    tdVal.className = 'fm-val';
    if (entry.kind === "list") {
        tdVal.appendChild(createListValue(entry, index));
    } else if (entry.kind === "object") {
        tdVal.appendChild(createObjectValue(entry));
    } else {
        tdVal.appendChild(createScalarValue(entry, index));
    }

    const tdDel = document.createElement('td');
    tdDel.className = 'fm-action';
    const objectBtn = document.createElement('button');
    objectBtn.className = `fm-object-toggle-btn${entry.kind === "object" ? " is-object" : ""}`;
    objectBtn.innerHTML = IconSettings;
    objectBtn.tabIndex = -1;
    applyTooltip(objectBtn, entry.kind === "object" ? t("Convert to scalar") : t("Convert to object"), { placement: "above" });
    objectBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        hideTooltip();
        toggleEntryObject(index);
    });
    tdDel.appendChild(objectBtn);

    const delBtn = document.createElement('button');
    delBtn.className = 'fm-delete-btn';
    delBtn.innerHTML = IconX;
    delBtn.tabIndex = -1;
    applyTooltip(delBtn, t('Delete'), { placement: "above" });
    delBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        hideTooltip();
        currentFmEntries.splice(index, 1);
        commitFrontmatterChange();
        if (serializeFrontmatter(currentFmEntries)) {
            refreshTable();
        }
    });
    tdDel.appendChild(delBtn);

    tr.appendChild(tdKey);
    tr.appendChild(tdVal);
    tr.appendChild(tdDel);
    return tr;
}

// ── add row ──────────────────────────────────────────────────────
function addNewRow(): void {
    const newEntry: FmEntry = { kind: "scalar", key: '', value: '' };
    currentFmEntries.push(newEntry);
    const tr = createFmRow(newEntry, currentFmEntries.length - 1);
    _tbody.appendChild(tr);
    tr.querySelector<HTMLElement>('.fm-key')?.focus();
}

function addObjectRow(): void {
    const newEntry: FmEntry = { kind: "object", key: "metadata", fields: [{ kind: "scalar", key: "", value: "" }] };
    currentFmEntries.push(newEntry);
    const tr = createFmRow(newEntry, currentFmEntries.length - 1);
    _tbody.appendChild(tr);
    tr.querySelector<HTMLElement>('.fm-key')?.focus();
    commitFrontmatterChange();
}

// ── undo / redo ──────────────────────────────────────────────────
function handleUndo(): void {
    interface ExecDoc { execCommand(cmd: string): boolean }
    (document as ExecDoc).execCommand("undo");
}

function handleRedo(): void {
    interface ExecDoc { execCommand(cmd: string): boolean }
    (document as ExecDoc).execCommand("redo");
}

function isInFmPanel(): boolean {
    const el = document.activeElement;
    return !!el && !!document.getElementById('frontmatter-panel')?.contains(el);
}

// ── keyboard shortcuts on document ───────────────────────────────
function bindPanelShortcuts(eventManager: EventManager): void {
    eventManager.onDocument('keydown', (e) => {
        if (!isInFmPanel()) { return; }
        const mod = e.metaKey || e.ctrlKey;
        if (mod && e.code === 'KeyZ' && !e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            handleUndo();
        } else if (mod && e.code === 'KeyZ' && e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            handleRedo();
        } else if (mod && e.code === 'KeyY') {
            e.preventDefault();
            e.stopPropagation();
            handleRedo();
        }
    }, true);
}

function cloneEntries(entries: FmEntry[]): FmEntry[] {
    return entries.map(entry => {
        if (entry.kind === "list") {
            return { ...entry, items: [...entry.items] };
        }
        if (entry.kind === "raw") {
            return { ...entry, lines: [...entry.lines] };
        }
        if (entry.kind === "object") {
            return {
                ...entry,
                fields: entry.fields.map(field => {
                    if (field.kind === "list") {
                        return { ...field, items: [...field.items] };
                    }
                    if (field.kind === "raw") {
                        return { ...field, lines: [...field.lines] };
                    }
                    return { ...field };
                }),
            };
        }
        return { ...entry };
    });
}

function ensureFrontmatterPanel(): HTMLElement | null {
    const existing = document.getElementById('frontmatter-panel');
    if (existing) {
        return existing;
    }
    const editorEl = document.getElementById('editor');
    if (!editorEl?.parentNode) {
        return null;
    }
    const panel = document.createElement('div');
    panel.id = 'frontmatter-panel';
    panel.className = 'frontmatter-panel';
    editorEl.parentNode.insertBefore(panel, editorEl);
    return panel;
}

export function addSkillFrontmatterHeader(): void {
    if (hasFrontmatterStructure()) {
        return;
    }
    const existingKeys = new Set(
        currentFmEntries
            .filter(entry => entry.kind !== "raw")
            .map(entry => entry.key),
    );
    const additions = cloneEntries(SKILL_TEMPLATE).filter(entry => {
        return entry.kind === "raw" || !existingKeys.has(entry.key);
    });
    if (additions.length === 0) {
        return;
    }
    currentFmEntries = [...additions, ...currentFmEntries];
    commitFrontmatterChange();
    const panel = ensureFrontmatterPanel();
    if (panel) {
        renderFrontmatterPanel(serializeFrontmatter(currentFmEntries), _eventManager);
    }
    document.querySelector<HTMLElement>("#frontmatter-panel .fm-key")?.focus();
}

export function addFrontmatterHeader(): void {
    if (hasFrontmatterStructure()) {
        return;
    }
    currentFmEntries = cloneEntries(FRONTMATTER_TEMPLATE);
    commitFrontmatterChange();
    const panel = ensureFrontmatterPanel();
    if (panel) {
        renderFrontmatterPanel(serializeFrontmatter(currentFmEntries), _eventManager);
    }
    document.querySelector<HTMLElement>("#frontmatter-panel .fm-val")?.focus();
}

// ── render ───────────────────────────────────────────────────────
export function renderFrontmatterPanel(frontmatter: string | undefined, eventManager: EventManager): void {
    suppressListItemBlur = false;
    const existing = document.getElementById('frontmatter-panel');
    const editorEl = document.getElementById('editor');
    const panel = existing ?? document.createElement('div');
    panel.id = 'frontmatter-panel';
    panel.className = 'frontmatter-panel';
    _panel = panel;
    _eventManager = eventManager;

    if (!frontmatter) {
        currentFmEntries = [];
        existing?.remove();
        if (editorEl) { editorEl.style.paddingTop = ''; }
        bindPanelShortcuts(eventManager);
        return;
    }

    currentFmEntries = normalizeEntriesForEditing(parseFrontmatter(frontmatter));

    const table = document.createElement('table');
    table.className = 'frontmatter-table';
    const tbody = document.createElement('tbody');
    _tbody = tbody;

    currentFmEntries.forEach((entry, i) => {
        if (entry.kind !== "raw") {
            tbody.appendChild(createFmRow(entry, i));
        }
    });
    table.appendChild(tbody);
    panel.innerHTML = '';
    panel.appendChild(table);

    const addRow = document.createElement('div');
    addRow.className = 'fm-add-row';
    const addBtn = document.createElement('button');
    addBtn.className = 'fm-add-btn';
    addBtn.innerHTML = `${IconPlus} <span>${t('Add field')}</span>`;
    addBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        addNewRow();
    });
    const addObjectBtn = document.createElement('button');
    addObjectBtn.className = 'fm-add-btn';
    addObjectBtn.innerHTML = `${IconSettings} <span>${t("Add object")}</span>`;
    addObjectBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        addObjectRow();
    });
    addRow.appendChild(addBtn);
    addRow.appendChild(addObjectBtn);
    panel.appendChild(addRow);

    if (!existing) {
        editorEl?.parentNode?.insertBefore(panel, editorEl);
    }
    if (editorEl) { editorEl.style.paddingTop = '16px'; }

    bindPanelShortcuts(eventManager);
}
