import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { getCurrentContext, signProfilePictureUrl } from "@/lib/auth/session";
import { GlobalSearch } from "@/components/search/global-search";
import { UserMenu } from "@/components/layout/user-menu";
import { MobileDrawerTrigger } from "@/components/layout/mobile-drawer-trigger";
import { NotificationPopover } from "@/components/layout/notification-popover";
import { getPublicPlatformSetting, isPlatformAdmin } from "@/lib/platform/admin";
import { getServerDict } from "@/lib/i18n/server";

export async function Topbar({ pageTitle }: { pageTitle?: string }) {
  const { user, profile } = await getCurrentContext();
  const title = pageTitle ?? "Dashboard";
  const [maintenanceRaw, platformAdmin, { dict }] = await Promise.all([
    getPublicPlatformSetting("maintenance_mode_enabled").catch(() => null),
    isPlatformAdmin(),
    getServerDict(),
  ]);
  const maintenanceMode = (maintenanceRaw === true || maintenanceRaw === "true") && !platformAdmin;
  const profilePictureUrl = await signProfilePictureUrl(profile?.profile_picture_url ?? profile?.avatar_url ?? null);
  const shellDict = dict.shell as Record<string, string> | undefined;

  return (
    // `sticky` class kept so the existing print CSS selector (header.sticky)
    // continues to hide the topbar during print. The AppShell now keeps this
    // topbar pinned at the top of the content column without needing sticky
    // behavior — it sits as a shrink-0 sibling above the scrolling <main>.
    <header className="sticky top-0 z-20 shrink-0 border-b border-slate-200 bg-[#fff]/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
      {maintenanceMode && (
        <div className="flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-center text-xs font-bold text-white">
          <AlertTriangle className="size-3.5" />
          {shellDict?.maintenanceBanner || "Maintenance mode is active. Some features may be limited."}
        </div>
      )}
      {/* Mobile top bar (< md) */}
      <div className="flex h-14 items-center justify-between px-3 md:hidden">
        <div className="flex items-center gap-2 min-w-0">
          <MobileDrawerTrigger />
          <h1 className="truncate text-lg font-black text-slate-950 dark:text-slate-50">{title}</h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <GlobalSearch />
          <NotificationPopover compact />
          {user ? (
            <UserMenu
              name={profile?.full_name ?? user.email ?? "User"}
              email={user.email ?? ""}
              role={profile?.role ?? null}
              profilePictureUrl={profilePictureUrl}
              isPlatformAdmin={platformAdmin}
            />
          ) : (
            <Link
              href="/login"
              className="flex h-9 items-center justify-center rounded-xl bg-blue-700 px-3 text-xs font-bold text-white shadow-sm transition hover:bg-blue-800"
            >
              {shellDict?.signIn || "Sign in"}
            </Link>
          )}
        </div>
      </div>

      {/* Desktop/Tablet top bar (>= md) */}
      <div className="hidden md:flex min-h-20 min-w-0 flex-col gap-3 px-3 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <MobileDrawerTrigger />
          <h1 className="truncate text-xl font-black text-slate-950 dark:text-slate-50 sm:text-2xl">{title}</h1>
        </div>
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center lg:max-w-[860px] lg:flex-1 lg:justify-end xl:max-w-[980px]">
          <GlobalSearch />
          <NotificationPopover />
          {user ? (
            <UserMenu
              name={profile?.full_name ?? user.email ?? "User"}
              email={user.email ?? ""}
              role={profile?.role ?? null}
              profilePictureUrl={profilePictureUrl}
              isPlatformAdmin={platformAdmin}
            />
          ) : (
            <Link
              href="/login"
              className="flex min-h-11 items-center justify-center rounded-xl bg-blue-700 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800"
            >
              {shellDict?.signIn || "Sign in"}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
