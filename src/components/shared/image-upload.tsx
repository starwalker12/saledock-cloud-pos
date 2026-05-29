"use client";

import { useState, useRef, useEffect } from "react";
import { Upload, X, Loader2, ImageIcon } from "lucide-react";
import { validateImageFile, uploadImage, type UploadResult } from "@/lib/storage/upload";
import { createClient } from "@/lib/supabase/client";

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
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function checkAuth() {
      const supabase = createClient();
      let { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const refreshed = await supabase.auth.getSession();
          session = refreshed.data.session;
        }
      }
      setAuthReady(true);
    }
    checkAuth();
  }, []);

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setImgError(false);

    const validationError = validateImageFile(file);
    if (validationError) {
      setUploadError(validationError);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    const localPreview = URL.createObjectURL(file);
    setPreview(localPreview);
    setUploading(true);

    let result: UploadResult;
    try {
      result = await uploadImage(bucket, folderPath, file);
    } catch {
      setUploading(false);
      setImgError(false);
      setUploadError("Upload could not complete. Please try again.");
      setPreview(currentUrl ?? null);
      URL.revokeObjectURL(localPreview);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setUploading(false);

    if (result.error) {
      setUploadError(result.error);
      setImgError(false);
      setPreview(currentUrl ?? null);
      URL.revokeObjectURL(localPreview);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    if (result.publicUrl) {
      setUploadError(null);
      setPreview(result.publicUrl);
      onUploadComplete(result.publicUrl);
    }
    URL.revokeObjectURL(localPreview);
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleRemove() {
    setPreview(null);
    setUploadError(null);
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

      {/* Vertical stack: preview on top, controls below */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        {/* Preview */}
        <div
          className={`relative flex w-full shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-slate-200 bg-slate-50 sm:w-24 ${aspectClasses[aspectRatio]}`}
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-1 py-3 sm:py-0">
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
            <div className="py-3 sm:py-0">
              <ImageIcon className="size-8 text-slate-300" aria-hidden="true" />
            </div>
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
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-0 sm:flex-1">
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
            disabled={uploading || !authReady}
            className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            {!authReady ? (
              <Loader2 className="size-3.5 animate-spin shrink-0" />
            ) : (
              <Upload className="size-3.5 shrink-0" />
            )}
            <span>{!authReady ? "Preparing…" : preview ? "Change" : "Upload"}</span>
          </button>
          {(preview || showErrorState) && onRemove && (
            <button
              type="button"
              onClick={handleRemove}
              className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-red-200 px-3 text-xs font-semibold text-red-600 hover:bg-red-50"
            >
              <X className="size-3.5 shrink-0" />
              <span>{removeLabel ?? "Remove"}</span>
            </button>
          )}
          <p className="text-[10px] text-slate-400 leading-relaxed">
            PNG, JPG or WebP. Max 5 MB.
          </p>
          {showErrorState && !preview?.startsWith("blob:") && (
            <p className="text-[10px] text-slate-400 leading-relaxed">
              Preview unavailable. Upload a new image or remove it.
            </p>
          )}
        </div>
      </div>

      {uploadError && (
        <p className="text-xs text-red-500">{uploadError}</p>
      )}
    </div>
  );
}
