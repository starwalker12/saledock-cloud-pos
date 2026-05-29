"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { getDictionary, type Lang } from "./translations";

const COOKIE_NAME = "saledock_lang";
const STORAGE_KEY = "saledock_lang";

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function setCookie(name: string, value: string, days = 365) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires};path=/;SameSite=Lax`;
}

type LanguageContextValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  dict: Record<string, unknown>;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function getInitialLang(): Lang {
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "ur" || stored === "ur-roman") return stored;
    const cookie = getCookie(COOKIE_NAME);
    if (cookie === "en" || cookie === "ur" || cookie === "ur-roman") return cookie;
  }
  return "en";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(getInitialLang);

  const setLang = useCallback((newLang: Lang) => {
    setLangState(newLang);
    setCookie(COOKIE_NAME, newLang);
    try { localStorage.setItem(STORAGE_KEY, newLang); } catch {}
    document.documentElement.lang = newLang === "ur-roman" ? "ur" : newLang;
  }, []);

  const dict = getDictionary(lang) as Record<string, unknown>;

  return (
    <LanguageContext.Provider value={{ lang, setLang, dict }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
