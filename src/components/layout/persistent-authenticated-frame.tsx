"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ConfirmDialogProvider } from "@/components/ui/confirm-dialog";
import { DrawerProvider } from "@/components/layout/drawer-context";
import { ActiveWorkspaceGuard } from "@/components/auth/active-workspace-guard";

const WORKSPACE_ROUTE_PREFIXES = [
  "/audit-log",
  "/customers",
  "/daily-closing",
  "/dashboard",
  "/expenses",
  "/invoices",
  "/pos",
  "/products",
  "/purchases",
  "/repairs",
  "/reports",
  "/returns",
  "/settings",
  "/suppliers",
  "/users",
] as const;

export function usesPersistentAuthenticatedFrame(pathname: string): boolean {
  return WORKSPACE_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function PersistentAuthenticatedFrame({
  authenticatedShell,
  children,
}: {
  authenticatedShell: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();

  if (!usesPersistentAuthenticatedFrame(pathname)) return children;

  return (
    <ConfirmDialogProvider>
      <DrawerProvider>
        <div
          data-persistent-authenticated-frame
          className="flex h-dvh max-w-full overflow-hidden bg-slate-50 text-slate-950 print:contents dark:bg-slate-950 dark:text-slate-50"
        >
          <ActiveWorkspaceGuard>
            {authenticatedShell}
            {children}
          </ActiveWorkspaceGuard>
        </div>
      </DrawerProvider>
    </ConfirmDialogProvider>
  );
}
