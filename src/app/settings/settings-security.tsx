"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getLinkedProviders, type LinkedProviders } from "@/lib/auth/identities";
import {
  signOutAction,
  getActiveSessionsAction,
  signOutOtherSessionsAction,
  type SessionInfo,
} from "@/app/(auth)/actions";
import {
  Shield, KeyRound, Monitor, LogOut, Link as LinkIcon,
  CheckCircle, ArrowRight, Mail, ShieldCheck, Loader2
} from "lucide-react";

interface SettingsSecurityProps {
  linkedProviders: LinkedProviders;
  userEmail: string | null;
}

function parseUserAgent(ua: string): string {
  const lower = ua.toLowerCase();
  
  let os = "Unknown OS";
  if (lower.includes("windows")) os = "Windows";
  else if (lower.includes("macintosh") || lower.includes("mac os x")) os = "macOS";
  else if (lower.includes("iphone") || lower.includes("ipad")) os = "iOS";
  else if (lower.includes("android")) os = "Android";
  else if (lower.includes("linux")) os = "Linux";
  else if (lower.includes("node")) os = "Node.js";

  let browser = "Unknown Browser";
  if (lower.includes("firefox")) browser = "Firefox";
  else if (lower.includes("chrome") || lower.includes("chromium")) browser = "Chrome";
  else if (lower.includes("safari")) browser = "Safari";
  else if (lower.includes("edge")) browser = "Edge";
  else if (lower.includes("opera") || lower.includes("opr")) browser = "Opera";
  else if (lower.includes("postman")) browser = "Postman";
  else if (lower === "node") browser = "Node.js Env";

  if (os === "Node.js" && browser === "Node.js Env") {
    return "Node.js environment";
  }

  if (os !== "Unknown OS" && browser !== "Unknown Browser") {
    return `${browser} on ${os}`;
  }
  if (browser !== "Unknown Browser") return browser;
  if (os !== "Unknown OS") return os;
  return ua || "Unknown device";
}

function getSessionIdFromToken(token: string): string | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payloadBase64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payloadJson = atob(payloadBase64);
    const payload = JSON.parse(payloadJson);
    return payload.session_id || null;
  } catch (err) {
    console.error("Failed to decode session token:", err);
    return null;
  }
}

export function SettingsSecurity({
  linkedProviders,
  userEmail,
}: SettingsSecurityProps) {
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(userEmail);
  const [hasPassword, setHasPassword] = useState(linkedProviders.hasPassword);
  const [hasGoogle, setHasGoogle] = useState(linkedProviders.hasGoogle);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [signOutOthersPending, setSignOutOthersPending] = useState(false);
  const [signOutOthersState, setSignOutOthersState] = useState<{ error: string | null; success: string | null }>({ error: null, success: null });

  const loadSessions = useCallback(async () => {
    const res = await getActiveSessionsAction();
    if (res.error) {
      setSessionsError(res.error);
    } else if (res.sessions) {
      setSessions(res.sessions);
    }

    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      const sid = getSessionIdFromToken(session.access_token);
      setCurrentSessionId(sid);
    }
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const providers = getLinkedProviders(user);
          if (user.identities && user.identities.length > 0) {
            setEmail(user.email ?? null);
            setHasPassword(providers.hasPassword);
            setHasGoogle(providers.hasGoogle);
          }
        }
      } catch (err) {
        console.error("Error loading user in Security tab:", err);
      }

      await loadSessions();
      setLoading(false);
    }
    load();
  }, [loadSessions]);

  const handleSignOutOthers = async () => {
    setSignOutOthersPending(true);
    setSignOutOthersState({ error: null, success: null });
    const res = await signOutOtherSessionsAction();
    if (res.error) {
      setSignOutOthersState({ error: res.error, success: null });
    } else {
      setSignOutOthersState({ error: null, success: res.success ?? "Signed out of all other sessions." });
      await loadSessions();
    }
    setSignOutOthersPending(false);
  };

  if (loading) return null;

  return (
    <div className="space-y-5">
      {/* Sign-in security */}
      <section className="rounded-2xl border border-slate-200 bg-[#fff] p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
            <KeyRound className="size-4" />
          </div>
          <h3 className="text-sm font-black text-slate-950 dark:text-slate-50">Sign-in Security</h3>
        </div>

        <div className="mt-4 space-y-3">
          {/* Email row */}
          <div className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                <Mail className="size-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{email ?? "No email"}</p>
                <div className="mt-0.5 flex flex-wrap gap-1.5">
                  <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ${
                    hasPassword
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                      : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                  }`}>
                    Password {hasPassword ? "set" : "not set"}
                  </span>
                </div>
              </div>
            </div>
            <Link
              href="/settings?tab=accounts"
              className="flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Manage
              <ArrowRight className="size-3" />
            </Link>
          </div>

          {/* Google row */}
          <div className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className={`flex size-9 items-center justify-center rounded-full ${
                hasGoogle
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                  : "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
              }`}>
                <svg className="size-4" viewBox="0 0 24 24" fill="none">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Google</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {hasGoogle ? "Connected" : "Not connected"}
                </p>
              </div>
            </div>
            <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${
              hasGoogle
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
            }`}>
              {hasGoogle ? (
                <><CheckCircle className="size-3" /> Connected</>
              ) : (
                "Not connected"
              )}
            </span>
          </div>

        </div>

        <div className="mt-3">
          <Link
            href="/settings?tab=accounts"
            className="flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <LinkIcon className="size-3.5" />
            Manage connected accounts
          </Link>
        </div>
      </section>

      {/* Active sessions */}
      <section className="rounded-2xl border border-slate-200 bg-[#fff] p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
              <Monitor className="size-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-950 dark:text-slate-50">Active Sessions</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Manage your active logins across devices</p>
            </div>
          </div>
          {sessions.length > 1 && (
            <button
              onClick={handleSignOutOthers}
              disabled={signOutOthersPending}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-red-200 px-3 text-xs font-semibold text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/50 cursor-pointer disabled:opacity-50"
            >
              {signOutOthersPending ? (
                <>
                  <Loader2 className="size-3 animate-spin" />
                  Processing...
                </>
              ) : (
                "Sign out of all other sessions"
              )}
            </button>
          )}
        </div>

        {signOutOthersState.success && (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
            {signOutOthersState.success}
          </div>
        )}

        {signOutOthersState.error && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-medium text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300">
            {signOutOthersState.error}
          </div>
        )}

        {sessionsError && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-medium text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300">
            {sessionsError}
          </div>
        )}

        <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
          {sessions.length === 0 ? (
            <p className="text-xs text-slate-500 py-2">No active sessions found.</p>
          ) : (
            sessions.map((session) => {
              const isCurrent = session.id === currentSessionId;
              return (
                <div key={session.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      <Monitor className="size-4.5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                          {parseUserAgent(session.userAgent)}
                        </span>
                        {isCurrent && (
                          <span className="inline-flex items-center rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                            This device
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400/80">
                        IP: {session.ip} &bull; Logged in {new Date(session.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center gap-3">
          <form action={signOutAction}>
            <button
              type="submit"
              className="flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
            >
              <LogOut className="size-3.5" />
              Sign out of this device
            </button>
          </form>
        </div>
      </section>

      {/* Login protection */}
      <section className="rounded-2xl border border-slate-200 bg-[#fff] p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
            <Shield className="size-4" />
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-950 dark:text-slate-50">Login protection</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">How your sign-in is secured</p>
          </div>
        </div>
        <ul className="mt-4 space-y-2">
          <li className="flex items-start gap-2.5 rounded-xl border border-slate-100 px-4 py-3 text-sm text-slate-700 dark:border-slate-800 dark:text-slate-300">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
            <span>reCAPTCHA protects email and password sign-in from automated attacks.</span>
          </li>
          <li className="flex items-start gap-2.5 rounded-xl border border-slate-100 px-4 py-3 text-sm text-slate-700 dark:border-slate-800 dark:text-slate-300">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
            <span>OAuth sign-in with Google is handled securely by each provider.</span>
          </li>
          <li className="flex items-start gap-2.5 rounded-xl border border-slate-100 px-4 py-3 text-sm text-slate-700 dark:border-slate-800 dark:text-slate-300">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
            <span>All data is transmitted over HTTPS with encrypted connections.</span>
          </li>
        </ul>
      </section>

      {/* Data and privacy */}
      <section className="rounded-2xl border border-slate-200 bg-[#fff] p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <Shield className="size-4" />
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-950 dark:text-slate-50">Data and privacy</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Manage your data and privacy settings</p>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          <Link
            href="/settings?tab=privacy"
            className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <span>Privacy Center</span>
            <ArrowRight className="size-3.5 text-slate-400" />
          </Link>
          <Link
            href="/settings?tab=accounts"
            className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <span>Connected Accounts</span>
            <ArrowRight className="size-3.5 text-slate-400" />
          </Link>
        </div>
      </section>

      {/* Security recommendations */}
      <section className="rounded-2xl border border-slate-200 bg-[#fff] p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
            <ShieldCheck className="size-4" />
          </div>
          <h3 className="text-sm font-black text-slate-950 dark:text-slate-50">Recommendations</h3>
        </div>
        <ul className="mt-4 space-y-2">
          {[
            "Use a strong, unique password for your account.",
            "Keep your email account secure — it is used for password recovery.",
            "Add another sign-in method before unlinking your only provider.",
            "Review connected accounts regularly and remove any you do not recognise.",
          ].map((tip) => (
            <li key={tip} className="flex items-start gap-2.5 rounded-xl border border-slate-100 px-4 py-3 text-sm text-slate-700 dark:border-slate-800 dark:text-slate-300">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
