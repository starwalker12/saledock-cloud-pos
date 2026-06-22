"use client";

import Image from "next/image";
import { useState } from "react";
import { Package } from "lucide-react";

type ProductThumbnailProps = {
  imageUrl: string | null | undefined;
  productName: string;
  className: string;
  sizes: string;
};

export function ProductThumbnail({
  imageUrl,
  productName,
  className,
  sizes,
}: ProductThumbnailProps) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(imageUrl) && !failed;

  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-xl border border-slate-200/60 bg-slate-100 text-slate-500 dark:border-slate-700/50 dark:bg-slate-800 dark:text-slate-400 ${className}`}
    >
      {showImage ? (
        <div className="absolute inset-1">
          <Image
            src={imageUrl!}
            alt=""
            fill
            sizes={sizes}
            className="object-contain"
            loading="lazy"
            onError={() => setFailed(true)}
          />
        </div>
      ) : (
        <div
          className="flex h-full items-center justify-center"
          role="img"
          aria-label={`${productName} has no product image`}
        >
          <Package className="size-1/3 min-h-5 min-w-5" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}
