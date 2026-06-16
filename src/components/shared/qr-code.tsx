"use client";

import { use, useMemo, Suspense } from "react";
import { toDataURL } from "qrcode";

function createQrPromise(value: string, size: number): Promise<{ dataUrl: string | null; error: boolean }> {
  return toDataURL(value, { width: size, margin: 2, errorCorrectionLevel: "M" })
    .then((dataUrl) => ({ dataUrl, error: false }))
    .catch(() => ({ dataUrl: null, error: true }));
}

function QrCodeImageInner({
  value,
  size,
  alt,
  className = "",
}: {
  value: string;
  size: number;
  alt: string;
  className?: string;
}) {
  const promise = useMemo(() => createQrPromise(value, size), [value, size]);
  const { dataUrl, error } = use(promise);

  if (error || !dataUrl) {
    return (
      <div
        className={`flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-400 dark:border-slate-700 dark:bg-slate-900 ${className}`}
        style={{ width: size, height: size }}
      >
        QR error
      </div>
    );
  }

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={dataUrl}
      alt={alt}
      width={size}
      height={size}
      className={`rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-700 ${className}`}
    />
  );
}

function QrSkeleton({ size, className = "" }: { size: number; className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800 ${className}`}
      style={{ width: size, height: size }}
      aria-busy="true"
    />
  );
}

export function QrCodeImage({
  value,
  size = 128,
  alt = "QR code",
  className = "",
}: {
  value: string;
  size?: number;
  alt?: string;
  className?: string;
}) {
  return (
    <Suspense fallback={<QrSkeleton size={size} className={className} />}>
      <QrCodeImageInner value={value} size={size} alt={alt} className={className} />
    </Suspense>
  );
}
