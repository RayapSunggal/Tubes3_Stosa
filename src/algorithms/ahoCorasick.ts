import type { DetectorInput, RawMatch } from "../shared/types";

interface AhoPattern {
  target: string;
  keyword: string;
}

interface AhoNode {
  children: Map<string, AhoNode>;
  fail: AhoNode | null;
  outputs: AhoPattern[];
}

function createNode(): AhoNode {
  return {
    children: new Map<string, AhoNode>(),
    fail: null,
    outputs: [],
  };
}

function buildTrie(patterns: AhoPattern[]): AhoNode {
  const root=createNode();

  for (const pattern of patterns) {
    let node=root;

    for (const char of pattern.target) {
      let next=node.children.get(char);

      if (next===undefined) {
        next=createNode();
        node.children.set(char, next);
      }

      node=next;
    }

    node.outputs.push(pattern);
  }

  const queue: AhoNode[]=[];

  for (const child of root.children.values()) {
    child.fail=root;
    queue.push(child);
  }

  while (queue.length>0) {
    const current=queue.shift() as AhoNode;

    for (const [char, next] of current.children) {
      let fallback=current.fail;

      while (fallback!==null && !fallback.children.has(char)) {
        fallback=fallback.fail;
      }

      next.fail=fallback?.children.get(char) ?? root;
      next.outputs.push(...next.fail.outputs);
      queue.push(next);
    }
  }

  return root;
}

function ahoCorasick(text: string, keywords: string[]): RawMatch[] {
  const patterns: AhoPattern[]=keywords
    .filter((keyword) => keyword.length>0)
    .map((keyword) => ({
      target: keyword.toLowerCase(),
      keyword,
    }));
  const matches: RawMatch[]=[];
  if (patterns.length===0 || text.length===0) return matches;

  const root=buildTrie(patterns);
  const data=text.toLowerCase();
  let node=root;
  let ni=0;

  for (let i=0; i<data.length; i++) {
    const char=data[i];

    while (node!==root && !node.children.has(char)) {
      ni++;
      node=node.fail ?? root;
    }

    const next=node.children.get(char);
    ni++;
    node=next ?? root;

    for (const pattern of node.outputs) {
      const start=i-pattern.target.length+1;

      matches.push({
        keyword: pattern.keyword,
        matchedText: text.slice(start, i+1),
        algorithm: "AhoCorasick",
        start,
        end: i+1,
        comparisons: ni,
      });
    }
  }

  return matches;
}

export function runAhoCorasick(input: DetectorInput): RawMatch[] {
  const { text, keywords }=input;

  return ahoCorasick(text, keywords);
}
