import { createElement, type ReactNode } from "react";
import type { JSONContent } from "@tiptap/core";
import { safeLink } from "../../../packages/contracts/src/rich-text";
export function RichText({ document }: { document: JSONContent }) {
  function render(node: JSONContent, key: number): ReactNode {
    let children: ReactNode = node.text ?? node.content?.map(render) ?? null;
    for (const mark of node.marks ?? []) {
      if (mark.type === "bold") children = <strong>{children}</strong>;
      if (mark.type === "italic") children = <em>{children}</em>;
      if (mark.type === "code") children = <code>{children}</code>;
      if (mark.type === "link" && safeLink(mark.attrs?.href))
        children = (
          <a href={mark.attrs.href} rel="noopener noreferrer">
            {children}
          </a>
        );
    }
    if (node.type === "text") return <span key={key}>{children}</span>;
    if (node.type === "heading")
      return createElement(
        `h${Math.min(6, Math.max(1, Number(node.attrs?.level ?? 2)))}`,
        { key },
        children,
      );
    if (node.type === "tableCell" || node.type === "tableHeader")
      return createElement(
        node.type === "tableCell" ? "td" : "th",
        {
          key,
          colSpan: Number(node.attrs?.colspan ?? 1),
          rowSpan: Number(node.attrs?.rowspan ?? 1),
        },
        children,
      );
    if (node.type === "codeBlock")
      return (
        <pre key={key}>
          <code>{children}</code>
        </pre>
      );
    if (node.type === "table")
      return (
        <table key={key}>
          <tbody>{children}</tbody>
        </table>
      );
    const tags: Record<string, string> = {
      doc: "div",
      paragraph: "p",
      bulletList: "ul",
      orderedList: "ol",
      listItem: "li",
      blockquote: "blockquote",
      tableRow: "tr",
      hardBreak: "br",
      horizontalRule: "hr",
    };
    return node.type && tags[node.type]
      ? createElement(
          tags[node.type]!,
          { key },
          node.type === "hardBreak" || node.type === "horizontalRule"
            ? undefined
            : children,
        )
      : null;
  }
  return <div className="rich-text">{render(document, 0)}</div>;
}
