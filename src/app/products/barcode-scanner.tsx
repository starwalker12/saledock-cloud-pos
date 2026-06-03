"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { Camera, CameraOff } from "lucide-react";

type Props = {
  onDetected: (barcode: string) => void;
  disabled?: boolean;
};

type ScannerState =
  | { status: "idle" }
  | { status: "opening" }
  | { status: "scanning"; stream: MediaStream }
  | { status: "error"; message: string };

export function BarcodeScanner({ onDetected, disabled }: Props) {
  const [state, setState] = useState<ScannerState>({ status: "idle" });
  const videoRef = useRef<HTMLVideoElement>(null);
  const rafRef = useRef<number>(0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const detectorRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const readerRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const onDetectedRef = useRef(onDetected);

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  const hasNative = typeof window !== "undefined" && "BarcodeDetector" in window;

  const stopDetection = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    if (readerRef.current) {
      try { readerRef.current.reset(); } catch { /* noop */ }
      readerRef.current = null;
    }
    detectorRef.current = null;
  }, []);

  const stopCamera = useCallback(() => {
    stopDetection();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setState({ status: "idle" });
  }, [stopDetection]);

  useEffect(() => {
    return () => {
      stopDetection();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [stopDetection]);

  // ── Effect: when scanning, attach stream to video and start detection ──
  useEffect(() => {
    if (state.status !== "scanning") return;

    const video = videoRef.current;
    if (!video) return;

    video.srcObject = state.stream;
    streamRef.current = state.stream;
    video.play().catch(() => {});

    const start = () => {
      if (hasNative) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const BarcodeDetectorCtor = (window as any).BarcodeDetector;
        detectorRef.current = new BarcodeDetectorCtor({
          formats: [
            "qr_code", "ean_13", "ean_8", "upc_a", "upc_e",
            "code_128", "code_39", "code_93", "codabar",
            "itf", "data_matrix", "pdf417", "aztec",
          ],
        });

        const detect = async () => {
          if (!videoRef.current || !detectorRef.current) return;
          try {
            const codes = await detectorRef.current.detect(videoRef.current);
            if (codes.length > 0 && codes[0].rawValue) {
              onDetectedRef.current(codes[0].rawValue);
              stopCamera();
              return;
            }
          } catch {
            // continue
          }
          rafRef.current = requestAnimationFrame(detect);
        };
        rafRef.current = requestAnimationFrame(detect);
      } else {
        (async () => {
          const { BrowserMultiFormatReader } = await import("@zxing/browser");
          if (!videoRef.current) return;
          const reader = new BrowserMultiFormatReader();
          readerRef.current = reader;
          reader.decodeFromVideoElement(videoRef.current, (result) => {
            if (result) {
              onDetectedRef.current(result.getText());
              stopCamera();
            }
          });
        })();
      }
    };

    if (video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
      start();
    } else {
      video.addEventListener("loadeddata", start, { once: true });
    }

    return () => {
      video.removeEventListener("loadeddata", start);
      stopDetection();
    };
    // state.stream is set atomically with state.status (both in the same setState call),
    // so the effect correctly re-runs whenever we enter scanning with a new stream.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status, stopCamera, stopDetection, hasNative]);

  const startCamera = useCallback(async () => {
    if (typeof window === "undefined") return;
    setState({ status: "opening" });

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 } },
        });
      }

      setState({ status: "scanning", stream });
    } catch (err) {
      const msg =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Camera permission denied."
          : "Could not open camera.";
      setState({ status: "error", message: msg });
    }
  }, []);

  // ── Render ──
  if (state.status === "scanning") {
    return (
      <div className="relative mt-2 overflow-hidden rounded-lg border border-slate-200 bg-black sm:col-span-2">
        <video ref={videoRef} autoPlay playsInline muted className="h-48 w-full object-cover" />
        <button
          type="button"
          onClick={stopCamera}
          className="absolute top-2 right-2 rounded-lg bg-slate-900/70 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-slate-900"
        >
          <CameraOff className="mr-1 inline size-4" />
          Stop
        </button>
        <p className="absolute bottom-2 left-2 rounded bg-slate-900/60 px-2 py-1 text-xs text-white">
          Point camera at a barcode
        </p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <p className="text-xs text-red-600 sm:col-span-2">{state.message}</p>
    );
  }

  return (
    <button
      type="button"
      onClick={startCamera}
      disabled={disabled || state.status === "opening"}
      className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
    >
      {state.status === "opening" ? (
        "Opening camera…"
      ) : (
        <>
          <Camera className="mr-1 inline size-4" />
          Scan with camera
        </>
      )}
    </button>
  );
}
