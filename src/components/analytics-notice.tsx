"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { saveSidebarPreferences } from "@/lib/use-ui-preferences";

const STORAGE_KEY = "analytics-consent";
const LEGACY_NOTICE_STORAGE_KEY = "analytics-notice-dismissed";
const PREFERENCES_STORAGE_KEY = "saledock-sidebar-preferences-v1";
const CONSENT_VERSION = "2026-06-analytics-v1";
const OPEN_COOKIE_SETTINGS_EVENT = "saledock:open-cookie-settings";
const COOKIE_CONSENT_CHANGED_EVENT = "saledock:cookie-consent-changed";
// Sidebar preferences are also used for signed-in analytics/marketing consent storage.
const PREFERENCES_CHANGED_EVENT = "saledock-sidebar-preferences-changed";

function hasStoredConsentDecision(): boolean {
  if (typeof window === "undefined") return false;
  try {
    // Anonymous visitors: consent stored directly under STORAGE_KEY.
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "accepted" || raw === "rejected") return true;
    const parsed = raw ? (JSON.parse(raw) as Partial<StoredConsent>) : null;
    if (parsed?.value === "accepted" || parsed?.value === "rejected") return true;

    // Signed-in visitors: consent is persisted as part of sidebar preferences.
    const rawPrefs = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (rawPrefs) {
      const prefs = JSON.parse(rawPrefs) as Record<string, unknown>;
      const hasAnalytics =
        prefs.analyticsConsent === "accepted" || prefs.analyticsConsent === "rejected";
      const hasMarketing =
        prefs.marketingConsent === "accepted" || prefs.marketingConsent === "rejected";
      if (hasAnalytics || hasMarketing) return true;
    }
  } catch {
    // ignore parse errors
  }
  return false;
}

type ConsentValue = "accepted" | "rejected";

type StoredConsent = {
  value: ConsentValue;
  version: string;
  timestamp: string;
};

type AnalyticsNoticeProps = {
  gaMeasurementId?: string;
  clarityProjectId?: string;
  nonce?: string;
};

export function openCookieSettings() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(OPEN_COOKIE_SETTINGS_EVENT));
}

function parseStoredConsent(raw: string | null): StoredConsent | null {
  try {
    if (!raw) return null;

    if (raw === "accepted" || raw === "rejected") {
      return {
        value: raw,
        version: "legacy-string",
        timestamp: "",
      };
    }

    const parsed = JSON.parse(raw) as Partial<StoredConsent>;
    if (parsed.value !== "accepted" && parsed.value !== "rejected") return null;

    return {
      value: parsed.value,
      version: parsed.version ?? "unknown",
      timestamp: parsed.timestamp ?? "",
    };
  } catch {
    return null;
  }
}

function writeStoredConsent(value: ConsentValue): StoredConsent {
  const nextConsent = {
    value,
    version: CONSENT_VERSION,
    timestamp: new Date().toISOString(),
  };

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextConsent));
    window.localStorage.removeItem(LEGACY_NOTICE_STORAGE_KEY);
  } catch {
    // Keep the in-memory decision working if browser storage is unavailable.
  }

  window.dispatchEvent(new Event(COOKIE_CONSENT_CHANGED_EVENT));
  return nextConsent;
}

// Read the marketing/advertising decision. Stored in the shared preferences
// object for every visitor so the (public-only) Meta Pixel helper can read it.
function readMarketingDecision(): ConsentValue | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { marketingConsent?: unknown };
    if (parsed?.marketingConsent === "accepted" || parsed?.marketingConsent === "rejected") {
      return parsed.marketingConsent;
    }
    return null;
  } catch {
    return null;
  }
}

function writeMarketingDecision(value: ConsentValue) {
  if (typeof window === "undefined") return;
  let existing: Record<string, unknown> = {};
  try {
    const raw = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (raw) existing = JSON.parse(raw);
  } catch {
    // ignore parse errors and start fresh
  }
  const nextPrefs = {
    ...existing,
    marketingConsent: value,
    updatedAt: new Date().toISOString(),
  };
  // saveSidebarPreferences writes localStorage + dispatches the change event,
  // and (only for signed-in users) persists to the database, fail-open.
  saveSidebarPreferences(nextPrefs);
  window.dispatchEvent(new Event(COOKIE_CONSENT_CHANGED_EVENT));
}

