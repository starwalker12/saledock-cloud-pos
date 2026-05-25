import { AppShell } from "@/components/layout/app-shell";

function Box({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-200/60 ${className}`} />;
}

export default function DailyClosingLoading() {
  return (
    <AppShell pageTitle="Daily Closing">
      <Box className="mb-5 h-12 w-full" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <Box className="h-3 w-24" />
            <Box className="mt-2 h-7 w-32" />
            <Box className="mt-4 h-3 w-40" />
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <Box className="h-72 w-full" />
        <Box className="h-72 w-full" />
      </div>
    </AppShell>
  );
}
