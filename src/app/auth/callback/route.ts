import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

function safeRedirect(origin: string, next: string | null): string {
  if (next && next.startsWith("/") && !next.startsWith("//")) {
    return `${origin}${next}`;
  }
  return `${origin}/dashboard`;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next");
  const errorParam = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  const linkingParam = url.searchParams.get("linking");

  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
  const origin = forwardedHost ? `${forwardedProto}://${forwardedHost}` : url.origin;

  // ── Detect provider from redirectTo URL ───────────────────────────────────
  const providerHint = url.searchParams.get("provider");

  // ── Error handling ────────────────────────────────────────────────────────
  if (errorParam) {
    const lower = errorParam.toLowerCase();

    // OAuth identity/email conflict
    if (lower.includes("email already registered") || lower.includes("email already exists") || lower.includes("identity conflict") || lower.includes("already linked")) {
      const settingsUrl = new URL("/settings?tab=accounts", origin);
      settingsUrl.searchParams.set("link", "conflict");
      if (providerHint) settingsUrl.searchParams.set("provider", providerHint);
      return NextResponse.redirect(settingsUrl);
    }

    // Linking flow error — redirect to settings with error banner
    if (linkingParam === "1") {
      const settingsUrl = new URL("/settings?tab=accounts", origin);
      settingsUrl.searchParams.set("link", "error");
      if (providerHint) settingsUrl.searchParams.set("provider", providerHint);
      return NextResponse.redirect(settingsUrl);
    }

    const loginUrl = new URL("/login", origin);

    // Generic OAuth error
    loginUrl.searchParams.set("error", "auth_callback_failed");
    return NextResponse.redirect(loginUrl);
  }

  if (!code) {
    return NextResponse.redirect(new URL("/login", origin));
  }

  // ── Exchange code for session ─────────────────────────────────────────────
  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    const msg = error.message.toLowerCase();

    if (linkingParam === "1") {
      const settingsUrl = new URL("/settings?tab=accounts", origin);
      settingsUrl.searchParams.set("link", "error");
      if (providerHint) settingsUrl.searchParams.set("provider", providerHint);
      return NextResponse.redirect(settingsUrl);
    }

    const loginUrl = new URL("/login", origin);

    if (msg.includes("email already registered") || msg.includes("email already exists") || msg.includes("identity conflict") || msg.includes("already linked")) {
      const settingsUrl = new URL("/settings?tab=accounts", origin);
      settingsUrl.searchParams.set("link", "conflict");
      return NextResponse.redirect(settingsUrl);
    }

    loginUrl.searchParams.set("error", "auth_callback_failed");
    return NextResponse.redirect(loginUrl);
  }

  // ── Account linking flow ──────────────────────────────────────────────────
  if (linkingParam === "1") {
    const settingsUrl = new URL("/settings?tab=accounts", origin);
    settingsUrl.searchParams.set("link", "success");
    if (providerHint) {
      settingsUrl.searchParams.set("provider", providerHint);
    }
    return NextResponse.redirect(settingsUrl);
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
