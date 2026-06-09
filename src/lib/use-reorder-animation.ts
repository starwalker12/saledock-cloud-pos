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

    const selector = `[data-${dataAttr}]`;
    const items = container.querySelectorAll<HTMLElement>(selector);
    const newRects = new Map<string, DOMRect>();

    items.forEach((el) => {
      const key = el.getAttribute(`data-${dataAttr}`);
      if (!key) return;
      if (key === draggingKey) return;

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
    offsetX: number;
    offsetY: number;
    anim: Animation | null;
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
    const ds = dragStateRef.current;
    if (ds && ds.anim) {
      ds.anim.cancel();
      const prevEl = getElement(ds.key);
      if (prevEl) clearGhostStyles(prevEl);
    }

    if (reducedRef.current) return;

    const el = getElement(key);
    if (!el) return;

    const rect = el.getBoundingClientRect();
    dragStateRef.current = {
      key,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      anim: null,
    };

    el.style.zIndex = "50";
    el.style.position = "relative";
    el.style.pointerEvents = "none";
    el.style.transform = "scale(1.03)";
    el.style.boxShadow = "0 8px 25px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)";
    el.style.opacity = "0.9";
    el.style.willChange = "transform";
  }, [getElement]);

  const updateDrag = useCallback((event: { clientX: number; clientY: number }) => {
    const ds = dragStateRef.current;
    if (!ds) return;

    const el = getElement(ds.key);
    if (!el) return;

    if (ds.anim) {
      ds.anim.cancel();
      ds.anim = null;
    }

    const rect = el.getBoundingClientRect();
    const targetX = event.clientX - ds.offsetX;
    const targetY = event.clientY - ds.offsetY;
    const dx = targetX - rect.left;
    const dy = targetY - rect.top;

    el.style.transform = `translate(${dx}px, ${dy}px) scale(1.03)`;
  }, [getElement]);

  const endDrag = useCallback((
    event: { clientX: number; clientY: number },
    onSettled?: () => void,
  ) => {
    const ds = dragStateRef.current;
    if (!ds) {
      onSettled?.();
      return;
    }

    const el = getElement(ds.key);
    if (!el) {
      dragStateRef.current = null;
      onSettled?.();
      return;
    }

    if (reducedRef.current) {
      clearGhostStyles(el);
      dragStateRef.current = null;
      onSettled?.();
      return;
    }

    const rect = el.getBoundingClientRect();
    const targetX = event.clientX - ds.offsetX;
    const targetY = event.clientY - ds.offsetY;
    const dx = targetX - rect.left;
    const dy = targetY - rect.top;

    if (dx === 0 && dy === 0) {
      clearGhostStyles(el);
      dragStateRef.current = null;
      onSettled?.();
      return;
    }

    el.style.transform = `translate(${dx}px, ${dy}px) scale(1.03)`;
    const anim = el.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(1.03)` },
        { transform: "translate(0, 0) scale(1)" },
      ],
      { duration: 175, easing: "ease-out" },
    );
    anim.addEventListener("finish", () => {
      clearGhostStyles(el);
      dragStateRef.current = null;
      onSettled?.();
    });
    ds.anim = anim;
  }, [getElement]);

  return { startDrag, updateDrag, endDrag };
}

function clearGhostStyles(el: HTMLElement) {
  el.style.transform = "";
  el.style.boxShadow = "";
  el.style.opacity = "";
  el.style.zIndex = "";
  el.style.pointerEvents = "";
  el.style.position = "";
  el.style.willChange = "";
}
