import type { NextConfig } from "next";

const projectRoot = process.cwd();

const staticPublicAssetHeaders = [
  { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
];

const staticPublicAssetPaths = [
  "/apple-touch-icon.png",
  "/favicon.ico",
  "/file.svg",
  "/gadget-zone-logo.png",
  "/globe.svg",
  "/next.svg",
  "/onboarding-ecosystem-dark.png",
  "/onboarding-ecosystem-light.png",
  "/saledock-logo-full.png",
  "/saledock-logo-mark.png",
  "/vercel.svg",
  "/window.svg",
];

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },
  async headers() {
    return [
      ...staticPublicAssetPaths.map((source) => ({
        source,
        headers: staticPublicAssetHeaders,
      })),
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
