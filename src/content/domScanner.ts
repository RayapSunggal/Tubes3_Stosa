const SKIPPED_SELECTOR =
  "script, style, noscript, textarea, input, select, option, pre, code, [data-judol-highlight='true']";

export interface TextSegment {
  node: Text;
  start: number;
  end: number;
}

export interface DomScanResult {
  text: string;
  segments: TextSegment[];
}

export function scanDocumentText(root: ParentNode = document.body): DomScanResult {
  const segments: TextSegment[] = [];
  const textParts: string[] = [];
  let cursor = 0;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!isReadableTextNode(node)) {
        return NodeFilter.FILTER_REJECT;
      }

      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let current = walker.nextNode();
  while (current) {
    const node = current as Text;
    const value = node.nodeValue ?? "";

    textParts.push(value);
    segments.push({
      node,
      start: cursor,
      end: cursor + value.length,
    });

    cursor += value.length;
    textParts.push(" ");
    cursor += 1;
    current = walker.nextNode();
  }

  return {
    text: textParts.join(""),
    segments,
  };
}

function isReadableTextNode(node: Node): boolean {
  const value = node.nodeValue;
  if (!value || value.trim().length === 0) {
    return false;
  }

  const parent = node.parentElement;
  if (!parent || parent.closest(SKIPPED_SELECTOR)) {
    return false;
  }

  const style = window.getComputedStyle(parent);
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    style.opacity !== "0"
  );
}
