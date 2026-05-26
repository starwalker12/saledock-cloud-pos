import Link from "next/link";
import { Bell, LogOut } from "lucide-react";
import { getCurrentContext } from "@/lib/auth/session";
import { signOutAction } from "@/app/(auth)/actions";
import { GlobalSearch } from "@/components/search/global-search";

export async function Topbar({ pageTitle }: { pageTitle?: string }) {
  const { user, profile, organization, branch } = await getCurrentContext();
  const title = pageTitle ?? (branch?.name ? `${branch.name} dashboard` : "Dashboard");

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="flex min-h-20 min-w-0 flex-col gap-3 px-3 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="truncate text-xs font-bold uppercase tracking-[0.16em] text-blue-700 sm:tracking-[0.24em]">
            {organization?.name ?? "Gadget Zone Online POS"}
            {branch?.name && pageTitle ? ` · ${branch.name}` : ""}
          </p>
          <h1 className="truncate text-xl font-black text-slate-950 sm:text-2xl">{title}</h1>
        </div>
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center lg:max-w-[680px]">
          <GlobalSearch />
          <button className="flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 px-4 text-slate-600">
            <Bell className="size-4" />
          </button>
          {user ? (
            <div className="flex min-w-0 items-center gap-2">
              <div className="hidden min-w-0 flex-col text-right sm:flex">
                <span className="max-w-48 truncate text-sm font-bold text-slate-900 lg:max-w-64">
                  {profile?.full_name ?? user.email}
                </span>
                <span className="max-w-48 truncate text-xs text-slate-500 lg:max-w-64">
                  {profile?.role ?? "no profile"} · {user.email}
                </span>
              </div>
              <form action={signOutAction} className="shrink-0">
                <button
                  type="submit"
                  className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 sm:px-4"
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