function clearTrackingCookies(options: { analytics: boolean; marketing: boolean }) {
  if (typeof document === "undefined") return;

  const existingCookieNames = document.cookie
    .split(";")
    .map((cookie) => cookie.split("=")[0]?.trim())
    .filter((name): name is string => Boolean(name));

  const namesToClear = new Set<string>();
  if (options.analytics) {
    namesToClear.add("_ga");
    namesToClear.add("_clck");
    namesToClear.add("_clsk");
    for (const name of existingCookieNames) {
      if (name.startsWith("_ga_")) namesToClear.add(name);
    }
  }
  if (options.marketing) {
    // Meta Pixel cookies (only present if the pixel was ever active).
    namesToClear.add("_fbp");
    namesToClear.add("_fbc");
  }
  if (namesToClear.size === 0) return;

  const hostname = window.location.hostname;
  const isIpAddress = /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
  const domainCandidates = new Set<string | null>([null]);

  if (hostname && hostname.includes(".") && !isIpAddress) {
    domainCandidates.add(hostname);
    domainCandidates.add(`.${hostname}`);
  }

  for (const name of namesToClear) {
    for (const domain of domainCandidates) {
      document.cookie = [
        `${name}=`,
        "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
        "Max-Age=0",
        "Path=/",
        "SameSite=Lax",
        domain ? `Domain=${domain}` : "",
      ]
        .filter(Boolean)
        .join("; ");
    }
  }
}

