import Link from "next/link";
import Image from "next/image";

export function FooterSection() {
  return (
    <footer className="border-t border-slate-200 bg-slate-50 px-4 py-12 dark:border-white/[0.05] dark:bg-[#070b16]">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-6 sm:flex-row sm:justify-between">
        <div className="flex items-center">
          <Image src="/saledock-logo-full.png" alt="SaleDock Cloud POS" width={488} height={178}
            className="h-7 w-auto object-contain dark:brightness-0 dark:invert" />
        </div>

        <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-slate-400 dark:text-slate-500">
          <Link href="/privacy"       className="transition-colors duration-200 hover:text-slate-700 dark:hover:text-slate-300">Privacy Policy</Link>
          <Link href="/terms"         className="transition-colors duration-200 hover:text-slate-700 dark:hover:text-slate-300">Terms of Service</Link>
          <Link href="/data-deletion" className="transition-colors duration-200 hover:text-slate-700 dark:hover:text-slate-300">Data Deletion</Link>
          <span className="text-slate-300 dark:text-slate-700">·</span>
          <a href="mailto:fardan.aatir@outlook.com" className="transition-colors duration-200 hover:text-slate-700 dark:hover:text-slate-300">fardan.aatir@outlook.com</a>
        </div>

        <p className="text-xs text-slate-400 dark:text-slate-500">
          &copy; {new Date().getFullYear()} SaleDock Cloud POS
        </p>
      </div>
    </footer>
  );
}
