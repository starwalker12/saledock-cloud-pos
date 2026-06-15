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

type CropState = {
  file: File;
  url: string;
  zoom: number;
  x: number;
  y: number;
};

const cropOutputSize = {
  square: { width: 800, height: 800, aspect: 1 },
  landscape: { width: 960, height: 720, aspect: 4 / 3 },
};

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image could not be loaded for cropping."));
    img.src = src;
  });
}

async function createCroppedFile(file: File, url: string, aspectRatio: "square" | "landscape", zoom: number, x: number, y: number) {
  const img = await loadImage(url);
  const { width, height, aspect } = cropOutputSize[aspectRatio];
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Image crop could not be prepared.");

  const imageAspect = img.naturalWidth / img.naturalHeight;
  let cropWidth = img.naturalWidth;
  let cropHeight = img.naturalHeight;

  if (imageAspect > aspect) {
    cropWidth = img.naturalHeight * aspect;
  } else {
    cropHeight = img.naturalWidth / aspect;
  }

  cropWidth = Math.max(1, cropWidth / zoom);
  cropHeight = Math.max(1, cropHeight / zoom);

  const sourceX = Math.max(0, (img.naturalWidth - cropWidth) * (x / 100));
  const sourceY = Math.max(0, (img.naturalHeight - cropHeight) * (y / 100));
  const outputType = file.type === "image/png" ? "image/png" : "image/jpeg";

  if (outputType === "image/jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }

  ctx.drawImage(img, sourceX, sourceY, cropWidth, cropHeight, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, outputType, 0.92));
  if (!blob) throw new Error("Image crop could not be saved.");

  const extension = outputType === "image/png" ? "png" : "jpg";
  const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
  return new File([blob], `${baseName}-cropped.${extension}`, { type: outputType });
}

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
  const [cropState, setCropState] = useState<CropState | null>(null);
  const [cropProcessing, setCropProcessing] = useState(false);
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

  useEffect(() => {
    return () => {
      if (cropState?.url) {
        URL.revokeObjectURL(cropState.url);
      }
    };
  }, [cropState?.url]);

  useEffect(() => {
    if (!cropState) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !cropProcessing) {
        handleCancelCrop();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cropState, cropProcessing]);

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

    setCropState((current) => {
      if (current?.url) URL.revokeObjectURL(current.url);
      return { file, url: URL.createObjectURL(file), zoom: 1, x: 50, y: 50 };
    });
  }

  async function uploadPreparedFile(file: File) {
    const localPreview = URL.createObjectURL(file);
    setPreview(localPreview);
    setUploading(true);

    let result: UploadResult;
    try {
      result = await uploadImage(bucket, folderPath, file);
    } catch (e) {
      console.error("[ImageUpload]", e);
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

  function handleCancelCrop() {
    setCropState(null);
    setCropProcessing(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleConfirmCrop() {
    if (!cropState || cropProcessing) return;
    setUploadError(null);
    setCropProcessing(true);

    try {
      const croppedFile = await createCroppedFile(
        cropState.file,
        cropState.url,
        aspectRatio,
        cropState.zoom,
        cropState.x,
        cropState.y
      );
      setCropState(null);
      setCropProcessing(false);
      await uploadPreparedFile(croppedFile);
    } catch (e) {
      console.error("[ImageUploadCrop]", e);
      setCropProcessing(false);
      setUploadError("Image could not be cropped. Please try another image.");
    }
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

      {cropState && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/70 p-3 sm:items-center sm:p-6">
          <button
            type="button"
            aria-label="Cancel image crop"
            className="absolute inset-0 cursor-default"
            onClick={handleCancelCrop}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="image-crop-title"
            className="relative max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-3xl border border-slate-200 bg-[#fff] p-4 shadow-2xl dark:border-white/10 dark:bg-slate-950 sm:p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 id="image-crop-title" className="text-base font-bold text-slate-950 dark:text-white">
                  Crop image
                </h3>
                <p className="mt-1 text-sm leading-5 text-slate-600 dark:text-slate-300">
                  Position the image, then confirm to upload the cropped version.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCancelCrop}
                className="flex size-9 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition hover:bg-slate-100 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/10"
                aria-label="Close crop dialog"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="mt-4 rounded-2xl bg-slate-100 p-3 dark:bg-slate-900">
              <div className={`relative mx-auto max-h-[48dvh] w-full overflow-hidden rounded-xl bg-slate-950 ${aspectClasses[aspectRatio]}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={cropState.url}
                  alt="Crop preview"
                  className="h-full w-full select-none object-cover transition-transform duration-150"
                  style={{
                    objectPosition: `${cropState.x}% ${cropState.y}%`,
                    transform: `scale(${cropState.zoom})`,
                  }}
                  draggable={false}
                />
                <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-white/40" />
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Zoom
                <input
                  type="range"
                  min="1"
                  max="3"
                  step="0.05"
                  value={cropState.zoom}
                  onChange={(e) => setCropState((current) => current ? { ...current, zoom: Number(e.target.value) } : current)}
                  className="mt-2 w-full accent-[var(--primary-accent-bg)]"
                />
              </label>
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Horizontal position
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={cropState.x}
                  onChange={(e) => setCropState((current) => current ? { ...current, x: Number(e.target.value) } : current)}
                  className="mt-2 w-full accent-[var(--primary-accent-bg)]"
                />
              </label>
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Vertical position
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={cropState.y}
                  onChange={(e) => setCropState((current) => current ? { ...current, y: Number(e.target.value) } : current)}
                  className="mt-2 w-full accent-[var(--primary-accent-bg)]"
                />
              </label>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleCancelCrop}
                disabled={cropProcessing}
                className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmCrop}
                disabled={cropProcessing}
                className="min-h-11 rounded-xl bg-[var(--primary-accent-bg)] px-4 text-sm font-bold text-[var(--primary-accent-text)] shadow-sm transition hover:bg-[var(--primary-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {cropProcessing ? "Preparing..." : "Use crop"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
