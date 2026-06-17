"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, CheckCircle, Loader2, MailCheck, Building2, UserCircle, ShieldCheck, MapPin } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Recaptcha } from "@/components/auth/recaptcha";
import {
  acceptStaffInviteAction,
  declineStaffInviteAction,
  getStaffInviteByTokenAction,
  type StaffInvitation,
} from "@/app/users/invite-actions";

type InvitePageStatus = "loading" | "view" | "accepting" | "accepted" | "declined" | "error";

function hashParams(): URLSearchParams {
  if (typeof window === "undefined") return new URLSearchParams();
  return new URLSearchParams(window.location.hash.replace(/^#/, ""));
}

function clearInviteHash() {
  if (typeof window === "undefined" || !window.location.hash) return;
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
}

function InviteCard({
  status,
  title,
  message,
  children,
}: {
  status: InvitePageStatus;
  title: string;
  message: string;
  children?: React.ReactNode;
}) {
  const isLoading = status === "loading" || status === "accepting";
  const isSuccess = status === "accepted";
  const isError = status === "error";

  return (
    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-[#fff] p-6 text-center shadow-xl dark:border-slate-800 dark:bg-slate-900">
      <div
        className={`mx-auto flex size-14 items-center justify-center rounded-full ${
          isLoading
            ? "bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400"
            : isSuccess
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
              : isError
                ? "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-300"
                : "bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400"
        }`}
      >
        {isLoading ? (
          <Loader2 className="size-7 animate-spin" />
        ) : isSuccess ? (
          <CheckCircle className="size-7" />
        ) : isError ? (
          <AlertTriangle className="size-7" />
        ) : (
          <MailCheck className="size-7" />
        )}
      </div>

      <div className="mt-5 space-y-2">
        <h1 className="text-xl font-black text-slate-950 dark:text-white">{title}</h1>
        <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">{message}</p>
      </div>

      {children && <div className="mt-6 space-y-4">{children}</div>}
    </div>
  );
}

function PermissionSummary({ role }: { role: StaffInvitation["role"] }) {
  const summaries: Record<StaffInvitation["role"], string> = {
    owner: "Full shop access. Can manage staff, settings, billing, and all data.",
    admin: "Can manage staff, settings, and most shop data. Cannot remove the owner.",
    manager: "Can sell, manage stock, view reports, and process returns within assigned branch.",
    cashier: "Can make sales and process basic transactions within assigned branch.",
    technician: "Can view and update repair jobs assigned to them.",
  };
  return <p className="text-sm text-slate-600 dark:text-slate-400">{summaries[role] ?? "Shop access based on role and branch."}</p>;
}

function AcceptForm({
  onAccepted,
  onError,
}: {
  onAccepted: () => void;
  onError: (message: string) => void;
}) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const recaptchaResetRef = useRef<(() => void) | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (!token) {
      onError("Invite link is missing. Ask the shop owner to resend the invite.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await acceptStaffInviteAction(token, {
        password,
        confirmPassword,
        recaptchaToken: captchaToken,
      });
      if (result.ok) {
        onAccepted();
      } else {
        onError(result.error);
        recaptchaResetRef.current?.();
        setCaptchaToken(null);
      }
    } catch {
      onError("Something went wrong. Please try again.");
      recaptchaResetRef.current?.();
      setCaptchaToken(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4 text-left">
      <div className="space-y-2">
        <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">Create password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          className="h-11 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-[#fff] dark:bg-slate-900 px-3 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-blue-600 dark:focus:border-blue-500"
          placeholder="Enter a secure password"
        />
      </div>
      <div className="space-y-2">
        <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">Confirm password</label>
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          minLength={8}
          className="h-11 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-[#fff] dark:bg-slate-900 px-3 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-blue-600 dark:focus:border-blue-500"
          placeholder="Re-enter your password"
        />
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Password must be at least 8 characters with uppercase, lowercase, number, and special character.
      </p>
      <div className="flex justify-center py-2">
        <Recaptcha onChange={setCaptchaToken} resetRef={recaptchaResetRef} />
      </div>
      <button
        type="submit"
        disabled={isSubmitting || !captchaToken}
        className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-blue-700 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800 disabled:opacity-60"
      >
        {isSubmitting ? "Accepting..." : "Accept invitation & create account"}
      </button>
    </form>
  );
}

function InviteAcceptContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<InvitePageStatus>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [invite, setInvite] = useState<StaffInvitation | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const settledRef = useRef(false);

  useEffect(() => {
    if (settledRef.current) return;

    const abortController = new AbortController();
    const signal = abortController.signal;

    async function load() {
      if (!token) {
        if (!signal.aborted) {
          settledRef.current = true;
          setStatus("error");
          setErrorMessage("This invite link is missing its token. Ask the shop owner to resend the invite.");
        }
        return;
      }

      // If Supabase appended session tokens in the hash (from invite email), set session first.
      const hash = hashParams();
      const hashAccessToken = hash.get("access_token");
      const hashRefreshToken = hash.get("refresh_token");
      const hashType = hash.get("type");
      const hasInviteHashTokens = Boolean(hashAccessToken && hashRefreshToken);
      if (hasInviteHashTokens) clearInviteHash();

      const supabase = createClient();
      if (hasInviteHashTokens) {
        if (hashType && hashType !== "invite") {
          if (!signal.aborted) {
            settledRef.current = true;
            setStatus("error");
            setErrorMessage("This is not a staff invite link.");
          }
          return;
        }
        const { error } = await supabase.auth.setSession({
          access_token: hashAccessToken!,
          refresh_token: hashRefreshToken!,
        });
        if (error && !signal.aborted) {
          settledRef.current = true;
          setStatus("error");
          setErrorMessage("The invite session could not be started. Ask the shop owner to resend the invite.");
          return;
        }
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user.email && !signal.aborted) {
        setSessionEmail(session.user.email);
      }

      const result = await getStaffInviteByTokenAction(token);
      if (signal.aborted) return;

      if (!result.ok) {
        settledRef.current = true;
        setStatus("error");
        setErrorMessage(result.error);
        return;
      }

      setInvite(result.invite);
      settledRef.current = true;
      setStatus("view");
    }

    load();

    return () => {
      abortController.abort();
    };
  }, [token]);

  const handleDecline = async () => {
    if (!token || !invite) return;
    setStatus("accepting");
    const result = await declineStaffInviteAction(token);
    if (result.ok) {
      setStatus("declined");
    } else {
      setStatus("error");
      setErrorMessage(result.error);
    }
  };

  const handleAccepted = () => {
    setStatus("accepted");
    window.setTimeout(() => {
      router.replace("/login?invite_accepted=1");
    }, 1200);
  };

  const emailMismatch = Boolean(sessionEmail && invite && sessionEmail.toLowerCase() !== invite.email.toLowerCase());

  if (status === "loading" || status === "accepting") {
    return (
      <InviteCard
        status={status}
        title="Opening invite..."
        message="Please wait while SaleDock verifies this staff invitation."
      />
    );
  }

  if (status === "error") {
    return (
      <InviteCard status={status} title="Invite could not be opened" message={errorMessage}>
        <button
          type="button"
          onClick={() => router.push("/login")}
          className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-blue-700 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800"
        >
          Back to sign in
        </button>
      </InviteCard>
    );
  }

  if (status === "declined") {
    return (
      <InviteCard
        status={status}
        title="Invitation declined"
        message="You declined this invitation. Ask the shop owner to send a new invite if this was a mistake."
      >
        <button
          type="button"
          onClick={() => router.push("/login")}
          className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-blue-700 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800"
        >
          Back to sign in
        </button>
      </InviteCard>
    );
  }

  if (status === "accepted") {
    return (
      <InviteCard
        status={status}
        title="Welcome to the team"
        message="Your staff invitation has been accepted. Opening the shop dashboard now."
      />
    );
  }

  if (!invite) {
    return (
      <InviteCard
        status="error"
        title="Invite could not be opened"
        message="We could not load this invitation. Ask the shop owner to resend the invite."
      />
    );
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-[#fff] p-6 text-center shadow-xl dark:border-slate-800 dark:bg-slate-900">
      <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400">
        <Building2 className="size-7" />
      </div>

      <div className="mt-5 space-y-2">
        <h1 className="text-xl font-black text-slate-950 dark:text-white">Accept staff invitation</h1>
        <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">
          You have been invited to join:
        </p>
        <p className="text-lg font-bold text-slate-950 dark:text-white">{invite.organization_name}</p>
      </div>

      <div className="mt-6 space-y-3 text-left">
        <div className="flex items-start gap-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3">
          <UserCircle className="size-5 shrink-0 text-slate-500 dark:text-slate-400" />
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Invited by</p>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{invite.invited_by_name ?? "Shop owner"}</p>
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3">
          <ShieldCheck className="size-5 shrink-0 text-slate-500 dark:text-slate-400" />
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Role</p>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 capitalize">{invite.role}</p>
            <PermissionSummary role={invite.role} />
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3">
          <MapPin className="size-5 shrink-0 text-slate-500 dark:text-slate-400" />
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Branch</p>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{invite.branch_name ?? "Main branch / all branches"}</p>
          </div>
        </div>
      </div>

      {emailMismatch && (
        <div className="mt-4 rounded-xl border border-amber-200 dark:border-amber-900/30 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          You are signed in as {sessionEmail}, but this invite is for {invite.email}. Please sign out and open the invite link while signed in as {invite.email}, or ask the owner to resend the invite to {sessionEmail}.
        </div>
      )}

      <div className="mt-6 space-y-3">
        {!emailMismatch && (
          <>
            <AcceptForm onAccepted={handleAccepted} onError={(msg) => { setStatus("error"); setErrorMessage(msg); }} />
            <hr className="border-slate-200 dark:border-slate-800" />
            <button
              type="button"
              onClick={handleDecline}
              className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent text-sm font-bold text-slate-700 dark:text-slate-300 transition hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Decline invitation
            </button>
          </>
        )}
        {emailMismatch && (
          <button
            type="button"
            onClick={() => router.push("/login")}
            className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-blue-700 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800"
          >
            Go to sign in
          </button>
        )}
      </div>
    </div>
  );
}

function InviteLoadingFallback() {
  return (
    <InviteCard
      status="loading"
      title="Opening invite..."
      message="Please wait while SaleDock verifies this staff invitation."
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
