"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { MessageCircle, Printer, X, Loader2, Image as ImageIcon, Copy, Check, ExternalLink } from "lucide-react";
import { useTheme } from "next-themes";

type PrintItem = {
  product_name: string;
  product_type: string;
  quantity: number;
  unit_price: number;
  item_discount: number;
  line_total: number;
  service_provider?: string | null;
  service_direction?: string | null;
  service_total_charged?: number;
};

type PrintPayment = {
  method: string;
  amount: number;
  reference_no?: string | null;
};

type PrintInvoice = {
  invoice_no: string;
  invoice_date: string;
  status: string;
  subtotal: number;
  discount_total: number;
  grand_total: number;
  amount_paid: number;
  change_due: number;
  balance_due: number;
  note?: string | null;
  customer?: {
    name: string;
    phone?: string | null;
  } | null;
  items: PrintItem[];
  payments: PrintPayment[];
};

type PrintButtonProps = {
  invoiceNo: string;
  customerPhone?: string | null;
  invoice?: PrintInvoice | null;
  shopName?: string;
};

type PrintAttempt = {
  id: number;
  cancelled: boolean;
  oldTitle: string;
  printMediaEntered: boolean;
  windowBlurred: boolean;
  focusCleanupId: number | null;
};

const CSS_PX_TO_MM = 25.4 / 96;
const THERMAL_PAGE_WIDTH_MM = 80;
const THERMAL_CONTENT_WIDTH_MM = 72;
const THERMAL_TOTAL_MARGIN_MM = 8;
const THERMAL_HEIGHT_ALLOWANCE_MM = 1;
const THERMAL_PAGE_STYLE_ID = "invoice-thermal-page-size";
const READINESS_TIMEOUT_MS = 5000;
const FOCUS_CLEANUP_DELAY_MS = 250;
const MIN_THERMAL_PAGE_HEIGHT_MM = 20;
const MAX_THERMAL_PAGE_HEIGHT_MM = 5000;
const THERMAL_ERROR_MESSAGE = "Unable to prepare the thermal invoice. Please try again.";

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
        reject(new Error("invoice image failed"));
      };
      image.addEventListener("load", onLoad, { once: true });
      image.addEventListener("error", onError, { once: true });
    });
  }

  if (typeof image.decode === "function") {
    try {
      await image.decode();
    } catch {
      if (!image.complete) throw new Error("invoice image decode failed");
    }
  }
}

async function waitForReceiptReadiness(receipt: HTMLElement): Promise<void> {
  const fontsReady = document.fonts?.ready.then(() => undefined) ?? Promise.resolve();
  const imagesReady = Promise.all(
    Array.from(receipt.querySelectorAll("img"), (image) => waitForImage(image)),
  ).then(() => undefined);
  await withTimeout(
    Promise.all([fontsReady, imagesReady]).then(() => undefined),
    READINESS_TIMEOUT_MS,
  );
}

function getWhatsAppPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const cleaned = phone.replace(/[^0-9+]/g, "");
  if (cleaned.length < 10) return "";

  if (cleaned.startsWith("+")) {
    return cleaned.replace("+", "");
  }

  if (cleaned.length === 11 && cleaned.startsWith("03")) {
    return "92" + cleaned.slice(1);
  }

  if (cleaned.length >= 10) {
    return cleaned;
  }

  return "";
}

