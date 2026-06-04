import { ScrollReveal } from "@/components/scroll-reveal";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function SecuritySection({ securityItems }: { securityItems: any[] }) {
  return (
    <section className="relative border-t border-slate-200/60 bg-white px-4 py-16 sm:py-24 dark:border-white/[0.05] dark:bg-[#050c1a]">
      <div className="pointer-events-none absolute right-0 top-0 h-px w-1/3 bg-gradient-to-l from-transparent via-[#00b8b0]/30 to-transparent" />

      <div className="mx-auto max-w-4xl">
        <ScrollReveal>
          <div className="flex flex-col items-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-teal-200/80 bg-teal-50 px-3.5 py-1.5 dark:border-teal-800/30 dark:bg-teal-950/30">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />
              <span className="font-display text-[11px] font-semibold uppercase tracking-widest text-teal-700 dark:text-teal-400">Security</span>
            </div>
            <h2 className="font-display text-center text-2xl font-extrabold text-slate-950 sm:text-3xl dark:text-white">
              Built with security first
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-center text-base leading-relaxed text-slate-500 dark:text-slate-400">
              Your data stays yours. SaleDock is designed with tenant isolation, role-based access, and defensive coding from day one.
            </p>
          </div>
        </ScrollReveal>

        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2">
          {securityItems.map((item, i) => {
            const Icon = item.icon;
            return (
              <ScrollReveal key={item.title} delay={i * 100}>
                <div className="group relative cursor-default rounded-2xl border border-slate-200 bg-slate-50 p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl dark:border-slate-700/50 dark:bg-slate-900">
                  <div className="absolute inset-x-0 -top-px h-[3px] rounded-t-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                    style={{ background: item.gradient }} />
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl text-white shadow-md"
                    style={{ background: item.gradient }}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-5 font-display text-base font-bold text-slate-950 dark:text-white">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{item.desc}</p>
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
