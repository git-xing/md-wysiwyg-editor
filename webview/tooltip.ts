let tooltipEl: HTMLElement | null = null;

function getTooltip(): HTMLElement {
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'custom-tooltip';
    document.body.appendChild(tooltipEl);
  }
  return tooltipEl;
}

interface TooltipOptions {
  /** 显示位置：'below'（默认，工具栏用）或 'above' */
  placement?: 'above' | 'below';
  /** 仅在文本被截断（出现 ...）时才显示 */
  truncatedOnly?: boolean;
}

interface TooltipHandle {
  /** 动态更新 tooltip 文案（不影响显示状态） */
  setText(t: string): void;
  /** 主动显示 tooltip（用于点击后反馈等场景） */
  show(): void;
}

function position(tip: HTMLElement, el: HTMLElement, placement: 'above' | 'below'): void {
  tip.style.visibility = 'hidden';
  tip.style.display = 'block';

  const elRect = el.getBoundingClientRect();
  const tipRect = tip.getBoundingClientRect();

  let x = elRect.left + elRect.width / 2 - tipRect.width / 2;
  let y: number;

  if (placement === 'above') {
    y = elRect.top - tipRect.height - 6;
    if (y < 4) { y = elRect.bottom + 6; } // 上方不够则降到下方
  } else {
    y = elRect.bottom + 6;
    if (y + tipRect.height > window.innerHeight - 4) { y = elRect.top - tipRect.height - 6; }
  }

  if (x + tipRect.width > window.innerWidth - 4) { x = window.innerWidth - tipRect.width - 4; }
  if (x < 4) { x = 4; }

  tip.style.left = `${x}px`;
  tip.style.top = `${y}px`;
  tip.style.visibility = 'visible';
}

/** 立即隐藏当前显示的 tooltip（用于点击交互后主动清除） */
export function hideTooltip(): void {
  if (tooltipEl) { tooltipEl.style.display = 'none'; }
}

/** 替换原生 title，改用 VSCode 风格的自定义 tooltip */
export function applyTooltip(el: HTMLElement, text: string, options: TooltipOptions = {}): TooltipHandle {
  const { placement = 'below', truncatedOnly = false } = options;
  let currentText = text;

  el.removeAttribute('title');

  el.addEventListener('mouseenter', () => {
    if (!currentText) { return; }
    if (truncatedOnly && el.scrollWidth <= el.offsetWidth) { return; }
    const tip = getTooltip();
    tip.textContent = currentText;
    position(tip, el, placement);
  });

  el.addEventListener('mouseleave', () => {
    if (tooltipEl) { tooltipEl.style.display = 'none'; }
  });

  return {
    setText(t: string) { currentText = t; },
    show() {
      if (!currentText) { return; }
      const tip = getTooltip();
      tip.textContent = currentText;
      position(tip, el, placement);
    },
  };
}
