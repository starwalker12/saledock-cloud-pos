import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSafeRedirectPath } from "@/lib/security/sanitize";

function safeRedirect(origin: string, next: string | null): string {
  if (next && isSafeRedirectPath(next)) {
    return `${origin}${next}`;
  }
  return `${origin}/dashboard`;
}

function renderResultPage(
  success: boolean,
  error: boolean,
  redirectUrl: string,
  inviteRedirectUrl?: string,
) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Email Confirmation - SaleDock</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
    }
  </script>
</head>
<body class="flex min-h-screen items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
  <div id="card" class="w-full max-w-md rounded-2xl border border-slate-200 bg-[#fff] p-6 text-center space-y-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
    <!-- Icon Container -->
    <div id="icon-container" class="mx-auto flex size-12 items-center justify-center rounded-full"></div>
    
    <div class="space-y-2">
      <h2 id="title" class="text-xl font-black text-slate-950 dark:text-white"></h2>
      <p id="message" class="text-sm text-slate-500 dark:text-slate-400 leading-relaxed"></p>
    </div>
    
    <a id="action-btn" href="/login" class="inline-flex h-11 w-full items-center justify-center rounded-xl bg-blue-700 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800">
      Go to Settings
    </a>
  </div>

  <script>
    const hash = window.location.hash;
    const search = window.location.search;
    const inviteRedirectUrl = ${JSON.stringify(inviteRedirectUrl ?? "")};
    
    if (localStorage.getItem('theme') === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
    }
    
    let hasError = ${error};
    let forwardedInvite = false;
    
    if (hash) {
      const params = new URLSearchParams(hash.replace('#', '?'));
      if (inviteRedirectUrl && params.get('type') === 'invite') {
        forwardedInvite = true;
        window.location.replace(inviteRedirectUrl + hash);
      }
      if (params.get('error') || params.get('error_code')) {
        hasError = true;
      }
    }
    
    if (!hasError && search) {
      const params = new URLSearchParams(search);
      if (params.get('error') || params.get('error_code')) {
        hasError = true;
      }
    }
    
    const titleEl = document.getElementById('title');
    const messageEl = document.getElementById('message');
    const iconContainer = document.getElementById('icon-container');
    const actionBtn = document.getElementById('action-btn');
    const redirectUrl = "${redirectUrl}";
    
    if (forwardedInvite) {
      titleEl.innerText = "Opening staff invite";
      messageEl.innerText = "Please wait while SaleDock opens this invite securely.";
      iconContainer.className = "mx-auto flex size-12 items-center justify-center rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300";
      iconContainer.innerHTML = '<svg class="size-6 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v3m0 12v3m9-9h-3M6 12H3m15.364-6.364-2.121 2.121M7.757 16.243l-2.121 2.121m12.728 0-2.121-2.121M7.757 7.757 5.636 5.636" /></svg>';
      actionBtn.innerText = "Opening invite...";
      actionBtn.href = inviteRedirectUrl;
    } else if (hasError) {
      titleEl.innerText = "Link Invalid or Expired";
      messageEl.innerText = "This confirmation link is invalid or has expired. Please request a new one from Settings → Connected Accounts.";
      iconContainer.className = "mx-auto flex size-12 items-center justify-center rounded-full bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-300";
      iconContainer.innerHTML = '<svg class="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>';
      actionBtn.innerText = "Back to Settings";
      actionBtn.href = redirectUrl;
    } else if (${success}) {
      titleEl.innerText = "Email Confirmed";
      messageEl.innerText = "Your email has been confirmed.";
      iconContainer.className = "mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300";
      iconContainer.innerHTML = '<svg class="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>';
      actionBtn.innerText = "Go to Settings";
      actionBtn.href = redirectUrl;
    } else {
      window.location.href = "/login";
    }
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html" },
  });
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next");
  const errorParam = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  const errorCode = url.searchParams.get("error_code");
  const type = url.searchParams.get("type");
  const tokenHash = url.searchParams.get("token_hash");
  const linkingParam = url.searchParams.get("linking");

  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
  const origin = forwardedHost ? `${forwardedProto}://${forwardedHost}` : url.origin;

  // ── Detect provider from redirectTo URL ───────────────────────────────────
  const providerHint = url.searchParams.get("provider");

  // Settings redirect fallback url
  const settingsUrl = `${origin}/settings?tab=accounts`;
  const inviteUrl = new URL("/auth/invite", origin);
  inviteUrl.searchParams.set("next", isSafeRedirectPath(next) ? next! : "/dashboard");

  if (type === "invite" && tokenHash) {
    // Preserve the app's invitation token if the callback URL included one.
    const appToken = url.searchParams.get("token");
    if (appToken) inviteUrl.searchParams.set("token", appToken);
    inviteUrl.searchParams.set("token_hash", tokenHash);
    inviteUrl.searchParams.set("type", "invite");
    return NextResponse.redirect(inviteUrl);
  }

  // ── Error handling ────────────────────────────────────────────────────────
  if (errorParam) {
    if (type === "invite") {
      inviteUrl.searchParams.set("error", errorParam);
      if (errorCode) inviteUrl.searchParams.set("error_code", errorCode);
      return NextResponse.redirect(inviteUrl);
    }

    const lower = errorParam.toLowerCase();

    // Check if this is an email change / OTP link error
    if (type === "email_change" || errorCode === "otp_expired" || lower.includes("otp") || lower.includes("expired") || lower.includes("link") || lower.includes("verification")) {
      return renderResultPage(false, true, settingsUrl);
    }

    // OAuth identity/email conflict
    if (lower.includes("email already registered") || lower.includes("email already exists") || lower.includes("identity conflict") || lower.includes("already linked")) {
      const redirectUrl = new URL("/settings?tab=accounts", origin);
      redirectUrl.searchParams.set("link", "conflict");
      if (providerHint) redirectUrl.searchParams.set("provider", providerHint);
      return NextResponse.redirect(redirectUrl);
    }

    // Linking flow error — redirect to settings with error banner
    if (linkingParam === "1") {
      const redirectUrl = new URL("/settings?tab=accounts", origin);
      redirectUrl.searchParams.set("link", "error");
      if (providerHint) redirectUrl.searchParams.set("provider", providerHint);
      return NextResponse.redirect(redirectUrl);
    }

    const loginUrl = new URL("/login", origin);

    // Generic OAuth error
    loginUrl.searchParams.set("error", "auth_callback_failed");
    return NextResponse.redirect(loginUrl);
  }

  // Handle client-side hash fragment check fallback
  if (!code) {
    // If we have hash parameters in the browser, client-side JS handles it.
    // Otherwise it will redirect back to login.
    return renderResultPage(false, false, settingsUrl, inviteUrl.toString());
  }

  // ── Exchange code for session ─────────────────────────────────────────────
  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    const msg = error.message.toLowerCase();

    if (type === "invite") {
      inviteUrl.searchParams.set("error", error.message);
      return NextResponse.redirect(inviteUrl);
    }

    if (type === "email_change" || msg.includes("expired") || msg.includes("otp") || msg.includes("link") || msg.includes("verification")) {
      return renderResultPage(false, true, settingsUrl);
    }

    if (linkingParam === "1") {
      const redirectUrl = new URL("/settings?tab=accounts", origin);
      redirectUrl.searchParams.set("link", "error");
      if (providerHint) redirectUrl.searchParams.set("provider", providerHint);
      return NextResponse.redirect(redirectUrl);
    }

    const loginUrl = new URL("/login", origin);

    if (msg.includes("email already registered") || msg.includes("email already exists") || msg.includes("identity conflict") || msg.includes("already linked")) {
      const redirectUrl = new URL("/settings?tab=accounts", origin);
      redirectUrl.searchParams.set("link", "conflict");
      return NextResponse.redirect(redirectUrl);
    }

    loginUrl.searchParams.set("error", "auth_callback_failed");
    return NextResponse.redirect(loginUrl);
  }

  // ── Account linking flow ──────────────────────────────────────────────────
  if (linkingParam === "1") {
    const redirectUrl = new URL("/settings?tab=accounts", origin);
    redirectUrl.searchParams.set("link", "success");
    if (providerHint) {
      redirectUrl.searchParams.set("provider", providerHint);
    }
    return NextResponse.redirect(redirectUrl);
  }

  // ── Email change success page ─────────────────────────────────────────────
  if (type === "email_change") {
    return renderResultPage(true, false, settingsUrl);
  }

  // ── Regular login flow: route to onboarding or dashboard ──────────────────
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", origin));
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id, onboarding_completed")
    .eq("id", user.id)
    .maybeSingle<{ organization_id: string | null; onboarding_completed: boolean | null }>();

  const needsOnboarding = !profile?.organization_id || !profile?.onboarding_completed;
  if (needsOnboarding) {
    return NextResponse.redirect(new URL("/onboarding", origin));
  }

  return NextResponse.redirect(safeRedirect(origin, next));
}
