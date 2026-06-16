"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { AlertTriangle, CheckCircle, Loader2, MailCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { recordStaffInviteAcceptedAction } from "./actions";

type InviteStatus = "loading" | "success" | "error";

type InviteView = {
  status: InviteStatus;
  title: string;
  message: string;
};

const EXPIRED_INVITE_MESSAGE =
  "This invite link has expired. Ask the shop owner to resend the invite.";

function isSafeRedirectPath(value: string | null): value is string {
  return Boolean(value && /^\/(?!\/)[a-zA-Z0-9/._-]*$/.test(value));
}

function friendlyInviteError(message: string | null | undefined): InviteView {
  const lower = (message ?? "").toLowerCase();
  if (
    lower.includes("expired") ||
    lower.includes("invalid") ||
    lower.includes("otp") ||
    lower.includes("token") ||
    lower.includes("link")
  ) {
    return {
      status: "error",
      title: "Invite link expired",
      message: EXPIRED_INVITE_MESSAGE,
    };
  }
  return {
    status: "error",
    title: "Invite could not be opened",
    message: "We could not accept this invite. Ask the shop owner to resend it.",
  };
}

function hashParams(): URLSearchParams {
  if (typeof window === "undefined") return new URLSearchParams();
  return new URLSearchParams(window.location.hash.replace(/^#/, ""));
}

function clearInviteHash() {
  if (typeof window === "undefined" || !window.location.hash) return;
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
}

function decodeJwtSubject(token: string | null): string | null {
  if (!token || typeof window === "undefined") return null;
  const [, payload] = token.split(".");
  if (!payload) return null;

  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const decoded = JSON.parse(window.atob(padded)) as { sub?: unknown };
    return typeof decoded.sub === "string" ? decoded.sub : null;
  } catch {
    return null;
  }
}

async function currentSessionUserId(supabase: ReturnType<typeof createClient>): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user.id ?? null;
}

