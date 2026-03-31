// ─── 全局公共工具函数 ─────────────────────────────────────

/** 锁定 body 滚动（打开全屏/模态时调用） */
export function lockBodyScroll(): void {
    document.body.style.overflow = "hidden";
}

/** 恢复 body 滚动（关闭全屏/模态时调用） */
export function unlockBodyScroll(): void {
    document.body.style.overflow = "";
}

/**
 * 为全屏遮罩添加关闭动画，动画结束后从 DOM 移除并执行 onDone 做状态清理。
 * 依赖 CSS class `.lb-closing`（触发 lb-close keyframes）。
 */
export function animateCloseLightbox(overlay: HTMLElement, onDone: () => void): void {
    overlay.classList.add("lb-closing");
    overlay.addEventListener("animationend", () => {
        if (document.body.contains(overlay)) document.body.removeChild(overlay);
        onDone();
    }, { once: true });
}

/**
 * 绑定全屏遮罩的三种关闭触发器：
 * - 关闭按钮 mousedown
 * - 点击遮罩背景（e.target === overlay）
 * - ESC 键
 * 返回清理函数（移除 keydown 监听器），在 onDone 中调用。
 */
export function bindLightboxDismiss(
    overlay: HTMLElement,
    closeBtn: HTMLElement,
    onClose: () => void,
): () => void {
    const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") { e.preventDefault(); onClose(); }
    };
    closeBtn.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); onClose(); });
    overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) onClose(); });
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
}
