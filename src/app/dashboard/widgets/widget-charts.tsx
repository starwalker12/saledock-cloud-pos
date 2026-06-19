import React from "react";

/**
 * Reusable, dependency-free chart primitives for dashboard widgets.
 *
 * Design rules (see Part D of the dashboard brief):
 *  - Pure presentational components — no data fetching, no hooks, no state.
 *    They render whatever numbers they are handed; they never compute money,
 *    stock, or report figures themselves.
 *  - Crisp text: labels/values are real HTML (not scaled SVG text) so nothing
 *    is ever clipped or blurred. Only the plot shapes use SVG.
 *  - Background-agnostic colour: single-series charts use the per-card
 *    `--widget-chart-color` variable (set by widget-grid) so bars/lines stay
 *    readable on light, gradient, and solid-coloured cards alike. Multi-series
 *    charts (pie/donut) separate slices with angular gaps so the card colour
 *    shows through — no clashing on solid cards.
 *  - Motion is opt-in via the shared PR #249 utilities and is disabled under
 *    prefers-reduced-motion (handled centrally in globals.css).
 */

export type ChartPoint = { key: string | number; label: string; value: number; title?: string };
export type ChartSlice = { label: string; value: number };

const CHART_COLOR = "var(--widget-chart-color)";

// Brand-derived categorical palette for multi-series charts (pie/donut/ranking).
// Ordered for maximum adjacent contrast; warning/negative coral is kept last so
// it is only reached when there are many categories.
export const CHART_PALETTE = [
  "#2563eb", // royal blue
  "#0d9488", // teal / aqua
  "#f59e0b", // amber
  "#7c3aed", // violet
  "#0ea5e9", // sky
  "#16a34a", // green
  "#1e3a8a", // deep navy
  "#f43f5e", // coral (warning / overflow only)
];

function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export function ChartEmpty({ message }: { message: string }) {
  return (
    <div className="flex h-full min-h-[60px] flex-1 items-center justify-center px-2 text-center">
      <p className="widget-chart-muted text-xs font-semibold italic text-slate-500 dark:text-slate-400">{message}</p>
    </div>
  );
}

/**
 * Vertical bar chart. HTML bars (crisp labels, never clipped), a baseline,
 * and an optional peak marker. `density` controls label thinning for long
 * series (e.g. a full month).
 */
