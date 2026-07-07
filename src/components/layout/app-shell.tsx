import type { ReactNode } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { DrawerProvider } from "@/components/layout/drawer-context";
import { ConfirmDialogProvider } from "@/components/ui/confirm-dialog";
import { MobileTabBar } from "@/components/layout/mobile-tab-bar";
import { MobileDrawerWrapper } from "@/components/layout/mobile-drawer-wrapper";

export function AppShell({
  children,
  pageTitle,
  contentClassName = "max-w-[1600px]",
  mainClassName = "p-3 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:p-6 md:pb-6",
  showMobileTabBar = true,
}: {
  children: ReactNode;
  pageTitle?: string;
  contentClassName?: string;
  mainClassName?: string;
  showMobileTabBar?: boolean;
}) {
  return (
      <ConfirmDialogProvider>
        <DrawerProvider>
          <div className="flex h-dvh max-w-full overflow-hidden bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-slate-50">
            <Sidebar />
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <Topbar pageTitle={pageTitle} />
              <main className={`min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden ${mainClassName}`}>
                <div className={`animate-fade-in mx-auto w-full min-w-0 space-y-4 md:space-y-6 ${contentClassName}`}>
                  {children}
                </div>
              </main>
              {showMobileTabBar && <MobileTabBar />}
            </div>
          </div>
          <MobileDrawerWrapper />
        </DrawerProvider>
      </ConfirmDialogProvider>
  );
}
