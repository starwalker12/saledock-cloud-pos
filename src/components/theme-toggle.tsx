"use client";

import { ChevronDown, Check, Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useRef, useState } from "react";

const themeOptions = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

export function ThemeToggle({ showLabelOnMobile }: { showLabelOnMobile?: boolean }) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(id);
  }, []);

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

  const activeTheme = mounted ? theme ?? "system" : "system";
  const ActiveIcon = useMemo(() => {
    if (!mounted) {
      return Monitor;
    }
    const option = themeOptions.find((item) => item.value === activeTheme);
    if (option) {
      return option.icon;
    }
    return resolvedTheme === "dark" ? Moon : Sun;
  }, [activeTheme, mounted, resolvedTheme]);

  const activeLabel = themeOptions.find((o) => o.value === activeTheme)?.label ?? "Theme";

  return (
    <div ref={menuRef} className="print:hidden relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex min-h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-white hover:shadow-md dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Theme"
      >
        <ActiveIcon className="size-4 shrink-0 text-blue-700 dark:text-slate-100" aria-hidden="true" />
        <span className={showLabelOnMobile ? "min-w-0" : "hidden min-w-0 sm:inline"}>
          {mounted ? activeLabel : "Theme"}
        </span>
        <ChevronDown
          className={`size-3.5 shrink-0 text-slate-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-44 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-black/5 dark:border-slate-700 dark:bg-slate-900">
          <div className="p-1.5">
            {themeOptions.map((option) => {
              const Icon = option.icon;
              const isActive = option.value === activeTheme;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => { setTheme(option.value); setOpen(false); }}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                    isActive
                      ? "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                      : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`}
                >
                  <Icon className="size-4 shrink-0 text-slate-400" aria-hidden="true" />
                  <span className="flex-1 text-left">{option.label}</span>
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
