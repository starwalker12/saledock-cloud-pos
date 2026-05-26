"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  FileText,
  RotateCcw,
  Receipt,
  Lock,
  Wrench,
  BarChart3,
  Settings,
  UserCog,
  ScrollText,
  Sparkles,
  User,
  Search,
  Loader2,
  CornerDownLeft,
  X,
} from "lucide-react";
import { executeGlobalSearchAction } from "@/app/search/actions";
import type { SearchResult } from "@/lib/data/global-search";

const QUICK_PAGES = [
  { title: "Dashboard", href: "/dashboard", icon: "LayoutDashboard" },
  { title: "POS Checkout", href: "/pos", icon: "ShoppingCart" },
  { title: "Products & Services", href: "/products", icon: "Package" },
  { title: "Customers Database", href: "/customers", icon: "Users" },
  { title: "Sales Invoices", href: "/invoices", icon: "FileText" },
  { title: "Repairs Workflow", href: "/repairs", icon: "Wrench" },
];

function getIcon(key: string) {
  switch (key) {
    case "LayoutDashboard":
      return LayoutDashboard;
    case "ShoppingCart":
      return ShoppingCart;
    case "Package":
      return Package;
    case "Users":
      return Users;
    case "FileText":
      return FileText;
    case "RotateCcw":
      return RotateCcw;
    case "Receipt":
      return Receipt;
    case "Lock":
      return Lock;
    case "Wrench":
      return Wrench;
    case "BarChart3":
      return BarChart3;
    case "Settings":
      return Settings;
    case "UserCog":
      return UserCog;
    case "ScrollText":
      return ScrollText;
    case "Sparkles":
      return Sparkles;
    case "User":
      return User;
    default:
      return Search;
  }
}

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const resultsContainerRef = useRef<HTMLDivElement>(null);

  // Bind global keyboard shortcut: Cmd/Ctrl + K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => {
          const next = !prev;
          if (next) {
            setHighlightIndex(0);
            setQuery("");
            setResults([]);
            setLoading(false);
          }
          return next;
        });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Autofocus the input field when the modal opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const handleQueryChange = (val: string) => {
    setQuery(val);
    if (!val.trim()) {
      setResults([]);
      setHighlightIndex(0);
      setLoading(false);
    } else {
      setLoading(true);
    }
  };

  // Debounced search trigger (200ms)
  useEffect(() => {
    if (!query.trim()) return;

    const delayDebounce = setTimeout(async () => {
      try {
        const res = await executeGlobalSearchAction(query);
        setResults(res);
        setHighlightIndex(0);
      } catch (err) {
        console.error("Global search failed:", err);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => clearTimeout(delayDebounce);
  }, [query]);

  // Scroll active item into view if navigating with arrow keys
  useEffect(() => {
    if (results.length > 0 && resultsContainerRef.current) {
      const activeEl = resultsContainerRef.current.querySelector(
        `[data-active-index="${highlightIndex}"]`,
      );
      if (activeEl) {
        activeEl.scrollIntoView({ block: "nearest" });
      }
    }
  }, [highlightIndex, results]);

  const handleOpen = () => {
    setOpen(true);
    setHighlightIndex(0);
    setQuery("");
    setResults([]);
    setLoading(false);
  };

  const handleClose = () => {
    setOpen(false);
    setQuery("");
    setResults([]);
    setLoading(false);
  };

  const handleNavigate = (href: string) => {
    setOpen(false);
    setQuery("");
    setResults([]);
    setLoading(false);
    router.push(href);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      handleClose();
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((prev) =>
        results.length > 0 ? (prev + 1) % results.length : 0,
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((prev) =>
        results.length > 0
          ? (prev - 1 + results.length) % results.length
          : 0,
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[highlightIndex]) {
        handleNavigate(results[highlightIndex].href);
      }
    }
  };

  // Group results dynamically by groupLabel
  const groupedResults = results.reduce<Record<string, { item: SearchResult; index: number }[]>>(
    (acc, item, globalIdx) => {
      if (!acc[item.groupLabel]) {
        acc[item.groupLabel] = [];
      }
      acc[item.groupLabel].push({ item, index: globalIdx });
      return acc;
    },
    {},
  );

  return (
    <>
      {/* Clickable search placeholder input in the Topbar */}
      <button
        onClick={handleOpen}
        className="flex min-h-11 min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-left text-sm text-slate-400 transition duration-150 hover:border-slate-300 hover:bg-slate-100/50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:bg-slate-800 sm:w-56 lg:w-72 cursor-pointer"
        aria-label="Open command search"
      >
        <Search className="size-4 shrink-0 text-slate-400" />
        <span className="flex-1 truncate">Search...</span>
        <kbd className="pointer-events-none hidden h-5 select-none items-center gap-0.5 rounded border border-slate-200 bg-white px-1.5 font-mono text-[10px] font-medium text-slate-400 dark:border-slate-700 dark:bg-slate-950 sm:inline-flex shrink-0">
          <span className="text-[10px]">⌘</span>K
        </kbd>
      </button>

      {/* Command Palette Overlay Dialog */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-0 backdrop-blur-xs sm:p-4 md:p-12"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClose();
          }}
        >
          {/* Main search panel: Modal on desktop, fullscreen sheet on mobile */}
          <div
            ref={containerRef}
            className="flex h-full w-full flex-col overflow-hidden border border-slate-200 bg-white shadow-2xl transition-all dark:border-slate-800 dark:bg-slate-950 sm:h-[460px] sm:max-w-2xl sm:rounded-2xl"
            onKeyDown={handleKeyDown}
          >
            {/* Search inputs bar */}
            <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3.5 dark:border-slate-800">
              <Search className="size-5 shrink-0 text-slate-400" />
              <input
                ref={inputRef}
                type="text"
                className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-500"
                placeholder="Search pages, SKU, barcode, device IMEI, customers..."
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                autoComplete="off"
                spellCheck="false"
              />
              {loading ? (
                <Loader2 className="size-4 shrink-0 animate-spin text-slate-400" />
              ) : query ? (
                <button
                  onClick={() => {
                    handleQueryChange("");
                    inputRef.current?.focus();
                  }}
                  className="rounded-md p-1 transition hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="size-4 text-slate-500" />
                </button>
              ) : (
                <kbd className="pointer-events-none hidden select-none items-center rounded border border-slate-200 bg-slate-50 px-1.5 font-mono text-[10px] font-semibold text-slate-400 dark:border-slate-700 dark:bg-slate-900 sm:inline-flex shrink-0">
                  ESC
                </kbd>
              )}
              {/* Close trigger on mobile */}
              <button
                onClick={handleClose}
                className="block rounded-md p-1 transition hover:bg-slate-100 dark:hover:bg-slate-800 sm:hidden"
              >
                <X className="size-5 text-slate-700 dark:text-slate-200" />
              </button>
            </div>

            {/* Results display panel */}
            <div
              ref={resultsContainerRef}
              className="min-w-0 flex-1 overflow-y-auto p-3"
            >
              {/* Query is empty */}
              {!query.trim() && (
                <div className="py-6 px-4 text-center">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Quick Navigation
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {QUICK_PAGES.map((page) => {
                      const Icon = getIcon(page.icon);
                      return (
                        <button
                          key={page.href}
                          onClick={() => handleNavigate(page.href)}
                          className="flex items-center gap-2.5 rounded-xl border border-slate-100 bg-slate-50/50 p-2.5 text-left text-xs font-bold text-slate-600 transition hover:border-slate-200 hover:bg-slate-100/50 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          <Icon className="size-4 shrink-0 text-slate-500" />
                          <span className="truncate">{page.title}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* No records found */}
              {query.trim() && results.length === 0 && !loading && (
                <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                  <Search className="size-8 text-slate-300 dark:text-slate-600" />
                  <h3 className="mt-2 text-sm font-bold text-slate-700 dark:text-slate-200">
                    No results found
                  </h3>
                  <p className="mt-1 max-w-xs text-xs text-slate-500">
                    No matching pages, products, customers, bills, or repair jobs found for &quot;
                    {query}&quot;.
                  </p>
                </div>
              )}

              {/* Loader placeholder */}
              {loading && results.length === 0 && (
                <div className="space-y-3 py-6 px-3">
                  {[1, 2, 3].map((n) => (
                    <div key={n} className="flex items-center gap-3 animate-pulse">
                        <div className="size-8 rounded-full bg-slate-100 dark:bg-slate-800 shrink-0" />
                      <div className="flex-1 space-y-1.5 min-w-0">
                        <div className="h-3 w-1/3 rounded bg-slate-100 dark:bg-slate-800" />
                        <div className="h-2 w-1/2 rounded bg-slate-100 dark:bg-slate-800" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Render matches list */}
              {results.length > 0 && (
                <div className="space-y-4">
                  {Object.entries(groupedResults).map(([groupTitle, entries]) => (
                    <div key={groupTitle} className="space-y-1">
                      <h4 className="px-3 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                        {groupTitle}
                      </h4>
                      <div className="space-y-0.5">
                        {entries.map(({ item, index }) => {
                          const Icon = getIcon(item.iconKey);
                          const isHighlighted = highlightIndex === index;
                          return (
                            <div
                              key={item.id}
                              data-active-index={index}
                              onClick={() => handleNavigate(item.href)}
                              className={`flex items-center justify-between rounded-xl p-3 cursor-pointer transition select-none ${
                                isHighlighted
                                  ? "bg-blue-50/80 text-blue-800 border-l-4 border-blue-600 pl-2 shadow-xs dark:bg-blue-950/50 dark:text-blue-100"
                                  : "hover:bg-slate-50 text-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
                              }`}
                            >
                              <div className="flex min-w-0 items-center gap-3">
                                <div
                                  className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${
                                    isHighlighted
                                      ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200"
                                      : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300"
                                  }`}
                                >
                                  <Icon className="size-4" />
                                </div>
                                <div className="min-w-0 flex-1 text-left">
                                  <p className="truncate text-xs font-bold leading-tight">
                                    {item.title}
                                  </p>
                                  {item.subtitle && (
                                    <p
                                      className={`truncate text-[10px] leading-tight mt-0.5 ${
                                        isHighlighted
                                          ? "text-blue-500 font-medium"
                                          : "text-slate-400"
                                      }`}
                                    >
                                      {item.subtitle}
                                    </p>
                                  )}
                                </div>
                              </div>

                              <div className="flex shrink-0 items-center gap-2 pl-2">
                                {item.badge && (
                                  <span
                                    className={`inline-flex rounded px-1.5 py-0.5 text-[9px] font-bold ${
                                      item.badgeClass ?? "bg-slate-100 text-slate-600"
                                    }`}
                                  >
                                    {item.badge}
                                  </span>
                                )}
                                {isHighlighted && (
                                  <CornerDownLeft className="size-3 text-blue-500 animate-pulse hidden sm:block shrink-0" />
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer containing navigation instructions */}
            <div className="hidden items-center justify-between border-t border-slate-100 bg-slate-50/50 px-4 py-2.5 text-[10px] font-bold text-slate-400 dark:border-slate-800 dark:bg-slate-900/70 sm:flex shrink-0">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1">
                  <kbd className="rounded border border-slate-200 bg-white px-1 font-mono dark:border-slate-700 dark:bg-slate-950">↑↓</kbd>
                  to navigate
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="rounded border border-slate-200 bg-white px-1 font-mono dark:border-slate-700 dark:bg-slate-950">Enter</kbd>
                  to select
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="rounded border border-slate-200 bg-white px-1 font-mono dark:border-slate-700 dark:bg-slate-950">ESC</kbd>
                  to close
                </span>
              </div>
              <div>
                <span>Gadget Zone Command Palette</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