export function VerticalBars({
  points,
  heightClass,
  animate = true,
}: {
  points: ChartPoint[];
  heightClass: string;
  animate?: boolean;
}) {
  const safeMax = Math.max(...points.map((p) => Number(p.value) || 0), 1);
  const animateBars = animate && !reducedMotion();

  return (
    <div className={`flex w-full items-end gap-[3px] border-b border-slate-200/70 dark:border-slate-700/60 ${heightClass}`} role="img" aria-label="Bar chart">
      {points.map((bar, idx) => {
        const value = Number(bar.value) || 0;
        const pct = (value / safeMax) * 100;
        const height = value > 0 ? Math.max(pct, 6) : 1.5;
        return (
          <div key={bar.key} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
            <div className="flex h-full w-full items-end justify-center">
              <div
                className={`w-full max-w-[26px] rounded-t-[3px] ${animateBars ? "animate-bar-grow" : ""}`}
                style={{
                  height: `${height}%`,
                  backgroundColor: CHART_COLOR,
                  opacity: value > 0 ? 0.9 : 0.25,
                  animationDelay: animateBars ? `${Math.min(idx * 30, 360)}ms` : undefined,
                }}
                title={bar.title}
              />
            </div>
            <span className="widget-chart-muted h-3 truncate text-[10px] font-bold leading-none text-slate-500 dark:text-slate-400">
              {bar.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Horizontal bar / ranking chart. HTML rows so long names and values stay
 * fully legible. Each row shows a filled track sized to the row value.
 */
export function HorizontalBars({
  rows,
  formatValue,
  colored = false,
  moreCount = 0,
  animate: animateProp = true,
}: {
  rows: { label: string; value: number; sub?: string }[];
  formatValue: (value: number) => string;
  colored?: boolean;
  moreCount?: number;
  animate?: boolean;
}) {
  const safeMax = Math.max(...rows.map((r) => Number(r.value) || 0), 1);
  const animate = animateProp && !reducedMotion();

  return (
    <div className="flex w-full flex-1 flex-col justify-center gap-2">
      {rows.map((row, idx) => {
        const value = Number(row.value) || 0;
        const pct = value > 0 ? Math.max((value / safeMax) * 100, 4) : 0;
        const color = colored ? CHART_PALETTE[idx % CHART_PALETTE.length] : CHART_COLOR;
        return (
          <div key={`${row.label}-${idx}`} className="min-w-0">
            <div className="mb-0.5 flex items-baseline justify-between gap-2">
              <span className="widget-chart-label min-w-0 flex-1 truncate text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                {row.label}
              </span>
              <span className="widget-chart-strong max-w-[55%] shrink-0 truncate text-[11px] font-black text-slate-900 dark:text-white tabular-nums">
                {formatValue(value)}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200/70 dark:bg-slate-700/50">
              <div
                className={`h-full rounded-full ${animate ? "animate-widget-bar-x" : ""}`}
                style={{
                  width: `${pct}%`,
                  backgroundColor: color,
                  animationDelay: animate ? `${Math.min(idx * 50, 300)}ms` : undefined,
                }}
              />
            </div>
          </div>
        );
      })}
      {moreCount > 0 && (
        <p className="widget-chart-muted truncate text-[10px] font-semibold text-slate-500 dark:text-slate-400">
          + {moreCount} more
        </p>
      )}
    </div>
  );
}

/**
 * Line / area trend. SVG path with a non-scaling stroke (crisp at any size)
 * over a baseline; x labels rendered as HTML below so they never clip.
 */
export function TrendLine({
  points,
  heightClass,
  area = false,
  animate: animateProp = true,
}: {
  points: ChartPoint[];
  heightClass: string;
  area?: boolean;
  animate?: boolean;
}) {
  const values = points.map((p) => Number(p.value) || 0);
  const safeMax = Math.max(...values, 1);
  const n = points.length;
  const W = 100;
  const H = 40;
  const padY = 4; // vertical headroom so the peak never touches the top edge
  const padX = 1.5; // horizontal inset so end points/round caps stay in bounds
  const innerW = W - padX * 2;
  const coords = points.map((p, i) => {
    const x = n <= 1 ? W / 2 : padX + (i / (n - 1)) * innerW;
    const v = Number(p.value) || 0;
    const y = H - padY - (v / safeMax) * (H - padY * 2);
    return { x, y };
  });
  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(2)},${c.y.toFixed(2)}`).join(" ");
  const areaPath = `${linePath} L${coords[coords.length - 1].x.toFixed(2)},${H} L${coords[0].x.toFixed(2)},${H} Z`;
  const animate = animateProp && !reducedMotion();
  const gradId = React.useId();

  return (
    <div className={`relative w-full overflow-hidden border-b border-slate-200/70 dark:border-slate-700/60 ${heightClass}`}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full overflow-hidden" role="img" aria-label="Trend line chart">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_COLOR} stopOpacity="0.28" />
            <stop offset="100%" stopColor={CHART_COLOR} stopOpacity="0" />
          </linearGradient>
        </defs>
        {area && <path d={areaPath} fill={`url(#${gradId})`} stroke="none" />}
        <path
          d={linePath}
          fill="none"
          stroke={CHART_COLOR}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          className={animate ? "animate-widget-line" : ""}
          style={{ ["--dash" as string]: "240" }}
          pathLength={240}
          strokeDasharray={240}
        />
      </svg>
    </div>
  );
}

export function Sparkline({ points }: { points: ChartPoint[] }) {
  const values = points.map((p) => Number(p.value) || 0);
  const safeMax = Math.max(...values, 1);
  const n = points.length;
  const coords = points.map((p, i) => {
    const x = n <= 1 ? 0 : (i / (n - 1)) * 100;
    const y = 20 - (Number(p.value) || 0) / safeMax * 18 - 1;
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg viewBox="0 0 100 20" preserveAspectRatio="none" className="h-6 w-full" role="img" aria-label="Sparkline">
      <path d={coords.join(" ")} fill="none" stroke={CHART_COLOR} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/**
 * Pie / donut. Slices are separated by a small angular gap so the card
 * background shows between them — readable on any card colour without a
 * stroke that would need to match the (unknown) background.
 */
export function PieDonut({
  slices,
  formatValue,
  donut = true,
  centerLabel,
  centerValue,
  moreCount = 0,
  animate: animateProp = true,
}: {
  slices: ChartSlice[];
  formatValue: (value: number) => string;
  donut?: boolean;
  centerLabel?: string;
  centerValue?: string;
  moreCount?: number;
  animate?: boolean;
}) {
  const total = slices.reduce((s, x) => s + (Number(x.value) || 0), 0);
  if (total <= 0) {
    return <ChartEmpty message="No data to chart yet" />;
  }

  // Donut uses a thin ring; pie uses a thick ring whose inner radius reaches the
  // centre. Both fit inside the 36×36 viewBox so nothing is clipped.
  const C = 18;
  const R = donut ? 15.915 : 9; // donut radius gives circumference ≈ 100
  const SW = donut ? 4.5 : 18;
  const circumference = 2 * Math.PI * R;
  const gap = slices.length > 1 ? circumference * 0.02 : 0;
  const animate = animateProp && !reducedMotion();

  // Cumulative offset per slice computed without mutation (n is tiny — max ~6).
  const arcs = slices.map((slice, idx) => {
    const value = Number(slice.value) || 0;
    const frac = value / total;
    const precedingFrac = slices
      .slice(0, idx)
      .reduce((sum, s) => sum + (Number(s.value) || 0) / total, 0);
    const len = Math.max(frac * circumference - gap, 0);
    return {
      color: CHART_PALETTE[idx % CHART_PALETTE.length],
      dasharray: `${len} ${circumference - len}`,
      dashoffset: -(precedingFrac * circumference),
      label: slice.label,
      value,
    };
  });

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-wrap content-center items-center justify-center gap-x-3 gap-y-2 overflow-hidden">
      <div className={`relative shrink-0 ${animate ? "animate-fade-in" : ""}`} style={{ width: 92, height: 92 }}>
        <svg viewBox="0 0 36 36" className="h-[92px] w-[92px] -rotate-90 overflow-hidden">
          {/* Contrast separator ring: drawn in the card's high-contrast mark
             colour so slice edges/gaps stay visible even when a slice colour
             matches the card (e.g. a blue slice on a solid blue card). */}
          <circle cx={C} cy={C} r={R} fill="none" stroke={CHART_COLOR} strokeWidth={SW + 1.4} opacity={0.9} />
          {arcs.map((arc, idx) => (
            <circle
              key={idx}
              cx={C}
              cy={C}
              r={R}
              fill="none"
              stroke={arc.color}
              strokeWidth={SW}
              strokeDasharray={arc.dasharray}
              strokeDashoffset={arc.dashoffset}
            />
          ))}
        </svg>
        {donut && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            {centerValue && <span className="widget-chart-strong text-xs font-black leading-none text-slate-900 dark:text-white">{centerValue}</span>}
            {centerLabel && <span className="widget-chart-muted mt-0.5 text-[8px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{centerLabel}</span>}
          </div>
        )}
      </div>
      <ul className="min-w-[7rem] flex-1 space-y-1 overflow-hidden">
        {arcs.map((arc, idx) => (
          <li key={idx} className="flex min-w-0 items-center gap-1.5 text-[11px]">
            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: arc.color }} aria-hidden="true" />
            <span className="widget-chart-label min-w-0 flex-1 truncate font-semibold text-slate-700 dark:text-slate-200">{arc.label}</span>
            <span className="widget-chart-strong max-w-[45%] shrink-0 truncate font-black text-slate-900 dark:text-white tabular-nums">{formatValue(arc.value)}</span>
          </li>
        ))}
        {moreCount > 0 && (
          <li className="widget-chart-muted truncate pl-3.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
            + {moreCount} more
          </li>
        )}
      </ul>
    </div>
  );
}

/**
 * Ranking list — numbered rows with a subtle inline progress track. Used as
 * the "Table / List" view for ranked metrics like Top Products.
 */
export function RankingList({
  rows,
  formatValue,
  moreCount = 0,
}: {
  rows: { label: string; value: number; sub?: string }[];
  formatValue: (value: number) => string;
  moreCount?: number;
}) {
  const safeMax = Math.max(...rows.map((r) => Number(r.value) || 0), 1);
  return (
    <div className="flex w-full flex-1 flex-col justify-center gap-1.5">
      {rows.map((row, idx) => {
        const value = Number(row.value) || 0;
        const pct = value > 0 ? Math.max((value / safeMax) * 100, 4) : 0;
        return (
          <div key={`${row.label}-${idx}`} className="relative overflow-hidden rounded-lg">
            <div className="absolute inset-y-0 left-0 rounded-lg bg-[var(--widget-chart-color)] opacity-[0.12]" style={{ width: `${pct}%` }} aria-hidden="true" />
            <div className="relative flex items-center gap-2 px-2 py-1">
              <span className="widget-chart-label flex size-4 shrink-0 items-center justify-center rounded-full bg-slate-200/80 text-[9px] font-black text-slate-600 dark:bg-slate-700/70 dark:text-slate-200">
                {idx + 1}
              </span>
              <span className="widget-chart-strong min-w-0 flex-1 truncate text-[11px] font-semibold text-slate-800 dark:text-slate-100">{row.label}</span>
              {row.sub && <span className="widget-chart-muted hidden max-w-[30%] shrink-0 truncate text-[10px] font-medium text-slate-500 dark:text-slate-400 sm:inline">{row.sub}</span>}
              <span className="widget-chart-strong max-w-[45%] shrink-0 truncate text-[11px] font-black text-slate-900 dark:text-white tabular-nums">{formatValue(value)}</span>
            </div>
          </div>
        );
      })}
      {moreCount > 0 && (
        <p className="widget-chart-muted truncate px-2 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
          + {moreCount} more
        </p>
      )}
    </div>
  );
}
