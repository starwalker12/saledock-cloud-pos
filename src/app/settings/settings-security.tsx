"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getLinkedProviders } from "@/lib/auth/identities";
import { signOutAction } from "@/app/(auth)/actions";
import {
  Shield, KeyRound, Smartphone, Monitor, LogOut, Link as LinkIcon,
  CheckCircle, ArrowRight, Mail, ShieldCheck,
} from "lucide-react";

export function SettingsSecurity() {
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [hasPassword, setHasPassword] = useState(false);
  const [hasGoogle, setHasGoogle] = useState(false);
  const [hasFacebook, setHasFacebook] = useState(false);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const providers = getLinkedProviders(user);
        setEmail(user.email ?? null);
        setHasPassword(providers.hasPassword);
        setHasGoogle(providers.hasGoogle);
        setHasFacebook(providers.hasFacebook);
      }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return null;

  return (
    <div className="space-y-5">
      {/* Sign-in security */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
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

          {/* Facebook row */}
          <div className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className={`flex size-9 items-center justify-center rounded-full ${
                hasFacebook
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                  : "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
              }`}>
                <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Facebook</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {hasFacebook ? "Connected" : "Not connected"}
                </p>
              </div>
            </div>
            <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${
              hasFacebook
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
            }`}>
              {hasFacebook ? (
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

      {/* Multi-factor authentication */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
            <Smartphone className="size-4" />
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-950 dark:text-slate-50">Multi-factor authentication</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Add an extra verification step when signing in</p>
          </div>
        </div>
        <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-4 text-center dark:border-slate-700 dark:bg-slate-800/20">
          <ShieldCheck className="mx-auto size-8 text-slate-300 dark:text-slate-600" />
          <p className="mt-2 text-sm font-semibold text-slate-500 dark:text-slate-400">Coming soon</p>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            Two-factor authentication will be available in a future update.
          </p>
        </div>
      </section>

      {/* Active session */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
            <Monitor className="size-4" />
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-950 dark:text-slate-50">Active session</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Your current session is secured</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <form action={signOutAction}>
            <button
              type="submit"
              className="flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <LogOut className="size-3.5" />
              Sign out
            </button>
          </form>
          <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-400 dark:bg-slate-800 dark:text-slate-500">
            Manage all sessions — coming soon
          </span>
        </div>
      </section>

      {/* Login protection */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
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
            <span>OAuth sign-in with Google or Facebook is handled securely by each provider.</span>
          </li>
          <li className="flex items-start gap-2.5 rounded-xl border border-slate-100 px-4 py-3 text-sm text-slate-700 dark:border-slate-800 dark:text-slate-300">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
            <span>All data is transmitted over HTTPS with encrypted connections.</span>
          </li>
        </ul>
      </section>

      {/* Data and privacy */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
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
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
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
