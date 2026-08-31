"use client";

import { createBrowserClient } from "@supabase/ssr";

// Next.js only inlines public environment variables when they are referenced
// directly. Reading them through the shared process.env parser leaves browser
// bundles on the local fallback values.
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "supabase-anon-key-not-configured";

export function createClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
