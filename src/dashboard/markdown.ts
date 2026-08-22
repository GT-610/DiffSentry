import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

// The bot's review summaries + finding bodies are GitHub-flavored markdown
// with inline <details>/<summary> blocks. Parse to HTML so the dashboard
// matches what GitHub shows instead of a wall of raw markdown.
//
// The output runs through an allowlist sanitizer before leaving the server.
// Markdown rendered here is not always bot-authored: issue bodies and PR
// descriptions are stored verbatim from the webhook, so anyone who can open
// an issue on an installed repo authors content an operator's browser will
// render. A regex blacklist is the wrong tool for that — entity-encoded
// payloads (`javascript&colon;`, `<iframe srcdoc="&#60;script&#62;">`) slip
// past pattern matching but not a parse-and-rebuild sanitizer.

marked.setOptions({ gfm: true, breaks: false });

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  // GFM output plus the raw-HTML surfaces our own comments rely on:
  // <details>/<summary> collapsibles and task-list checkboxes.
  allowedTags: [
    "p", "br", "hr",
    "em", "strong", "del", "s", "sub", "sup", "span",
    "code", "pre", "blockquote",
    "ul", "ol", "li",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "table", "thead", "tbody", "tfoot", "tr", "th", "td",
    "a", "img",
    "details", "summary",
    "input",
  ],
  allowedAttributes: {
    a: ["href", "title"],
    img: ["src", "alt", "title"],
    input: ["type", "checked", "disabled"],
    th: ["align"],
    td: ["align"],
    code: ["class"], // language-* classes emitted by fenced code blocks
    details: ["open"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowProtocolRelative: false,
};

export function renderMarkdown(input: string | null | undefined): string {
  if (!input) return "";
  let html: string;
  try {
    html = marked.parse(input, { async: false }) as string;
  } catch {
    // Parser blew up — fall back to escaped plaintext (no HTML reaches the DOM).
    return input
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br>");
  }
  return sanitizeHtml(html, SANITIZE_OPTIONS);
}
