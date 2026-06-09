"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageToggle } from "@/components/language-toggle";

export function PublicPageHeader({ showLanguage = false }: { showLanguage?: boolean }) {
  const handleBack = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      e.preventDefault();
      window.history.back();
    }
  };

  return (
    <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6 dark:border-slate-700">
      <Link
        href="/"
        onClick={handleBack}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition cursor-pointer"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Home
      </Link>
      <div className="flex items-center gap-2">
        {showLanguage && <LanguageToggle />}
        <ThemeToggle />
      </div>
    </div>
  );
}
