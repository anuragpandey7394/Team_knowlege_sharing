import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  validateDocument,
  safeLink,
} from "../../packages/contracts/src/rich-text";
import { RichText } from "../../apps/web/src/rich-text";
const paragraph = (text: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});
describe("server editor validation and escaped rendering", () => {
  it("extracts deterministic text and renders HTML-looking input as text", () => {
    const input = paragraph("<img src=x onerror=alert(1)>");
    const result = validateDocument(input);
    expect(result.text).toBe("<img src=x onerror=alert(1)>");
    const html = renderToStaticMarkup(<RichText document={result.document} />);
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
  it("rejects unsafe protocols, unknown nodes/attrs, invalid structure and oversized text", () => {
    for (const href of [
      "javascript:alert(1)",
      "data:text/html,x",
      "java\nscript:alert(1)",
      "//evil.test",
      " https://safe.test",
    ])
      expect(safeLink(href)).toBe(false);
    for (const href of [
      "https://example.test",
      "mailto:user@example.test",
      "/local",
      "#anchor",
    ])
      expect(safeLink(href)).toBe(true);
    const invalid = [
      { type: "doc", content: [{ type: "image", attrs: { src: "x" } }] },
      {
        type: "doc",
        content: [{ type: "paragraph", attrs: { onclick: "bad" } }],
      },
      {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "paragraph" }] }],
      },
      paragraph("x".repeat(100001)),
      {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "bad",
                marks: [
                  { type: "link", attrs: { href: "javascript:alert(1)" } },
                ],
              },
            ],
          },
        ],
      },
    ];
    for (const value of invalid)
      expect(() => validateDocument(value)).toThrow();
  });
  it("preserves code and table structures without accepting arbitrary HTML", () => {
    const document = {
      type: "doc",
      content: [
        {
          type: "codeBlock",
          content: [{ type: "text", text: "npm run build" }],
        },
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Cell" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const result = validateDocument(document);
    expect(result.text).toContain("npm run build");
    expect(result.text).toContain("Cell");
    const html = renderToStaticMarkup(<RichText document={result.document} />);
    expect(html).toContain("<pre>");
    expect(html).toContain("<table>");
  });
});
