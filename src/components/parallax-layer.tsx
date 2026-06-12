"use client";

import { useEffect, useRef, type ComponentPropsWithoutRef } from "react";

type ParallaxLayerProps = ComponentPropsWithoutRef<"div"> & {
  speed?: number;
};

export function ParallaxLayer({
  speed = 0.1,
  style,
  children,
  ...props
}: ParallaxLayerProps) {
  const layerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;

    const update = () => {
      frame = 0;
      const currentLayer = layerRef.current;
      if (!currentLayer) return;

      if (motionQuery.matches) {
        currentLayer.style.transform = "";
        return;
      }

      const section = currentLayer.parentElement ?? currentLayer;
      const rect = section.getBoundingClientRect();
      const viewportCenter = window.innerHeight / 2;
      const sectionCenter = rect.top + rect.height / 2;
      const offset = (viewportCenter - sectionCenter) * speed;

      currentLayer.style.transform = `translate3d(0, ${offset.toFixed(2)}px, 0)`;
    };

    const requestUpdate = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };

    const handleMotionChange = () => requestUpdate();

    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);
    motionQuery.addEventListener("change", handleMotionChange);
    update();

    return () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
      motionQuery.removeEventListener("change", handleMotionChange);
      layer.style.transform = "";
    };
  }, [speed]);

  return (
    <div
      ref={layerRef}
      data-parallax-layer
      style={{ ...style, willChange: "transform" }}
      {...props}
    >
      {children}
    </div>
  );
}
