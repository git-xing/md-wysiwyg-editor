/**
 * components/frontmatter/index.ts
 * 
 * 职责：渲染和管理 YAML Frontmatter 可编辑面板
 */

import { IconPlus, IconX } from "../../ui/icons";
import { t } from "../../i18n";
import { notifyFrontmatterUpdate } from "../../messaging";
import type { EventManager } from "../../eventManager";

export type FmEntry = { key: string; value: string };

/** 解析 YAML frontmatter 字符串为 key-value 数组 */
export function parseFrontmatter(raw: string): FmEntry[] {
    return raw
        .split('\n')
        .filter(line => !line.match(/^---/) && line.includes(':'))
        .map(line => {
            const colonIdx = line.indexOf(':');
            return {
                key: line.slice(0, colonIdx).trim(),
                value: line.slice(colonIdx + 1).trim(),
            };
        })
        .filter(({ key }) => key.length > 0);
}

/** 将 key-value 数组序列化为 YAML frontmatter 字符串 */
export function serializeFrontmatter(entries: FmEntry[]): string {
    if (entries.length === 0) { return ""; }
    const lines = entries
        .filter(e => e.key.length > 0)
        .map(e => `${e.key}: ${e.value}`);
    if (lines.length === 0) { return ""; }
    return `---\n${lines.join("\n")}\n---\n`;
}

// ── undo/redo ────────────────────────────────────────────────────
let currentFmEntries: FmEntry[] = [];

// ── table ref ────────────────────────────────────────────────────
let _tbody: HTMLTableSectionElement;
let _panel: HTMLElement;
let _eventManager: EventManager;

function refreshTable(): void {
    _tbody.innerHTML = '';
    currentFmEntries.forEach((entry, i) => {
        _tbody.appendChild(createFmRow(entry, i));
    });
}

// ── commit ───────────────────────────────────────────────────────
function commitFrontmatterChange(): void {
    const raw = serializeFrontmatter(currentFmEntries);
    notifyFrontmatterUpdate(raw);
    if (currentFmEntries.length === 0) {
        document.getElementById('frontmatter-panel')?.remove();
        const ed = document.getElementById('editor');
        if (ed) { ed.style.paddingTop = ''; }
    }
}

// ── cell binding ─────────────────────────────────────────────────
function bindFmCell(
    td: HTMLElement,
    entry: FmEntry,
    field: 'key' | 'value',
): void {
    td.contentEditable = 'true';
    td.textContent = entry[field];
    td.dataset['orig'] = entry[field];
    td.dataset['placeholder'] = field === 'key' ? 'key' : 'value';

    td.addEventListener('blur', () => {
        const newVal = (td.textContent ?? '').trim();
        if (field === 'key' && newVal.length === 0) {
            td.textContent = td.dataset['orig'] ?? '';
            return;
        }
        if (newVal !== entry[field]) {
            entry[field] = newVal;
            commitFrontmatterChange();
        }
        td.dataset['orig'] = entry[field];
    });
}

// ── row ──────────────────────────────────────────────────────────
function createFmRow(entry: FmEntry, index: number): HTMLTableRowElement {
    const tr = document.createElement('tr');

    const tdKey = document.createElement('td');
    tdKey.className = 'fm-key';
    bindFmCell(tdKey, entry, 'key');

    const tdVal = document.createElement('td');
    tdVal.className = 'fm-val';
    bindFmCell(tdVal, entry, 'value');

    const tdDel = document.createElement('td');
    tdDel.className = 'fm-action';
    const delBtn = document.createElement('button');
    delBtn.className = 'fm-delete-btn';
    delBtn.innerHTML = IconX;
    delBtn.title = t('Delete');
    delBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        currentFmEntries.splice(index, 1);
        commitFrontmatterChange();
        refreshTable();
    });
    tdDel.appendChild(delBtn);

    tr.appendChild(tdKey);
    tr.appendChild(tdVal);
    tr.appendChild(tdDel);
    return tr;
}

// ── add row ──────────────────────────────────────────────────────
function addNewRow(): void {
    const newEntry: FmEntry = { key: '', value: '' };
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

// ── render ───────────────────────────────────────────────────────
export function renderFrontmatterPanel(frontmatter: string | undefined, eventManager: EventManager): void {
    const existing = document.getElementById('frontmatter-panel');
    const editorEl = document.getElementById('editor');

    if (!frontmatter) {
        currentFmEntries = [];
        existing?.remove();
        if (editorEl) { editorEl.style.paddingTop = ''; }
        return;
    }

    currentFmEntries = parseFrontmatter(frontmatter);

    const panel = existing ?? document.createElement('div');
    panel.id = 'frontmatter-panel';
    panel.className = 'frontmatter-panel';
    _panel = panel;
    _eventManager = eventManager;

    const table = document.createElement('table');
    table.className = 'frontmatter-table';
    const tbody = document.createElement('tbody');
    _tbody = tbody;

    currentFmEntries.forEach((entry, i) => {
        tbody.appendChild(createFmRow(entry, i));
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
