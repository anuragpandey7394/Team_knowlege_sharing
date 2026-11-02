import { getSchema, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
export const emptyDocument: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};
export function safeLink(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length > 2048 ||
    value !== value.trim() ||
    Array.from(value).some(
      (char) =>
        char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127 || char === "\\",
    )
  )
    return false;
  if (value.startsWith("#") || /^\/(?!\/)/u.test(value)) return true;
  try {
    return ["http:", "https:", "mailto:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}
export function editorExtensions() {
  return [
    StarterKit.configure({
      underline: false,
      strike: false,
      link: { openOnClick: false, isAllowedUri: safeLink },
    }),
    TableKit.configure({ table: { resizable: false } }),
  ];
}
const schema = getSchema(editorExtensions());
const nodes = new Set([
  "doc",
  "paragraph",
  "text",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "blockquote",
  "codeBlock",
  "horizontalRule",
  "hardBreak",
  "table",
  "tableRow",
  "tableCell",
  "tableHeader",
]);
const marks = new Set(["bold", "italic", "code", "link"]);
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid editor object");
  return value as Record<string, unknown>;
}
export function validateDocument(value: unknown): {
  document: JSONContent;
  text: string;
} {
  let count = 0;
  function attrs(
    value: unknown,
    allowed: Record<string, unknown>,
    type: string,
  ) {
    if (value === undefined) return;
    for (const [key, data] of Object.entries(record(value))) {
      if (!Object.hasOwn(allowed, key))
        throw new Error("Unsupported editor attribute");
      if (
        data !== null &&
        typeof data !== "string" &&
        typeof data !== "number" &&
        !(
          key === "colwidth" &&
          Array.isArray(data) &&
          data.length <= 20 &&
          data.every((n) => Number.isInteger(n) && n > 0 && n <= 2000)
        )
      )
        throw new Error("Invalid editor attribute");
      if (typeof data === "string" && data.length > 2048)
        throw new Error("Oversized editor attribute");
      if (
        ["colspan", "rowspan", "start"].includes(key) &&
        (!Number.isInteger(data) || Number(data) < 1 || Number(data) > 1000)
      )
        throw new Error("Invalid numeric attribute");
      if (
        key === "level" &&
        (!Number.isInteger(data) || Number(data) < 1 || Number(data) > 6)
      )
        throw new Error("Invalid heading level");
    }
    if (type === "link" && !safeLink(record(value).href))
      throw new Error("Unsafe link");
  }
  function visit(input: unknown, depth: number) {
    if (++count > 10000 || depth > 32)
      throw new Error("Editor document too complex");
    const node = record(input);
    if (
      Object.keys(node).some(
        (key) => !["type", "attrs", "marks", "text", "content"].includes(key),
      ) ||
      typeof node.type !== "string" ||
      !nodes.has(node.type)
    )
      throw new Error("Unsupported editor node");
    attrs(node.attrs, schema.nodes[node.type]!.spec.attrs ?? {}, node.type);
    if (
      node.text !== undefined &&
      (node.type !== "text" || typeof node.text !== "string")
    )
      throw new Error("Invalid editor text");
    if (node.marks !== undefined) {
      if (!Array.isArray(node.marks) || node.marks.length > 4)
        throw new Error("Invalid editor marks");
      for (const value of node.marks) {
        const mark = record(value);
        if (
          Object.keys(mark).some((key) => !["type", "attrs"].includes(key)) ||
          typeof mark.type !== "string" ||
          !marks.has(mark.type)
        )
          throw new Error("Unsupported editor mark");
        attrs(mark.attrs, schema.marks[mark.type]!.spec.attrs ?? {}, mark.type);
        if (mark.type === "link" && !mark.attrs)
          throw new Error("Missing link");
      }
    }
    if (node.content !== undefined) {
      if (!Array.isArray(node.content))
        throw new Error("Invalid editor content");
      for (const child of node.content) visit(child, depth + 1);
    }
  }
  visit(value, 0);
  if (record(value).type !== "doc")
    throw new Error("Editor root must be a document");
  const document = schema.nodeFromJSON(value);
  document.check();
  const text = document.textBetween(0, document.content.size, "\n", "\n");
  if (text.length > 100000)
    throw new Error("Page text exceeds 100000 characters");
  return { document: document.toJSON() as JSONContent, text };
}
