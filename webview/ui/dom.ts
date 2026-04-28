import { applyTooltip } from '@/ui/tooltip';

/**
 * 通用按钮工厂。
 * onClick 自动包装 e.preventDefault() + e.stopPropagation()。
 */
export function createButton(options: {
    className: string;
    icon?: string;
    label?: string;
    title?: string;
    tabIndex?: number;
    tooltipPlacement?: 'above' | 'below';
    onClick?: () => void;
}): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = options.className;
    if (options.tabIndex !== undefined) btn.tabIndex = options.tabIndex;
    if (options.icon) btn.innerHTML = options.icon;
    if (options.label) btn.textContent = options.label;

    const tipText = options.title ?? options.label;
    if (tipText) {
        applyTooltip(btn, tipText, { placement: options.tooltipPlacement ?? 'below' });
    }

    if (options.onClick) {
        const handler = options.onClick;
        btn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            handler();
        });
    }

    return btn;
}

/**
 * 通用分隔线工厂。
 * 取代各组件的 sep() / sSep() / makeSep()。
 */
export function createSeparator(className: string, tag: 'div' | 'span' = 'div'): HTMLElement {
    const el = document.createElement(tag);
    el.className = className;
    return el;
}

/**
 * 为输入框绑定 Enter/Escape 键盘处理。
 * 自动处理 isComposing、stopPropagation、preventDefault。
 */
export function setupInputKeyboard(
    input: HTMLInputElement,
    onEnter: () => void,
    onEscape: () => void,
): void {
    input.addEventListener('keydown', (e) => {
        if (e.isComposing) return;
        e.stopPropagation();
        if (e.key === 'Enter') {
            e.preventDefault();
            onEnter();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            onEscape();
        }
    });
}

/**
 * 监听外部 mousedown 事件以关闭浮层。
 * 返回移除监听的函数，用于手动清理。
 * @param targets 点击这些元素内部时不触发关闭
 * @param onClose 关闭回调
 * @param delayMs 延迟注册（默认 0），避免当前事件立即触发
 */
export function onOutsideMousedown(
    targets: HTMLElement[],
    onClose: () => void,
    delayMs = 0,
): () => void {
    function handler(e: MouseEvent) {
        const target = e.target as Node;
        if (targets.some((el) => el.contains(target))) return;
        onClose();
        document.removeEventListener('mousedown', handler);
    }

    if (delayMs > 0) {
        setTimeout(() => document.addEventListener('mousedown', handler), delayMs);
    } else {
        document.addEventListener('mousedown', handler);
    }

    return () => document.removeEventListener('mousedown', handler);
}
