import Link from "next/link";
import Image from "next/image";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageToggle } from "@/components/language-toggle";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function TopNav({ d }: { d: any }) {
  return (
    <nav className="sticky top-0 z-50 w-full border-b border-white/10 bg-gradient-to-r from-[#0b2f6f] to-[#0d9488] shadow-lg shadow-blue-900/20 dark:border-white/[0.06] dark:bg-[#050c1a]/95">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="inline-flex items-center rounded-2xl bg-white/95 px-4 py-2 shadow-sm ring-1 ring-white/40 dark:bg-white/95">
          <Image src="/saledock-logo-full.png" alt="SaleDock Cloud POS" width={488} height={178}
            className="h-8 w-auto object-contain sm:h-9" priority />
        </Link>

        <div className="flex items-center gap-2 sm:gap-3">
          <ThemeToggle />
          <LanguageToggle />
          <>
            <Link href="/login"
              className="hidden h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-white/25 bg-white/10 px-4 text-xs font-semibold text-white shadow-sm backdrop-blur-sm transition-all duration-200 hover:bg-white/20 hover:-translate-y-0.5 sm:flex sm:text-sm">
              {d?.nav?.signIn || "Sign in"}
            </Link>
            <Link href="/login?signup=1"
              className="flex h-10 cursor-pointer items-center gap-1.5 rounded-xl bg-[#fff] px-4 text-xs font-bold text-[#0b2f6f] shadow-lg shadow-black/10 transition-all duration-200 hover:bg-[#fff]/90 hover:-translate-y-0.5 sm:text-sm dark:bg-cyan-300 dark:text-[#020617] dark:hover:bg-cyan-200">
              {d?.nav?.startFree || "Start free"}
            </Link>
          </>
        </div>
      </div>
    </nav>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */
