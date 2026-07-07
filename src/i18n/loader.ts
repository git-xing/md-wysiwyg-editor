import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

let _cache: Record<string, Record<string, string>> | null = null;

function loadAllTranslations(): Record<string, Record<string, string>> {
    if (_cache) return _cache;

    // 使用 vscode extensionUri 定位 i18n 目录
    const extPath = vscode.extensions.getExtension('chance-liu.md-wysiwyg-editor')?.extensionPath;
    if (!extPath) {
        _cache = {};
        return _cache;
    }

    const i18nDir = path.join(extPath, 'i18n', 'webview');
    _cache = {};

    try {
        const files = fs.readdirSync(i18nDir).filter(f => f.endsWith('.json'));
        for (const file of files) {
            const lang = file.replace('.json', '');
            const content = fs.readFileSync(path.join(i18nDir, file), 'utf-8');
            _cache[lang] = JSON.parse(content);
        }
    } catch (err) {
        console.warn('[i18n] Failed to load translations:', err);
    }

    return _cache;
}

function normalizeLanguage(lang: string): string {
    const lower = lang.toLowerCase();
    if (lower.startsWith('zh')) return 'zh-cn';
    if (lower.startsWith('ja')) return 'ja';
    if (lower.startsWith('ko')) return 'ko';
    return 'en';
}

export function getTranslations(lang: string): Record<string, string> {
    const all = loadAllTranslations();
    const key = normalizeLanguage(lang);
    return all[key] || all['en'] || {};
}
