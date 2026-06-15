"use client";

import { useState, useRef, useEffect, type FormEvent } from "react";
import Link from "next/link";
import {
  ChevronDown,
  Settings,
  UserCircle,
  Shield,
  ShieldCheck,
  MonitorCog,
  LogOut,
} from "lucide-react";
import { signOutAction } from "@/app/(auth)/actions";
import { useLanguage } from "@/lib/i18n/language-provider";
import { LanguageToggleMinimal } from "@/components/language-toggle";
import { ThemeMenuSection } from "@/components/theme-toggle";
import {
  ConfirmDialogProvider,
  useConfirmDialog,
} from "@/components/ui/confirm-dialog";
import { Logo } from "@/components/logo";

type UserMenuProps = {
  name: string;
  email: string;
  role: string | null;
  profilePictureUrl: string | null;
  isPlatformAdmin: boolean;
};

export function UserMenu({ name, email, role, profilePictureUrl, isPlatformAdmin }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { dict } = useLanguage();
  const shellDict = dict.shell as Record<string, string> | undefined;
  const t = (key: string, fallback: string) => shellDict?.[key] || fallback;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (confirmDialogOpen) return;

      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (confirmDialogOpen) return;

      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [confirmDialogOpen]);

  const displayName = name || email;
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div ref={menuRef} className="relative shrink-0">
      <ConfirmDialogProvider
        onOpenChange={setConfirmDialogOpen}
      >
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-full md:rounded-2xl border border-slate-200 bg-white/80 p-1 md:px-3 md:py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-white hover:shadow-md dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
          aria-haspopup="true"
          aria-expanded={open}
        >
          {profilePictureUrl ? (
            <span className="size-7 shrink-0 overflow-hidden rounded-full">
              <span
                className="block size-full bg-cover bg-center"
                style={{ backgroundImage: `url(${profilePictureUrl})` }}
              />
            </span>
          ) : (
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-teal-500 text-[11px] font-bold text-white">
              {initials}
            </span>
          )}
          <span className="hidden min-w-0 flex-col text-left md:flex">
            <span className="max-w-32 truncate text-sm font-bold text-slate-900 dark:text-slate-100 lg:max-w-48">
              {name}
            </span>
            <span className="max-w-32 truncate text-[10px] text-slate-500 dark:text-slate-400 lg:max-w-48">
              {role ?? t("noProfile", "no profile")}
            </span>
          </span>
          <ChevronDown className={`hidden md:block size-3.5 shrink-0 text-slate-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </button>

        {open && (
          <div className="absolute right-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-1rem)] rounded-2xl border border-slate-200 bg-[#fff] shadow-xl shadow-black/5 dark:border-slate-700 dark:bg-slate-900">
            <div className="rounded-t-2xl border-b border-slate-100 px-4 py-3 dark:border-slate-800">
              <p className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                {name}
              </p>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                {email}
              </p>
            </div>

            <div className="p-1.5">
              <MenuItem href="/settings" icon={Settings} label={t("settings", "Shop Profile")} />
              <MenuItem href="/settings?tab=accounts" icon={UserCircle} label={t("connectedAccounts", "Connected Accounts")} />
              <MenuItem href="/settings?tab=privacy" icon={Shield} label={t("privacyCenter", "Privacy Center")} />
              <MenuItem href="/settings?tab=security" icon={ShieldCheck} label={t("security", "Security")} />
              {isPlatformAdmin && (
                <MenuItem href="/platform" icon={MonitorCog} label={t("platformAdmin", "Platform Admin")} />
              )}
            </div>

            <div className="border-t border-slate-100 p-1.5 dark:border-slate-800">
              <ThemeMenuSection />
            </div>

            <div className="border-t border-slate-100 p-1.5 dark:border-slate-800">
              <LanguageToggleMinimal />
            </div>

            <div className="rounded-b-2xl border-t border-slate-100 p-1.5 dark:border-slate-800">
              <SignOutMenuItem t={t} />
            </div>
          </div>
        )}
      </ConfirmDialogProvider>
    </div>
  );
}

function SignOutMenuItem({
  t,
}: {
  t: (key: string, fallback: string) => string;
}) {
  const confirm = useConfirmDialog();
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const confirmedSubmitRef = useRef(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    if (confirmedSubmitRef.current) {
      confirmedSubmitRef.current = false;
      return;
    }

    e.preventDefault();

    if (isConfirming || isSubmitting) return;

    const form = e.currentTarget;
    setIsConfirming(true);

    const shouldSignOut = await confirm({
      title: t("signOutConfirmTitle", "Sign out?"),
      message: t("signOutConfirmMessage", "Sign out of SaleDock?"),
      confirmLabel: t("signOut", "Sign out"),
      cancelLabel: t("cancel", "Cancel"),
    });

    setIsConfirming(false);

    if (!shouldSignOut) return;

    confirmedSubmitRef.current = true;
    setIsSubmitting(true);
    form.requestSubmit();
  }

  return (
    <>
      <form action={signOutAction} onSubmit={handleSubmit}>
        <button
          type="submit"
          disabled={isConfirming || isSubmitting}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-wait disabled:opacity-70 dark:text-red-400 dark:hover:bg-red-950/30 cursor-pointer"
        >
          <LogOut className="size-4" />
          {t("signOut", "Sign out")}
        </button>
      </form>
      {isSubmitting && (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-4 bg-slate-950/80 text-white backdrop-blur-sm">
          <Logo className="h-12 w-auto object-contain mb-2 dark:brightness-0 dark:invert" />
          <div className="size-10 animate-spin rounded-full border-4 border-white border-t-transparent" />
          <span className="font-bold text-lg">{t("signingOut", "Signing out...")}</span>
        </div>
      )}
    </>
  );
}

function MenuItem({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
      onClick={() => {
        // Close will happen naturally via click-outside or navigation
      }}
    >
      <Icon className="size-4 shrink-0 text-slate-400" />
      {label}
    </Link>
  );
}
