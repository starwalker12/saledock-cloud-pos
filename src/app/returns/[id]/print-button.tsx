"use client";

import { MessageCircle, Printer } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type PrintButtonProps = {
  whatsappHref: string;
};

const CSS_PX_TO_MM = 25.4 / 96;
const THERMAL_PAGE_WIDTH_MM = 80;
const THERMAL_CONTENT_WIDTH_MM = 72;
const THERMAL_TOTAL_MARGIN_MM = 8;
const THERMAL_HEIGHT_ALLOWANCE_MM = 1;
const THERMAL_PAGE_STYLE_ID = "returns-thermal-page-size";
const PRINT_CLEANUP_DELAY_MS = 1200;
const READINESS_TIMEOUT_MS = 5000;
const MIN_THERMAL_PAGE_HEIGHT_MM = 20;
const MAX_THERMAL_PAGE_HEIGHT_MM = 5000;
const THERMAL_ERROR_MESSAGE = "Unable to prepare the thermal receipt. Please try again.";

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function withTimeout(promise: Promise<void>, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("readiness timeout")), timeoutMs);
    promise.then(resolve, reject).finally(() => window.clearTimeout(timeout));
  });
}

async function waitForImage(image: HTMLImageElement): Promise<void> {
  if (!image.complete) {
    await new Promise<void>((resolve, reject) => {
      const onLoad = () => {
        image.removeEventListener("error", onError);
        resolve();
      };
      const onError = () => {
        image.removeEventListener("load", onLoad);
        reject(new Error("receipt image failed"));
      };
      image.addEventListener("load", onLoad, { once: true });
      image.addEventListener("error", onError, { once: true });
    });
  }

  if (typeof image.decode === "function") {
    try {
      await image.decode();
    } catch {
      if (!image.complete) throw new Error("receipt image decode failed");
    }
  }
}

async function waitForReceiptReadiness(receipt: HTMLElement): Promise<void> {
  const fontsReady = document.fonts?.ready.then(() => undefined) ?? Promise.resolve();
  const imagesReady = Promise.all(
    Array.from(receipt.querySelectorAll("img"), (image) => waitForImage(image)),
  ).then(() => undefined);
  await withTimeout(Promise.all([fontsReady, imagesReady]).then(() => undefined), READINESS_TIMEOUT_MS);
}

export function PrintButton({ whatsappHref }: PrintButtonProps) {
  const inFlightRef = useRef(false);
  const cleanupRef = useRef<(() => void) | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const [thermalError, setThermalError] = useState<string | null>(null);

  const createCleanup = useCallback(() => {
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      document
        .querySelectorAll<HTMLElement>('[data-returns-thermal-measuring="true"]')
        .forEach((element) => delete element.dataset.returnsThermalMeasuring);
      document.getElementById(THERMAL_PAGE_STYLE_ID)?.remove();
      delete document.body.dataset.printMode;
      delete document.body.dataset.returnsThermalPrint;
      window.removeEventListener("afterprint", cleanup);
      inFlightRef.current = false;
      if (cleanupRef.current === cleanup) cleanupRef.current = null;
    };
    cleanupRef.current = cleanup;
    window.addEventListener("afterprint", cleanup);
    return cleanup;
  }, []);

  useEffect(() => () => cleanupRef.current?.(), []);

  const beginPrint = useCallback(() => {
    if (inFlightRef.current) return null;
    inFlightRef.current = true;
    document.getElementById(THERMAL_PAGE_STYLE_ID)?.remove();
    document
      .querySelectorAll<HTMLElement>('[data-returns-thermal-measuring="true"]')
      .forEach((element) => delete element.dataset.returnsThermalMeasuring);
    delete document.body.dataset.printMode;
    delete document.body.dataset.returnsThermalPrint;
    return createCleanup();
  }, [createCleanup]);

  const printA4 = useCallback(() => {
    const cleanup = beginPrint();
    if (!cleanup) return;
    document.body.dataset.printMode = "a4";
    try {
      window.print();
      if (inFlightRef.current) {
        timeoutRef.current = window.setTimeout(cleanup, PRINT_CLEANUP_DELAY_MS);
      }
    } catch {
      cleanup();
    }
  }, [beginPrint]);

  const printThermal = useCallback(async () => {
    setThermalError(null);
    const cleanup = beginPrint();
    if (!cleanup) return;

    try {
      const receipt = document.querySelector<HTMLElement>(".thermal-print");
      if (!receipt) throw new Error("missing thermal receipt");

      receipt.dataset.returnsThermalMeasuring = "true";
      await waitForReceiptReadiness(receipt);
      await nextAnimationFrame();
      await nextAnimationFrame();

      const receiptBounds = receipt.getBoundingClientRect();
      const measuredWidthMm = receiptBounds.width * CSS_PX_TO_MM;
      if (Math.abs(measuredWidthMm - THERMAL_CONTENT_WIDTH_MM) > 0.5) {
        throw new Error("invalid thermal receipt width");
      }
      const contentHeightPx = receiptBounds.height;
      const contentHeightMm = contentHeightPx * CSS_PX_TO_MM;
      const pageHeightMm =
        Math.ceil(
          (contentHeightMm + THERMAL_TOTAL_MARGIN_MM + THERMAL_HEIGHT_ALLOWANCE_MM) * 10,
        ) / 10;
      if (
        !Number.isFinite(pageHeightMm) ||
        pageHeightMm < MIN_THERMAL_PAGE_HEIGHT_MM ||
        pageHeightMm > MAX_THERMAL_PAGE_HEIGHT_MM
      ) {
        throw new Error("invalid thermal receipt height");
      }

      delete receipt.dataset.returnsThermalMeasuring;
      const style = document.createElement("style");
      style.id = THERMAL_PAGE_STYLE_ID;
      style.textContent = `@page returnsThermalReceipt { size: ${THERMAL_PAGE_WIDTH_MM}mm ${pageHeightMm.toFixed(1)}mm; margin: 4mm; }`;
      document.head.append(style);
      document.body.dataset.printMode = "thermal";
      document.body.dataset.returnsThermalPrint = "true";
      await nextAnimationFrame();

      window.print();
      if (inFlightRef.current) {
        timeoutRef.current = window.setTimeout(cleanup, PRINT_CLEANUP_DELAY_MS);
      }
    } catch {
      cleanup();
      setThermalError(THERMAL_ERROR_MESSAGE);
    }
  }, [beginPrint]);

  return (
    <div className="print:hidden">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={printA4}
          className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white hover:bg-blue-800 shadow-sm"
        >
          <Printer className="size-4" />
          Print A4
        </button>
        <button
          type="button"
          onClick={printThermal}
          className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50 shadow-sm"
        >
          <Printer className="size-4" />
          Print 80mm
        </button>
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 shadow-sm"
        >
          <MessageCircle className="size-4" />
          Share WhatsApp
        </a>
      </div>
      {thermalError ? (
        <p role="alert" className="mt-2 text-sm font-medium text-red-700">
          {thermalError}
        </p>
      ) : null}
    </div>
  );
}
