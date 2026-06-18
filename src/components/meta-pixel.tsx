"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

/**
 * Meta (Facebook) Pixel — DORMANT, double-gated, PageView only.
 *
 * This helper is intentionally inert in production today. It loads the pixel
 * ONLY when BOTH of these are true:
 *   1. `NEXT_PUBLIC_META_PIXEL_ID` is configured (owner sets it in Vercel), and
 *   2. The visitor has granted *marketing/advertising* consent.
 *
 * The current cookie banner only collects a single "analytics" consent (for
 * Google Analytics and Microsoft Clarity). It does NOT yet offer a separate
 * marketing/ads consent category, which an advertising pixel legally requires.
 * Until a follow-up PR adds that category to the banner + Privacy Policy, the
 * marketing-consent value below is never set, so this component renders null
 * and the pixel never fires. This is deliberate — do not gate Meta Pixel on the
 * analytics toggle.
 *
 * It only ever sends a standard PageView. It never receives invoice, customer,
 * stock, payment, report, or any shop/business data, and it is only mounted on
 * public marketing pages (never on logged-in POS/app pages).
 *
 * To enable later (separate, review-first PR):
 *   - Add a "marketing/advertising" consent category to the cookie banner and
 *     persist it as `marketingConsent: "accepted"` in the preferences store.
 *   - Set `NEXT_PUBLIC_META_PIXEL_ID` in Vercel (do not hard-code it).
 *   - Add the Meta domains to the CSP in src/proxy.ts:
 *       script-src  https://connect.facebook.net
 *       img-src     https://www.facebook.com
 *       connect-src https://www.facebook.com
 *     (CSP is currently report-only; keep it report-only.)
 */

const PREFERENCES_STORAGE_KEY = "saledock-sidebar-preferences-v1";
const CONSENT_CHANGED_EVENT = "saledock:cookie-consent-changed";
const PREFERENCES_CHANGED_EVENT = "saledock-sidebar-preferences-changed";

function readMarketingConsent(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { marketingConsent?: unknown };
    return parsed?.marketingConsent === "accepted";
  } catch {
    return false;
  }
}

function subscribeConsent(callback: () => void) {
  window.addEventListener(CONSENT_CHANGED_EVENT, callback);
  window.addEventListener(PREFERENCES_CHANGED_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(CONSENT_CHANGED_EVENT, callback);
    window.removeEventListener(PREFERENCES_CHANGED_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

type MetaPixelProps = {
  /** CSP nonce, required once the pixel is actually enabled. */
  nonce?: string;
};

export default function MetaPixel({ nonce }: MetaPixelProps) {
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const pathname = usePathname();
  // Subscribe to marketing-consent changes without setState-in-effect.
  const marketingConsent = useSyncExternalStore(
    subscribeConsent,
    readMarketingConsent,
    () => false,
  );

  const enabled = Boolean(pixelId) && marketingConsent;

  // Fire a PageView on SPA navigation once the pixel is active.
  useEffect(() => {
    if (!enabled) return;
    const fbq = (window as unknown as { fbq?: (...args: unknown[]) => void }).fbq;
    if (typeof fbq === "function") {
      fbq("track", "PageView");
    }
  }, [enabled, pathname]);

  if (!enabled) return null;

  return (
    <Script
      id="meta-pixel-base"
      strategy="afterInteractive"
      nonce={nonce}
      data-pixel-id={pixelId}
      dangerouslySetInnerHTML={{
        __html: `
          !function(f,b,e,v,n,t,s)
          {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};
          if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
          n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t,s)}(window, document,'script',
          'https://connect.facebook.net/en_US/fbevents.js');
          var pixelId = document.getElementById('meta-pixel-base').getAttribute('data-pixel-id');
          fbq('init', pixelId);
          fbq('track', 'PageView');
        `,
      }}
    />
  );
}
