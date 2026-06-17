"use client";

import Image from "next/image";
import { useSyncExternalStore } from "react";

function subscribeThemeClass(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

function getIsDark() {
  return document.documentElement.classList.contains("dark");
}

function getServerSnapshot() {
  return false;
}

export function ThemeImage({
  lightSrc,
  darkSrc,
  lightWidth,
  lightHeight,
  darkWidth,
  darkHeight,
  alt,
  className,
  priority,
  placeholder,
}: {
  lightSrc: string;
  darkSrc: string;
  lightWidth: number;
  lightHeight: number;
  darkWidth: number;
  darkHeight: number;
  alt: string;
  className?: string;
  priority?: boolean;
  placeholder?: "blur" | "empty";
}) {
  const isDark = useSyncExternalStore(subscribeThemeClass, getIsDark, getServerSnapshot);
  const src = isDark ? darkSrc : lightSrc;
  const width = isDark ? darkWidth : lightWidth;
  const height = isDark ? darkHeight : lightHeight;

  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={className}
      priority={priority}
      placeholder={placeholder}
    />
  );
}
