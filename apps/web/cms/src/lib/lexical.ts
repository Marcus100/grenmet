interface LexicalNode {
  children?: LexicalNode[];
  text?: string;
  type?: string;
}

function lexicalText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const value = node as LexicalNode;
  if (typeof value.text === "string") return value.text;
  const content = Array.isArray(value.children)
    ? value.children.map(lexicalText).join("")
    : "";
  return ["heading", "listitem", "paragraph", "quote"].includes(
    value.type ?? ""
  )
    ? `${content}\n\n`
    : content;
}

/** Rich text as plain paragraphs for the public feed. */
export function bodyToText(body: unknown): string {
  if (typeof body === "string") return body;
  if (!body || typeof body !== "object") return "";
  return lexicalText((body as { root?: unknown }).root).trim();
}
