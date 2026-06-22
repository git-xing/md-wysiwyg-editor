import type { EditorView } from "@milkdown/prose/view";
import { Plugin, TextSelection } from "@milkdown/prose/state";
import { $prose } from "@milkdown/utils";
import { IconChevronDown, IconChevronRight } from "../ui/icons";
import { applyTooltip, hideTooltip } from "../ui/tooltip";
import { headingFoldPluginKey, type HeadingFoldMeta } from "./headingFold";
import { t } from "../i18n";
import {
    getTopbarBottom,
    getHeadingLevel,
    getVisibleHeadings,
    getHeadingText,
    findHeadingPos,
} from "../utils/headingUtils";

const HEADING_STICKY_ACTIVE_CHANGE_EVENT = "heading-sticky-active-change";

function findHeadingFoldRange(view: EditorView, headingPos: number): { from: number; to: number } | null {
    const headingNode = view.state.doc.nodeAt(headingPos);
    if (!headingNode || headingNode.type.name !== "heading") {
        return null;
    }

    const headingLevel = headingNode.attrs["level"] as number;
    const from = headingPos + headingNode.nodeSize;
    let to = view.state.doc.content.size;
    view.state.doc.forEach((node, offset) => {
        if (offset <= headingPos || node.type.name !== "heading") {
            return;
        }
        const level = node.attrs["level"] as number;
        if (level <= headingLevel && to === view.state.doc.content.size) {
            to = offset;
        }
    });

    return from < to ? { from, to } : null;
}

function scrollHeadingIntoStickyPosition(view: EditorView, headingPos: number): void {
    requestAnimationFrame(() => {
        const heading = view.nodeDOM(headingPos);
        if (!(heading instanceof HTMLElement)) {
            return;
        }
        const top = heading.getBoundingClientRect().top + window.scrollY - getTopbarBottom() - 8;
        window.scrollTo({ top });
    });
}

function dispatchStickyActiveChange(headingPos: number | null): void {
    window.dispatchEvent(
        new CustomEvent(HEADING_STICKY_ACTIVE_CHANGE_EVENT, {
            detail: { headingPos },
        }),
    );
}

function setStickyContent(
    sticky: HTMLElement,
    view: EditorView,
    heading: HTMLElement,
    headingPos: number,
    collapsed: boolean,
    foldable: boolean,
): void {
    const level = getHeadingLevel(heading);
    const text = getHeadingText(heading);
    sticky.className = "heading-sticky-title";
    sticky.innerHTML = "";

    const gutter = document.createElement("span");
    gutter.className = "heading-sticky-gutter";

    if (foldable) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "heading-sticky-toggle";
        button.innerHTML = collapsed ? IconChevronRight : IconChevronDown;
        const tipText = collapsed ? t("Expand content") : t("Collapse content");
        button.setAttribute("aria-label", tipText);
        button.setAttribute("aria-expanded", collapsed ? "false" : "true");
        applyTooltip(button, tipText, { placement: "above" });
        button.addEventListener("mousedown", (event) => {
            event.preventDefault();
            event.stopPropagation();
        });
        button.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();

            const tr = view.state.tr
                .setMeta(headingFoldPluginKey, { type: "toggle", pos: headingPos } satisfies HeadingFoldMeta)
                .setMeta("addToHistory", false);

            if (!collapsed) {
                const range = findHeadingFoldRange(view, headingPos);
                if (
                    range &&
                    view.state.selection.from < range.to &&
                    view.state.selection.to > range.from
                ) {
                    tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(headingPos + 1, tr.doc.content.size))));
                }
            }

            view.dispatch(tr);
            view.focus();
            hideTooltip();
            scrollHeadingIntoStickyPosition(view, headingPos);
        });
        gutter.appendChild(button);
    }

    const marker = document.createElement("span");
    marker.className = "heading-sticky-marker";
    marker.textContent = `#H${level}`;
    gutter.appendChild(marker);

    const label = document.createElement("span");
    label.className = "heading-sticky-text";
    label.textContent = text;

    sticky.append(gutter, label);
}

function syncStickyTypography(sticky: HTMLElement, heading: HTMLElement): void {
    const style = window.getComputedStyle(heading);
    sticky.style.fontSize = style.fontSize;
    sticky.style.lineHeight = style.lineHeight;
    sticky.style.fontWeight = style.fontWeight;
}

