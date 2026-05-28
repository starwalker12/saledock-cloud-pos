"use client";

import { useEffect, useState } from "react";
import { useActionState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  linkGoogleAccountAction,
  linkFacebookAccountAction,
  unlinkIdentityAction,
  type AuthState,
} from "@/app/(auth)/actions";
import { Link, Unlink, AlertTriangle, CheckCircle, Loader2 } from "lucide-react";

const initialState: AuthState = { error: null };

type IdentityProvider = {
  provider: string;
  id: string;
  created_at: string;
  last_sign_in_at: string | null;
  identity_data?: Record<string, unknown>;
};

export function ConnectedAccounts({ linkParam }: { linkParam?: string | null }) {
  const [identities, setIdentities] = useState<IdentityProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [unlinkState, unlinkAction] = useActionState(unlinkIdentityAction, initialState);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.identities) {
        setIdentities(user.identities as IdentityProvider[]);
      }
      setLoading(false);
    }
    load();
  }, []);

  const hasPassword = identities.some((id) => id.provider === "email");
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
            >
              {hasPassword && <p className="text-xs text-slate-400">Set during sign-up</p>}
            </ProviderRow>

            <ProviderRow
              label="Google"
              connected={!!googleIdentity}
              detail={googleIdentity?.identity_data?.email as string ?? undefined}
              canUnlink={!!googleIdentity && identities.length > 1}
              onUnlink={() => {
                const fd = new FormData();
                fd.append("provider", "google");
                unlinkAction(fd);
              }}
              locked={identities.length <= 1}
            >
              {!googleIdentity && (
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
              connected={!!facebookIdentity}
              detail={facebookIdentity?.identity_data?.email as string ?? undefined}
              canUnlink={!!facebookIdentity && identities.length > 1}
              onUnlink={() => {
                const fd = new FormData();
                fd.append("provider", "facebook");
                unlinkAction(fd);
              }}
              locked={identities.length <= 1}
            >
              {!facebookIdentity && (
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
  detail,
  canUnlink,
  onUnlink,
  locked,
  children,
}: {
  label: string;
  connected: boolean;
  detail?: string;
  canUnlink?: boolean;
  onUnlink?: () => void;
  locked?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
      <div className="flex items-center gap-3">
        <div
          className={`flex size-10 items-center justify-center rounded-full ${
            connected ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"
          }`}
        >
          {connected ? <CheckCircle className="size-5" /> : <AlertTriangle className="size-4" />}
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
        {connected && locked && <span className="text-xs text-slate-400">Required</span>}
        {!connected && <span className="text-xs text-slate-400">Not connected</span>}
      </div>
    </div>
  );
}
