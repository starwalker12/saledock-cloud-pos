import type { ReactNode } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { DrawerProvider } from "@/components/layout/drawer-context";
import { ConfirmDialogProvider } from "@/components/ui/confirm-dialog";
import { MobileTabBar } from "@/components/layout/mobile-tab-bar";

export function AppShell({ children, pageTitle }: { children: ReactNode; pageTitle?: string }) {
  return (
    <ConfirmDialogProvider>
      <DrawerProvider>
        <div className="flex h-dvh max-w-full overflow-hidden bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-slate-50">
          <Sidebar />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <Topbar pageTitle={pageTitle} />
            <main className="min-h-0 min-w-0 flex-1 overflow-y-auto p-3 sm:p-6 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-6">
              <div className="mx-auto w-full max-w-[1600px] space-y-6">
                {children}
              </div>
            </main>
            <MobileTabBar />
          </div>
        </div>
      </DrawerProvider>
    </ConfirmDialogProvider>
  );
}

