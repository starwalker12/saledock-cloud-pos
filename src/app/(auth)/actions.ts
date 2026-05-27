"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

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

export type AuthState = { error: string | null; info?: string | null };

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

  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: error.message };

  redirect("/auth/callback?next=%2Fdashboard");
}

export async function signUpAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if (!env.isSupabaseConfigured) return configError();

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
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${origin}${POST_AUTH_PATH}`,
    },
  });
  if (error) return { error: error.message };

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
  if (error) return { error: error.message };
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
  const result = await oAuthAction("facebook");
  if (result.error && (result.error.includes("not enabled") || result.error.includes("Unsupported provider"))) {
    return {
      error: "Facebook login is not configured yet. Please use Google or email, or ask the administrator to enable Facebook in Supabase Dashboard.",
    };
  }
  return result;
}

export async function resetPasswordAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if (!env.isSupabaseConfigured) return configError();
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
