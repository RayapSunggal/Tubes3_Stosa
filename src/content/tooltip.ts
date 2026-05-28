export interface TooltipPayload {
  keyword: string;
  algorithm: string;
  count: number;
  executionTimeMs: number;
  matchedText: string;
}

const tooltipData = new WeakMap<Element, TooltipPayload>();
let tooltipElement: HTMLDivElement | null = null;
let activeTarget: Element | null = null;
let isSetup = false;

export function attachTooltipData(element: Element, payload: TooltipPayload): void {
  tooltipData.set(element, payload);
}

export function setupJudolTooltip(): void {
  if (isSetup) {
    return;
  }

  isSetup = true;
  injectTooltipStyle();
  document.addEventListener("mouseover", handleMouseOver);
  document.addEventListener("mousemove", handleMouseMove);
  document.addEventListener("mouseout", handleMouseOut);
  document.addEventListener("focusin", handleFocusIn);
  document.addEventListener("focusout", handleFocusOut);
}

function handleMouseOver(event: MouseEvent): void {
  const target = findHighlightTarget(event.target);
  if (!target) {
    return;
  }

  activeTarget = target;
  showTooltip(target, event.clientX, event.clientY);
}

function handleMouseMove(event: MouseEvent): void {
  if (!activeTarget || !tooltipElement) {
    return;
  }

  positionTooltip(event.clientX, event.clientY);
}

function handleMouseOut(event: MouseEvent): void {
  const target = findHighlightTarget(event.target);
  const related = event.relatedTarget;

  if (!target || (related instanceof Node && target.contains(related))) {
    return;
  }

  hideTooltip();
}

function handleFocusIn(event: FocusEvent): void {
  const target = findHighlightTarget(event.target);
  if (!target) {
    return;
  }

  const rect = target.getBoundingClientRect();
  activeTarget = target;
  showTooltip(target, rect.left + rect.width / 2, rect.bottom);
}

function handleFocusOut(): void {
  hideTooltip();
}

function findHighlightTarget(target: EventTarget | null): Element | null {
  if (!(target instanceof Element)) {
    return null;
  }

  return target.closest("[data-judol-highlight='true']");
}

function showTooltip(target: Element, x: number, y: number): void {
  const payload = tooltipData.get(target);
  if (!payload) {
    return;
  }

  const tooltip = getTooltipElement();
  tooltip.replaceChildren(
    createTitle(payload.keyword),
    createRow("Matched", payload.matchedText),
    createRow("Algorithm", payload.algorithm),
    createRow("Count", String(payload.count)),
    createRow("Time", `${payload.executionTimeMs.toFixed(2)} ms`),
  );

  tooltip.hidden = false;
  positionTooltip(x, y);
}

function hideTooltip(): void {
  activeTarget = null;
  if (tooltipElement) {
    tooltipElement.hidden = true;
  }
}

function positionTooltip(x: number, y: number): void {
  const tooltip = getTooltipElement();
  const margin = 12;
  const offset = 14;
  const rect = tooltip.getBoundingClientRect();
  const left = Math.min(
    Math.max(margin, x + offset),
    window.innerWidth - rect.width - margin,
  );
  const top = Math.min(
    Math.max(margin, y + offset),
    window.innerHeight - rect.height - margin,
  );

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function getTooltipElement(): HTMLDivElement {
  if (tooltipElement) {
    return tooltipElement;
  }

  tooltipElement = document.createElement("div");
  tooltipElement.className = "judol-detector-tooltip";
  tooltipElement.hidden = true;
  document.documentElement.appendChild(tooltipElement);
  return tooltipElement;
}

function createTitle(text: string): HTMLElement {
  const title = document.createElement("strong");
  title.className = "judol-detector-tooltip__title";
  title.textContent = text;
  return title;
}

function createRow(label: string, value: string): HTMLElement {
  const row = document.createElement("span");
  row.className = "judol-detector-tooltip__row";

  const labelElement = document.createElement("span");
  labelElement.textContent = label;

  const valueElement = document.createElement("b");
  valueElement.textContent = value;

  row.append(labelElement, valueElement);
  return row;
}

function injectTooltipStyle(): void {
  if (document.getElementById("judol-detector-tooltip-style")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "judol-detector-tooltip-style";
  style.textContent = `
    .judol-detector-tooltip {
      position: fixed;
      z-index: 2147483647;
      width: max-content;
      max-width: 260px;
      padding: 10px 12px;
      border: 1px solid rgba(23, 35, 38, 0.16);
      border-radius: 8px;
      background: #132326;
      color: #f8fbfa;
      box-shadow: 0 14px 34px rgba(17, 29, 33, 0.24);
      font: 12px/1.35 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      pointer-events: none;
    }

    .judol-detector-tooltip[hidden] {
      display: none;
    }

    .judol-detector-tooltip__title {
      display: block;
      margin-bottom: 7px;
      color: #ffffff;
      font-size: 13px;
      line-height: 1.2;
    }

    .judol-detector-tooltip__row {
      display: grid;
      grid-template-columns: 78px minmax(0, 1fr);
      gap: 8px;
      margin-top: 4px;
    }

    .judol-detector-tooltip__row span {
      color: #aebec3;
    }

    .judol-detector-tooltip__row b {
      min-width: 0;
      overflow-wrap: anywhere;
      color: #ffffff;
      font-weight: 750;
    }
  `;
  document.documentElement.appendChild(style);
}
