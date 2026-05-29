"use client";

import { ChevronDown } from "lucide-react";
import { useLanguage } from "@/lib/i18n/language-provider";

const faqKeys = [
  ["q1", "a1"],
  ["q2", "a2"],
  ["q3", "a3"],
  ["q4", "a4"],
  ["q5", "a5"],
  ["q6", "a6"],
] as const;

export function FaqSection() {
  const { dict } = useLanguage();
  const faqDict = dict.faq as Record<string, string> | undefined;

  const t = (key: string, fallback: string) => faqDict?.[key] || fallback;
  const title = t("title", "Frequently asked questions");

  return (
    <section className="relative border-t border-slate-200/60 bg-white px-4 py-16 sm:py-24 dark:border-white/[0.05] dark:bg-[#050c1a]">
      <div className="pointer-events-none absolute left-1/3 right-1/3 top-0 h-px bg-gradient-to-r from-transparent via-[#00b8b0]/25 to-transparent" />

      <div className="mx-auto max-w-3xl">
        <div className="flex flex-col items-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-teal-200/80 bg-teal-50 px-3.5 py-1.5 dark:border-teal-800/30 dark:bg-teal-950/30">
            <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />
            <span className="font-display text-[11px] font-semibold uppercase tracking-widest text-teal-700 dark:text-teal-400">FAQ</span>
          </div>
          <h2 className="font-display text-center text-2xl font-extrabold text-slate-950 sm:text-3xl dark:text-white">
            {title}
          </h2>
        </div>

        <div className="mt-10 space-y-4">
          {faqKeys.map(([qKey, aKey]) => {
            const question = t(qKey, "");
            const answer = t(aKey, "");
            return (
              <details
                key={qKey}
                className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all duration-200 hover:shadow-md dark:border-slate-700/50 dark:bg-slate-900"
              >
                <summary className="flex cursor-pointer items-center justify-between gap-4 px-5 py-4 text-sm font-bold text-slate-900 transition-colors hover:text-teal-700 dark:text-slate-100 dark:hover:text-teal-400 sm:px-6 sm:py-5 sm:text-base [&::-webkit-details-marker]:hidden">
                  <span>{question}</span>
                  <ChevronDown className="size-4 shrink-0 text-slate-400 transition-transform duration-200 group-open:rotate-180" />
                </summary>
                <div className="border-t border-slate-100 px-5 pb-5 pt-4 text-sm leading-6 text-slate-600 dark:border-slate-800 dark:text-slate-400 sm:px-6 sm:pb-6 sm:pt-4">
                  {answer}
                </div>
              </details>
            );
          })}
        </div>
      </div>
    </section>
  );
}
