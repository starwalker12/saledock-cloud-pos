"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ComponentType, PointerEvent as ReactPointerEvent } from "react";
import { useReorderAnim } from "@/lib/use-reorder-animation";
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Check,
  GripVertical,
  LayoutGrid,
  PackageSearch,
  RotateCcw,
  ShoppingCart,
  TrendingUp,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";
import { STAT_CARD_TONE_STYLES, type StatCardTone } from "@/components/ui/stat-card";

const STORAGE_KEY = "saledock-dashboard-layout-v1";
const STORAGE_EVENT = "saledock-dashboard-layout-changed";

const iconMap: Record<string, ComponentType<{ className?: string }>> = {
  briefcase: Briefcase,
  packageSearch: PackageSearch,
  rotateCcw: RotateCcw,
  shoppingCart: ShoppingCart,
  trendingUp: TrendingUp,
  users: Users,
  wallet: Wallet,
  wrench: Wrench,
};

export type DashboardStatCard = {
  id: string;
  label: string;
  value: string;
  change: string;
  tone: StatCardTone;
  icon: keyof typeof iconMap;
  href?: string;
};

export type DashboardLayoutLabels = {
  editLayout: string;
  done: string;
  resetLayout: string;
  dragToReorder: string;
  moveEarlier: string;
  moveLater: string;
};

type DashboardLayoutPreferences = {
  version: 1;
  order: string[];
  updatedAt: string;
};

function uniqueStrings(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((value): value is string => typeof value === "string"))];
}

function parseStoredLayout(raw: string | null): DashboardLayoutPreferences {
  try {
    if (!raw) return { version: 1, order: [], updatedAt: "" };
    const parsed = JSON.parse(raw) as Partial<DashboardLayoutPreferences>;
    return {
      version: 1,
      order: uniqueStrings(parsed.order),
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
    };
  } catch {
    return { version: 1, order: [], updatedAt: "" };
  }
}

function getLayoutSnapshot(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function getServerLayoutSnapshot(): string {
  return "";
}

function subscribeToLayout(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) onStoreChange();
  };
  const handleLocalChange = () => onStoreChange();

  window.addEventListener("storage", handleStorage);
  window.addEventListener(STORAGE_EVENT, handleLocalChange);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(STORAGE_EVENT, handleLocalChange);
  };
}

function writeStoredLayout(order: string[]) {
  if (typeof window === "undefined") return;
  const next: DashboardLayoutPreferences = {
    version: 1,
    order,
    updatedAt: new Date().toISOString(),
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(STORAGE_EVENT));
  } catch {}
}

function clearStoredLayout() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event(STORAGE_EVENT));
  } catch {}
}

function normalizeOrder(cards: DashboardStatCard[], storedOrder: string[]): string[] {
  const knownIds = new Set(cards.map((card) => card.id));
  const saved = storedOrder.filter((id) => knownIds.has(id));
  const missing = cards.map((card) => card.id).filter((id) => !saved.includes(id));
  return [...saved, ...missing];
}

export function DashboardStatLayout({
  cards,
  firstName,
  role,
  organizationName,
  labels,
}: {
  cards: DashboardStatCard[];
  firstName: string;
  role: string;
  organizationName: string;
  labels: DashboardLayoutLabels;
}) {
  const layoutSnapshot = useSyncExternalStore(
    subscribeToLayout,
    getLayoutSnapshot,
    getServerLayoutSnapshot,
  );
  const prefs = useMemo(() => parseStoredLayout(layoutSnapshot), [layoutSnapshot]);
  const [editing, setEditing] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const draggingIdRef = useRef<string | null>(null);
  const lastDragTargetRef = useRef<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const justDraggedRef = useRef<string | null>(null);
  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null);

  const getDraggedElement = (id: string) => {
    return gridRef.current?.querySelector<HTMLElement>(`[data-dashboard-card-id="${id}"]`) ?? null;
  };

  const cleanupStyles = () => {
    if (!gridRef.current) return;
    const items = gridRef.current.querySelectorAll<HTMLElement>("[data-dashboard-card-id]");
    items.forEach((item) => {
      item.style.transform = "";
      item.style.boxShadow = "";
      item.style.opacity = "";
      item.style.zIndex = "";
      item.style.pointerEvents = "";
      item.style.willChange = "";
    });
  };

  useEffect(() => {
    if (!draggingId) {
      cleanupStyles();
    }
  }, [draggingId]);

  const cardMap = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards]);
  const orderedIds = useMemo(() => normalizeOrder(cards, prefs.order), [cards, prefs.order]);
  const orderedCards = orderedIds
    .map((id) => cardMap.get(id))
    .filter((card): card is DashboardStatCard => Boolean(card));

  useReorderAnim(gridRef, "dashboard-card-id", [orderedCards], justDraggedRef);

  const moveCard = (sourceId: string, targetId: string, placement: "before" | "after") => {
    if (sourceId === targetId) return;

    const nextOrder = normalizeOrder(cards, parseStoredLayout(getLayoutSnapshot()).order).filter(
      (id) => id !== sourceId,
    );
    const targetIndex = nextOrder.indexOf(targetId);
    if (targetIndex === -1) return;

    nextOrder.splice(placement === "after" ? targetIndex + 1 : targetIndex, 0, sourceId);
    writeStoredLayout(nextOrder);
  };

  const moveCardByStep = (cardId: string, direction: -1 | 1) => {
    const currentOrder = normalizeOrder(cards, parseStoredLayout(getLayoutSnapshot()).order);
    const sourceIndex = currentOrder.indexOf(cardId);
    const targetIndex = sourceIndex + direction;
    if (sourceIndex === -1 || targetIndex < 0 || targetIndex >= currentOrder.length) return;

    const nextOrder = [...currentOrder];
    const [source] = nextOrder.splice(sourceIndex, 1);
    nextOrder.splice(targetIndex, 0, source);
    writeStoredLayout(nextOrder);
  };

  const beginDrag = (event: ReactPointerEvent<HTMLButtonElement>, cardId: string) => {
    if (!editing || (event.pointerType === "mouse" && event.button !== 0)) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingIdRef.current = cardId;
    lastDragTargetRef.current = null;
    setDraggingId(cardId);

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;

    dragStartPosRef.current = { x: event.clientX, y: event.clientY };
    const el = getDraggedElement(cardId);
    if (el) {
      el.style.transform = "translate(0px, 0px) scale(1.03)";
      el.style.boxShadow = "0 8px 25px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)";
      el.style.opacity = "0.92";
      el.style.zIndex = "1000";
      el.style.pointerEvents = "none";
      el.style.willChange = "transform";
    }
  };

  const updateDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const sourceId = draggingIdRef.current;
    if (!editing || !sourceId) return;

    event.preventDefault();

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!prefersReduced && dragStartPosRef.current) {
      const el = getDraggedElement(sourceId);
      if (el) {
        const dx = event.clientX - dragStartPosRef.current.x;
        const dy = event.clientY - dragStartPosRef.current.y;
        el.style.transform = `translate(${dx}px, ${dy}px) scale(1.03)`;
      }
    }
  };

  const endDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const sourceId = draggingIdRef.current;
    if (!sourceId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const rawTarget = document.elementFromPoint(event.clientX, event.clientY);
    const targetElement = rawTarget instanceof HTMLElement
      ? rawTarget.closest("[data-dashboard-card-id]")
      : null;
    const targetId = targetElement instanceof HTMLElement ? targetElement.dataset.dashboardCardId : null;

    if (targetId && targetId !== sourceId) {
      const sourceIndex = orderedCards.findIndex((card) => card.id === sourceId);
      const targetIndex = orderedCards.findIndex((card) => card.id === targetId);
      if (sourceIndex !== -1 && targetIndex !== -1) {
        justDraggedRef.current = sourceId;
        moveCard(sourceId, targetId, targetIndex > sourceIndex ? "after" : "before");
      }
    }

    draggingIdRef.current = null;
    lastDragTargetRef.current = null;
    dragStartPosRef.current = null;
    setDraggingId(null);
    cleanupStyles();
  };

  const resetLayout = () => {
    clearStoredLayout();
    setDraggingId(null);
    draggingIdRef.current = null;
    lastDragTargetRef.current = null;
  };

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-black text-slate-950 dark:text-white">
            Welcome, {firstName}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase dark:bg-[rgba(255,255,255,0.08)] dark:text-slate-300">
              {role}
            </span>
            {" · "}{organizationName}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {editing && (
            <button
              type="button"
              onClick={resetLayout}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-[#f8fafc] px-3 text-xs font-bold text-slate-600 transition hover:bg-[#eef2f7] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-white/[0.10] dark:bg-[rgba(255,255,255,0.04)] dark:text-slate-300 dark:hover:bg-[rgba(255,255,255,0.08)]"
            >
              <RotateCcw className="size-3.5" aria-hidden="true" />
              {labels.resetLayout}
            </button>
          )}
          <button
            type="button"
            onClick={() => setEditing((current) => !current)}
            aria-pressed={editing}
            className={`inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-bold shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              editing
                ? "bg-[#15803d] text-white hover:bg-[#166534] dark:bg-[#16a34a] dark:text-white dark:hover:bg-[#15803d]"
                : "border border-slate-200 bg-[#f8fafc] text-slate-700 hover:bg-[#eef2f7] dark:border-white/[0.10] dark:bg-[rgba(255,255,255,0.04)] dark:text-slate-200 dark:hover:bg-[rgba(255,255,255,0.08)]"
            }`}
          >
            {editing ? <Check className="size-3.5" aria-hidden="true" /> : <LayoutGrid className="size-3.5" aria-hidden="true" />}
            {editing ? labels.done : labels.editLayout}
          </button>
          <Link
            href="/pos"
            className="hidden h-9 items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#0b2f6f] to-[#0891b2] px-4 text-xs font-bold text-white shadow-sm transition hover:opacity-90 sm:inline-flex"
          >
            <ShoppingCart className="size-3.5" aria-hidden="true" />
            New sale
          </Link>
        </div>
      </div>

      <div
        ref={gridRef}
        className={`grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4 ${
          editing ? "rounded-2xl border border-dashed border-blue-200 bg-[#eff6ff]/60 p-2 dark:border-blue-400/30 dark:bg-blue-950/20" : ""
        }`}
      >
        {orderedCards.map((card, index) => (
          <DashboardCard
            key={card.id}
            card={card}
            editing={editing}
            dragging={draggingId === card.id}
            labels={labels}
            canMoveEarlier={index > 0}
            canMoveLater={index < orderedCards.length - 1}
            onBeginDrag={beginDrag}
            onUpdateDrag={updateDrag}
            onEndDrag={endDrag}
            onMoveEarlier={() => moveCardByStep(card.id, -1)}
            onMoveLater={() => moveCardByStep(card.id, 1)}
          />
        ))}
      </div>
    </>
  );
}

function DashboardCard({
  card,
  editing,
  dragging,
  labels,
  canMoveEarlier,
  canMoveLater,
  onBeginDrag,
  onUpdateDrag,
  onEndDrag,
  onMoveEarlier,
  onMoveLater,
}: {
  card: DashboardStatCard;
  editing: boolean;
  dragging: boolean;
  labels: DashboardLayoutLabels;
  canMoveEarlier: boolean;
  canMoveLater: boolean;
  onBeginDrag: (event: ReactPointerEvent<HTMLButtonElement>, cardId: string) => void;
  onUpdateDrag: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onEndDrag: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onMoveEarlier: () => void;
  onMoveLater: () => void;
}) {
  const Icon = iconMap[card.icon];
  const toneStyles = STAT_CARD_TONE_STYLES[card.tone];

  const content = (
    <div
      data-dashboard-card-id={card.id}
      className={`group/dashboard-card relative rounded-xl border p-3 ${toneStyles.card} ${
        editing ? "min-h-[112px] ring-1 ring-blue-200/70 dark:ring-blue-400/25" : ""
      } ${dragging ? "opacity-70 ring-2 ring-blue-500" : ""}`}
    >
      {editing && (
        <div className="mb-2 flex items-center justify-between gap-2">
          <button
            type="button"
            onPointerDown={(event) => onBeginDrag(event, card.id)}
            onPointerMove={onUpdateDrag}
            onPointerUp={onEndDrag}
            onPointerCancel={onEndDrag}
            className="flex h-7 min-w-0 flex-1 touch-none items-center gap-1.5 rounded-lg border border-blue-200 bg-[#dbeafe] px-2 text-[10px] font-bold text-blue-700 transition hover:bg-[#bfdbfe] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-blue-400/30 dark:bg-blue-400/10 dark:text-blue-200 dark:hover:bg-blue-400/20"
            aria-label={`${labels.dragToReorder}: ${card.label}`}
            title={`${labels.dragToReorder}: ${card.label}`}
          >
            <GripVertical className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{labels.dragToReorder}</span>
          </button>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={onMoveEarlier}
              disabled={!canMoveEarlier}
              className="flex size-7 items-center justify-center rounded-lg border border-blue-200 bg-[#eff6ff] text-blue-700 transition hover:bg-[#dbeafe] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-40 dark:border-blue-400/30 dark:bg-blue-400/10 dark:text-blue-200 dark:hover:bg-blue-400/20"
              aria-label={`${labels.moveEarlier}: ${card.label}`}
              title={`${labels.moveEarlier}: ${card.label}`}
            >
              <ArrowLeft className="size-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onMoveLater}
              disabled={!canMoveLater}
              className="flex size-7 items-center justify-center rounded-lg border border-blue-200 bg-[#eff6ff] text-blue-700 transition hover:bg-[#dbeafe] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-40 dark:border-blue-400/30 dark:bg-blue-400/10 dark:text-blue-200 dark:hover:bg-blue-400/20"
              aria-label={`${labels.moveLater}: ${card.label}`}
              title={`${labels.moveLater}: ${card.label}`}
            >
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between">
        <span className={`text-[10px] font-semibold tracking-wider ${toneStyles.label}`}>
          {card.label}
        </span>
        <span className={`inline-flex h-6 w-6 items-center justify-center rounded-md ${toneStyles.icon}`}>
          {Icon && <Icon className="size-3.5" aria-hidden="true" />}
        </span>
      </div>
      <p className={`mt-1.5 text-sm font-bold sm:text-base ${toneStyles.value}`}>
        {card.value}
      </p>
      <p className={`mt-0.5 text-[10px] font-medium ${toneStyles.detail}`}>
        {card.change}
      </p>
    </div>
  );

  if (editing || !card.href) {
    return content;
  }

  return (
    <Link href={card.href} className="transition hover:opacity-80">
      {content}
    </Link>
  );
}
