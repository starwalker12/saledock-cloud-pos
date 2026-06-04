import Link from "next/link";

type ReportFiltersProps = {
  start: string;
  end: string;
  range: string;
  quickRanges: { label: string; value: string }[];
};

export function ReportFilters({ start, end, range, quickRanges }: ReportFiltersProps) {
  return (
    <form
      action="/reports"
      method="GET"
      className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm print:hidden"
    >
      <div className="grid gap-4 xl:grid-cols-[1fr_auto] xl:items-end">
        <div className="flex flex-wrap items-center gap-2">
          {quickRanges.map((qr) => (
            <Link
              key={qr.value}
              href={`/reports?range=${qr.value}`}
              className={`min-h-10 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                range === qr.value
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-slate-50 text-slate-700 hover:bg-slate-100"
              }`}
            >
              {qr.label}
            </Link>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <input type="hidden" name="range" value="custom" />
          <label className="block min-w-0 text-left">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1">
              Start Date
            </span>
            <input
              type="date"
              name="startDate"
              defaultValue={start}
              className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-600"
            />
          </label>
          <label className="block min-w-0 text-left">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1">
              End Date
            </span>
            <input
              type="date"
              name="endDate"
              defaultValue={end}
              className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-600"
            />
          </label>
          <button
            type="submit"
            className="h-10 rounded-xl bg-slate-950 px-5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-slate-900"
          >
            Apply Filter
          </button>
        </div>
      </div>
    </form>
  );
}
