import { ScrollReveal } from "@/components/scroll-reveal";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function FeaturesSection({ features }: { features: any[] }) {
  return (
    <section className="relative border-t border-slate-200/60 bg-slate-50 px-4 py-16 sm:py-24 dark:border-white/[0.05] dark:bg-[#070b16]">
      <div className="pointer-events-none absolute left-0 top-0 h-px w-1/3 bg-gradient-to-r from-transparent via-[#00b8b0]/30 to-transparent" />

      <div className="mx-auto max-w-6xl">
        <ScrollReveal>
          <div className="flex flex-col items-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-200/80 bg-blue-50 px-3.5 py-1.5 dark:border-blue-800/30 dark:bg-blue-950/30">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
              <span className="font-display text-[11px] font-semibold uppercase tracking-widest text-blue-700 dark:text-blue-400">Features</span>
            </div>
            <h2 className="font-display text-center text-2xl font-extrabold text-slate-950 sm:text-3xl dark:text-white">
              Everything your shop needs
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-center text-base leading-relaxed text-slate-500 dark:text-slate-400">
              From ringing up sales to managing repairs and generating reports — SaleDock ships with a complete toolkit for modern retail.
            </p>
          </div>
        </ScrollReveal>

        <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => {
            const Icon = f.icon;
            const isWide = i === 0;
            const isFull = i === 8;
            return (
              <ScrollReveal key={f.title} delay={i * 65}
                className={[isWide ? "lg:col-span-2" : "", isFull ? "sm:col-span-2 lg:col-span-3" : ""].join(" ")}>
                <div className="group relative h-full cursor-default rounded-2xl border border-slate-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 dark:border-slate-700/50 dark:bg-slate-900">
                  {/* Glow */}
                  <div className="absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                    style={{ boxShadow: `0 16px 48px ${f.glow}` }} />
                  {/* Top bar */}
                  <div className="absolute inset-x-0 -top-px h-[3px] rounded-t-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                    style={{ background: f.gradient }} />

                  {isWide ? (
                    <div className="relative flex flex-col gap-5 p-7 sm:flex-row sm:items-start sm:gap-7">
                      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-white shadow-md"
                        style={{ background: f.gradient }}>
                        <Icon className="h-6 w-6" />
                      </span>
                      <div>
                        <h3 className="font-display text-lg font-extrabold text-slate-950 dark:text-white">{f.title}</h3>
                        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{f.desc}</p>
                        {f.tags && (
                          <div className="mt-4 flex flex-wrap gap-2">
                            {f.tags.map((tag: any) => (
                              <span key={tag}
                                className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold"
                                style={{ background: f.glow, color: "#1d4ed8" }}>
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : isFull ? (
                    <div className="relative flex flex-col gap-5 p-7 sm:flex-row sm:items-center sm:gap-7">
                      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-white shadow-md"
                        style={{ background: f.gradient }}>
                        <Icon className="h-6 w-6" />
                      </span>
                      <div>
                        <h3 className="font-display text-lg font-extrabold text-slate-950 dark:text-white">{f.title}</h3>
                        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{f.desc}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="relative p-6">
                      <span className="flex h-12 w-12 items-center justify-center rounded-xl text-white shadow-md transition-shadow duration-300 group-hover:shadow-lg"
                        style={{ background: f.gradient }}>
                        <Icon className="h-5 w-5" />
                      </span>
                      <h3 className="mt-5 font-display text-base font-bold text-slate-950 dark:text-white">{f.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{f.desc}</p>
                    </div>
                  )}
                </div>
              </ScrollReveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */
