import { AppShell } from "@/components/layout/app-shell";

function Box({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-200/60 ${className}`} />;
}

export default function ExpensesLoading() {
  return (
    <AppShell pageTitle="Expenses">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <Box className="h-3 w-24" />
            <Box className="mt-2 h-7 w-32" />
            <Box className="mt-4 h-3 w-40" />
          </div>
        ))}
      </div>
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <Box className="h-4 w-40" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Box key={i} className="h-14 w-full" />
          ))}
        </div>
      </div>
    </AppShell>
  );
}
