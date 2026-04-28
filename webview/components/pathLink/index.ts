import "./pathLink.css";
import { notifyOpenFile } from "@/messaging";

// ── 路径检测正则 ──────────────────────────────────────────────────────
// 匹配：@/path、./path、../path、dir/file、file.ext
const PATH_REGEX =
    /^(@\/[^\s]+|\.{1,2}\/[^\s]+|[a-zA-Z0-9_-][a-zA-Z0-9._-]*\/[^\s]+|[a-zA-Z0-9_-][a-zA-Z0-9._-]*\.[a-zA-Z][a-zA-Z0-9]*(#\d+(-\d+)?)?)$/;

function isPathLike(text: string): boolean {
    return PATH_REGEX.test(text.trim());
}

// 判断 <code> 元素是否可响应路径跳转：
//   排除 pre > code（代码块）、<a> > code（已是链接）、内容不像路径
function isEligibleCode(el: Element): boolean {
    if (el.tagName !== "CODE") return false;
    if (el.closest("pre")) return false;
    if (el.closest("a")) return false;
    return isPathLike(el.textContent ?? "");
}

export function setupPathLink(container: HTMLElement): void {
    const isMac = window.__i18n?.isMac ?? false;

    let cmdHeld = false;
    let activeCode: Element | null = null;
    let lastHoveredCode: Element | null = null;

    function highlight(el: Element): void {
        if (activeCode === el) return;
        unhighlight();
        activeCode = el;
        el.classList.add("path-link--active");
    }

    function unhighlight(): void {
        if (!activeCode) return;
        activeCode.classList.remove("path-link--active");
        activeCode = null;
    }

    // ── 修饰键追踪 ──────────────────────────────────────────────────
    document.addEventListener("keydown", (e) => {
        if (isMac ? e.key === "Meta" : e.key === "Control") {
            cmdHeld = true;
            // 先按 Cmd 后悬浮的场景：鼠标已在目标上，立即高亮
            if (lastHoveredCode && isEligibleCode(lastHoveredCode)) {
                highlight(lastHoveredCode);
            }
        }
    });

    document.addEventListener("keyup", (e) => {
        if (isMac ? e.key === "Meta" : e.key === "Control") {
            cmdHeld = false;
            unhighlight();
        }
    });

    // Cmd+Tab 切走时 keyup 不会触发，通过 blur 重置
    window.addEventListener("blur", () => {
        cmdHeld = false;
        unhighlight();
    });

    // ── 鼠标悬浮 ────────────────────────────────────────────────────
    container.addEventListener("mouseover", (e) => {
        const code = (e.target as Element).closest("code");
        if (code && isEligibleCode(code)) {
            lastHoveredCode = code;
            if (cmdHeld) highlight(code);
        } else {
            lastHoveredCode = null;
            unhighlight();
        }
    });

    container.addEventListener("mouseout", (e) => {
        const related = e.relatedTarget as Node | null;
        // 若鼠标仍在 activeCode 内部（如移向子节点），不清除高亮
        if (activeCode && related && activeCode.contains(related)) return;
        lastHoveredCode = null;
        if (cmdHeld) unhighlight();
    });

    // ── Cmd+Click ────────────────────────────────────────────────────
    container.addEventListener("click", (e) => {
        const me = e as MouseEvent;
        if (!me.metaKey && !me.ctrlKey) return;

        const code = (me.target as Element).closest("code");
        if (!code || !isEligibleCode(code)) return;

        e.preventDefault();
        e.stopPropagation();
        const path = (code.textContent ?? "").trim();
        notifyOpenFile(path);
        unhighlight();
    });
}
