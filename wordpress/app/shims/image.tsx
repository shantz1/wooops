import type { ImgHTMLAttributes } from "react";

/** Stand-in for next/image: WordPress serves images directly, so a plain <img> is used. */
export default function Image(props:
  ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean; priority?: boolean }) {
  // Next-only props are dropped so they never reach the DOM.
  const rest = { ...props };
  delete rest.unoptimized;
  delete rest.priority;
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  return <img {...rest} />;
}
