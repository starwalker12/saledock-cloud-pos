"use client";

import { useState, useRef, useEffect, useSyncExternalStore, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { Upload, X, Loader2, ImageIcon, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, RotateCcw } from "lucide-react";
import { validateImageFile, uploadImage, resolveImagePreviewUrl, type UploadResult } from "@/lib/storage/upload";
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

type CropDragState = {
  pointerId: number;
  startPointerX: number;
  startPointerY: number;
  startX: number;
  startY: number;
  zoom: number;
};

const cropOutputSize = {
  square: { width: 800, height: 800, aspect: 1 },
  landscape: { width: 960, height: 720, aspect: 4 / 3 },
};

const DEFAULT_CROP_X = 50;
const DEFAULT_CROP_Y = 50;
const DEFAULT_CROP_ZOOM = 1;
const NUDGE_STEP = 5;

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
  // `preview` tracks the logically-selected image: a local blob during upload,
  // or the canonical stored URL after upload/resume, or null. It is NOT used
  // directly as the <img> source because the profile-pictures bucket is private
  // and its canonical URL is not directly loadable.
  const [preview, setPreview] = useState<string | null>(currentUrl ?? null);
  // For private buckets we resolve a short-lived signed URL to actually render.
  // `signedUrl` holds that result and `signedFor` records which `preview` value
  // it corresponds to, so we can tell when it is stale.
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [signedFor, setSignedFor] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [cropState, setCropState] = useState<CropState | null>(null);
  const [cropProcessing, setCropProcessing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cropDragRef = useRef<CropDragState | null>(null);
  // Holds the current local blob preview URL so we can revoke it only when it is
  // replaced or the component unmounts — never while it is still on screen.
  const objectUrlRef = useRef<string | null>(null);
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  // Track currentUrl during render so preview re-syncs whenever the parent
  // changes it (draft resume, server URL arriving after first paint, remove).
  // This is the official React pattern for adjusting state from a prop change
  // without an effect.
  const normalizedCurrentUrl = currentUrl ?? null;
  const [lastSyncedUrl, setLastSyncedUrl] = useState(normalizedCurrentUrl);
  if (normalizedCurrentUrl !== lastSyncedUrl) {
    setLastSyncedUrl(normalizedCurrentUrl);
    // Keep an in-flight blob preview visible during upload; otherwise mirror the prop.
    setPreview((prev) => (prev?.startsWith("blob:") ? prev : normalizedCurrentUrl));
    setImgError(false);
  }

  // Derive how to display `preview` (computed during render — no effect setState):
  // - blob URL or public-branding (public bucket): loadable as-is.
  // - profile-pictures (private bucket): needs an async signed URL.
  const isBlobPreview = preview?.startsWith("blob:") ?? false;
  const isPublicBucket = bucket === "public-branding";
  const directlyLoadable = preview && (isBlobPreview || isPublicBucket) ? preview : null;
  const needsSignedUrl = Boolean(preview) && !isBlobPreview && !isPublicBucket;
  const signedReady = needsSignedUrl && signedFor === preview ? signedUrl : null;
  const displaySrc = directlyLoadable ?? signedReady;
  const resolving = needsSignedUrl && signedFor !== preview && !imgError;

  // Fetch the signed URL for a private-bucket preview. setState only happens in
  // the async callback, never synchronously in the effect body.
  useEffect(() => {
    if (!needsSignedUrl || !preview || signedFor === preview) return;
    let cancelled = false;
    resolveImagePreviewUrl(bucket, preview).then((res) => {
      if (cancelled) return;
      setSignedFor(preview);
      if (res.previewUrl) {
        setSignedUrl(res.previewUrl);
      } else {
        setSignedUrl(null);
        setImgError(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [needsSignedUrl, preview, bucket, signedFor]);

  // Revoke the tracked blob preview when the component unmounts.
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

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
      return { file, url: URL.createObjectURL(file), zoom: DEFAULT_CROP_ZOOM, x: DEFAULT_CROP_X, y: DEFAULT_CROP_Y };
    });
  }

  async function uploadPreparedFile(file: File) {
    // Replace any previous tracked blob, then show this one immediately.
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const localPreview = URL.createObjectURL(file);
    objectUrlRef.current = localPreview;
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
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setUploading(false);

    if (result.error) {
      setUploadError(result.error);
      setImgError(false);
      setPreview(currentUrl ?? null);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    if (result.publicUrl) {
      setUploadError(null);
      // Store the canonical URL; the resolve effect turns it into a loadable
      // (signed) display URL. The tracked blob stays alive until then.
      setPreview(result.publicUrl);
      onUploadComplete(result.publicUrl);
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  function clampPosition(value: number) {
    return Math.max(0, Math.min(100, value));
  }

  function handleCropPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!cropState || cropProcessing) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    cropDragRef.current = {
      pointerId: event.pointerId,
      startPointerX: event.clientX,
      startPointerY: event.clientY,
      startX: cropState.x,
      startY: cropState.y,
      zoom: cropState.zoom,
    };
  }

  function handleCropPointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = cropDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const deltaX = event.clientX - drag.startPointerX;
    const deltaY = event.clientY - drag.startPointerY;
    const nextX = clampPosition(drag.startX - (deltaX / rect.width) * (100 / drag.zoom));
    const nextY = clampPosition(drag.startY - (deltaY / rect.height) * (100 / drag.zoom));

    setCropState((current) => current ? { ...current, x: nextX, y: nextY } : current);
  }

  function handleCropPointerEnd(event: PointerEvent<HTMLDivElement>) {
    if (cropDragRef.current?.pointerId === event.pointerId) {
      cropDragRef.current = null;
    }
  }

  function handleCancelCrop() {
    cropDragRef.current = null;
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
      cropDragRef.current = null;
      setCropProcessing(false);
      await uploadPreparedFile(croppedFile);
    } catch (e) {
      console.error("[ImageUploadCrop]", e);
      setCropProcessing(false);
      setUploadError("Image could not be cropped. Please try another image.");
    }
  }

  function nudgePosition(deltaX: number, deltaY: number) {
    if (!cropState || cropProcessing) return;
    setCropState((current) => {
      if (!current) return current;
      return {
        ...current,
        x: clampPosition(current.x + deltaX),
        y: clampPosition(current.y + deltaY),
      };
    });
  }

  function resetCrop() {
    if (!cropState || cropProcessing) return;
    setCropState((current) =>
      current
        ? { ...current, x: DEFAULT_CROP_X, y: DEFAULT_CROP_Y, zoom: DEFAULT_CROP_ZOOM }
        : current
    );
  }

  function handleRemove() {
    setPreview(null);
    setUploadError(null);
    setImgError(false);
    onRemove?.();
    if (inputRef.current) inputRef.current.value = "";
  }

  const isBusy = uploading || resolving;
  const showImage = !isBusy && Boolean(displaySrc) && !imgError;
  const showErrorState = !isBusy && Boolean(preview) && imgError;

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
          {isBusy ? (
            <div className="flex flex-col items-center gap-1 py-3 sm:py-0">
              <Loader2 className="size-5 animate-spin text-slate-400" />
              {uploading && <span className="text-[10px] text-slate-400">{uploadingText}</span>}
            </div>
          ) : showImage ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={displaySrc ?? undefined}
                src={displaySrc ?? undefined}
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
                Couldn&apos;t preview
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
            <span>{!authReady ? "Preparing…" : showImage ? "Change" : "Upload"}</span>
          </button>
          {preview && onRemove && (
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
          {showErrorState && (
            <p className="text-[10px] text-slate-400 leading-relaxed">
              Image could not be previewed. Upload again or remove it.
            </p>
          )}
        </div>
      </div>

      {uploadError && (
        <p className="text-xs text-red-500">{uploadError}</p>
      )}

      {cropState && mounted && createPortal(
        <div
          data-testid="crop-overlay"
          className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/70 p-3 sm:items-center sm:p-6"
        >
          <button
            type="button"
            aria-label="Cancel image crop"
            className="absolute inset-0 cursor-default"
            onClick={handleCancelCrop}
          />
          <div
            data-testid="crop-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="image-crop-title"
            aria-describedby="image-crop-description"
            className="relative max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-3xl border border-slate-200 bg-[#fff] p-4 shadow-2xl dark:border-white/10 dark:bg-slate-950 sm:p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 id="image-crop-title" className="text-base font-bold text-slate-950 dark:text-white">
                  Crop image
                </h3>
                <p id="image-crop-description" className="mt-1 text-sm leading-5 text-slate-600 dark:text-slate-300">
                  Drag the image or use the direction buttons. Adjust zoom, then confirm to upload.
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
              <div
                data-testid="crop-preview-area"
                className={`relative mx-auto max-h-[48dvh] w-full touch-none overflow-hidden rounded-xl bg-slate-950 ${aspectClasses[aspectRatio]} ${
                  cropProcessing ? "cursor-wait" : "cursor-grab active:cursor-grabbing"
                }`}
                onPointerDown={handleCropPointerDown}
                onPointerMove={handleCropPointerMove}
                onPointerUp={handleCropPointerEnd}
                onPointerCancel={handleCropPointerEnd}
                onLostPointerCapture={(event) => handleCropPointerEnd(event)}
                aria-label="Drag image to reposition crop"
              >
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
                <div className="pointer-events-none absolute inset-0 bg-slate-950/20" />
                <div
                  className={`pointer-events-none absolute inset-4 border-2 border-white shadow-[0_0_0_999px_rgba(2,6,23,0.42)] ${
                    aspectRatio === "square" ? "rounded-full" : "rounded-2xl"
                  }`}
                  data-testid="crop-mask"
                />
                <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-white/40" />
              </div>
              <p className="mt-2 text-center text-xs font-semibold text-slate-500 dark:text-slate-400">
                Drag to position or use the buttons. Use zoom for a closer crop.
              </p>

              <p data-testid="crop-status" className="mt-1 text-center text-xs tabular-nums text-slate-500 dark:text-slate-400">
                X {cropState.x.toFixed(0)}% · Y {cropState.y.toFixed(0)}% · Zoom {cropState.zoom.toFixed(2)}×
              </p>
            </div>

            <div className="mt-4 space-y-3">
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Zoom
                <input
                  data-testid="crop-zoom"
                  type="range"
                  min="1"
                  max="3"
                  step="0.05"
                  value={cropState.zoom}
                  onChange={(e) => setCropState((current) => current ? { ...current, zoom: Number(e.target.value) } : current)}
                  className="mt-2 w-full accent-[var(--primary-accent-bg)]"
                />
              </label>
            </div>

            <div className="mt-4 space-y-3">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Position</p>
              {/**
               * CSS object-position moves the *alignment point*, which is the inverse of the
               * visible image movement. The pointer-drag handlers already subtract pointer deltas
               * (nextX = startX - pointerDeltaX), so the buttons below intentionally mirror that
               * inverse: moving the image right decreases X, moving the image left increases X,
               * moving the image down decreases Y, and moving the image up increases Y.
               */}
              <div className="grid grid-cols-3 gap-2">
                <div className="col-start-2">
                  <button
                    type="button"
                    onClick={() => nudgePosition(0, NUDGE_STEP)}
                    disabled={cropProcessing}
                    aria-label="Move image up"
                    className="flex min-h-11 w-full items-center justify-center gap-1 rounded-xl border border-slate-200 px-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-accent-bg)] focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/10 dark:focus-visible:ring-offset-slate-950"
                  >
                    <ArrowUp className="size-3.5" />
                    <span>Up</span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => nudgePosition(NUDGE_STEP, 0)}
                  disabled={cropProcessing}
                  aria-label="Move image left"
                  className="flex min-h-11 w-full items-center justify-center gap-1 rounded-xl border border-slate-200 px-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-accent-bg)] focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/10 dark:focus-visible:ring-offset-slate-950"
                >
                  <ArrowLeft className="size-3.5" />
                  <span>Left</span>
                </button>
                <button
                  type="button"
                  onClick={resetCrop}
                  disabled={cropProcessing}
                  aria-label="Reset crop"
                  className="flex min-h-11 w-full items-center justify-center gap-1 rounded-xl border border-slate-200 px-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-accent-bg)] focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/10 dark:focus-visible:ring-offset-slate-950"
                >
                  <RotateCcw className="size-3.5" />
                  <span>Reset</span>
                </button>
                <button
                  type="button"
                  onClick={() => nudgePosition(-NUDGE_STEP, 0)}
                  disabled={cropProcessing}
                  aria-label="Move image right"
                  className="flex min-h-11 w-full items-center justify-center gap-1 rounded-xl border border-slate-200 px-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-accent-bg)] focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/10 dark:focus-visible:ring-offset-slate-950"
                >
                  <ArrowRight className="size-3.5" />
                  <span>Right</span>
                </button>
                <div className="col-start-2">
                  <button
                    type="button"
                    onClick={() => nudgePosition(0, -NUDGE_STEP)}
                    disabled={cropProcessing}
                    aria-label="Move image down"
                    className="flex min-h-11 w-full items-center justify-center gap-1 rounded-xl border border-slate-200 px-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-accent-bg)] focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/10 dark:focus-visible:ring-offset-slate-950"
                  >
                    <ArrowDown className="size-3.5" />
                    <span>Down</span>
                  </button>
                </div>
              </div>
              <p className="text-center text-xs text-slate-500 dark:text-slate-400">
                Reset restores the centered position and 1× zoom.
              </p>
              <p className="sr-only" aria-live="polite">
                Position {cropState.x.toFixed(0)} percent horizontal, {cropState.y.toFixed(0)} percent vertical. Zoom {cropState.zoom.toFixed(2)} times.
              </p>
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
        </div>,
        document.body
      )}
    </div>
  );
}
