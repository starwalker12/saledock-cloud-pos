"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { sanitizePlainText } from "@/lib/security/sanitize";
import { verifyRecaptchaToken } from "@/lib/security/recaptcha";

const credentialsSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

const signUpSchema = credentialsSchema.extend({
  fullName: z.string().min(2, "Enter your full name."),
});

const resetSchema = z.object({
  email: z.string().email("Enter a valid email address."),
});

export type AuthState = { error: string | null; info?: string | null; success?: string | null };

function configError(): AuthState {
  return {
    error:
      "Supabase is not configured yet. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local.",
  };
}

async function publicOrigin(): Promise<string> {
  const h = await headers();
  const forwardedHost = h.get("x-forwarded-host");
  const forwardedProto = h.get("x-forwarded-proto") ?? "https";
  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`;
  const host = h.get("host");
  return host ? `${forwardedProto}://${host}` : "http://localhost:3000";
}

// Where to land an authenticated user when we don't know if they have a shop yet.
// The callback route does the actual onboarding-vs-dashboard branching.
const POST_AUTH_PATH = "/auth/callback?next=%2Fdashboard";

export async function signInAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if (!env.isSupabaseConfigured) return configError();

  const recaptchaToken = formData.get("recaptchaToken") as string | null;
  const recaptchaResult = await verifyRecaptchaToken(recaptchaToken);
  if (!recaptchaResult.success) {
    return { error: recaptchaResult.error ?? "Security check failed." };
  }

  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    // Keep error message neutral — do not reveal whether email exists
    return { error: "Invalid email or password." };
  }

  redirect("/auth/callback?next=%2Fdashboard");
}

export async function signUpAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if (!env.isSupabaseConfigured) return configError();

  const recaptchaToken = formData.get("recaptchaToken") as string | null;
  const recaptchaResult = await verifyRecaptchaToken(recaptchaToken);
  if (!recaptchaResult.success) {
    return { error: recaptchaResult.error ?? "Security check failed." };
  }

  // Enforce public_signup_enabled platform setting server-side
  try {
    const { getPublicPlatformSetting } = await import("@/lib/platform/admin");
    const raw = await getPublicPlatformSetting("public_signup_enabled");
    const enabled = raw !== false && raw !== "false" && raw !== null;
    if (!enabled) {
      return { error: "New account registration is currently disabled. Contact the platform administrator." };
    }
  } catch {
    return { error: "Could not verify registration settings. Try again later." };
  }

  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    fullName: formData.get("fullName"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const origin = await publicOrigin();

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: sanitizePlainText(parsed.data.fullName, 200) },
      emailRedirectTo: `${origin}${POST_AUTH_PATH}`,
    },
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("already registered") || msg.includes("already exists") || msg.includes("already in use") || msg.includes("duplicate")) {
      return {
        error: null,
        info: "An account may already exist for this email. Sign in to continue setup, or use password reset if you forgot your password.",
      };
    }
    return { error: error.message };
  }

  // If email confirmation is enabled, no session is created yet — tell the user.
  if (!data.session) {
    return {
      error: null,
      info: "Account created. Check your inbox to confirm your email, then sign in.",
    };
  }

  redirect("/onboarding");
}

async function oAuthAction(provider: "google" | "facebook"): Promise<AuthState> {
  if (!env.isSupabaseConfigured) return configError();

  const origin = await publicOrigin();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${origin}${POST_AUTH_PATH}`,
    },
  });
  if (error) {
    const msg = error.message.toLowerCase();
    // Facebook invalid scopes / provider not configured
    if (msg.includes("invalid_scope") || msg.includes("invalid scope")) {
      return {
        error: `${provider === "facebook" ? "Facebook" : "Google"} login is almost ready, but a required permission is not enabled yet. Please contact the platform owner.`,
      };
    }
    if (msg.includes("unsupported provider") || msg.includes("provider is not enabled") || msg.includes("not enabled")) {
      const label = provider.charAt(0).toUpperCase() + provider.slice(1);
      return { error: `${label} login is not configured yet. Enable the ${label} provider in Supabase Dashboard.` };
    }
    return { error: error.message };
  }
  if (!data?.url) {
    const label = provider.charAt(0).toUpperCase() + provider.slice(1);
    return { error: `${label} sign-in is not configured. Enable the ${label} provider in Supabase Dashboard.` };
  }

  redirect(data.url);
}

export async function signInWithGoogleAction(_prev: AuthState, _formData: FormData): Promise<AuthState> {
  void _prev;
  void _formData;
  return oAuthAction("google");
}

export async function signInWithFacebookAction(_prev: AuthState, _formData: FormData): Promise<AuthState> {
  void _prev;
  void _formData;
  return oAuthAction("facebook");
}

export async function resetPasswordAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if (!env.isSupabaseConfigured) return configError();

  const recaptchaToken = formData.get("recaptchaToken") as string | null;
  const recaptchaResult = await verifyRecaptchaToken(recaptchaToken);
  if (!recaptchaResult.success) {
    return { error: recaptchaResult.error ?? "Security check failed." };
  }

  const parsed = resetSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const origin = await publicOrigin();
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origin}/auth/callback?next=%2Fonboarding`,
  });
  if (error) return { error: error.message };
  return {
    error: null,
    info: "If an account exists, a password reset email has been sent.",
  };
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// ── OAuth Account Linking ─────────────────────────────────────────────────────

