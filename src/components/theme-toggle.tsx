"use client";

import { ChevronDown, Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useState } from "react";

const themeOptions = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(id);
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

  return (
    <label className="theme-toggle print:hidden relative flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:shadow-none dark:hover:bg-slate-800">
      <ActiveIcon className="size-4 text-blue-700 dark:text-slate-100" aria-hidden="true" />
      <span className="sr-only">Theme</span>
      {mounted ? (
        <select
          aria-label="Theme"
          value={activeTheme}
          onChange={(event) => setTheme(event.target.value)}
          className="max-w-24 cursor-pointer appearance-none bg-transparent pr-4 text-xs font-bold outline-none sm:text-sm"
        >
          {themeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <span className="w-14 text-xs font-bold text-slate-500 dark:text-slate-400">Theme</span>
      )}
      <ChevronDown
        className="pointer-events-none absolute right-2 top-1/2 size-3 -translate-y-1/2 text-slate-400"
        aria-hidden="true"
      />
    </label>
  );
}
