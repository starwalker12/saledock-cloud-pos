"use client";

import { useCallback, useLayoutEffect, useRef } from "react";

export function useReorderAnim(
  containerRef: React.RefObject<HTMLElement | null>,
  dataAttr: string,
  deps: unknown[],
  draggingKey?: string | null,
) {
  const prevRectsRef = useRef<Map<string, DOMRect>>(new Map());
  const animsRef = useRef<Map<string, Animation>>(new Map());
  const reducedRef = useRef(false);
  const prevDraggingRef = useRef<string | null | undefined>(undefined);

  useLayoutEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedRef.current = mq.matches;
    const handler = (e: MediaQueryListEvent) => { reducedRef.current = e.matches; };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useLayoutEffect(() => {
    if (reducedRef.current) return;
    const container = containerRef.current;
    if (!container) return;

    const prevDragging = prevDraggingRef.current;
    const dragJustEnded = prevDragging != null && draggingKey == null;
    prevDraggingRef.current = draggingKey ?? null;

    const selector = `[data-${dataAttr}]`;
    const items = container.querySelectorAll<HTMLElement>(selector);
    const newRects = new Map<string, DOMRect>();

    items.forEach((el) => {
      const key = el.getAttribute(`data-${dataAttr}`);
      if (!key) return;

      if (dragJustEnded && key === prevDragging) {
        const ghostRect = el.getBoundingClientRect();
        clearGhostStyles(el);
        void el.offsetHeight;
        const naturalRect = el.getBoundingClientRect();
        newRects.set(key, naturalRect);

        const settleDx = ghostRect.left - naturalRect.left;
        const settleDy = ghostRect.top - naturalRect.top;
        if (settleDx !== 0 || settleDy !== 0) {
          const anim = el.animate(
            [
              {
                transform: `translate(${settleDx}px, ${settleDy}px) scale(1.03)`,
              },
              { transform: "none" },
            ],
            { duration: 175, easing: "ease-out" },
          );
          animsRef.current.set(key, anim);
          anim.addEventListener("finish", () => animsRef.current.delete(key));
        }
        return;
      }

      if (key === draggingKey) {
        const rect = el.getBoundingClientRect();
        newRects.set(key, rect);
        return;
      }

      const prevAnim = animsRef.current.get(key);
      if (prevAnim) prevAnim.cancel();

      const rect = el.getBoundingClientRect();
      newRects.set(key, rect);

      const prevRect = prevRectsRef.current.get(key);
      if (prevRect) {
        const dx = prevRect.left - rect.left;
        const dy = prevRect.top - rect.top;
        if (dx !== 0 || dy !== 0) {
          const anim = el.animate(
            [
              { transform: `translate(${dx}px, ${dy}px)` },
              { transform: "translate(0, 0)" },
            ],
            { duration: 200, easing: "ease-out" },
          );
          animsRef.current.set(key, anim);
          anim.addEventListener("finish", () => animsRef.current.delete(key));
        }
      }
    });

    prevRectsRef.current = newRects;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export function useDragGhost(
  containerRef: React.RefObject<HTMLElement | null>,
  dataAttr: string,
) {
  const reducedRef = useRef(false);
  const dragStateRef = useRef<{
    key: string;
    startX: number;
    startY: number;
  } | null>(null);

  useLayoutEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedRef.current = mq.matches;
    const handler = (e: MediaQueryListEvent) => { reducedRef.current = e.matches; };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const getElement = useCallback((key: string) => {
    return containerRef.current?.querySelector<HTMLElement>(
      `[data-${dataAttr}="${key}"]`,
    ) ?? null;
  }, [containerRef, dataAttr]);

  const startDrag = useCallback((event: { clientX: number; clientY: number }, key: string) => {
    const prev = dragStateRef.current;
    if (prev) {
      const prevEl = getElement(prev.key);
      if (prevEl) clearGhostStyles(prevEl);
    }

    if (reducedRef.current) return;

    const el = getElement(key);
    if (!el) return;

    dragStateRef.current = { key, startX: event.clientX, startY: event.clientY };

    el.style.zIndex = "1000";
    el.style.pointerEvents = "none";
    el.style.transform = "translate(0px, 0px) scale(1.03)";
    el.style.boxShadow = "0 8px 25px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)";
    el.style.opacity = "0.92";
    el.style.willChange = "transform";
  }, [getElement]);

  const updateDrag = useCallback((event: { clientX: number; clientY: number }) => {
    const ds = dragStateRef.current;
    if (!ds) return;

    const el = getElement(ds.key);
    if (!el) return;

    const dx = event.clientX - ds.startX;
    const dy = event.clientY - ds.startY;

    el.style.transform = `translate(${dx}px, ${dy}px) scale(1.03)`;
  }, [getElement]);

  const endDrag = useCallback(() => {
    dragStateRef.current = null;
  }, []);

  return { startDrag, updateDrag, endDrag };
}

function clearGhostStyles(el: HTMLElement) {
  el.style.transform = "";
  el.style.boxShadow = "";
  el.style.opacity = "";
  el.style.zIndex = "";
  el.style.pointerEvents = "";
  el.style.willChange = "";
}
