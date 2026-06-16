"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { AlertTriangle, CheckCircle, Loader2, MailCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { recordStaffInviteAcceptedAction } from "./actions";

type InviteStatus = "loading" | "success" | "error";

const EXPIRED_INVITE_MESSAGE =
  "This invite link has expired. Ask the shop owner to resend the invite.";

function isSafeRedirectPath(value: string | null): value is string {
  return Boolean(value && /^\/(?!\/)[a-zA-Z0-9/._-]*$/.test(value));
}

function friendlyInviteError(message: string | null | undefined): string {
  const lower = (message ?? "").toLowerCase();
  if (
    lower.includes("expired") ||
    lower.includes("invalid") ||
    lower.includes("otp") ||
    lower.includes("token") ||
    lower.includes("link")
  ) {
    return EXPIRED_INVITE_MESSAGE;
  }
  return "We could not accept this invite. Ask the shop owner to resend it.";
}

function hashParams(): URLSearchParams {
  if (typeof window === "undefined") return new URLSearchParams();
  return new URLSearchParams(window.location.hash.replace(/^#/, ""));
}

function InviteCard({
  status,
  message,
  onBackToLogin,
}: {
  status: InviteStatus;
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
          {isLoading ? "Accepting invite..." : isSuccess ? "Invite accepted" : "Invite link expired"}
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
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const nextPath = useMemo(
    () => (isSafeRedirectPath(searchParams.get("next")) ? searchParams.get("next")! : "/dashboard"),
    [searchParams],
  );
  const [status, setStatus] = useState<InviteStatus>("loading");
  const [message, setMessage] = useState("Please wait while SaleDock verifies this staff invite.");

  useEffect(() => {
    let active = true;

    async function acceptInvite() {
      const supabase = createClient();
      const hash = hashParams();
      const errorMessage =
        searchParams.get("error_description") ??
        searchParams.get("error") ??
        hash.get("error_description") ??
        hash.get("error");

      if (errorMessage) {
        if (!active) return;
        setStatus("error");
        setMessage(friendlyInviteError(errorMessage));
        return;
      }

      const hashAccessToken = hash.get("access_token");
      const hashRefreshToken = hash.get("refresh_token");
      const hashType = hash.get("type");

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
          } else {
            const result = await supabase.auth.setSession({
              access_token: hashAccessToken,
              refresh_token: hashRefreshToken,
            });
            authError = result.error;
          }
        } else {
          authError = { message: "The invite link is missing verification details." };
        }

        if (authError) {
          if (!active) return;
          setStatus("error");
          setMessage(friendlyInviteError(authError.message));
          return;
        }

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          if (!active) return;
          setStatus("error");
          setMessage("The invite was verified, but SaleDock could not start a signed-in session. Please ask the shop owner to resend the invite.");
          return;
        }

        await recordStaffInviteAcceptedAction().catch(() => undefined);

        if (!active) return;
        setStatus("success");
        setMessage("Your staff invite has been accepted. Opening the shop dashboard now.");
        window.setTimeout(() => router.replace(nextPath), 700);
      } catch {
        if (!active) return;
        setStatus("error");
        setMessage(EXPIRED_INVITE_MESSAGE);
      }
    }

    acceptInvite();

    return () => {
      active = false;
    };
  }, [code, nextPath, router, searchParams, tokenHash, type]);

  return (
    <InviteCard
      status={status}
      message={message}
      onBackToLogin={() => router.push("/login")}
    />
  );
}

function InviteLoadingFallback() {
  return (
    <InviteCard
      status="loading"
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
