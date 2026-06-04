import { ScrollReveal } from "@/components/scroll-reveal";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function HowItWorksSection({ howItWorks }: { howItWorks: any[] }) {
  return (
    <section className="relative border-t border-slate-200/60 bg-white px-4 py-16 sm:py-24 dark:border-white/[0.05] dark:bg-[#050c1a]">
      <div className="pointer-events-none absolute left-1/3 right-1/3 top-0 h-px bg-gradient-to-r from-transparent via-violet-400/25 to-transparent" />

      <div className="mx-auto max-w-4xl">
        <ScrollReveal>
          <div className="flex flex-col items-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-violet-200/80 bg-violet-50 px-3.5 py-1.5 dark:border-violet-800/30 dark:bg-violet-950/30">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
              <span className="font-display text-[11px] font-semibold uppercase tracking-widest text-violet-700 dark:text-violet-400">Getting started</span>
            </div>
            <h2 className="font-display text-center text-2xl font-extrabold text-slate-950 sm:text-3xl dark:text-white">
              Get started in minutes
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-center text-base leading-relaxed text-slate-500 dark:text-slate-400">
              No credit card required. No complicated setup. Just three simple steps.
            </p>
          </div>
        </ScrollReveal>

        <div className="relative mt-12 grid grid-cols-1 gap-10 sm:grid-cols-3">
          <div aria-hidden className="pointer-events-none absolute left-[calc(100%/6)] right-[calc(100%/6)] top-7 hidden border-t-2 border-dashed border-slate-200 dark:border-slate-700 sm:block" />
          {howItWorks.map((item, i) => (
            <ScrollReveal key={item.step} delay={i * 120}>
              <div className="group text-center">
                <span className="relative z-10 mx-auto flex h-14 w-14 items-center justify-center rounded-2xl font-display text-xl font-black text-white shadow-lg transition-all duration-300 group-hover:-translate-y-0.5 group-hover:shadow-xl group-hover:shadow-blue-900/25"
                  style={{ background: "linear-gradient(135deg,#0b2f6f,#0891b2)" }}>
                  {item.step}
                </span>
                <h3 className="mt-6 font-display text-base font-bold text-slate-950 dark:text-white">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{item.desc}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */
