import Link from "next/link";
import { Bell, LogOut, AlertTriangle } from "lucide-react";
import { getCurrentContext } from "@/lib/auth/session";
import { signOutAction } from "@/app/(auth)/actions";
import { GlobalSearch } from "@/components/search/global-search";
import { ThemeToggle } from "@/components/theme-toggle";
import { getPublicPlatformSetting, isPlatformAdmin } from "@/lib/platform/admin";

export async function Topbar({ pageTitle }: { pageTitle?: string }) {
  const { user, profile } = await getCurrentContext();
  const title = pageTitle ?? "Dashboard";
  const [maintenanceRaw, platformAdmin] = await Promise.all([
    getPublicPlatformSetting("maintenance_mode_enabled").catch(() => null),
    isPlatformAdmin(),
  ]);
  const maintenanceMode = (maintenanceRaw === true || maintenanceRaw === "true") && !platformAdmin;

  return (
    // `sticky` class kept so the existing print CSS selector (header.sticky)
    // continues to hide the topbar during print. The AppShell now keeps this
    // topbar pinned at the top of the content column without needing sticky
    // behavior — it sits as a shrink-0 sibling above the scrolling <main>.
    <header className="sticky top-0 z-20 shrink-0 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
      {maintenanceMode && (
        <div className="flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-center text-xs font-bold text-white">
          <AlertTriangle className="size-3.5" />
          Maintenance mode is active. Some features may be limited.
        </div>
      )}
      <div className="flex min-h-20 min-w-0 flex-col gap-3 px-3 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-black text-slate-950 dark:text-slate-50 sm:text-2xl">{title}</h1>
        </div>
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center lg:max-w-[680px]">
          <GlobalSearch />
          <ThemeToggle />
          <button className="flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 px-4 text-slate-600 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800">
            <Bell className="size-4" />
          </button>
          {user ? (
            <div className="flex min-w-0 items-center gap-2">
              <div className="hidden min-w-0 flex-col text-right sm:flex">
                <span className="max-w-48 truncate text-sm font-bold text-slate-900 dark:text-slate-100 lg:max-w-64">
                  {profile?.full_name ?? user.email}
                </span>
                <span className="max-w-48 truncate text-xs text-slate-500 dark:text-slate-400 lg:max-w-64">
                  {profile?.role ?? "no profile"} · {user.email}
                </span>
              </div>
              <form action={signOutAction} className="shrink-0">
                <button
                  type="submit"
                  className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-800 sm:px-4"
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
