"use client";

import { useEffect, useState } from "react";
import { useActionState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  linkGoogleAccountAction,
  linkFacebookAccountAction,
  unlinkIdentityAction,
  setPasswordAction,
  type AuthState,
} from "@/app/(auth)/actions";
import { Link, Unlink, AlertTriangle, Loader2, CheckCircle } from "lucide-react";
import { getLinkedProviders, type LinkedProviders } from "@/lib/auth/identities";
import { GoogleIcon, FacebookIcon, PasswordIcon } from "@/components/icons/provider-icons";

const initialState: AuthState = { error: null };
const passwordInitialState: AuthState = { error: null };

type IdentityProvider = {
  provider: string;
  id: string;
  created_at: string;
  last_sign_in_at: string | null;
  identity_data?: Record<string, unknown>;
};

export function ConnectedAccounts({
  linkParam,
  linkedProviders: initialLinkedProviders,
}: {
  linkParam?: string | null;
  linkedProviders: LinkedProviders;
}) {
  const [identities, setIdentities] = useState<IdentityProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [serverProviders, setServerProviders] = useState<LinkedProviders>(initialLinkedProviders);
  const [unlinkState, unlinkAction] = useActionState(unlinkIdentityAction, initialState);
  const [passwordState, passwordAction] = useActionState(setPasswordAction, passwordInitialState);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const providers = getLinkedProviders(user);
        setServerProviders(providers);
        if (user.identities) {
          setIdentities(user.identities as IdentityProvider[]);
        }
      }
      setLoading(false);
    }
    load();
  }, [unlinkState, passwordState]);

  const { hasPassword, hasGoogle, hasFacebook, identityCount } = serverProviders;
  const googleIdentity = identities.find((id) => id.provider === "google");
  const facebookIdentity = identities.find((id) => id.provider === "facebook");

  const linkMessage =
    linkParam === "success"
      ? "Account linked successfully."
      : linkParam === "conflict"
        ? "This email is already used by another sign-in method. Sign in with your original method first, then link this provider from Profile Settings."
        : null;

  const linkMessageType =
    linkParam === "success" ? "success" : linkParam === "conflict" ? "error" : null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div>
        <h2 className="text-lg font-black text-slate-950">Connected Accounts</h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          Link Google or Facebook so you can sign in using either provider. For security,
          sign in with your existing account first before linking a new provider.
        </p>
      </div>

      <div className="mt-5 space-y-4">
        {linkMessage && (
          <div
            className={`rounded-xl border px-4 py-3 text-sm font-medium ${
              linkMessageType === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-red-200 bg-red-50 text-red-800"
            }`}
          >
            {linkMessage}
          </div>
        )}

        {unlinkState.error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
            {unlinkState.error}
          </div>
        )}
        {unlinkState.success && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
            {unlinkState.success}
          </div>
        )}
        {passwordState.error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
            {passwordState.error}
          </div>
        )}
        {passwordState.success && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
            {passwordState.success}
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="size-4 animate-spin" />
            Loading connected accounts...
          </div>
        )}

        {!loading && (
          <>
            <ProviderRow
              label="Email / Password"
              connected={hasPassword}
              provider="email"
              locked={identityCount <= 1 && hasPassword}
            >
              {hasPassword && <p className="text-xs text-slate-400">Connected</p>}
              {!hasPassword && (
                <div className="mt-2">
                  <details className="group">
                    <summary className="cursor-pointer text-xs font-semibold text-blue-600 hover:text-blue-700">
                      Set password
                    </summary>
                    <form action={passwordAction} className="mt-2 space-y-2">
                      <input
                        type="password"
                        name="password"
                        placeholder="New password"
                        required
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <input
                        type="password"
                        name="confirmPassword"
                        placeholder="Confirm password"
                        required
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        type="submit"
                        className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                      >
                        Set Password
                      </button>
                    </form>
                  </details>
                </div>
              )}
            </ProviderRow>

            <ProviderRow
              label="Google"
              connected={hasGoogle}
              provider="google"
              detail={googleIdentity?.identity_data?.email as string ?? undefined}
              canUnlink={hasGoogle && identityCount > 1}
              onUnlink={() => {
                const fd = new FormData();
                fd.append("provider", "google");
                unlinkAction(fd);
              }}
              locked={identityCount <= 1 && hasGoogle}
            >
              {!hasGoogle && (
                <form action={async (fd: FormData) => { await linkGoogleAccountAction(initialState, fd); }}>
                  <button
                    type="submit"
                    className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    <Link className="size-3.5" />
                    Link Google Account
                  </button>
                </form>
              )}
            </ProviderRow>

            <ProviderRow
              label="Facebook"
              connected={hasFacebook}
              provider="facebook"
              detail={facebookIdentity?.identity_data?.email as string ?? undefined}
              canUnlink={hasFacebook && identityCount > 1}
              onUnlink={() => {
                const fd = new FormData();
                fd.append("provider", "facebook");
                unlinkAction(fd);
              }}
              locked={identityCount <= 1 && hasFacebook}
            >
              {!hasFacebook && (
                <form action={async (fd: FormData) => { await linkFacebookAccountAction(initialState, fd); }}>
                  <button
                    type="submit"
                    className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    <Link className="size-3.5" />
                    Link Facebook Account
                  </button>
                </form>
              )}
            </ProviderRow>

            <div className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500">
              <p>
                <strong className="text-slate-700">Need help?</strong> If you signed up with email/password,
                you can link Google or Facebook so you have more sign-in options.
                You can always unlink a provider as long as at least one other sign-in method remains.
              </p>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function ProviderRow({
  label,
  connected,
  provider,
  detail,
  canUnlink,
  onUnlink,
  locked,
  children,
}: {
  label: string;
  connected: boolean;
  provider: string;
  detail?: string;
  canUnlink?: boolean;
  onUnlink?: () => void;
  locked?: boolean;
  children?: React.ReactNode;
}) {
  const Icon = provider === "email" ? PasswordIcon : provider === "google" ? GoogleIcon : FacebookIcon;

  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
      <div className="flex items-center gap-3">
        <div
          className={`flex size-10 items-center justify-center rounded-full ${
            locked && connected
              ? "bg-amber-100 text-amber-600"
              : connected
                ? "bg-emerald-100 text-emerald-700"
                : "bg-slate-100 text-slate-400"
          }`}
        >
          {locked && connected ? (
            <AlertTriangle className="size-5" />
          ) : (
            <Icon className="size-5" />
          )}
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-800">{label}</p>
          {detail && <p className="text-xs text-slate-500">{detail}</p>}
          {children && <div className="mt-1">{children}</div>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {connected && canUnlink && (
          <form action={onUnlink}>
            <button
              type="submit"
              className="flex h-8 items-center gap-1 rounded-lg border border-red-200 px-3 text-xs font-semibold text-red-600 hover:bg-red-50"
            >
              <Unlink className="size-3" />
              Unlink
            </button>
          </form>
        )}
        {connected && locked && (
          <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">
            <AlertTriangle className="size-3" />
            Required
          </span>
        )}
        {connected && !locked && (
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">
            <CheckCircle className="size-3" />
            Connected
          </span>
        )}
        {!connected && (
          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-500">
            Not connected
          </span>
        )}
      </div>
    </div>
  );
}
