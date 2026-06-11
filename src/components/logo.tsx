import React from "react";

interface LogoProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src" | "alt"> {
  className?: string;
  alt?: string;
}

export function Logo({ className = "", alt = "SaleDock", ...props }: LogoProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/saledock-logo-full.png"
      alt={alt}
      className={`dark:brightness-0 dark:invert object-contain ${className}`}
      {...props}
    />
  );
}
