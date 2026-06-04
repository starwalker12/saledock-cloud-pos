import Link from "next/link";
import { ArrowRight, CheckCircle } from "lucide-react";
import { ScrollReveal } from "@/components/scroll-reveal";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function CtaSection({ d }: { d: any }) {
  return (
    <ScrollReveal delay={100}>
      <section className="relative overflow-hidden border-t border-slate-200/60 px-4 py-16 text-center sm:py-24 dark:border-white/[0.05]">
        <div aria-hidden className="pointer-events-none absolute inset-0"
          style={{ background: "linear-gradient(135deg,#020817 0%,#0a1e40 45%,#071e35 100%)" }}
        />
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.055]"
          style={{
            backgroundImage: "radial-gradient(circle,#94a3b8 1px,transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />
        <div aria-hidden className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(ellipse 65% 55% at 50% 100%,rgba(0,184,176,0.14) 0%,transparent 65%)" }}
        />

        <div className="relative mx-auto max-w-2xl">
          <ScrollReveal delay={150}>
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/15 bg-white/[0.06] text-[#00b8b0] shadow-lg backdrop-blur-sm">
              <CheckCircle className="h-8 w-8" />
            </div>
          </ScrollReveal>
          <ScrollReveal delay={200}>
            <h2 className="font-display text-2xl font-extrabold text-white sm:text-3xl">
              Launch your shop on SaleDock Cloud POS
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-base leading-relaxed text-slate-400">
              Join shops that trust SaleDock for their daily operations. Free to start, no commitment.
            </p>
          </ScrollReveal>
          <ScrollReveal delay={300}>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link href="/login?signup=1"
                className="group inline-flex h-12 w-full max-w-xs cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0b2f6f] to-[#00b8b0] px-8 text-sm font-bold text-white shadow-lg transition-all duration-200 hover:opacity-90 hover:shadow-xl hover:-translate-y-0.5 sm:w-auto">
                {d?.cta?.createAccount || "Create your account"}
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
              <Link href="/login"
                className="inline-flex h-12 w-full max-w-xs cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/[0.06] px-8 text-sm font-semibold text-white backdrop-blur-sm transition-all duration-200 hover:bg-white/15 hover:-translate-y-0.5 sm:w-auto">
                {d?.cta?.signIn || "Sign in"}
              </Link>
            </div>
            <p className="mt-4 text-xs text-slate-600">{d?.cta?.noCredit || "No credit card required · Free to start"}</p>
          </ScrollReveal>
        </div>
      </section>
    </ScrollReveal>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */
