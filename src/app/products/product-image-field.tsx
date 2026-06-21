"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ImageIcon, Trash2, Upload } from "lucide-react";
import {
  PRODUCT_IMAGE_ACCEPT,
  validateProductImageFile,
} from "@/lib/storage/product-image-rules";

type ProductImageFieldProps = {
  currentUrl?: string | null;
  disabled?: boolean;
  onDirty?: () => void;
};

export function ProductImageField({
  currentUrl,
  disabled = false,
  onDirty,
}: ProductImageFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentUrl ?? null);
  const [removed, setRemoved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  function clearObjectUrl() {
    if (!objectUrlRef.current) return;
    URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const validationError = validateProductImageFile(file);
    if (validationError) {
      setError(validationError);
      event.target.value = "";
      return;
    }

    clearObjectUrl();
    const objectUrl = URL.createObjectURL(file);
    objectUrlRef.current = objectUrl;
    setPreviewUrl(objectUrl);
    setRemoved(false);
    setError(null);
    onDirty?.();
  }

  function handleRemove() {
    clearObjectUrl();
    if (inputRef.current) inputRef.current.value = "";
    setPreviewUrl(null);
    setRemoved(true);
    setError(null);
    onDirty?.();
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative size-28 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800">
        {previewUrl ? (
          <Image
            src={previewUrl}
            alt="Product image preview"
            fill
            sizes="112px"
            className="object-cover"
            unoptimized={previewUrl.startsWith("blob:")}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-slate-400 dark:text-slate-500">
            <ImageIcon className="size-8" aria-hidden="true" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Product image</p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          JPG, PNG, or WebP up to 2 MB. Square images look best in POS.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <label className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-300 bg-[#fff] px-3 text-sm font-bold text-slate-700 transition hover:bg-slate-100 focus-within:ring-2 focus-within:ring-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
            <Upload className="size-4" aria-hidden="true" />
            {previewUrl ? "Change image" : "Upload image"}
            <input
              ref={inputRef}
              type="file"
              name="product_image"
              accept={PRODUCT_IMAGE_ACCEPT}
              disabled={disabled}
              onChange={handleFileChange}
              className="sr-only"
            />
          </label>
          {previewUrl && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={disabled}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-bold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:text-red-400 dark:hover:bg-red-950/40"
            >
              <Trash2 className="size-4" aria-hidden="true" />
              Remove image
            </button>
          )}
        </div>
        {error && (
          <p role="alert" className="mt-2 text-xs font-semibold text-red-700 dark:text-red-400">
            {error}
          </p>
        )}
      </div>
      {removed && <input type="hidden" name="remove_image" value="1" />}
    </div>
  );
}
