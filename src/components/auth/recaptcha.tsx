"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useTheme } from "next-themes";

interface GrecaptchaWidget {
  render: (container: HTMLElement, params: Record<string, unknown>) => number;
  reset: (widgetId: number) => void;
}

interface GrecaptchaWindow {
  grecaptcha: GrecaptchaWidget;
}

export type RecaptchaStatus = "unconfigured" | "loading" | "ready" | "failed" | "verified";

interface RecaptchaProps {
  onChange: (token: string | null) => void;
  onStatus?: (status: RecaptchaStatus) => void;
  resetRef?: { current: (() => void) | null };
}

function getGrecaptcha(): GrecaptchaWidget | null {
  if (typeof window === "undefined") return null;
  const g = (window as unknown as GrecaptchaWindow).grecaptcha;
  return g && typeof g.render === "function" ? g : null;
}

export function Recaptcha({ onChange, onStatus, resetRef }: RecaptchaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<number | null>(null);
  const renderStartedRef = useRef(false);
  const [status, setStatus] = useState<RecaptchaStatus>(() => {
    const key = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY : undefined;
    return key ? "loading" : "unconfigured";
  });
  const siteKey =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY
      : undefined;
  const { resolvedTheme } = useTheme();

  const reportStatus = useCallback((s: RecaptchaStatus) => {
    setStatus(s);
    onStatus?.(s);
  }, [onStatus]);

  const reset = useCallback(() => {
    const g = getGrecaptcha();
    if (widgetIdRef.current !== null && g) {
      g.reset(widgetIdRef.current);
      onChange(null);
    }
  }, [onChange]);

  useEffect(() => {
    if (resetRef) {
      resetRef.current = reset;
    }
    return () => {
      if (resetRef) {
        resetRef.current = null;
      }
    };
  }, [reset, resetRef]);

  useEffect(() => {
    if (!siteKey || !containerRef.current || renderStartedRef.current) return;

    const theme = resolvedTheme === "dark" ? "dark" : "light";

    function renderWidget() {
      const g = getGrecaptcha();
      if (!containerRef.current || renderStartedRef.current || !g) return;
      renderStartedRef.current = true;
      try {
        const widgetId = g.render(containerRef.current, {
          sitekey: siteKey,
          theme,
          callback: (token: string) => {
            reportStatus("verified");
            onChange(token);
          },
          "expired-callback": () => {
            reportStatus("ready");
            onChange(null);
          },
          "error-callback": () => {
            reportStatus("failed");
            onChange(null);
          },
        });
        widgetIdRef.current = widgetId;
        requestAnimationFrame(() => { reportStatus("ready"); });
      } catch {
        requestAnimationFrame(() => { reportStatus("failed"); });
      }
    }

    if (getGrecaptcha()) {
      renderWidget();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://www.google.com/recaptcha/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.onload = renderWidget;
    script.onerror = () => {
      reportStatus("failed");
    };
    document.head.appendChild(script);
  }, [siteKey, reportStatus, onChange, resolvedTheme]);

  if (!siteKey) return null;

  return (
    <div className="relative flex items-center justify-center">
      <div ref={containerRef} />
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-16 w-[200px] animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
        </div>
      )}
      {status === "failed" && null}
    </div>
  );
}
