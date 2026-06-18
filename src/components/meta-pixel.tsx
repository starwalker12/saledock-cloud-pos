"use client";

import Script from "next/script";
import { useSyncExternalStore } from "react";

/**
 * Meta (Facebook) Pixel — off by default, double-gated, PageView only.
 *
 * It loads ONLY when ALL of these are true:
 *   1. `NEXT_PUBLIC_META_PIXEL_ID` is configured (owner sets it in Vercel), and
 *   2. The visitor has granted *marketing / advertising* consent, and
 *   3. It is rendered on the public landing/marketing page (it is mounted only
 *      there — never on signed-in app or point-of-sale pages).
 *
 * The cookie banner now offers a dedicated "Marketing / Advertising" consent
 * category, separate from the "Analytics" category (Google Analytics + Microsoft
 * Clarity). This component reads that marketing decision from the shared
 * preferences store (`marketingConsent: "accepted"`). It is deliberately NOT
 * gated on the analytics toggle. With no Pixel ID configured, or without
 * marketing consent, it renders null and nothing loads.
 *
 * It only ever sends a single standard PageView (fired once by the base script
 * on load). It never receives invoice, customer, stock, payment, report, or any
 * shop/business data. There is no server-side Conversions API.
 *
 * To enable: set `NEXT_PUBLIC_META_PIXEL_ID` in Vercel (do not hard-code it) and
 * add the Meta domains to the CSP in src/proxy.ts (script-src
 * connect.facebook.net; img-src/connect-src www.facebook.com). CSP stays
 * report-only.
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
  // Subscribe to marketing-consent changes without setState-in-effect.
  const marketingConsent = useSyncExternalStore(
    subscribeConsent,
    readMarketingConsent,
    () => false,
  );

  const enabled = Boolean(pixelId) && marketingConsent;

  // Exactly one PageView is sent — by the base script below on load. We do not
  // add a route-change PageView effect, because this component is mounted only
  // on the public landing page and a second call would duplicate the PageView.
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
