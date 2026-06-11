import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSafeRedirectPath } from "@/lib/security/sanitize";
import type { EmailOtpType } from "@supabase/supabase-js";

function safeRedirect(origin: string, next: string | null): string {
  if (next && isSafeRedirectPath(next)) {
    return `${origin}${next}`;
  }
  return `${origin}/dashboard`;
}

function renderResultPage(success: boolean, error: boolean, redirectUrl: string) {
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
    
    if (localStorage.getItem('theme') === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
    }
    
    let hasError = ${error};
    
    if (hash) {
      const params = new URLSearchParams(hash.replace('#', '?'));
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
    
    if (hasError) {
      titleEl.innerText = "Link Invalid or Expired";
      messageEl.innerText = "This confirmation link is invalid or has expired. Please request a new one from Settings → Connected Accounts.";
      iconContainer.className = "mx-auto flex size-12 items-center justify-center rounded-full bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-300";
      iconContainer.innerHTML = '<svg class="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>';
      actionBtn.innerText = "Back to Settings";
      actionBtn.href = redirectUrl;
    } else if (${success}) {
      titleEl.innerText = "Email Confirmed";
      messageEl.innerText = "Your email has been confirmed successfully.";
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
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = url.searchParams.get("next");

  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
  const origin = forwardedHost ? `${forwardedProto}://${forwardedHost}` : url.origin;

  const settingsUrl = `${origin}/settings?tab=accounts`;

  if (!tokenHash || !type) {
    return renderResultPage(false, true, settingsUrl);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    type,
    token_hash: tokenHash,
  });

  if (error) {
    console.error("[security] verifyOtp failed:", error.message);
    return renderResultPage(false, true, settingsUrl);
  }

  if (type === "recovery") {
    return NextResponse.redirect(safeRedirect(origin, next || "/onboarding"));
  }

  return renderResultPage(true, false, settingsUrl);
}
