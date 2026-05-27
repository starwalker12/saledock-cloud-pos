import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_APP_NAME: z.string().default("SaleDock Cloud POS"),
  PLATFORM_ADMIN_EMAILS: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

const data = parsed.success ? parsed.data : ({} as Partial<z.infer<typeof envSchema>>);

const isSupabaseConfigured = Boolean(
  data.NEXT_PUBLIC_SUPABASE_URL && data.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

export const env = {
  NEXT_PUBLIC_SUPABASE_URL: data.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    data.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "supabase-anon-key-not-configured",
  SUPABASE_SERVICE_ROLE_KEY: data.SUPABASE_SERVICE_ROLE_KEY,
  NEXT_PUBLIC_APP_NAME: data.NEXT_PUBLIC_APP_NAME ?? "SaleDock Cloud POS",
  PLATFORM_ADMIN_EMAILS: data.PLATFORM_ADMIN_EMAILS,
  isSupabaseConfigured,
};