function AnalyticsScripts({
  gaMeasurementId,
  clarityProjectId,
  nonce,
}: AnalyticsNoticeProps) {
  return (
    <>
      {clarityProjectId && (
        <Script
          id="microsoft-clarity"
          strategy="afterInteractive"
          nonce={nonce}
          data-project-id={clarityProjectId}
          dangerouslySetInnerHTML={{
            __html: `
              (function(c,l,a,r,i,t,y){
                var projectId = l.getElementById('microsoft-clarity').getAttribute('data-project-id');
                c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
                t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+projectId;
                y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
              })(window, document, "clarity", "script");
            `,
          }}
        />
      )}

      {gaMeasurementId && (
        <>
          <Script
            id="google-analytics-src"
            strategy="afterInteractive"
            nonce={nonce}
            src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(
              gaMeasurementId,
            )}`}
          />
          <Script
            id="google-analytics-init"
            strategy="afterInteractive"
            nonce={nonce}
            data-measurement-id={gaMeasurementId}
            dangerouslySetInnerHTML={{
              __html: `
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                var measurementId = document.getElementById('google-analytics-init').getAttribute('data-measurement-id');
                gtag('config', measurementId);
              `,
            }}
          />
        </>
      )}
    </>
  );
}

export default function AnalyticsNotice({
  gaMeasurementId,
  clarityProjectId,
  nonce,
}: AnalyticsNoticeProps) {
  // Analytics scripts exist only if configured; the marketing category is always
  // offered so visitors can make a clear, separate advertising-cookie choice.
  const hasAnalytics = Boolean(gaMeasurementId || clarityProjectId);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dbChecked, setDbChecked] = useState(false);
  const [bannerOpen, setBannerOpen] = useState(() => !hasStoredConsentDecision());
  const [showDetails, setShowDetails] = useState(false);
  const [consentTrigger, setConsentTrigger] = useState(0);

  // Draft toggle state used while the visitor is customizing choices.
  const [draftAnalytics, setDraftAnalytics] = useState(false);
  const [draftMarketing, setDraftMarketing] = useState(false);

  // Listen to storage / preference changes (only for live consent updates, not banner state).
  useEffect(() => {
    const handleStorageChange = () => {
      setConsentTrigger((prev) => prev + 1);
    };
    window.addEventListener("storage", handleStorageChange);
    window.addEventListener(COOKIE_CONSENT_CHANGED_EVENT, handleStorageChange);
    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener(COOKIE_CONSENT_CHANGED_EVENT, handleStorageChange);
    };
  }, []);

  // Listen to open settings trigger
  useEffect(() => {
    function handleOpenCookieSettings() {
      setBannerOpen(true);
      setShowDetails(true);
    }

    window.addEventListener(OPEN_COOKIE_SETTINGS_EVENT, handleOpenCookieSettings);
    return () => window.removeEventListener(OPEN_COOKIE_SETTINGS_EVENT, handleOpenCookieSettings);
  }, []);

  // Fetch initial auth user and subscribe to changes
  useEffect(() => {
    const supabase = createClient();
    let active = true;

    supabase.auth.getUser().then(({ data: { user: u } }) => {
      if (!active) return;
      setUser(u);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  // Sync/check db preferences for logged-in user to avoid transient banner flash
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      const timer = setTimeout(() => setDbChecked(true), 0);
      return () => clearTimeout(timer);
    }

    const supabase = createClient();
    let active = true;

    supabase
      .from("user_ui_preferences")
      .select("sidebar_preferences")
      .eq("user_id", user.id)
      .single()
      .then(
        ({ data }) => {
          if (!active) return;
          if (data?.sidebar_preferences) {
            const parsed = data.sidebar_preferences as Record<string, unknown>;
            const hasAnalyticsPref =
              parsed?.analyticsConsent === "accepted" || parsed?.analyticsConsent === "rejected";
            const hasMarketingPref =
              parsed?.marketingConsent === "accepted" || parsed?.marketingConsent === "rejected";
            if (hasAnalyticsPref || hasMarketingPref) {
              try {
                const rawLocal = localStorage.getItem(PREFERENCES_STORAGE_KEY);
                const localParsed = rawLocal ? JSON.parse(rawLocal) : {};
                const nextPrefs: Record<string, unknown> = {
                  ...localParsed,
                  updatedAt: new Date().toISOString(),
                };
                if (hasAnalyticsPref) nextPrefs.analyticsConsent = parsed.analyticsConsent;
                if (hasMarketingPref) nextPrefs.marketingConsent = parsed.marketingConsent;
                localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(nextPrefs));
                window.dispatchEvent(new Event(PREFERENCES_CHANGED_EVENT));
              } catch {}
            }
          }
          setDbChecked(true);
        },
        () => {
          if (active) setDbChecked(true);
        }
      );

    return () => {
      active = false;
    };
  }, [user, authLoading]);

  // Read current consent decisions (re-reads when consentTrigger changes).
  const getDecisions = () => {
    if (typeof window === "undefined") return { analytics: null, marketing: null };

    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    consentTrigger;

    let analytics: ConsentValue | null = null;
    const rawSidebar = localStorage.getItem(PREFERENCES_STORAGE_KEY);
    let sidebar: Record<string, unknown> = {};
    if (rawSidebar) {
      try {
        sidebar = JSON.parse(rawSidebar);
      } catch {}
    }

    if (user) {
      if (sidebar.analyticsConsent === "accepted" || sidebar.analyticsConsent === "rejected") {
        analytics = sidebar.analyticsConsent;
      }
    } else {
      analytics = parseStoredConsent(localStorage.getItem(STORAGE_KEY))?.value ?? null;
    }

    const marketing = readMarketingDecision();
    return { analytics, marketing };
  };

  const { analytics: analyticsDecision, marketing: marketingDecision } = getDecisions();

  // Keep banner visibility derived from persisted consent. If the visitor has already
  // decided (accepted or rejected), sidebar/dash layout changes must not reopen it.
  const hasDecided = analyticsDecision !== null && marketingDecision !== null;
  const shouldShowBanner = !hasDecided || bannerOpen;

  const saveAnalyticsAccountConsent = (value: ConsentValue) => {
    if (typeof window === "undefined") return;

    let existing: Record<string, unknown> = {};
    const rawSidebar = localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (rawSidebar) {
      try {
        existing = JSON.parse(rawSidebar);
      } catch {}
    }

    const nextPrefs = {
      ...existing,
      analyticsConsent: value,
      updatedAt: new Date().toISOString(),
    };

    localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(nextPrefs));
    window.dispatchEvent(new Event(PREFERENCES_CHANGED_EVENT));
    saveSidebarPreferences(nextPrefs);
  };

  const setAnalyticsDecision = (value: ConsentValue) => {
    if (user) {
      saveAnalyticsAccountConsent(value);
    } else {
      writeStoredConsent(value);
    }
  };

  // Apply a full set of choices. Reloads only when analytics goes accepted -> rejected
  // so already-loaded GA/Clarity tags stop (preserves prior behavior).
  function applyChoices(nextAnalytics: ConsentValue, nextMarketing: ConsentValue) {
    const analyticsWasAccepted = analyticsDecision === "accepted";

    setAnalyticsDecision(nextAnalytics);
    writeMarketingDecision(nextMarketing);

    clearTrackingCookies({
      analytics: nextAnalytics === "rejected",
      marketing: nextMarketing === "rejected",
    });

    setBannerOpen(false);
    setShowDetails(false);

    if (analyticsWasAccepted && nextAnalytics === "rejected") {
      window.setTimeout(() => window.location.reload(), 50);
    }
  }

  function handleAcceptAll() {
    applyChoices("accepted", "accepted");
  }

  function handleRejectAll() {
    applyChoices("rejected", "rejected");
  }

  function handleSaveChoices() {
    applyChoices(draftAnalytics ? "accepted" : "rejected", draftMarketing ? "accepted" : "rejected");
  }

  function handleOpenDetails() {
    // Seed the toggles from current decisions (undecided defaults to off).
    setDraftAnalytics(analyticsDecision === "accepted");
    setDraftMarketing(marketingDecision === "accepted");
    setShowDetails(true);
  }

  if (!hasAnalytics) return null;
  if (authLoading || (user && !dbChecked)) return null;

  const analyticsAccepted = analyticsDecision === "accepted";

  return (
    <>
      {hasAnalytics && analyticsAccepted && (
        <AnalyticsScripts
          gaMeasurementId={gaMeasurementId}
          clarityProjectId={clarityProjectId}
          nonce={nonce}
        />
      )}

      {shouldShowBanner && (
        <div
          role="region"
          aria-label="Cookie consent"
          data-testid="cookie-consent-banner"
          className="print-hidden fixed inset-x-3 bottom-3 z-30 rounded-xl border border-[#cbd5e1] bg-[#f8fafc] px-4 py-3 text-sm text-[#0f172a] shadow-lg print:hidden dark:border-[#475569] dark:bg-[#0f172a] dark:text-[#e2e8f0] sm:left-1/2 sm:right-auto sm:w-[min(760px,calc(100%-2rem))] sm:-translate-x-1/2"
        >
          <div className="flex flex-col gap-3">
            <p className="leading-6">
              SaleDock uses cookies. <strong>Necessary</strong> cookies are always on so the site works.
              You can separately allow <strong>Analytics</strong> cookies (Google Analytics 4 and Microsoft
              Clarity) and <strong>Marketing</strong> cookies (advertising tools such as Meta Pixel). You can
              reject the optional ones and still use the site.{" "}
              <Link
                href="/privacy"
                className="font-semibold text-[#1d4ed8] underline underline-offset-2 hover:text-[#1e40af] dark:text-[#93c5fd] dark:hover:text-[#bfdbfe]"
              >
                Privacy Policy
              </Link>
            </p>

            {showDetails && (
              <div className="flex flex-col gap-2 rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 dark:border-[#334155] dark:bg-[#1e293b]">
                <label className="flex items-start gap-2 opacity-70">
                  <input type="checkbox" checked disabled aria-label="Necessary cookies (always on)" className="mt-1" />
                  <span>
                    <span className="font-semibold">Necessary</span> — required for sign-in, security, and core
                    features. Always active.
                  </span>
                </label>
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={draftAnalytics}
                    onChange={(e) => setDraftAnalytics(e.target.checked)}
                    aria-label="Analytics cookies"
                    className="mt-1"
                  />
                  <span>
                    <span className="font-semibold">Analytics</span> — Google Analytics 4 and Microsoft Clarity,
                    to understand how the site is used.
                  </span>
                </label>
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={draftMarketing}
                    onChange={(e) => setDraftMarketing(e.target.checked)}
                    aria-label="Marketing and advertising cookies"
                    className="mt-1"
                  />
                  <span>
                    <span className="font-semibold">Marketing / Advertising</span> — advertising tools such as
                    Meta Pixel, used for advertising measurement and remarketing on public pages only.
                  </span>
                </label>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2">
              {!showDetails && (
                <button
                  type="button"
                  onClick={handleOpenDetails}
                  aria-label="Customize cookie choices"
                  className="mr-auto rounded-lg px-3 py-2 text-sm font-bold text-[#1d4ed8] underline underline-offset-2 hover:text-[#1e40af] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] dark:text-[#93c5fd] dark:hover:text-[#bfdbfe]"
                >
                  Cookie settings
                </button>
              )}
              <button
                type="button"
                onClick={handleRejectAll}
                aria-label="Reject optional cookies"
                className="rounded-lg border border-[#cbd5e1] bg-[#e2e8f0] px-4 py-2 text-sm font-bold text-[#0f172a] transition hover:bg-[#cbd5e1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] dark:border-[#64748b] dark:bg-[#334155] dark:text-[#f8fafc] dark:hover:bg-[#475569]"
              >
                Reject all
              </button>
              {showDetails ? (
                <button
                  type="button"
                  onClick={handleSaveChoices}
                  aria-label="Save cookie choices"
                  className="rounded-lg border border-[#1d4ed8] bg-[#2563eb] px-4 py-2 text-sm font-bold text-[#ffffff] transition hover:bg-[#1d4ed8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] dark:border-[#93c5fd] dark:bg-[#60a5fa] dark:text-[#082f49] dark:hover:bg-[#93c5fd]"
                >
                  Save choices
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleAcceptAll}
                  aria-label="Accept all cookies"
                  className="rounded-lg border border-[#1d4ed8] bg-[#2563eb] px-4 py-2 text-sm font-bold text-[#ffffff] transition hover:bg-[#1d4ed8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] dark:border-[#93c5fd] dark:bg-[#60a5fa] dark:text-[#082f49] dark:hover:bg-[#93c5fd]"
                >
                  Accept all
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