async function linkOAuthAction(provider: "google" | "facebook"): Promise<AuthState> {
  if (!env.isSupabaseConfigured) return configError();

  const origin = await publicOrigin();

  const supabase = await createClient();

  // Verify user is signed in before linking
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to link an account. Sign in first, then try again." };
  }

  // Developer-only diagnostic (safe — no tokens/secrets)
  if (process.env.NODE_ENV === "development") {
    console.log(`[linkIdentity] provider=${provider}, redirectTo=${origin}/auth/callback?linking=1`);
  }

  const { data, error } = await supabase.auth.linkIdentity({
    provider,
    options: {
      redirectTo: `${origin}/auth/callback?linking=1`,
    },
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("identity is already linked") || msg.includes("already linked")) {
      return { error: `This ${provider} account is already linked to your profile.` };
    }
    if (msg.includes("not supported") || msg.includes("not enabled") || msg.includes("unsupported provider")) {
      const label = provider.charAt(0).toUpperCase() + provider.slice(1);
      return {
        error: `Linking ${label} is not available yet. The ${label} provider must be enabled in Supabase Dashboard first.`,
      };
    }
    return { error: error.message };
  }

  if (!data?.url) {
    return { error: "Could not start account linking. Please try again." };
  }

  redirect(data.url);
}

export async function linkGoogleAccountAction(_prev: AuthState, _formData: FormData): Promise<AuthState> {
  void _prev;
  void _formData;
  return linkOAuthAction("google");
}

export async function linkFacebookAccountAction(_prev: AuthState, _formData: FormData): Promise<AuthState> {
  void _prev;
  void _formData;
  return linkOAuthAction("facebook");
}

// ── Unlink Identity ───────────────────────────────────────────────────────────

export async function unlinkIdentityAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in.", success: null };
  }

  const provider = formData.get("provider");
  if (typeof provider !== "string" || !provider) {
    return { error: "Provider is required.", success: null };
  }

  const identities = user.identities ?? [];
  const identity = identities.find((id) => id.provider === provider);
  if (!identity) {
    return { error: `No linked ${provider} account found.` };
  }

  // Prevent lockout — must have at least 2 remaining identities
  const remaining = identities.filter((id) => id.provider !== provider);
  if (remaining.length < 1) {
    return { error: "Cannot unlink your last sign-in method. Add another provider or set a password first." };
  }

  const { error } = await supabase.auth.unlinkIdentity(identity);
  if (error) {
    return { error: error.message };
  }

  return { error: null, success: `${provider.charAt(0).toUpperCase() + provider.slice(1)} account unlinked.` };
}

// ── Incomplete Signup Recovery ────────────────────────────────────────────────

export async function restartSetupAction(): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in." };
  }

  // Only allow restart if the user has no completed org
  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id, onboarding_completed")
    .eq("id", user.id)
    .maybeSingle<{ organization_id: string | null; onboarding_completed: boolean | null }>();

  if (!profile) {
    // No profile yet — redirect to onboarding fresh
    redirect("/onboarding");
  }

  if (profile.organization_id && profile.onboarding_completed) {
    return { error: "Your shop setup is already complete. You cannot restart setup." };
  }

  // If there's a partial org (organization_id set but onboarding incomplete), delete it safely
  if (profile.organization_id && !profile.onboarding_completed) {
    // Only delete if the org is incomplete (onboarding_completed = false)
    const { data: org } = await supabase
      .from("organizations")
      .select("onboarding_completed")
      .eq("id", profile.organization_id)
      .maybeSingle<{ onboarding_completed: boolean | null }>();

    if (org && !org.onboarding_completed) {
      await supabase.from("organizations").delete().eq("id", profile.organization_id);
    }
  }

  // Reset profile to pre-onboarding state
  await supabase
    .from("profiles")
    .update({
      organization_id: null,
      branch_id: null,
      onboarding_completed: false,
    })
    .eq("id", user.id);

  redirect("/onboarding");
}
