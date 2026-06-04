type KPI = { label: string; value: string; change: string; color: string };
type Row = { icon: React.ComponentType<{ className?: string }>; left: string; right: string; color: string; bg: string };
type Bar = { day: string; v: number };

export function DashboardPreview({
  kpi, rows, bars, icons, dark,
}: {
  kpi: KPI[]; rows: Row[]; bars: Bar[];
  icons: React.ComponentType<{ className?: string }>[];
  dark: boolean;
}) {
  const bg     = dark ? "linear-gradient(135deg,#060f20,#071525)" : "#ffffff";
  const card   = dark ? "rgba(255,255,255,0.04)" : "#f8fafc";
  const border = dark ? "rgba(255,255,255,0.07)" : "#e2e8f0";
  const text   = dark ? "#f1f5f9" : "#0f172a";
  const muted  = dark ? "#64748b" : "#64748b";
  const rowBg  = dark ? "rgba(255,255,255,0.03)" : "#f8fafc";
  const chrome = dark ? "rgba(255,255,255,0.04)" : "#f1f5f9";

  return (
    <div style={{ background: bg }}>
      {/* Browser chrome */}
      <div className="flex items-center gap-1.5 border-b px-4 py-2.5" style={{ background: chrome, borderColor: border }}>
        <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
        <span
          className="ml-2 truncate rounded border px-2.5 py-0.5 text-[11px] font-medium"
          style={{ background: dark ? "rgba(255,255,255,0.05)" : "white", borderColor: border, color: muted }}
        >
          saledock-cloud-pos.vercel.app/dashboard
        </span>
      </div>

      <div className="flex">
        {/* Sidebar */}
        <div
          className="hidden border-r p-2 sm:flex sm:flex-col sm:gap-1"
          style={{ background: dark ? "rgba(255,255,255,0.02)" : "#f8fafc", borderColor: border }}
        >
          {icons.map((Icon, i) => (
            <span
              key={i}
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={
                i === 0
                  ? { background: "linear-gradient(135deg,#0b2f6f,#00b8b0)", color: "#fff" }
                  : { color: muted }
              }
            >
              <Icon className="h-4 w-4" />
            </span>
          ))}
        </div>

        {/* Main */}
        <div className="flex-1 p-3.5">
          {/* KPI row */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {kpi.map((k) => (
              <div key={k.label} className="rounded-xl border p-3" style={{ background: card, borderColor: border }}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold" style={{ color: muted }}>{k.label}</span>
                  <span className="inline-block h-1.5 w-1.5 rounded-full animate-pulse" style={{ backgroundColor: k.color }} />
                </div>
                <p className="mt-1.5 font-display text-sm font-bold" style={{ color: text }}>{k.value}</p>
                <p className="text-[10px] font-semibold" style={{ color: k.color }}>{k.change}</p>
              </div>
            ))}
          </div>

          {/* Activity + chart */}
          <div className="mt-2.5 grid grid-cols-1 gap-2.5 lg:grid-cols-[1fr_160px]">
            <div className="space-y-1.5">
              {rows.map((row) => {
                const Icon = row.icon;
                return (
                  <div
                    key={row.left}
                    className="flex items-center gap-2.5 rounded-lg border p-2.5"
                    style={{ background: rowBg, borderColor: border }}
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md" style={{ background: row.bg, color: row.color }}>
                      <Icon className="h-3 w-3" />
                    </span>
                    <span className="truncate text-[11px] font-semibold" style={{ color: text }}>{row.left}</span>
                    <span className="ml-auto shrink-0 text-[11px] font-bold" style={{ color: row.color }}>{row.right}</span>
                  </div>
                );
              })}
            </div>

            {/* Bar chart */}
            <div className="hidden rounded-xl border p-3 lg:block" style={{ background: card, borderColor: border }}>
              <p className="mb-2 text-[9px] font-semibold uppercase tracking-wider" style={{ color: muted }}>Weekly sales</p>
              <div className="flex items-end gap-0.5" style={{ height: "52px" }}>
                {bars.map((bar, i) => (
                  <div key={i} className="flex flex-1 flex-col items-center gap-1">
                    <div className="flex h-[44px] w-full items-end">
                      <div
                        className="w-full rounded-t-sm animate-bar-grow"
                        style={{
                          height: `${bar.v}%`,
                          background: i >= 3 && i <= 4 ? "linear-gradient(to top,#0b2f6f,#00b8b0)" : "rgba(11,47,111,0.25)",
                          animationDelay: `${i * 0.07}s`,
                        }}
                      />
                    </div>
                    <span className="text-[7px] font-medium" style={{ color: muted }}>{bar.day}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
