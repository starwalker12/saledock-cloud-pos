"use client";

import { useEffect, useState, useCallback } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import {
  linkGoogleAccountAction,
  unlinkIdentityAction,
  setPasswordAction,
  changeEmailAction,
  resendEmailChangeAction,
  type AuthState,
} from "@/app/(auth)/actions";
import { Link, Unlink, AlertTriangle, CheckCircle, X, Mail, Shield, Eye, EyeOff } from "lucide-react";
import { getLinkedProviders, type LinkedProviders } from "@/lib/auth/identities";
import { GoogleIcon } from "@/components/icons/provider-icons";
import { Skeleton } from "@/components/ui/skeleton";

function ClientPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(timer);
  }, []);
  return mounted ? createPortal(children, document.body) : null;
}

const linkGoogleInitialState: AuthState = { error: null };
const passwordInitialState: AuthState = { error: null };
const emailInitialState: AuthState = { error: null };

type IdentityProvider = {
  provider: string;
  id: string;
  created_at: string;
  last_sign_in_at: string | null;
  identity_data?: Record<string, unknown>;
};

export function ConnectedAccounts({
  linkParam,
  providerParam,
  linkedProviders: initialLinkedProviders,
  userEmail: serverUserEmail = null,
}: {
  linkParam?: string | null;
  providerParam?: string | null;
  linkedProviders: LinkedProviders;
  userEmail?: string | null;
}) {
  const router = useRouter();
  const [identities, setIdentities] = useState<IdentityProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(serverUserEmail);
  const [userNewEmail, setUserNewEmail] = useState<string | null>(null);
  const [emailVerified, setEmailVerified] = useState<boolean>(false);
  const [serverProviders, setServerProviders] = useState<LinkedProviders>(initialLinkedProviders);
  const [linkGoogleState, linkGoogleAction] = useActionState(linkGoogleAccountAction, linkGoogleInitialState);
  const [unlinkState, unlinkAction] = useActionState(unlinkIdentityAction, linkGoogleInitialState);
  const [passwordState, passwordAction] = useActionState(setPasswordAction, passwordInitialState);
  const [emailState, emailAction] = useActionState(changeEmailAction, emailInitialState);
  const [resendState, resendAction] = useActionState(resendEmailChangeAction, { error: null });
  const [conflictDismissed, setConflictDismissed] = useState(false);
  const [dismissedSuccessHash, setDismissedSuccessHash] = useState<string | null>(null);
  const showSuccessDialog = !!passwordState.success && dismissedSuccessHash !== passwordState.success;

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const providers = getLinkedProviders(user);
        setServerProviders(providers);
        setUserEmail(user.email ?? serverUserEmail ?? null);
        setUserNewEmail(user.new_email ?? null);
        setEmailVerified(!!user.email_confirmed_at || providers.hasGoogle);
        if (user.identities) {
          setIdentities(user.identities as IdentityProvider[]);
        }
      } else if (serverUserEmail) {
        setUserEmail(serverUserEmail);
      }
      setLoading(false);
    }
    load();
  }, [linkGoogleState, unlinkState, passwordState, emailState, resendState, serverUserEmail]);

  const { hasPassword, hasGoogle, identityCount } = serverProviders;

  const hasAnyOAuthConnected = hasGoogle;

  const showConflictBanner = linkParam === "conflict" && !hasAnyOAuthConnected && !conflictDismissed;

  useEffect(() => {
    if (linkParam === "conflict" && hasAnyOAuthConnected && !loading) {
      router.replace("/settings?tab=accounts", { scroll: false });
    }
  }, [linkParam, hasAnyOAuthConnected, loading, router]);

  const dismissAll = useCallback(() => {
    setConflictDismissed(true);
    router.replace("/settings?tab=accounts", { scroll: false });
  }, [router]);

  const googleIdentity = identities.find((id) => id.provider === "google");

  const linkProviderLabel = providerParam === "google" ? "Google" : "";

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-900">
      <div>
        <h2 className="text-lg font-black text-slate-950 dark:text-slate-50">Connected Accounts</h2>
        <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
          Link Google so you can sign in using another provider. For security,
          sign in with your existing account first before linking a new provider.
        </p>
      </div>

      <div className="mt-5 space-y-4">
        {/* ── Feedback Banners ── */}

        {linkParam === "success" && linkProviderLabel && (
          <Banner type="success" onDismiss={dismissAll}>
            <span className="font-semibold">{linkProviderLabel}</span> account linked successfully.
          </Banner>
        )}

        {linkParam === "success" && !linkProviderLabel && (
          <Banner type="success" onDismiss={dismissAll}>
            Account linked successfully.
          </Banner>
        )}

        {linkParam === "error" && (
          <Banner type="error" onDismiss={dismissAll}>
            {linkProviderLabel
              ? `We could not link ${linkProviderLabel}. Please try again.`
              : "We could not link this provider. Please try again."}
          </Banner>
        )}

        {showConflictBanner && (
          <Banner type="conflict" onDismiss={dismissAll}>
            <p className="text-sm font-semibold text-red-800 dark:text-red-300">
              {linkProviderLabel
                ? `${linkProviderLabel} is linked to another SaleDock account`
                : "Provider already linked to another account"}
            </p>
            <p className="mt-1 text-sm leading-5 text-red-700 dark:text-red-400">
              Sign out and sign in with that provider to see which account it opens.
              If it is a duplicate account, contact support before deleting or merging anything.
            </p>
          </Banner>
        )}

        {unlinkState.success && (
          <Banner type="success" onDismiss={dismissAll}>
            {unlinkState.success}
          </Banner>
        )}

        {unlinkState.error && (
          <Banner type="error">
            {unlinkState.error}
          </Banner>
        )}

        {passwordState.success && (
          <Banner type="success" onDismiss={dismissAll}>
            {passwordState.success}
          </Banner>
        )}

        {passwordState.error && (
          <Banner type="error">
            {passwordState.error}
          </Banner>
        )}

        {linkGoogleState.success && (
          <Banner type="success" onDismiss={dismissAll}>
            {linkGoogleState.success}
          </Banner>
        )}

        {linkGoogleState.error && (
          <Banner type="error">
            {linkGoogleState.error}
          </Banner>
        )}

        {emailState.success && (
          <Banner type="success" onDismiss={dismissAll}>
            {emailState.success}
          </Banner>
        )}

        {emailState.error && (
          <Banner type="error">
            {emailState.error}
          </Banner>
        )}

        {resendState.success && (
          <Banner type="success" onDismiss={dismissAll}>
            {resendState.success}
          </Banner>
        )}

        {resendState.error && (
          <Banner type="error">
            {resendState.error}
          </Banner>
        )}

        {loading && (
          <div className="space-y-3">
            <ProviderRowSkeleton />
            <ProviderRowSkeleton />
            <ProviderRowSkeleton />
          </div>
        )}

        {!loading && (
          <>
            {/* Email & Password Row */}
            <EmailPasswordRow
              hasPassword={hasPassword}
              userEmail={userEmail}
              userNewEmail={userNewEmail}
              emailVerified={emailVerified}
              passwordAction={passwordAction}
              emailAction={emailAction}
              resendAction={resendAction}
              emailState={emailState}
              hasGoogle={hasGoogle}
              googleEmail={googleIdentity?.identity_data?.email as string ?? undefined}
            />

            <ProviderRow
              label="Google"
              connected={hasGoogle}
              detail={googleIdentity?.identity_data?.email as string ?? undefined}
              canUnlink={hasGoogle && identityCount > 1}
              onUnlink={() => {
                const fd = new FormData();
                fd.append("provider", "google");
                unlinkAction(fd);
              }}
              required={identityCount <= 1 && hasGoogle}
            >
              {!hasGoogle && (
                <form action={linkGoogleAction}>
                  <button
                    type="submit"
                    className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <Link className="size-3.5" />
                    Link Google Account
                  </button>
                </form>
              )}
            </ProviderRow>

            <HelpText />
          </>
        )}
      </div>

      {showSuccessDialog && (
        <ClientPortal>
          <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#020617]/75 p-4 backdrop-blur-sm animate-fade-in">
            <div
              role="dialog"
              aria-modal="true"
              className="w-full max-w-md rounded-2xl border border-slate-200 bg-[#fff] p-5 text-slate-900 shadow-2xl dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 sm:p-6 text-center space-y-4"
            >
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                <CheckCircle className="size-6" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-black text-slate-900 dark:text-slate-50">
                  Password Configured
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {passwordState.success}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDismissedSuccessHash(passwordState.success ?? null);
                  dismissAll();
                  window.location.reload();
                }}
                className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 cursor-pointer transition"
              >
                OK
              </button>
            </div>
          </div>
        </ClientPortal>
      )}
    </section>
  );
}

