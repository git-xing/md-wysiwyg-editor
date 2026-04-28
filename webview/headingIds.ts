/**
 * headingIds.ts
 *
 * 注意：不再使用 MutationObserver 动态更新 heading id。
 *
 * 原设计通过 el.id = slug 修改 ProseMirror 管理的 DOM 节点，会导致：
 *   assignIds → el.id 变更 → ProseMirror 检测到 heading attribute 变化
 *   → 替换 heading 节点 → childList mutation 含 heading → affectsHeadings=true
 *   → 再次 assignIds → 无限循环（B087）
 *
 * linkPopup 的 findHeadingElement() 已内置 slug 扫描 fallback，
 * 不依赖 el.id 也能正确找到标题并滚动。
 * 因此本模块保留 export 签名（供 index.ts 调用），但不做任何 DOM 操作。
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function initHeadingIds(_container: HTMLElement): void {
    // 刻意不操作 DOM — 详见上方注释
}
