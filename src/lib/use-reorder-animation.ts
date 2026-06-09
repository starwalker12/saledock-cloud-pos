"use client";

import { useLayoutEffect, useRef } from "react";

export function useReorderAnim(
  containerRef: React.RefObject<HTMLElement | null>,
  dataAttr: string,
  deps: unknown[],
  skipAnimKeyRef?: React.RefObject<string | null>,
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
    const skipKey = skipAnimKeyRef?.current;

    items.forEach((el) => {
      const key = el.getAttribute(`data-${dataAttr}`);
      if (!key) return;

      const prevAnim = animsRef.current.get(key);
      if (prevAnim) prevAnim.cancel();

      const rect = el.getBoundingClientRect();
      newRects.set(key, rect);

      if (key === skipKey) return;

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
    if (skipAnimKeyRef) {
      skipAnimKeyRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
