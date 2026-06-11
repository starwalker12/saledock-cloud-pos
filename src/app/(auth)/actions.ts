"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { sanitizePlainText } from "@/lib/security/sanitize";
import { verifyRecaptchaToken } from "@/lib/security/recaptcha";
import { logAudit } from "@/lib/audit";
import { checkRateLimit, recordAttempt, clearAttempts, extractClientIp } from "@/lib/auth/rate-limit";
import { setCaptchaPass, readCaptchaPass, decrementCaptchaPass, clearCaptchaPass } from "@/lib/auth/captcha-pass";

const passwordSchema = z.string()
  .min(8, "Password must be at least 8 characters.")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter.")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter.")
  .regex(/[0-9]/, "Password must contain at least one number.")
  .regex(/[^a-zA-Z0-9]/, "Password must contain at least one special character.");

const credentialsSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: passwordSchema,
});

const signUpSchema = credentialsSchema.extend({
  fullName: z.string().min(2, "Enter your full name."),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match.",
  path: ["confirmPassword"],
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

  const h = await headers();
  const ip = extractClientIp(h.get("x-forwarded-for"));

  // Captcha-pass: skip Google verify if a valid signed cookie exists
  const captchaPass = ip ? await readCaptchaPass(ip) : null;
  if (!captchaPass) {
    const recaptchaToken = formData.get("recaptchaToken") as string | null;
    const recaptchaResult = await verifyRecaptchaToken(recaptchaToken);
    if (!recaptchaResult.success) {
      return { error: recaptchaResult.error ?? "Security check failed." };
    }
    if (ip) {
      await setCaptchaPass(ip);
    }
  }

  const parsed = credentialsSchema.safeParse({
    email: formData.get("email") ?? "",
    password: formData.get("password") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please enter your email and password." };
  }

  if (ip) {
    const rateCheck = await checkRateLimit(parsed.data.email, ip);
    if (!rateCheck.allowed) {
      return { error: "Too many attempts. Please try again in a few minutes." };
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    console.error("[security] Failed sign-in attempt for", parsed.data.email);
    if (ip) {
      await recordAttempt(parsed.data.email, ip, false);
      await decrementCaptchaPass(ip);
    }
    return { error: "Invalid email or password." };
  }

  await clearCaptchaPass();
  if (ip) {
    await clearAttempts(parsed.data.email, ip);
  }
  redirect("/auth/callback?next=%2Fdashboard");
}

export async function signUpAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if (!env.isSupabaseConfigured) return configError();

  const h = await headers();
  const ip = extractClientIp(h.get("x-forwarded-for"));

  // Captcha-pass: skip Google verify if a valid signed cookie exists
  const captchaPass = ip ? await readCaptchaPass(ip) : null;
  if (!captchaPass) {
    const recaptchaToken = formData.get("recaptchaToken") as string | null;
    const recaptchaResult = await verifyRecaptchaToken(recaptchaToken);
    if (!recaptchaResult.success) {
      return { error: recaptchaResult.error ?? "Security check failed." };
    }
    if (ip) {
      await setCaptchaPass(ip);
    }
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
    email: formData.get("email") ?? "",
    password: formData.get("password") ?? "",
    fullName: formData.get("fullName") ?? "",
    confirmPassword: formData.get("confirmPassword") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please enter your name, email, and password." };
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
    console.error("[security] signUp failed:", error.message);
    if (ip) {
      await decrementCaptchaPass(ip);
    }
    return { error: "Something went wrong. Please try again." };
  }

  await clearCaptchaPass();

  // If email confirmation is enabled, no session is created yet — tell the user.
  if (!data.session) {
    return {
      error: null,
      info: "Account created. Check your inbox to confirm your email, then sign in.",
    };
  }

  redirect("/onboarding");
}

async function oAuthAction(provider: "google"): Promise<AuthState> {
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
    if (msg.includes("invalid_scope") || msg.includes("invalid scope")) {
      return {
        error: "Google login is almost ready, but a required permission is not enabled yet. Please contact the platform owner.",
      };
    }
    if (msg.includes("unsupported provider") || msg.includes("provider is not enabled") || msg.includes("not enabled")) {
      return { error: "Google login is not configured yet. Enable the Google provider in Supabase Dashboard." };
    }
    console.error("[security] oAuth failed:", error.message);
    return { error: "Something went wrong. Please try again later." };
  }
  if (!data?.url) {
    return { error: "Google sign-in is not configured. Enable the Google provider in Supabase Dashboard." };
  }

  redirect(data.url);
}

export async function signInWithGoogleAction(_prev: AuthState, _formData: FormData): Promise<AuthState> {
  void _prev;
  void _formData;
  return oAuthAction("google");
}

export async function resetPasswordAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if (!env.isSupabaseConfigured) return configError();

  const h = await headers();
  const ip = extractClientIp(h.get("x-forwarded-for"));

  // Captcha-pass: skip Google verify if a valid signed cookie exists
  const captchaPass = ip ? await readCaptchaPass(ip) : null;
  if (!captchaPass) {
    const recaptchaToken = formData.get("recaptchaToken") as string | null;
    const recaptchaResult = await verifyRecaptchaToken(recaptchaToken);
    if (!recaptchaResult.success) {
      return { error: recaptchaResult.error ?? "Security check failed." };
    }
    if (ip) {
      await setCaptchaPass(ip);
    }
  }

  const parsed = resetSchema.safeParse({ email: formData.get("email") ?? "" });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please enter your email." };
  }
  const origin = await publicOrigin();
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origin}/auth/callback?next=%2Fonboarding`,
  });

  // Each reset submission consumes one captcha-pass attempt
  // (parse errors above are NOT submissions, so they don't decrement)
  if (ip) {
    await decrementCaptchaPass(ip);
  }

  if (error) {
    console.error("[security] resetPassword failed:", error.message);
    return { error: "Something went wrong. Please try again." };
  }
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

async function linkOAuthAction(provider: "google"): Promise<AuthState> {
  if (!env.isSupabaseConfigured) return configError();

  const origin = await publicOrigin();

  const supabase = await createClient();

  // Verify user is signed in before linking
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to link an account. Sign in first, then try again." };
  }

  const { data, error } = await supabase.auth.linkIdentity({
    provider,
    options: {
      redirectTo: `${origin}/auth/callback?linking=1&provider=${provider}`,
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
    console.error("[security] unlinkIdentity failed:", error.message);
    return { error: "Could not unlink account. Please try again." };
  }

  return { error: null, success: `${provider.charAt(0).toUpperCase() + provider.slice(1)} account unlinked.` };
}

// ── Set Password (for users without email/password) ───────────────────────────

export async function setPasswordAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  if (!env.isSupabaseConfigured) return configError();

  const password = formData.get("password") as string | null;
  const confirm = formData.get("confirmPassword") as string | null;

  if (!password || password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }
  const passwordParsed = passwordSchema.safeParse(password);
  if (!passwordParsed.success) {
    return { error: passwordParsed.error.issues[0]?.message ?? "Password does not meet requirements." };
  }
  if (password !== confirm) {
    return { error: "Passwords do not match." };
  }

  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in." };
  }
  if (!user.email) {
    return { error: "No email address on your account. Contact support." };
  }

  const admin = createAdminClient();
  const { error: adminError } = await admin.auth.admin.updateUserById(user.id, {
    email: user.email,
    password,
    email_confirm: true,
    app_metadata: {
      providers: ["google", "email"]
    }
  });

  if (adminError) {
    if (adminError.message.toLowerCase().includes("same password")) {
      return { error: "New password must be different from your current password." };
    }
    console.error("[security] setPassword failed via admin client:", adminError.message);
    return { error: adminError.message || "Could not update password. Please try again." };
  }

  // GoTrue invalidates active sessions on password change. Re-establish session:
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password,
  });

  if (signInError) {
    console.error("[security] re-authentication after setPassword failed:", signInError.message);
    return { error: "Password was set, but we could not re-authenticate you automatically. Please sign in manually." };
  }

  logAudit({
    module: "auth",
    action: "auth.password_set",
    details: `Password set/updated for user ${user.email}`,
  });

  return {
    error: null,
    success: `Password added. You can now sign in with: ${user.email}`,
  };
}

// ── Change Email (authenticated) ─────────────────────────────────────────────

export async function changeEmailAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  if (!env.isSupabaseConfigured) return configError();

  const newEmail = formData.get("newEmail") as string | null;
  const confirmEmail = formData.get("confirmEmail") as string | null;

  if (!newEmail || !confirmEmail) {
    return { error: "Both email fields are required." };
  }

  const emailSchema = z.string().email("Enter a valid email address.");
  const parsed = emailSchema.safeParse(newEmail);
  if (!parsed.success) {
    return { error: "Enter a valid email address." };
  }

  if (newEmail !== confirmEmail) {
    return { error: "Email addresses do not match." };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in." };
  }

  if (newEmail.toLowerCase() === (user.email ?? "").toLowerCase()) {
    return { error: "New email is the same as your current email." };
  }

  const { error } = await supabase.auth.updateUser({ email: newEmail });
  if (error) {
    if (error.message.toLowerCase().includes("reauthentication") || error.message.toLowerCase().includes("recent")) {
      return { error: "For security, please sign out and sign back in, then try again." };
    }
    if (error.message.toLowerCase().includes("already") || error.message.toLowerCase().includes("exists") || error.message.toLowerCase().includes("in use")) {
      return { error: "This email address is already in use." };
    }
    console.error("[security] changeEmail failed:", error.message);
    return { error: "Could not update email. Please try again." };
  }

  logAudit({
    module: "auth",
    action: "auth.email_change_requested",
    details: `Email change requested from ${user.email} to ${newEmail}`,
  });

  return {
    error: null,
    success: "Email change requested. Check your new email for a confirmation link.",
  };
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
