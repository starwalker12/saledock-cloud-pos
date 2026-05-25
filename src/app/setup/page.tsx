import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentContext } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { SetupForm } from "./setup-form";

export default async function SetupPage() {
  if (!env.isSupabaseConfigured) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
        <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-xl">
          <h1 className="text-2xl font-black text-slate-950">Setup unavailable</h1>
          <p className="mt-3 text-sm text-slate-500">
            Supabase is not configured. Add credentials to <code>.env.local</code> and try again.
          </p>
        </section>
      </main>
    );
  }

  const { user, profile } = await getCurrentContext();
  if (!user) redirect("/login");
  if (profile?.organization_id) redirect("/dashboard");

  let locked = false;
  let countError: string | null = null;
  try {
    const admin = createAdminClient();
    const { count, error } = await admin
      .from("organizations")
      .select("id", { count: "exact", head: true });
    if (error) countError = error.message;
    locked = (count ?? 0) > 0;
  } catch (err) {
    countError = err instanceof Error ? err.message : "Unknown error";
  }

  const defaultFullName =
    (user.user_metadata as { full_name?: string } | null)?.full_name ?? "";

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <section className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 shadow-xl">
        <div className="mb-6">
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-blue-700">
            First-time setup
          </p>
          <h1 className="mt-2 text-3xl font-black text-slate-950">Create your organization</h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            Signed in as <strong>{user.email}</strong>. You will become the <strong>owner</strong>
            {" "}of this organization.
          </p>
        </div>

        {countError && (
          <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            {countError}
          </p>
        )}

        {locked ? (
          <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
            Setup is locked. An organization already exists. Ask the owner to invite you before
            signing in.
          </div>
        ) : (
          <SetupForm defaultFullName={defaultFullName} />
        )}
      </section>
    </main>
  );
}
