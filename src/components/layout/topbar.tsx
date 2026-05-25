import Link from "next/link";
import { Bell, LogOut, Search } from "lucide-react";
import { getCurrentContext } from "@/lib/auth/session";
import { signOutAction } from "@/app/(auth)/actions";

export async function Topbar() {
  const { user, profile, organization, branch } = await getCurrentContext();

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="flex min-h-20 flex-col gap-3 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-blue-700">
            {organization?.name ?? "Gadget Zone Online POS"}
          </p>
          <h1 className="text-2xl font-black text-slate-950">
            {branch?.name ? `${branch.name} dashboard` : "Dashboard"}
          </h1>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500">
            <Search className="size-4" />
            <span className="sr-only">Search</span>
            <input
              className="w-full bg-transparent outline-none placeholder:text-slate-400"
              placeholder="Search…"
            />
          </label>
          <button className="flex min-h-11 items-center justify-center rounded-xl border border-slate-200 px-4 text-slate-600">
            <Bell className="size-4" />
          </button>
          {user ? (
            <div className="flex items-center gap-2">
              <div className="hidden flex-col text-right sm:flex">
                <span className="text-sm font-bold text-slate-900">
                  {profile?.full_name ?? user.email}
                </span>
                <span className="text-xs text-slate-500">
                  {profile?.role ?? "no profile"} · {user.email}
                </span>
              </div>
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  title="Sign out"
                >
                  <LogOut className="size-4" />
                  Sign out
                </button>
              </form>
            </div>
          ) : (
            <Link
              href="/login"
              className="flex min-h-11 items-center justify-center rounded-xl bg-blue-700 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
