import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/dashboard/",
        "/pos/",
        "/products/",
        "/customers/",
        "/invoices/",
        "/returns/",
        "/expenses/",
        "/daily-closing/",
        "/repairs/",
        "/reports/",
        "/settings/",
        "/users/",
        "/audit-log/",
        "/suppliers/",
        "/platform/",
        "/purchases/",
        "/auth/",
        "/onboarding/",
        "/setup/",
      ],
    },
    sitemap: "https://saledock.site/sitemap.xml",
  };
}
