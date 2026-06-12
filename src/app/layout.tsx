import type { Metadata } from "next";
import { Geist, Geist_Mono, Syne, Noto_Nastaliq_Urdu } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { LanguageProvider } from "@/lib/i18n/language-provider";
import AnalyticsNotice from "@/components/analytics-notice";
import { env } from "@/lib/env";
import {
  COLOR_THEME_STORAGE_KEY,
  COLOR_THEME_VALUES,
  CUSTOM_THEME_CSS_VARIABLES,
  CUSTOM_THEME_FIELDS,
  CUSTOM_THEME_STORAGE_KEY,
  DEFAULT_COLOR_THEME,
} from "@/lib/color-theme";

const colorThemeInitScript = `
(() => {
  const root = document.documentElement;
  const defaultTheme = "${DEFAULT_COLOR_THEME}";
  const customTheme = "custom";
  const fields = ${JSON.stringify(CUSTOM_THEME_FIELDS)};
  const customVariables = ${JSON.stringify(CUSTOM_THEME_CSS_VARIABLES)};
  const hexPattern = /^#[0-9A-Fa-f]{6}$/;

  const clearCustomVariables = () => {
    customVariables.forEach((name) => root.style.removeProperty(name));
  };

  const hexToRgb = (hex) => {
    const clean = hex.replace("#", "");
    return {
      r: parseInt(clean.slice(0, 2), 16),
      g: parseInt(clean.slice(2, 4), 16),
      b: parseInt(clean.slice(4, 6), 16),
    };
  };

  const toHex = (value) => Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();

  const mixHex = (hex, targetHex, amount) => {
    const color = hexToRgb(hex);
    const target = hexToRgb(targetHex);
    return "#" + toHex(color.r + (target.r - color.r) * amount)
      + toHex(color.g + (target.g - color.g) * amount)
      + toHex(color.b + (target.b - color.b) * amount);
  };

  const hexToRgba = (hex, alpha) => {
    const color = hexToRgb(hex);
    return "rgba(" + color.r + "," + color.g + "," + color.b + "," + alpha + ")";
  };

  const applyCustomVariables = (colors) => {
    root.style.setProperty("--sidebar-bg", colors.sidebarBg);
    root.style.setProperty("--sidebar-inactive", colors.sidebarInactive);
    root.style.setProperty("--sidebar-active-bg", colors.sidebarActiveBg);
    root.style.setProperty("--sidebar-active-text", colors.sidebarActiveText);
    root.style.setProperty("--sidebar-active-accent", colors.sidebarActiveAccent);
    root.style.setProperty("--primary-accent-bg", colors.primaryAccentBg);
    root.style.setProperty("--primary-accent-text", colors.primaryAccentText);
    root.style.setProperty("--sidebar-popover-bg", mixHex(colors.sidebarBg, "#FFFFFF", 0.06));
    root.style.setProperty("--sidebar-count-bg", hexToRgba(colors.sidebarActiveAccent, 0.22));
    root.style.setProperty("--sidebar-confirm-text", colors.sidebarBg);
    root.style.setProperty("--primary-accent-hover", mixHex(colors.primaryAccentBg, "#000000", 0.16));
    root.style.setProperty("--primary-accent-soft", hexToRgba(colors.primaryAccentBg, 0.12));
  };

  const readCustomColors = () => {
    const raw = window.localStorage.getItem("${CUSTOM_THEME_STORAGE_KEY}");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

    return fields.reduce((colors, field) => {
      const color = parsed[field.key];
      if (!hexPattern.test(color)) throw new Error("Invalid custom theme color");
      colors[field.key] = color.toUpperCase();
      return colors;
    }, {});
  };

  try {
    const allowed = ${JSON.stringify(COLOR_THEME_VALUES)};
    const stored = window.localStorage.getItem("${COLOR_THEME_STORAGE_KEY}");
    const theme = allowed.includes(stored) ? stored : defaultTheme;

    if (theme === customTheme) {
      const customColors = readCustomColors();
      if (!customColors) {
        clearCustomVariables();
        root.setAttribute("data-color-theme", defaultTheme);
        return;
      }

      root.setAttribute("data-color-theme", customTheme);
      applyCustomVariables(customColors);
      return;
    }

    clearCustomVariables();
    root.setAttribute("data-color-theme", theme);
  } catch {
    clearCustomVariables();
    root.setAttribute("data-color-theme", defaultTheme);
  }
})();
`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const notoNastaliqUrdu = Noto_Nastaliq_Urdu({
  variable: "--font-urdu",
  subsets: ["arabic"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "SaleDock Cloud POS",
  description:
    "SaleDock is a cloud POS platform for shops to manage sales, inventory, repairs, invoices, expenses, and reports.",
  verification: {
    google: "4yFsod3SEer6gpo9UjvizFLcwif5c9ZcG1nOZ-2mUcQ",
  },
  other: {
    ...(env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
      ? {
          "google-site-verification": env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
        }
      : {}),
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = (await headers()).get("x-nonce") || undefined;

  return (
    <html
      lang="en"
      data-color-theme={DEFAULT_COLOR_THEME}
      className={`${geistSans.variable} ${geistMono.variable} ${syne.variable} ${notoNastaliqUrdu.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: colorThemeInitScript }} />
      </head>
      <body className="flex min-h-full flex-col bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-slate-50 transition-colors duration-200">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <LanguageProvider>
            {children}
          </LanguageProvider>
        </ThemeProvider>
        <AnalyticsNotice
          nonce={nonce}
          gaMeasurementId={process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID}
          clarityProjectId={process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID}
        />
      </body>
    </html>
  );
}
