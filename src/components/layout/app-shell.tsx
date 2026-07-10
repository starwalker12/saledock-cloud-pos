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
  printFullDocument = false,
}: {
  children: ReactNode;
  pageTitle?: string;
  contentClassName?: string;
  mainClassName?: string;
  showMobileTabBar?: boolean;
  printFullDocument?: boolean;
}) {
  const rootPrintClasses = printFullDocument
    ? "print:block print:h-auto print:min-h-0 print:max-h-none print:overflow-visible"
    : "";
  const columnPrintClasses = printFullDocument
    ? "print:block print:h-auto print:min-h-0 print:max-h-none print:overflow-visible"
    : "";
  const mainPrintClasses = printFullDocument
    ? "print:block print:h-auto print:min-h-0 print:max-h-none print:flex-none print:overflow-visible"
    : "";
  const contentPrintClasses = printFullDocument
    ? "print:block print:h-auto print:max-h-none print:overflow-visible"
    : "";

  return (
      <ConfirmDialogProvider>
        <DrawerProvider>
          <div
            data-app-shell-root
            data-print-full-document={printFullDocument ? "true" : "false"}
            className={`flex h-dvh max-w-full overflow-hidden bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-slate-50 ${rootPrintClasses}`}
          >
            <Sidebar />
            <div
              data-app-shell-column
              className={`flex min-h-0 min-w-0 flex-1 flex-col ${columnPrintClasses}`}
            >
              <Topbar pageTitle={pageTitle} />
              <main
                data-app-shell-main
                className={`min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden ${mainPrintClasses} ${mainClassName}`}
              >
                <div
                  data-app-shell-content
                  className={`animate-fade-in mx-auto w-full min-w-0 space-y-4 md:space-y-6 ${contentPrintClasses} ${contentClassName}`}
                >
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
