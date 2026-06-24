/**
 * eventManager.ts
 * 
 * 职责：统一管理事件监听器的绑定和解绑
 * 
 * 本模块提供以下功能：
 * - 绑定 DOM 事件（Window、Document、HTMLElement），返回解绑函数
 * - 绑定自定义事件，支持 emit 触发
 * - 键盘快捷键绑定，支持组合键配置和行为控制
 * - 批量解绑所有事件（组件销毁时调用）
 * - 调试支持：追踪当前绑定的事件数量
 */

// ── 类型定义 ──────────────────────────────────────────────

type EventHandler<T = any> = (event: T) => void;

interface BoundEvent {
    target: EventTarget;
    type: string;
    handler: EventListenerOrEventListenerObject;
    options?: boolean | AddEventListenerOptions;
}

interface CustomEventEntry {
    handlers: Set<EventHandler>;
}

/** 键盘快捷键配置 */
export interface ShortcutOptions {
    /** 按键码，如 "KeyF"、"KeyM"、"KeyK" */
    code: string;
    /** 是否需要 Meta/Cmd 键 */
    meta?: boolean;
    /** 是否需要 Ctrl 键 */
    ctrl?: boolean;
    /** 是否需要 Meta 或 Ctrl 键（跨平台兼容） */
    metaOrCtrl?: boolean;
    /** 是否需要 Shift 键 */
    shift?: boolean;
    /** 是否需要 Alt/Option 键 */
    alt?: boolean;
    /** 是否阻止默认行为（默认 true） */
    preventDefault?: boolean;
    /** 是否阻止事件冒泡（默认 false） */
    stopPropagation?: boolean;
}

// ── 事件管理器实现 ────────────────────────────────────────

export class EventManager {
    private boundEvents: BoundEvent[] = [];
    private customEvents = new Map<string, CustomEventEntry>();
    private disposed = false;

    /**
     * 绑定 DOM 事件到 Window
     * @returns 解绑函数
     */
    onWindow<K extends keyof WindowEventMap>(
        type: K,
        handler: (ev: WindowEventMap[K]) => void,
        options?: boolean | AddEventListenerOptions,
    ): () => void {
        return this.bind(window, type, handler as EventListener, options);
    }

    /**
     * 绑定 DOM 事件到 Document
     * @returns 解绑函数
     */
    onDocument<K extends keyof DocumentEventMap>(
        type: K,
        handler: (ev: DocumentEventMap[K]) => void,
        options?: boolean | AddEventListenerOptions,
    ): () => void {
        return this.bind(document, type, handler as EventListener, options);
    }

    /**
     * 绑定 DOM 事件到指定元素
     * @returns 解绑函数
     */
    onElement<K extends keyof HTMLElementEventMap>(
        target: HTMLElement,
        type: K,
        handler: (ev: HTMLElementEventMap[K]) => void,
        options?: boolean | AddEventListenerOptions,
    ): () => void {
        return this.bind(target, type, handler as EventListener, options);
    }

    /**
     * 绑定自定义事件
     * @returns 解绑函数
     */
    onCustom<T = any>(
        type: string,
        handler: EventHandler<T>,
    ): () => void {
        this.ensureNotDisposed();

        let entry = this.customEvents.get(type);
        if (!entry) {
            entry = { handlers: new Set() };
            this.customEvents.set(type, entry);
        }
        entry.handlers.add(handler);

        return () => {
            entry.handlers.delete(handler);
            if (entry.handlers.size === 0) {
                this.customEvents.delete(type);
            }
        };
    }

    /**
     * 绑定键盘快捷键
     * @param options - 快捷键配置
     * @param handler - 事件处理函数
     * @returns 解绑函数
     * 
     * @example
     * // Cmd/Ctrl+F
     * eventManager.onShortcut(
     *     { code: "KeyF", meta: true, ctrl: true },
     *     () => openFindBar()
     * );
     * 
     * @example
     * // Cmd/Ctrl+Shift+M
     * eventManager.onShortcut(
     *     { code: "KeyM", meta: true, ctrl: true, shift: true },
     *     () => switchToTextEditor()
     * );
     * 
     * @example
     * // Alt+K（不阻止冒泡）
     * eventManager.onShortcut(
     *     { code: "KeyK", alt: true, stopPropagation: false },
     *     () => sendToClaude()
     * );
     */
    onShortcut(
        options: ShortcutOptions,
        handler: (e: KeyboardEvent) => void,
    ): () => void {
        const {
            code,
            meta = false,
            ctrl = false,
            metaOrCtrl = false,
            shift = false,
            alt = false,
            preventDefault = true,
            stopPropagation = false,
        } = options;

        return this.onWindow("keydown", (e) => {
            // 检查组合键
            if (metaOrCtrl && !e.metaKey && !e.ctrlKey) { return; }
            if (meta && !metaOrCtrl && !e.metaKey) { return; }
            if (ctrl && !metaOrCtrl && !e.ctrlKey) { return; }
            if (shift && !e.shiftKey) { return; }
            if (alt && !e.altKey) { return; }
            
            // 检查按键码
            if (e.code !== code) { return; }

            // 阻止默认行为和冒泡
            if (preventDefault) { e.preventDefault(); }
            if (stopPropagation) { e.stopPropagation(); }

            handler(e);
        });
    }

    /**
     * 触发自定义事件
     */
    emit<T = any>(type: string, detail?: T): void {
        this.ensureNotDisposed();

        const entry = this.customEvents.get(type);
        if (entry) {
            for (const handler of entry.handlers) {
                try {
                    handler(detail);
                } catch (e) {
                    console.error(`[EventManager] Error in custom event handler for "${type}":`, e);
                }
            }
        }
    }

    /**
     * 批量解绑所有事件（用于组件销毁）
     */
    dispose(): void {
        if (this.disposed) { return; }
        this.disposed = true;

        // 解绑 DOM 事件
        for (const { target, type, handler, options } of this.boundEvents) {
            try {
                target.removeEventListener(type, handler, options);
            } catch {
                // 忽略已移除的元素
            }
        }
        this.boundEvents = [];

        // 清空自定义事件
        this.customEvents.clear();
    }

    /**
     * 获取当前绑定的事件数量（调试用）
     */
    get stats(): { domEvents: number; customEvents: number } {
        return {
            domEvents: this.boundEvents.length,
            customEvents: Array.from(this.customEvents.values())
                .reduce((sum, entry) => sum + entry.handlers.size, 0),
        };
    }

    // ── 内部方法 ──────────────────────────────────────────

    private bind(
        target: EventTarget,
        type: string,
        handler: EventListener,
        options?: boolean | AddEventListenerOptions,
    ): () => void {
        this.ensureNotDisposed();

        target.addEventListener(type, handler, options);
        this.boundEvents.push({ target, type, handler, options });

        return () => {
            target.removeEventListener(type, handler, options);
            const idx = this.boundEvents.findIndex(
                e => e.target === target && e.type === type && e.handler === handler,
            );
            if (idx !== -1) {
                this.boundEvents.splice(idx, 1);
            }
        };
    }

    private ensureNotDisposed(): void {
        if (this.disposed) {
            throw new Error("[EventManager] Instance has been disposed");
        }
    }
}

// ── 便捷工厂函数 ──────────────────────────────────────────

/**
 * 创建一个新的事件管理器实例
 */
export function createEventManager(): EventManager {
    return new EventManager();
}
