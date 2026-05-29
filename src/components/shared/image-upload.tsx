"use client";

import { useState, useRef } from "react";
import { Upload, X, Loader2, ImageIcon } from "lucide-react";
import { validateImageFile, uploadImage, type UploadResult } from "@/lib/storage/upload";

type ImageUploadProps = {
  bucket: "profile-pictures" | "public-branding";
  folderPath: string;
  currentUrl?: string | null;
  onUploadComplete: (publicUrl: string) => void;
  onRemove?: () => void;
  label?: string;
  aspectRatio?: "square" | "landscape";
  uploadingText?: string;
  removeLabel?: string;
};

const aspectClasses = {
  square: "aspect-square",
  landscape: "aspect-[4/3]",
};

export function ImageUpload({
  bucket,
  folderPath,
  currentUrl,
  onUploadComplete,
  onRemove,
  label,
  aspectRatio = "square",
  uploadingText = "Uploading...",
  removeLabel,
}: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentUrl ?? null);
  const [error, setError] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    const validationError = validateImageFile(file);
    if (validationError) {
      setError(validationError);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setImgError(false);
    const localPreview = URL.createObjectURL(file);
    setPreview(localPreview);
    setUploading(true);

    uploadImage(bucket, folderPath, file).then((result: UploadResult) => {
      setUploading(false);
      if (result.error) {
        setError(result.error);
        setImgError(false);
        setPreview(currentUrl ?? null);
        return;
      }
      if (result.publicUrl) {
        onUploadComplete(result.publicUrl);
        setPreview(result.publicUrl);
      }
      URL.revokeObjectURL(localPreview);
    }).catch(() => {
      setUploading(false);
      setImgError(false);
      setError("Unexpected upload error. Please try again.");
      setPreview(currentUrl ?? null);
    });
  }

  function handleRemove() {
    setPreview(null);
    setError(null);
    setImgError(false);
    onRemove?.();
    if (inputRef.current) inputRef.current.value = "";
  }

  const showImage = preview && !imgError;
  const showErrorState = preview && imgError;

  return (
    <div className="space-y-2">
      {label && (
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      )}

      <div className="flex items-start gap-4">
        {/* Preview */}
        <div
          className={`relative flex w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-slate-200 bg-slate-50 ${aspectClasses[aspectRatio]}`}
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-1">
              <Loader2 className="size-5 animate-spin text-slate-400" />
              <span className="text-[10px] text-slate-400">{uploadingText}</span>
            </div>
          ) : showImage ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={preview}
                src={preview}
                alt="Preview"
                className="h-full w-full object-cover"
                onError={() => setImgError(true)}
              />
              {onRemove && (
                <button
                  type="button"
                  onClick={handleRemove}
                  className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-red-500 text-white shadow hover:bg-red-600"
                  title="Remove"
                >
                  <X className="size-3" />
                </button>
              )}
            </>
          ) : showErrorState ? (
            <div className="flex flex-col items-center gap-1 p-2">
              <ImageIcon className="size-6 text-slate-300" aria-hidden="true" />
              <span className="text-[10px] text-center leading-tight text-slate-400">
                Preview unavailable
              </span>
            </div>
          ) : (
            <ImageIcon className="size-8 text-slate-300" aria-hidden="true" />
          )}
          {imgError && preview && onRemove && (
            <button
              type="button"
              onClick={handleRemove}
              className="absolute right-1 top-1 z-10 flex size-5 items-center justify-center rounded-full bg-red-500 text-white shadow hover:bg-red-600"
              title="Remove"
            >
              <X className="size-3" />
            </button>
          )}
        </div>

        {/* Controls */}
        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleFileSelected}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <Upload className="size-3.5" />
            {preview ? "Change" : "Upload"}
          </button>
          {(preview || showErrorState) && onRemove && (
            <button
              type="button"
              onClick={handleRemove}
              className="flex h-9 items-center gap-2 rounded-lg border border-red-200 px-3 text-xs font-semibold text-red-600 hover:bg-red-50"
            >
              <X className="size-3.5" />
              {removeLabel ?? "Remove"}
            </button>
          )}
          <p className="text-[10px] text-slate-400 leading-relaxed">
            PNG, JPG or WebP. Max 5 MB.
          </p>
          {showErrorState && !preview?.startsWith("blob:") && (
            <p className="text-[10px] text-slate-400 leading-relaxed">
              This image could not be loaded. Re-upload it or use a different file.
            </p>
          )}
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}
    </div>
  );
}
