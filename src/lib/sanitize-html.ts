import DOMPurify from "dompurify";

export function isSafeUrl(
  url: string,
  kind: "link" | "image"
): boolean {
  // Reject empty or whitespace-only URLs
  if (!url || /^\s*$/.test(url)) {
    return false;
  }

  // Reject URLs with control characters
  if (/[\x00-\x1f\x7f]/.test(url)) {
    return false;
  }

  // Reject protocol-relative URLs (browsers also treat a leading "/\\" like "//")
  if (url.startsWith("//") || url.startsWith("/\\") || url.includes("\\")) {
    return false;
  }

  // Reject data: and vbscript: schemes
  const lowerUrl = url.toLowerCase().trim();
  if (
    lowerUrl.startsWith("data:") ||
    lowerUrl.startsWith("vbscript:") ||
    lowerUrl.startsWith("javascript:")
  ) {
    return false;
  }

  // Reject URLs with tab characters or other tricks
  if (/java\s*script:/i.test(url)) {
    return false;
  }

  // For images: allow http/https or relative paths
  if (kind === "image") {
    return (
      lowerUrl.startsWith("http://") ||
      lowerUrl.startsWith("https://") ||
      url.startsWith("/")
    );
  }

  // For links: allow http/https/mailto/tel or relative paths
  if (kind === "link") {
    return (
      lowerUrl.startsWith("http://") ||
      lowerUrl.startsWith("https://") ||
      lowerUrl.startsWith("mailto:") ||
      lowerUrl.startsWith("tel:") ||
      url.startsWith("/") ||
      url.startsWith("#")
    );
  }

  return false;
}

const allowedTags = [
  "p", "br", "strong", "em", "u", "s", "a", "ul", "ol", "li", "blockquote", "code", "pre",
  "h1", "h2", "h3", "h4", "img", "table", "thead", "tbody", "tr", "th", "td", "hr", "span", "div",
];
const allowedAttributes = ["href", "target", "rel", "src", "alt", "title", "width", "height", "colspan", "rowspan", "style"];
const alignment = /^\s*text-align:\s*(left|center|right|justify)\s*;?\s*$/i;

let configured = false;

function configure() {
  if (configured) return;
  configured = true;
  // Attribute values are checked one by one; anything unsafe is dropped rather than rewritten.
  DOMPurify.addHook("uponSanitizeAttribute", (_node, data) => {
    if (data.attrName === "href" && !isSafeUrl(data.attrValue, "link")) data.keepAttr = false;
    else if (data.attrName === "src" && !isSafeUrl(data.attrValue, "image")) data.keepAttr = false;
    else if (data.attrName === "style") {
      const match = alignment.exec(data.attrValue);
      if (match) data.attrValue = `text-align: ${match[1].toLowerCase()};`;
      else data.keepAttr = false;
    }
  });
  DOMPurify.addHook("afterSanitizeAttributes", node => {
    if (node.tagName === "A" && node.getAttribute("target")) {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    }
    // An image without a safe source is useless; remove it entirely.
    if (node.tagName === "IMG" && !node.getAttribute("src")) node.remove();
  });
}

/** Cleans editor HTML for storage. Browser only: returns "" on the server, where it must not be used. */
export function sanitizeHtml(html: string): string {
  if (typeof window === "undefined") return "";
  configure();
  const cleaned = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: allowedTags,
    ALLOWED_ATTR: allowedAttributes,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    // Scheme check only; isSafeUrl above does the strict per-kind decision.
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|\/(?!\/)|#)/i,
    KEEP_CONTENT: true,
  });
  return cleaned === "<p></p>" ? "" : cleaned;
}
