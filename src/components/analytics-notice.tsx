"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { saveSidebarPreferences } from "@/lib/use-ui-preferences";

const STORAGE_KEY = "analytics-consent";
const LEGACY_NOTICE_STORAGE_KEY = "analytics-notice-dismissed";
const CONSENT_VERSION = "2026-06-analytics-v1";
const OPEN_COOKIE_SETTINGS_EVENT = "saledock:open-cookie-settings";
const COOKIE_CONSENT_CHANGED_EVENT = "saledock:cookie-consent-changed";

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

function clearAnalyticsCookies() {
  if (typeof document === "undefined") return;

  const existingCookieNames = document.cookie
    .split(";")
    .map((cookie) => cookie.split("=")[0]?.trim())
    .filter((name): name is string => Boolean(name));

  const namesToClear = new Set(["_ga", "_clck", "_clsk"]);
  for (const name of existingCookieNames) {
    if (name.startsWith("_ga_")) {
      namesToClear.add(name);
    }
  }

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
  const hasAnalytics = Boolean(gaMeasurementId || clarityProjectId);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dbChecked, setDbChecked] = useState(false);
  const [bannerOpen, setBannerOpen] = useState(false);
  const [consentTrigger, setConsentTrigger] = useState(0);

  // Listen to storage changes
  useEffect(() => {
    const handleStorageChange = () => {
      setConsentTrigger((prev) => prev + 1);
    };
    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("saledock-sidebar-preferences-changed", handleStorageChange);
    window.addEventListener(COOKIE_CONSENT_CHANGED_EVENT, handleStorageChange);
    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("saledock-sidebar-preferences-changed", handleStorageChange);
      window.removeEventListener(COOKIE_CONSENT_CHANGED_EVENT, handleStorageChange);
    };
  }, []);

  // Listen to open settings trigger
  useEffect(() => {
    function handleOpenCookieSettings() {
      setBannerOpen(true);
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
            if (parsed?.analyticsConsent === "accepted" || parsed?.analyticsConsent === "rejected") {
              try {
                const rawLocal = localStorage.getItem("saledock-sidebar-preferences-v1");
                const localParsed = rawLocal ? JSON.parse(rawLocal) : {};
                const nextPrefs = {
                  ...localParsed,
                  analyticsConsent: parsed.analyticsConsent,
                  updatedAt: new Date().toISOString(),
                };
                localStorage.setItem("saledock-sidebar-preferences-v1", JSON.stringify(nextPrefs));
                window.dispatchEvent(new Event("saledock-sidebar-preferences-changed"));
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

  // Read current consent settings
  const getConsentValues = () => {
    if (typeof window === "undefined") return { local: null, account: null };

    // Trigger re-read on state updates
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    consentTrigger;

    const rawLocal = localStorage.getItem(STORAGE_KEY);
    const local = parseStoredConsent(rawLocal);

    let account: ConsentValue | null = null;
    const rawSidebar = localStorage.getItem("saledock-sidebar-preferences-v1");
    if (rawSidebar) {
      try {
        const parsed = JSON.parse(rawSidebar);
        if (parsed.analyticsConsent === "accepted" || parsed.analyticsConsent === "rejected") {
          account = parsed.analyticsConsent;
        }
      } catch {}
    }

    return { local, account };
  };

  const { local: parsedConsent, account: accountConsent } = getConsentValues();

  const saveAccountConsent = (value: ConsentValue) => {
    if (typeof window === "undefined") return;

    let existing: Record<string, unknown> = {};
    const rawSidebar = localStorage.getItem("saledock-sidebar-preferences-v1");
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

    localStorage.setItem("saledock-sidebar-preferences-v1", JSON.stringify(nextPrefs));
    window.dispatchEvent(new Event("saledock-sidebar-preferences-changed"));
    saveSidebarPreferences(nextPrefs);
  };

  function handleAccept() {
    if (user) {
      saveAccountConsent("accepted");
    } else {
      writeStoredConsent("accepted");
    }
    setBannerOpen(false);
  }

  function handleReject() {
    const wasAccepted = user
      ? accountConsent === "accepted"
      : parsedConsent?.value === "accepted";

    if (user) {
      saveAccountConsent("rejected");
    } else {
      writeStoredConsent("rejected");
    }

    clearAnalyticsCookies();
    setBannerOpen(false);

    if (wasAccepted) {
      window.setTimeout(() => window.location.reload(), 50);
    }
  }

  if (!hasAnalytics) return null;
  if (authLoading || (user && !dbChecked)) return null;

  const analyticsAccepted = user
    ? accountConsent === "accepted"
    : parsedConsent?.value === "accepted";

  const shouldShowBanner = user
    ? bannerOpen || accountConsent === null
    : bannerOpen || parsedConsent === null;

  return (
    <>
      {analyticsAccepted && (
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
          className="fixed inset-x-3 bottom-3 z-30 rounded-xl border border-[#cbd5e1] bg-[#f8fafc] px-4 py-3 text-sm text-[#0f172a] shadow-lg dark:border-[#475569] dark:bg-[#0f172a] dark:text-[#e2e8f0] sm:left-1/2 sm:right-auto sm:w-[min(760px,calc(100%-2rem))] sm:-translate-x-1/2"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="leading-6">
              SaleDock uses Google Analytics 4 and Microsoft Clarity only if you accept
              analytics cookies. You can reject them and still use the site.{" "}
              <Link
                href="/privacy"
                className="font-semibold text-[#1d4ed8] underline underline-offset-2 hover:text-[#1e40af] dark:text-[#93c5fd] dark:hover:text-[#bfdbfe]"
              >
                Privacy Policy
              </Link>
            </p>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={handleReject}
                aria-label="Reject analytics cookies"
                className="rounded-lg border border-[#cbd5e1] bg-[#e2e8f0] px-4 py-2 text-sm font-bold text-[#0f172a] transition hover:bg-[#cbd5e1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] dark:border-[#64748b] dark:bg-[#334155] dark:text-[#f8fafc] dark:hover:bg-[#475569]"
              >
                Reject
              </button>
              <button
                type="button"
                onClick={handleAccept}
                aria-label="Accept analytics cookies"
                className="rounded-lg border border-[#1d4ed8] bg-[#2563eb] px-4 py-2 text-sm font-bold text-[#ffffff] transition hover:bg-[#1d4ed8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] dark:border-[#93c5fd] dark:bg-[#60a5fa] dark:text-[#082f49] dark:hover:bg-[#93c5fd]"
              >
                Accept
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