function EmailPasswordRow({
  hasPassword,
  userEmail,
  userNewEmail,
  emailVerified,
  passwordAction,
  emailAction,
  resendAction,
  emailState,
  hasGoogle,
  googleEmail,
}: {
  hasPassword: boolean;
  userEmail: string | null;
  userNewEmail: string | null;
  emailVerified: boolean;
  passwordAction: (payload: FormData) => void;
  emailAction: (payload: FormData) => void;
  resendAction: (payload: FormData) => void;
  emailState: AuthState;
  hasGoogle: boolean;
  googleEmail?: string;
}) {
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);

  const [passwordVal, setPasswordVal] = useState("");
  const [confirmPasswordVal, setConfirmPasswordVal] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const emailSuccess = emailState.success;
  useEffect(() => {
    if (emailSuccess) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowEmailForm(false);
    }
  }, [emailSuccess]);

  const passwordChecks = {
    minChars: passwordVal.length >= 8,
    uppercase: /[A-Z]/.test(passwordVal),
    lowercase: /[a-z]/.test(passwordVal),
    number: /[0-9]/.test(passwordVal),
    special: /[^a-zA-Z0-9]/.test(passwordVal),
  };
  const allPasswordChecksPass = Object.values(passwordChecks).every(Boolean);
  const passwordsMatch = confirmPasswordVal.length > 0 && passwordVal === confirmPasswordVal;

  const isEmailVerified = emailVerified || hasGoogle;
  const activeEmail = userEmail || googleEmail;

  return (
    <div className="rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-700">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
            <Mail className="size-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Email &amp; Password
            </p>
            {activeEmail && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {hasPassword ? `You can now sign in with: ${activeEmail}` : activeEmail}
              </p>
            )}
            <div className="mt-1 flex flex-wrap gap-1.5">
              {userNewEmail ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                  Email change pending
                </span>
              ) : (
                <span
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ${
                    isEmailVerified
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                      : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                  }`}
                >
                  {isEmailVerified ? "Verified" : "Unverified"}
                </span>
              )}
              <span
                className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ${
                  hasPassword
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                    : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                }`}
              >
                Password {hasPassword ? "set" : "not set"}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const nextState = !showPasswordForm;
              setShowPasswordForm(nextState);
              setShowEmailForm(false);
              if (!nextState) {
                setPasswordVal("");
                setConfirmPasswordVal("");
                setShowPassword(false);
                setShowConfirmPassword(false);
              }
            }}
            className="flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Shield className="size-3" />
            {hasPassword ? "Update password" : "Set password"}
          </button>
          <button
            type="button"
            onClick={() => { setShowEmailForm(!showEmailForm); setShowPasswordForm(false); }}
            className="flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Mail className="size-3" />
            Change email
          </button>
        </div>
      </div>

      {/* Set/Change Password Form */}
      {showPasswordForm && (
        <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-700">
          <form action={passwordAction} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">New password</label>
                <div className="relative mt-1">
                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    placeholder="Min 8 characters, upper + lower + digit + special"
                    required
                    minLength={8}
                    value={passwordVal}
                    onChange={(e) => setPasswordVal(e.target.value)}
                    className="h-10 w-full rounded-lg border border-slate-200 px-3 pr-10 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                {passwordVal.length > 0 && (
                  <div className="mt-2 space-y-1 text-xs">
                    <p className="font-medium text-slate-500">
                      Password must include:
                    </p>
                    {[
                      { key: "minChars", label: "At least 8 characters" },
                      { key: "uppercase", label: "One uppercase letter" },
                      { key: "lowercase", label: "One lowercase letter" },
                      { key: "number", label: "One number" },
                      { key: "special", label: "One special character" },
                    ].map(({ key, label }) => {
                      const passed = passwordChecks[key as keyof typeof passwordChecks];
                      return (
                        <p
                          key={key}
                          className={`flex items-center gap-1.5 ${
                            passed ? "text-emerald-600" : "text-slate-400"
                          }`}
                        >
                          <span className="shrink-0">{passed ? "\u2713" : "\u2022"}</span>
                          <span>{label}</span>
                        </p>
                      );
                    })}
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Confirm password</label>
                <div className="relative mt-1">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    name="confirmPassword"
                    placeholder="Re-enter password"
                    required
                    minLength={8}
                    value={confirmPasswordVal}
                    onChange={(e) => setConfirmPasswordVal(e.target.value)}
                    className="h-10 w-full rounded-lg border border-slate-200 px-3 pr-10 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                {confirmPasswordVal.length > 0 && (
                  <p
                    className={`mt-1.5 text-xs font-medium ${
                      passwordsMatch ? "text-emerald-600" : "text-red-600"
                    }`}
                  >
                    {passwordsMatch ? "Passwords match." : "Passwords do not match."}
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={!allPasswordChecksPass || !passwordsMatch}
                className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {hasPassword ? "Update Password" : "Set Password"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowPasswordForm(false);
                  setPasswordVal("");
                  setConfirmPasswordVal("");
                  setShowPassword(false);
                  setShowConfirmPassword(false);
                }}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Change Email Form */}
      {showEmailForm && (
        <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-700">
          <form action={emailAction} className="space-y-3">
            <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300 space-y-1">
              <p>
                <span className="font-semibold">Current email:</span> {activeEmail || "None"} (active for sign-in)
              </p>
              {userNewEmail && (
                <div className="mt-2 space-y-2 rounded-md bg-amber-50 p-2.5 text-amber-900 dark:bg-amber-950/20 dark:text-amber-300 border border-amber-200 dark:border-amber-900">
                  <p className="font-semibold text-xs">
                    Email change pending: {userNewEmail}
                  </p>
                  <p className="text-[11px] leading-4">
                    Please confirm the link sent to your new email address ({userNewEmail}).
                  </p>
                </div>
              )}
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Changing your email will keep your Google account linked.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">New email</label>
                <input
                  type="email"
                  name="newEmail"
                  placeholder="new@example.com"
                  required
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Confirm email</label>
                <input
                  type="email"
                  name="confirmEmail"
                  placeholder="Re-enter new email"
                  required
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 cursor-pointer"
              >
                Change Email
              </button>
              {userNewEmail && (
                <button
                  type="button"
                  onClick={() => {
                    const fd = new FormData();
                    resendAction(fd);
                  }}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Resend Confirmation
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowEmailForm(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function Banner({
  type,
  onDismiss,
  children,
}: {
  type: "success" | "error" | "conflict";
  onDismiss?: () => void;
  children: React.ReactNode;
}) {
  const styles = {
    success:
      "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
    error:
      "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300",
    conflict:
      "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300",
  };

  return (
    <div className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 ${styles[type]}`}>
      <div className="flex-1">{children}</div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-lg p-1 text-current opacity-60 hover:opacity-100"
          aria-label="Dismiss"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

function ProviderRowSkeleton() {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-700">
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-full" />
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      <Skeleton className="h-6 w-20 rounded-full" />
    </div>
  );
}

function ProviderRow({
  label,
  connected,
  detail,
  required,
  canUnlink,
  onUnlink,
  children,
}: {
  label: string;
  connected: boolean;
  detail?: string;
  required?: boolean;
  canUnlink?: boolean;
  onUnlink?: () => void;
  children?: React.ReactNode;
}) {
  const Icon = GoogleIcon;

  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-700">
      <div className="flex items-center gap-3">
        <div
          className={`flex size-10 items-center justify-center rounded-full ${
            connected
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
              : "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
          }`}
        >
          <Icon className="size-5" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{label}</p>
          {detail && <p className="text-xs text-slate-500 dark:text-slate-400">{detail}</p>}
          {children && <div className="mt-1">{children}</div>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {connected && canUnlink && (
          <form action={onUnlink}>
            <button
              type="submit"
              className="flex h-8 items-center gap-1 rounded-lg border border-red-200 px-3 text-xs font-semibold text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/50"
            >
              <Unlink className="size-3" />
              Unlink
            </button>
          </form>
        )}
        {connected && required && (
          <>
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
              <CheckCircle className="size-3" />
              Connected
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
              <AlertTriangle className="size-3" />
              Required
            </span>
          </>
        )}
        {connected && !required && (
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
            <CheckCircle className="size-3" />
            Connected
          </span>
        )}
        {!connected && (
          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            Not connected
          </span>
        )}
      </div>
    </div>
  );
}

function HelpText() {
  return (
    <div className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
      <p>
        <strong className="text-slate-700 dark:text-slate-300">Need help?</strong> If you signed up with email/password,
        you can link Google so you have more sign-in options.
        You can always unlink a provider as long as at least one other sign-in method remains.
      </p>
      <p className="mt-2">
        <strong className="text-slate-700 dark:text-slate-300">Required</strong> means this is your only current sign-in
        method. Add another provider or set a password before unlinking it.
      </p>
    </div>
  );
}
