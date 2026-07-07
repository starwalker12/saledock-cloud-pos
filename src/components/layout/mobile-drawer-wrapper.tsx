import { getCurrentContext, signProfilePictureUrl } from "@/lib/auth/session";
import { canManageUsers, canViewAuditLog, canManageSupplierPurchases, canViewReplenishment } from "@/lib/permissions";
import { isPlatformAdmin } from "@/lib/platform/admin";
import { MobileDrawerPanel } from "./mobile-drawer-panel";

type NavItem = {
  href: string;
  label: string;
  icon: string;
};

const baseItems: NavItem[] = [
  { href: "/dashboard", label: "dashboard", icon: "dashboard" },
  { href: "/pos", label: "pos", icon: "pos" },
  { href: "/products", label: "products", icon: "products" },
  { href: "/customers", label: "customers", icon: "customers" },
  { href: "/invoices", label: "invoices", icon: "invoices" },
  { href: "/returns", label: "returns", icon: "returns" },
  { href: "/repairs", label: "repairs", icon: "repairs" },
  { href: "/expenses", label: "expenses", icon: "expenses" },
  { href: "/daily-closing", label: "dailyClosing", icon: "dailyClosing" },
  { href: "/reports", label: "reports", icon: "reports" },
];

export async function MobileDrawerWrapper() {
  const { profile, user } = await getCurrentContext();
  const platformAdmin = await isPlatformAdmin();
  const profilePictureUrl = await signProfilePictureUrl(profile?.profile_picture_url ?? profile?.avatar_url ?? null);

  const visibleItems: NavItem[] = [
    ...baseItems,
    ...(canManageSupplierPurchases(profile?.role)
      ? [
          { href: "/suppliers/purchases", label: "purchases", icon: "purchases" },
          { href: "/suppliers/dues", label: "Supplier Dues", icon: "dues" },
        ]
      : []),
    ...(canViewReplenishment(profile?.role)
      ? [{ href: "/purchases/replenishment", label: "replenishment", icon: "replenishment" }]
      : []),
    ...(canViewAuditLog(profile?.role)
      ? [{ href: "/audit-log", label: "auditLog", icon: "auditLog" }]
      : []),
    ...(canManageUsers(profile?.role)
      ? [{ href: "/users", label: "users", icon: "users" }]
      : []),
    { href: "/settings", label: "settings", icon: "settings" },
    ...(platformAdmin ? [{ href: "/platform", label: "platform", icon: "platform" }] : []),
  ];

  return (
    <MobileDrawerPanel
      items={visibleItems}
      user={user ? {
        name: profile?.full_name ?? user.email ?? "User",
        email: user.email ?? "",
        role: profile?.role ?? null,
        profilePictureUrl: profilePictureUrl,
      } : null}
    />
  );
}