function buildTextMessage(invoice: PrintInvoice | null | undefined, shopName: string): string {
  if (!invoice) return "";

  const lines: string[] = [];

  lines.push(shopName || "SaleDock Shop");
  lines.push(`Invoice: ${invoice.invoice_no}`);

  let formattedDate = invoice.invoice_date;
  try {
    formattedDate = new Date(invoice.invoice_date).toLocaleDateString("en-PK", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {}
  lines.push(`Date: ${formattedDate}`);
  lines.push(`Status: ${String(invoice.status || "").toUpperCase()}`);
  lines.push("");

  lines.push("Bill to:");
  lines.push(invoice.customer?.name || "Walk-in Customer");
  lines.push("");

  lines.push("Items:");
  invoice.items.forEach((item, idx) => {
    lines.push(`${idx + 1}. ${item.product_name}`);

    const isService = item.product_type === "service";
    const qty = item.quantity;
    const price = item.unit_price;
    const total = item.line_total;

    let qtyLine = `   Qty: ${qty} x PKR ${price} = PKR ${total}`;
    if (item.item_discount > 0) {
      qtyLine += `\n   Discount: PKR ${item.item_discount}`;
    }

    if (isService && item.service_provider) {
      qtyLine += `\n   Provider: ${item.service_provider}`;
    }

    lines.push(qtyLine);
  });
  lines.push("");

  lines.push("Summary:");
  lines.push(`Subtotal: PKR ${invoice.subtotal}`);
  lines.push(`Discount: PKR ${invoice.discount_total}`);
  lines.push(`Total: PKR ${invoice.grand_total}`);
  lines.push(`Paid: PKR ${invoice.amount_paid}`);
  lines.push(`Balance Due: PKR ${invoice.balance_due}`);
  lines.push("");

  if (invoice.payments && invoice.payments.length > 0) {
    lines.push("Payment:");
    invoice.payments.forEach((pmt) => {
      let payLine = `Cash`;
      if (pmt.method === "card") payLine = "Card";
      else if (pmt.method === "bank_transfer") payLine = "Bank Transfer";
      else if (pmt.method === "cheque") payLine = "Cheque";
      else if (pmt.method === "other") payLine = "Other";
      else if (pmt.method) {
        payLine = pmt.method.charAt(0).toUpperCase() + pmt.method.slice(1);
      }
      lines.push(`${payLine}: PKR ${pmt.amount}`);
    });
    lines.push("");
  }

  if (invoice.note) {
    lines.push(`Note: ${invoice.note}`);
    lines.push("");
  }

  lines.push(`Thank you for shopping with ${shopName || "us"}.`);

  return lines.join("\n");
}

export function PrintButton({ invoiceNo, customerPhone, invoice, shopName }: PrintButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [imgBlob, setImgBlob] = useState<Blob | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [thermalError, setThermalError] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const attemptSequenceRef = useRef(0);
  const activeAttemptRef = useRef<PrintAttempt | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const { resolvedTheme } = useTheme();

  const isAttemptActive = useCallback(
    (attempt: PrintAttempt) =>
      mountedRef.current && !attempt.cancelled && activeAttemptRef.current === attempt,
    [],
  );

  const beginPrint = useCallback(
    (activeInvoiceNo: string) => {
      if (inFlightRef.current) return null;
      inFlightRef.current = true;
      if (mountedRef.current) setIsPrinting(true);

      const mediaQuery = window.matchMedia("print");
      const attempt: PrintAttempt = {
        id: ++attemptSequenceRef.current,
        cancelled: false,
        oldTitle: document.title,
        printMediaEntered: mediaQuery.matches,
        windowBlurred: false,
        focusCleanupId: null,
      };
      activeAttemptRef.current = attempt;

      document.getElementById(THERMAL_PAGE_STYLE_ID)?.remove();
      document
        .querySelectorAll<HTMLElement>('[data-invoice-thermal-measuring="true"]')
        .forEach((element) => delete element.dataset.invoiceThermalMeasuring);
      delete document.body.dataset.printMode;
      delete document.body.dataset.invoiceThermalPrint;
      document.title = `SaleDock-Invoice-${activeInvoiceNo}`;

      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        attempt.cancelled = true;
        if (attempt.focusCleanupId !== null) {
          window.clearTimeout(attempt.focusCleanupId);
          attempt.focusCleanupId = null;
        }
        const ownsActiveState = activeAttemptRef.current === attempt;
        if (ownsActiveState) {
          activeAttemptRef.current = null;
          document
            .querySelectorAll<HTMLElement>('[data-invoice-thermal-measuring="true"]')
            .forEach((element) => delete element.dataset.invoiceThermalMeasuring);
          document.getElementById(THERMAL_PAGE_STYLE_ID)?.remove();
          delete document.body.dataset.printMode;
          delete document.body.dataset.invoiceThermalPrint;
          document.title = attempt.oldTitle;
          inFlightRef.current = false;
          if (mountedRef.current) setIsPrinting(false);
        }
        window.removeEventListener("beforeprint", onBeforePrint);
        window.removeEventListener("afterprint", cleanup);
        window.removeEventListener("blur", onWindowBlur);
        window.removeEventListener("focus", onWindowFocus);
        mediaQuery.removeEventListener("change", onPrintMediaChange);
        if (cleanupRef.current === cleanup) cleanupRef.current = null;
      };
      const onBeforePrint = () => {
        if (isAttemptActive(attempt)) attempt.printMediaEntered = true;
      };
      const onPrintMediaChange = (event: MediaQueryListEvent) => {
        if (!isAttemptActive(attempt)) return;
        if (event.matches) attempt.printMediaEntered = true;
        else if (attempt.printMediaEntered) cleanup();
      };
      const onWindowBlur = () => {
        if (isAttemptActive(attempt)) attempt.windowBlurred = true;
      };
      const onWindowFocus = () => {
        if (!isAttemptActive(attempt) || !attempt.windowBlurred || mediaQuery.matches) return;
        if (attempt.focusCleanupId !== null) window.clearTimeout(attempt.focusCleanupId);
        attempt.focusCleanupId = window.setTimeout(() => {
          attempt.focusCleanupId = null;
          if (isAttemptActive(attempt) && !mediaQuery.matches) cleanup();
        }, FOCUS_CLEANUP_DELAY_MS);
      };

      cleanupRef.current = cleanup;
      window.addEventListener("beforeprint", onBeforePrint);
      window.addEventListener("afterprint", cleanup);
      window.addEventListener("blur", onWindowBlur);
      window.addEventListener("focus", onWindowFocus);
      mediaQuery.addEventListener("change", onPrintMediaChange);
      return { attempt, cleanup };
    },
    [isAttemptActive],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (activeAttemptRef.current) activeAttemptRef.current.cancelled = true;
      cleanupRef.current?.();
    };
  }, []);

  const printA4 = useCallback(() => {
    setThermalError(null);
    const print = beginPrint(invoiceNo);
    if (!print) return;
    document.body.dataset.printMode = "a4";
    try {
      window.print();
    } catch {
      print.cleanup();
    }
  }, [beginPrint, invoiceNo]);

  const printThermal = useCallback(async () => {
    setThermalError(null);
    const print = beginPrint(invoiceNo);
    if (!print) return;
    const { attempt, cleanup } = print;

    try {
      const receipt = document.querySelector<HTMLElement>(".thermal-print");
      if (!receipt) throw new Error("missing thermal invoice");

      receipt.dataset.invoiceThermalMeasuring = "true";
      await waitForReceiptReadiness(receipt);
      if (!isAttemptActive(attempt)) return;
      await nextAnimationFrame();
      if (!isAttemptActive(attempt)) return;
      await nextAnimationFrame();
      if (!isAttemptActive(attempt)) return;

      const receiptBounds = receipt.getBoundingClientRect();
      const measuredWidthMm = receiptBounds.width * CSS_PX_TO_MM;
      if (Math.abs(measuredWidthMm - THERMAL_CONTENT_WIDTH_MM) > 0.5) {
        throw new Error("invalid thermal invoice width");
      }
      const pageHeightMm =
        Math.ceil(
          (receiptBounds.height * CSS_PX_TO_MM +
            THERMAL_TOTAL_MARGIN_MM +
            THERMAL_HEIGHT_ALLOWANCE_MM) *
            10,
        ) / 10;
      if (
        !Number.isFinite(pageHeightMm) ||
        pageHeightMm < MIN_THERMAL_PAGE_HEIGHT_MM ||
        pageHeightMm > MAX_THERMAL_PAGE_HEIGHT_MM
      ) {
        throw new Error("invalid thermal invoice height");
      }

      delete receipt.dataset.invoiceThermalMeasuring;
      if (!isAttemptActive(attempt)) return;
      const style = document.createElement("style");
      style.id = THERMAL_PAGE_STYLE_ID;
      style.textContent = `@page invoiceThermalReceipt { size: ${THERMAL_PAGE_WIDTH_MM}mm ${pageHeightMm.toFixed(1)}mm; margin: 4mm; }`;
      if (!isAttemptActive(attempt)) return;
      document.head.append(style);
      if (!isAttemptActive(attempt)) return;
      document.body.dataset.printMode = "thermal";
      document.body.dataset.invoiceThermalPrint = "true";
      await nextAnimationFrame();
      if (!isAttemptActive(attempt)) return;

      window.print();
    } catch {
      if (!isAttemptActive(attempt)) return;
      cleanup();
      if (mountedRef.current) setThermalError(THERMAL_ERROR_MESSAGE);
    }
  }, [beginPrint, invoiceNo, isAttemptActive]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", handleEscape);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const message = buildTextMessage(invoice, shopName || "SaleDock Shop");
  const phone = getWhatsAppPhone(customerPhone);
  const whatsappUrl = phone
    ? `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`
    : `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;

  const handleShare = async () => {
    // Attempt to open WhatsApp directly
    try {
      window.open(whatsappUrl, "_blank");
    } catch (err) {
      console.error("Popup blocked or failed to open WhatsApp:", err);
    }

    setIsOpen(true);

    // Capture image in the background so it is ready if user decides to download it
    if (!imgBlob) {
      setIsLoading(true);
      try {
        const node = document.getElementById("invoice-print");
        if (node) {
          const { toBlob } = await import("html-to-image");
          const isDark = resolvedTheme === "dark";
          const blob = await toBlob(node, {
            cacheBust: true,
            backgroundColor: isDark ? "#0f172a" : "#ffffff",
            style: {
              borderRadius: "0",
              boxShadow: "none",
            },
          });
          if (blob) setImgBlob(blob);
        }
      } catch (err) {
        console.error("Background image capture failed:", err);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy message:", err);
    }
  };

  const downloadImage = useCallback(() => {
    if (!imgBlob) return;
    const url = URL.createObjectURL(imgBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `SaleDock-Invoice-${invoiceNo}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [imgBlob, invoiceNo]);

  return (
    <>
      <div className="flex flex-wrap gap-2 print:hidden">
        <button
          type="button"
          onClick={printA4}
          disabled={isPrinting}
          className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white hover:bg-blue-800 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Printer className="size-4" />
          Print A4 / Save PDF
        </button>
        <button
          type="button"
          onClick={printThermal}
          disabled={isPrinting}
          className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Printer className="size-4" />
          Print 80mm
        </button>
        {thermalError ? (
          <p role="alert" className="basis-full text-sm font-medium text-red-700">
            {thermalError}
          </p>
        ) : null}
        <button
          type="button"
          onClick={handleShare}
          className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 cursor-pointer"
        >
          <MessageCircle className="size-4" />
          Share WhatsApp
        </button>
      </div>

      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          />

          {/* Modal content */}
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-[#fff] p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 z-10">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
            >
              <X className="size-5" />
            </button>

            <div className="flex flex-col items-center text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
                <MessageCircle className="size-6" />
              </div>
              <h3 className="mt-4 text-lg font-black text-slate-900 dark:text-white">
                Share Invoice
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                We have attempted to open WhatsApp with the text invoice. If it did not open, you can click the button below or copy the message.
              </p>
            </div>

            <div className="mt-4 w-full">
              <textarea
                readOnly
                value={message}
                className="w-full h-40 p-3 text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg resize-none focus:outline-none"
              />
            </div>

            <div className="mt-6 flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex h-11 items-center justify-center gap-2 rounded-lg bg-blue-700 font-bold text-white hover:bg-blue-800 cursor-pointer"
                >
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                  {copied ? "Copied!" : "Copy Text"}
                </button>

                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-11 items-center justify-center gap-2 rounded-lg bg-emerald-600 font-bold text-white hover:bg-emerald-700 cursor-pointer"
                >
                  <ExternalLink className="size-4" />
                  Open WhatsApp
                </a>
              </div>

              {imgBlob ? (
                <button
                  type="button"
                  onClick={downloadImage}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <ImageIcon className="size-4" />
                  Download Image
                </button>
              ) : isLoading ? (
                <div className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-slate-100 text-xs font-bold text-slate-400 dark:border-slate-800">
                  <Loader2 className="size-4 animate-spin" />
                  Preparing Image Download...
                </div>
              ) : null}

              <button
                type="button"
                aria-label="Print or save invoice as PDF"
                onClick={() => {
                  printA4();
                  setIsOpen(false);
                }}
                disabled={isPrinting}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Printer className="size-4" />
                Print / Save as PDF
              </button>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex h-11 w-full items-center justify-center rounded-lg border border-slate-200 font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer bg-slate-50 dark:bg-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
