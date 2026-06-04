import { ScrollReveal } from "@/components/scroll-reveal";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function DayInLifeSection({ shopDaySteps }: { shopDaySteps: any[] }) {
  return (
    <section className="relative border-t border-slate-200/60 bg-slate-50 px-4 py-16 sm:py-24 dark:border-white/[0.05] dark:bg-[#070b16]">
      <div className="pointer-events-none absolute left-1/4 right-1/4 top-0 h-px bg-gradient-to-r from-transparent via-[#00b8b0]/25 to-transparent" />

      <div className="mx-auto max-w-5xl">
        <ScrollReveal>
          <div className="flex flex-col items-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-200/80 bg-cyan-50 px-3.5 py-1.5 dark:border-cyan-800/30 dark:bg-cyan-950/30">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-500" />
              <span className="font-display text-[11px] font-semibold uppercase tracking-widest text-cyan-700 dark:text-cyan-400">Daily workflow</span>
            </div>
            <h2 className="font-display text-center text-2xl font-extrabold text-slate-950 sm:text-3xl dark:text-white">
              Built for the full shop day
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-center text-base leading-relaxed text-slate-500 dark:text-slate-400">
              From opening the register to reviewing tonight&apos;s analytics — SaleDock covers every moment.
            </p>
          </div>
        </ScrollReveal>

        <div className="relative mt-14">
          <div aria-hidden className="pointer-events-none absolute left-[10%] right-[10%] top-[22px] hidden border-t-2 border-dashed border-slate-200 dark:border-slate-700 sm:block" />
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-5">
            {shopDaySteps.map((step, i) => {
              const Icon = step.icon;
              return (
                <ScrollReveal key={step.title} delay={i * 100}>
                  <div className="group flex flex-col items-center text-center">
                    <div className="mb-3 inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                      {step.time}
                    </div>
                    <div className="relative z-10 flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-md transition-all duration-300 group-hover:-translate-y-0.5 group-hover:shadow-lg group-hover:shadow-blue-900/25"
                      style={{ background: "linear-gradient(135deg,#0b2f6f,#00b8b0)" }}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="mt-4 font-display text-sm font-bold text-slate-950 dark:text-white">{step.title}</h3>
                    <p className="mt-1.5 text-xs leading-5 text-slate-500 dark:text-slate-400">{step.desc}</p>
                  </div>
                </ScrollReveal>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */
