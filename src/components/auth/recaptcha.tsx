"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface RecaptchaProps {
  onChange: (token: string | null) => void;
  resetRef?: React.MutableRefObject<(() => void) | null>;
}

export function Recaptcha({ onChange, resetRef }: RecaptchaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<number | null>(null);
  const scriptLoadedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const siteKey =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY
      : undefined;

  const reset = useCallback(() => {
    if (widgetIdRef.current !== null && window.grecaptcha) {
      window.grecaptcha.reset(widgetIdRef.current);
      onChange(null);
    }
  }, [onChange]);

  // Expose reset to parent ref outside of render
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

  // Load reCAPTCHA script
  useEffect(() => {
    if (!siteKey) return;

    if (window.grecaptcha) {
      scriptLoadedRef.current = true;
      return;
    }

    const onLoad = () => {
      scriptLoadedRef.current = true;
    };

    const script = document.createElement("script");
    script.src = "https://www.google.com/recaptcha/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.onload = onLoad;
    document.head.appendChild(script);

    return () => {
      if (widgetIdRef.current !== null && window.grecaptcha) {
        try {
          window.grecaptcha.reset(widgetIdRef.current);
        } catch {
          // widget may have been destroyed
        }
      }
    };
  }, [siteKey]);

  // Render widget once script is loaded
  useEffect(() => {
    if (!scriptLoadedRef.current || !containerRef.current || !siteKey) return;
    if (!window.grecaptcha) return;
    if (widgetIdRef.current !== null) return;

    try {
      const widgetId = window.grecaptcha.render(containerRef.current, {
        sitekey: siteKey,
        callback: (token: string) => {
          setError(null);
          onChange(token);
        },
        "expired-callback": () => {
          onChange(null);
        },
        "error-callback": () => {
          onChange(null);
        },
      });
      widgetIdRef.current = widgetId;
    } catch {
      // grecaptcha.render can throw if container is invalid
    }
  }, [siteKey, onChange]);

  if (!siteKey) {
    if (process.env.NODE_ENV === "development") {
      return (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-center text-xs text-amber-700">
          reCAPTCHA not configured — set NEXT_PUBLIC_RECAPTCHA_SITE_KEY
        </div>
      );
    }
    return null;
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <div ref={containerRef} />
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
