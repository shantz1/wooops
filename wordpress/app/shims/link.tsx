import type { AnchorHTMLAttributes } from "react";

/** Stand-in for next/link: panel paths become hash links, so new-tab and middle-click still work. */
export default function Link(props:
  AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean; replace?: boolean; scroll?: boolean }) {
  // Next-only props are dropped so they never reach the DOM.
  const { href, ...rest } = props;
  delete (rest as { prefetch?: boolean }).prefetch;
  delete (rest as { replace?: boolean }).replace;
  delete (rest as { scroll?: boolean }).scroll;
  return <a href={href.startsWith("/") ? `#${href}` : href} {...rest} />;
}
