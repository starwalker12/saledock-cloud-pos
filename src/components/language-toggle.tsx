"use client";

import { ChevronDown, Check, Languages } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/lib/i18n/language-provider";
import { LANGUAGE_NAMES, type Lang } from "@/lib/i18n/translations";

const langOptions: { value: Lang; labelKey: Lang }[] = [
  { value: "en", labelKey: "en" },
  { value: "ur", labelKey: "ur" },
  { value: "ur-roman", labelKey: "ur-roman" },
];

export function LanguageToggle() {
  const { lang, setLang } = useLanguage();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return (
    <div ref={menuRef} className="print:hidden relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex min-h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-white hover:shadow-md dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:bg-slate-800"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Language"
      >
        <Languages className="size-4 shrink-0 text-blue-700 dark:text-slate-100" aria-hidden="true" />
        <span className="hidden min-w-0 sm:inline">{LANGUAGE_NAMES[lang]}</span>
        <ChevronDown
          className={`size-3.5 shrink-0 text-slate-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-44 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-black/5 dark:border-slate-700 dark:bg-slate-900">
          <div className="p-1.5">
            {langOptions.map((option) => {
              const isActive = option.value === lang;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => { setLang(option.value); setOpen(false); router.refresh(); }}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                    isActive
                      ? "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                      : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`}
                >
                  <span className="flex-1 text-left">{LANGUAGE_NAMES[option.value]}</span>
                  {isActive && <Check className="size-4 shrink-0 text-blue-600" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function LanguageToggleMinimal() {
  const { lang, setLang } = useLanguage();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <Languages className="size-4 shrink-0 text-slate-400" />
        {LANGUAGE_NAMES[lang]}
      </button>

      {open && (
        <div className="absolute right-0 top-full lg:right-full lg:top-0 lg:mr-2 lg:mt-0 z-50 mt-1 w-44 max-h-60 overflow-y-auto rounded-2xl border border-slate-200 bg-[#fff] shadow-xl shadow-black/5 dark:border-slate-700 dark:bg-slate-900">
          <div className="p-1.5">
            {langOptions.map((option) => {
              const isActive = option.value === lang;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => { setLang(option.value); setOpen(false); router.refresh(); }}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                    isActive
                      ? "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                      : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`}
                >
                  <span className="flex-1 text-left">{LANGUAGE_NAMES[option.value]}</span>
                  {isActive && <Check className="size-4 shrink-0 text-blue-600" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
