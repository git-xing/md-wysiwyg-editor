/**
 * components/frontmatter/index.ts
 * 
 * 职责：渲染和管理 YAML Frontmatter 可编辑面板
 */

import { IconList, IconPlus, IconX } from "../../ui/icons";
import { t } from "../../i18n";
import { notifyFrontmatterUpdate } from "../../messaging";
import { applyTooltip } from "../../ui/tooltip";
import type { EventManager } from "../../eventManager";

export type FmEntry =
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
        /^(true|false|null|yes|no|on|off|\d+(\.\d+)?)$/i.test(value)
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
                entries.push({ kind: "raw", key, lines: [line, ...childLines] });
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

function scalarValueToListItems(value: string): string[] {
    const trimmed = value.trim();
    if (!trimmed) {
        return [];
    }
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        return splitInlineList(trimmed);
    }
    return trimmed.split(",").map(item => item.trim()).filter(Boolean);
}

function toggleEntryKind(index: number): void {
    const entry = currentFmEntries[index];
    if (!entry || entry.kind === "raw") {
        return;
    }
    currentFmEntries[index] = entry.kind === "list"
        ? { kind: "scalar", key: entry.key, value: entry.items.join(", ") }
        : { kind: "list", key: entry.key, items: scalarValueToListItems(entry.value) };
    commitFrontmatterChange();
    refreshTable();
}

// ── cell binding ─────────────────────────────────────────────────
function bindFmCell(
    td: HTMLElement,
    entry: Extract<FmEntry, { kind: "scalar" } | { kind: "list" }>,
    field: EditableField,
): void {
    td.contentEditable = 'true';
    const value = field === "key" ? entry.key : entry.kind === "scalar" ? entry.value : entry.items.join(", ");
    td.textContent = value;
    td.dataset['orig'] = value;
    td.dataset['placeholder'] = field === 'key' ? 'key' : 'value';

    td.addEventListener('blur', () => {
        const newVal = (td.textContent ?? '').trim();
        if (field === 'key' && newVal.length === 0) {
            td.textContent = td.dataset['orig'] ?? '';
            return;
        }
        if (newVal !== td.dataset['orig']) {
            if (field === "key") {
                entry.key = newVal;
            } else if (entry.kind === "scalar") {
                entry.value = newVal;
            } else {
                entry.items = newVal.split(",").map(item => item.trim()).filter(Boolean);
                refreshTable();
            }
            commitFrontmatterChange();
        }
        td.dataset['orig'] = field === "key" ? entry.key : entry.kind === "scalar" ? entry.value : entry.items.join(", ");
    });
}

function createListValue(entry: Extract<FmEntry, { kind: "list" }>): HTMLElement {
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
        text.addEventListener("blur", () => {
            if (suppressListItemBlur) {
                return;
            }
            const next = (text.textContent ?? "").trim();
            if (!next) {
                entry.items.splice(itemIndex, 1);
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
            suppressListItemBlur = true;
            syncItemsFromDom();
            entry.items.splice(itemIndex, 1);
            entry.items = entry.items.filter(Boolean);
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
    addBtn.innerHTML = `${IconPlus} <span>${t("Add field")}</span>`;
    addBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
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
    bindFmCell(tdKey, entry, 'key');

    const tdVal = document.createElement('td');
    tdVal.className = 'fm-val';
    if (entry.kind === "list") {
        tdVal.appendChild(createListValue(entry));
    } else {
        bindFmCell(tdVal, entry, 'value');
    }

    const tdDel = document.createElement('td');
    tdDel.className = 'fm-action';
    const kindBtn = document.createElement('button');
    kindBtn.className = `fm-kind-toggle-btn${entry.kind === "list" ? " is-list" : ""}`;
    kindBtn.innerHTML = IconList;
    kindBtn.tabIndex = -1;
    applyTooltip(kindBtn, entry.kind === "list" ? "转为单值" : "转为多值", { placement: "above" });
    kindBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleEntryKind(index);
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'fm-delete-btn';
    delBtn.innerHTML = IconX;
    delBtn.tabIndex = -1;
    applyTooltip(delBtn, t('Delete'), { placement: "above" });
    delBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        currentFmEntries.splice(index, 1);
        commitFrontmatterChange();
        if (serializeFrontmatter(currentFmEntries)) {
            refreshTable();
        }
    });
    tdDel.appendChild(kindBtn);
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

    currentFmEntries = parseFrontmatter(frontmatter);

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
    addRow.appendChild(addBtn);
    panel.appendChild(addRow);

    if (!existing) {
        editorEl?.parentNode?.insertBefore(panel, editorEl);
    }
    if (editorEl) { editorEl.style.paddingTop = '16px'; }

    bindPanelShortcuts(eventManager);
}