export const headingStickyPlugin = $prose(() =>
    new Plugin({
        view(view) {
            const sticky = document.createElement("div");
            sticky.className = "heading-sticky-title";
            sticky.hidden = true;
            document.body.appendChild(sticky);

            let rafId: number | null = null;
            let activeHeading: HTMLElement | null = null;
            let activeHeadingPos: number | null = null;

            const hideSticky = () => {
                activeHeading = null;
                if (activeHeadingPos !== null) {
                    activeHeadingPos = null;
                    dispatchStickyActiveChange(null);
                }
                sticky.hidden = true;
                delete sticky.dataset["headingPos"];
            };

            const updateSticky = () => {
                rafId = null;

                const top = getTopbarBottom();
                const headings = getVisibleHeadings(view);

                // 动态计算偏移：标题 padding-top（1em）与 sticky padding（0.5em）的差值
                let paddingOffset = 0;
                if (headings.length > 0) {
                    const headingStyle = window.getComputedStyle(headings[0]);
                    const headingPaddingTop = parseFloat(headingStyle.paddingTop) || 0;
                    // sticky 的 padding 是 0.5em，这里用标题 padding 的一半作为近似
                    paddingOffset = headingPaddingTop / 2 - 1;
                }
                const threshold = top - paddingOffset;

                let activeIndex = -1;

                for (let i = 0; i < headings.length; i++) {
                    if (headings[i].getBoundingClientRect().top <= threshold) {
                        activeIndex = i;
                    } else {
                        break;
                    }
                }

                if (activeIndex < 0) {
                    hideSticky();
                    return;
                }

                const heading = headings[activeIndex];
                const text = getHeadingText(heading);
                if (!text) {
                    hideSticky();
                    return;
                }

                const headingPos = findHeadingPos(view, heading);
                if (headingPos === null) {
                    hideSticky();
                    return;
                }

                if (activeHeadingPos !== headingPos) {
                    activeHeadingPos = headingPos;
                    dispatchStickyActiveChange(headingPos);
                }
                const foldable = heading.classList.contains("heading-fold-heading--foldable");
                const collapsed = headingFoldPluginKey.getState(view.state)?.has(headingPos) ?? false;
                const rect = heading.getBoundingClientRect();
                sticky.hidden = false;
                sticky.dataset["headingPos"] = String(headingPos);
                sticky.style.top = `${top}px`;
                sticky.style.left = `${rect.left}px`;
                sticky.style.width = `${rect.width}px`;

                if (
                    heading !== activeHeading ||
                    sticky.dataset["headingText"] !== text ||
                    sticky.dataset["collapsed"] !== String(collapsed)
                ) {
                    activeHeading = heading;
                    sticky.dataset["headingText"] = text;
                    sticky.dataset["collapsed"] = String(collapsed);
                    syncStickyTypography(sticky, heading);
                    setStickyContent(sticky, view, heading, headingPos, collapsed, foldable);
                }

                const nextHeading = headings[activeIndex + 1] ?? null;
                const stickyHeight = sticky.getBoundingClientRect().height;
                const nextTop = nextHeading?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY;
                const offset = Math.min(0, nextTop - top - stickyHeight);
                sticky.style.transform = `translateY(${offset}px)`;
            };

            const scheduleUpdate = () => {
                if (rafId !== null) {
                    return;
                }
                rafId = requestAnimationFrame(updateSticky);
            };

            const scheduleLayoutUpdate = () => {
                scheduleUpdate();
                requestAnimationFrame(scheduleUpdate);
            };

            const bodyClassObserver = new MutationObserver(scheduleLayoutUpdate);
            bodyClassObserver.observe(document.body, {
                attributes: true,
                attributeFilter: ["class"],
            });

            const resizeObserver = new ResizeObserver(scheduleUpdate);
            resizeObserver.observe(view.dom);
            const editorRoot = document.getElementById("editor");
            if (editorRoot) {
                resizeObserver.observe(editorRoot);
            }

            window.addEventListener("scroll", scheduleUpdate, { passive: true });
            window.addEventListener("resize", scheduleUpdate);
            scheduleUpdate();

            return {
                update: scheduleUpdate,
                destroy() {
                    if (rafId !== null) {
                        cancelAnimationFrame(rafId);
                    }
                    window.removeEventListener("scroll", scheduleUpdate);
                    window.removeEventListener("resize", scheduleUpdate);
                    bodyClassObserver.disconnect();
                    resizeObserver.disconnect();
                    sticky.remove();
                },
            };
        },
    }),
);
