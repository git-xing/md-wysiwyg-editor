declare global {
    interface Window {
        __i18n?: {
            translations: Record<string, string>;
            isMac: boolean;
            debugMode?: boolean;
        };
    }
}

const _t: Record<string, string> = window.__i18n?.translations ?? {};
const _isMac: boolean = window.__i18n?.isMac ?? false;

/** 翻译字符串，未找到则返回原始 key（即英文原文） */
export function t(key: string): string {
    return _t[key] ?? key;
}

/**
 * 将快捷键字符串转为当前平台的显示格式。
 * 输入格式遵循 ProseMirror keymap 规范，如 'Mod-b'、'Mod-Shift-z'、'Alt-k'。
 * Mac:  Mod→⌘  Shift→⇧  Alt→⌥  其余字符大写，整体无分隔符
 * Win:  Mod→Ctrl  Shift→Shift  Alt→Alt  其余字符大写，以 '+' 分隔
 */
export function kbd(shortcut: string): string {
    const parts = shortcut.split("-");
    if (_isMac) {
        return parts
            .map((p) => {
                if (p === "Mod") {
                    return "⌘";
                }
                if (p === "Shift") {
                    return "⇧";
                }
                if (p === "Alt") {
                    return "⌥";
                }
                return p.toUpperCase();
            })
            .join("");
    } else {
        return parts
            .map((p) => {
                if (p === "Mod") {
                    return "Ctrl";
                }
                if (p === "Shift") {
                    return "Shift";
                }
                if (p === "Alt") {
                    return "Alt";
                }
                return p.toUpperCase();
            })
            .join("+");
    }
}