function InviteCard({
  status,
  title,
  message,
  onBackToLogin,
}: {
  status: InviteStatus;
  title: string;
  message: string;
  onBackToLogin: () => void;
}) {
  const isLoading = status === "loading";
  const isSuccess = status === "success";

  return (
    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-[#fff] p-6 text-center shadow-xl dark:border-slate-800 dark:bg-slate-900">
      <div
        className={`mx-auto flex size-14 items-center justify-center rounded-full ${
          isLoading
            ? "bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400"
            : isSuccess
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
              : "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-300"
        }`}
      >
        {isLoading ? (
          <Loader2 className="size-7 animate-spin" />
        ) : isSuccess ? (
          <CheckCircle className="size-7" />
        ) : (
          <AlertTriangle className="size-7" />
        )}
      </div>

      <div className="mt-5 space-y-2">
        <h1 className="text-xl font-black text-slate-950 dark:text-white">
          {title}
        </h1>
        <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">
          {message}
        </p>
      </div>

      {status === "error" && (
        <button
          type="button"
          onClick={onBackToLogin}
          className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-xl bg-blue-700 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800"
        >
          Back to sign in
        </button>
      )}
    </div>
  );
}

function InviteAcceptContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const processedRef = useRef(false);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const nextPath = useMemo(
    () => (isSafeRedirectPath(searchParams.get("next")) ? searchParams.get("next")! : "/dashboard"),
    [searchParams],
  );
  const [view, setView] = useState<InviteView>({
    status: "loading",
    title: "Accepting invite...",
    message: "Please wait while SaleDock verifies this staff invite.",
  });

  useEffect(() => {
    if (processedRef.current) return;
    processedRef.current = true;

    let active = true;

    const showView = (nextView: InviteView) => {
      if (!active) return;
      setView(nextView);
    };

    const showFriendlyError = (message: string | null | undefined) => {
      showView(friendlyInviteError(message));
    };

    const finishAcceptedInvite = async (successMessage: string) => {
      const result = await recordStaffInviteAcceptedAction();
      if (!result.ok) {
        showView({
          status: "error",
          title: "Invite needs help",
          message: result.message,
        });
        return;
      }

      showView({
        status: "success",
        title: "Invite accepted",
        message: successMessage,
      });
      window.setTimeout(() => {
        if (active) router.replace(nextPath);
      }, 700);
    };

    async function acceptInvite() {
      const hash = hashParams();
      const errorMessage =
        searchParams.get("error_description") ??
        searchParams.get("error") ??
        hash.get("error_description") ??
        hash.get("error");

      if (errorMessage) {
        showFriendlyError(errorMessage);
        return;
      }

      const hashAccessToken = hash.get("access_token");
      const hashRefreshToken = hash.get("refresh_token");
      const hashType = hash.get("type");
      const hashUserId = decodeJwtSubject(hashAccessToken);
      const hasInviteHashTokens = Boolean(hashAccessToken && hashRefreshToken);
      if (hasInviteHashTokens) clearInviteHash();
      const supabase = createClient();

      try {
        let authError: { message: string } | null = null;

        if (code) {
          const result = await supabase.auth.exchangeCodeForSession(code);
          authError = result.error;
        } else if (tokenHash) {
          if (type && type !== "invite") {
            authError = { message: "This is not a staff invite link." };
          } else {
            const result = await supabase.auth.verifyOtp({
              token_hash: tokenHash,
              type: "invite" as EmailOtpType,
            });
            authError = result.error;
          }
        } else if (hashAccessToken && hashRefreshToken) {
          if (hashType && hashType !== "invite") {
            authError = { message: "This is not a staff invite link." };
          } else if (!hashUserId) {
            authError = { message: "The invite link has an invalid token." };
          } else if (hashUserId && (await currentSessionUserId(supabase)) === hashUserId) {
            await finishAcceptedInvite("Your staff invite has been accepted. Opening the shop dashboard now.");
            return;
          } else {
            const result = await supabase.auth.setSession({
              access_token: hashAccessToken,
              refresh_token: hashRefreshToken,
            });
            authError = result.error;
          }
        } else {
          const existingUserId = await currentSessionUserId(supabase);
          if (existingUserId) {
            await finishAcceptedInvite("You are already signed in. Opening the shop dashboard now.");
            return;
          }
          showView({
            status: "error",
            title: "Invite already used",
            message: "This invite may have already been used. Please sign in, or ask the shop owner to resend it.",
          });
          return;
        }

        if (authError) {
          if (hashUserId && (await currentSessionUserId(supabase)) === hashUserId) {
            await finishAcceptedInvite("Your staff invite has been accepted. Opening the shop dashboard now.");
            return;
          }
          showFriendlyError(authError.message);
          return;
        }

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          showView({
            status: "error",
            title: "Invite needs help",
            message: "The invite was verified, but SaleDock could not start a signed-in session. Please ask the shop owner to resend the invite.",
          });
          return;
        }

        await finishAcceptedInvite("Your staff invite has been accepted. Opening the shop dashboard now.");
      } catch {
        showView({
          status: "error",
          title: "Invite link expired",
          message: EXPIRED_INVITE_MESSAGE,
        });
      }
    }

    acceptInvite();

    return () => {
      active = false;
    };
  }, [code, nextPath, router, searchParams, tokenHash, type]);

  return (
    <InviteCard
      status={view.status}
      title={view.title}
      message={view.message}
      onBackToLogin={() => router.push("/login")}
    />
  );
}

function InviteLoadingFallback() {
  return (
    <InviteCard
      status="loading"
      title="Accepting invite..."
      message="Please wait while SaleDock verifies this staff invite."
      onBackToLogin={() => undefined}
    />
  );
}

export default function InviteAcceptPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
      <div className="absolute top-6 flex items-center gap-2 text-sm font-black text-slate-700 dark:text-slate-200">
        <MailCheck className="size-5 text-blue-600 dark:text-blue-400" />
        SaleDock staff invite
      </div>
      <Suspense fallback={<InviteLoadingFallback />}>
        <InviteAcceptContent />
      </Suspense>
    </main>
  );
}
