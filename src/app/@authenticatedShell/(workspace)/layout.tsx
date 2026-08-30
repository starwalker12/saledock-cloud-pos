import type { ReactNode } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileDrawerWrapper } from "@/components/layout/mobile-drawer-wrapper";

export default function WorkspaceShellLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Sidebar />
      <MobileDrawerWrapper />
      {children}
    </>
  );
}
