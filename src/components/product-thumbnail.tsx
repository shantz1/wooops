"use client";

import Image from "next/image";
import { Package } from "lucide-react";
import { useState } from "react";

export function ProductThumbnail({ src, alt, size = 48 }: { src?: string; alt: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const usable = src && /^https?:\/\//i.test(src);

  return (
    <span className="grid shrink-0 place-items-center overflow-hidden rounded-lg border text-muted-foreground" style={{ width: size, height: size }}>
      {usable && !failed ? (
        <Image src={src} alt={alt} width={size} height={size} unoptimized loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="h-full w-full object-cover" />
      ) : <Package className="size-5" aria-label="No product image" />}
    </span>
  );
}
