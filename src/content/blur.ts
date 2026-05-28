const BLUR_CLASS = "judol-detector-highlight--blurred";
const BLUR_TARGET_SELECTOR =
  "[data-judol-highlight='true'], [data-judol-ocr-match='true']";

export function applyBlurToHighlights(enabled: boolean, root: ParentNode = document): void {
  injectBlurStyle();

  const highlights = Array.from(root.querySelectorAll<HTMLElement>(BLUR_TARGET_SELECTOR));

  for (const highlight of highlights) {
    highlight.classList.toggle(BLUR_CLASS, enabled);
    highlight.dataset.judolBlurred = enabled ? "true" : "false";
  }
}

export function clearBlurState(root: ParentNode = document): void {
  const blurredHighlights = Array.from(
    root.querySelectorAll<HTMLElement>(`.${BLUR_CLASS}`),
  );

  for (const highlight of blurredHighlights) {
    highlight.classList.remove(BLUR_CLASS);
    delete highlight.dataset.judolBlurred;
  }
}

function injectBlurStyle(): void {
  if (document.getElementById("judol-detector-blur-style")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "judol-detector-blur-style";
  style.textContent = `
    .judol-detector-highlight--blurred {
      filter: blur(4px);
      user-select: none;
      transition: filter 140ms ease;
    }

    .judol-detector-highlight--blurred:focus {
      filter: blur(3px);
    }
  `;
  document.documentElement.appendChild(style);
}
