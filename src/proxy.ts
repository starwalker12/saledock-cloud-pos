import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/session-update";

export async function proxy(request: NextRequest) {
  const isDev = process.env.NODE_ENV === "development";
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  // Toggle for enforcement. When isEnforced is false, we emit Content-Security-Policy-Report-Only.
  // Set to true to switch to Content-Security-Policy (Enforced).
  const isEnforced = false;
  const headerName = isEnforced
    ? "Content-Security-Policy"
    : "Content-Security-Policy-Report-Only";

  const origin = request.nextUrl.origin;
  const reportUrl = `${origin}/api/csp-report`;

  // Construct the Content Security Policy directives
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""} https://www.google.com https://www.gstatic.com https://www.googletagmanager.com https://www.google-analytics.com https://*.clarity.ms`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data: https://bvxyxrdskjryepwjmsvc.supabase.co https://www.google-analytics.com https://www.google.com https://*.clarity.ms",
    "connect-src 'self' https://bvxyxrdskjryepwjmsvc.supabase.co wss://bvxyxrdskjryepwjmsvc.supabase.co https://accounts.google.com https://www.google-analytics.com https://stats.g.doubleclick.net https://*.clarity.ms https://*.bing.com",
    "frame-src 'self' https://www.google.com https://recaptcha.google.com",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    `report-uri ${reportUrl}`,
    "report-to csp-endpoint",
  ];

  const headerValue = directives.join("; ");
  const reportingEndpointsValue = `csp-endpoint="${reportUrl}"`;

  return updateSession(request, {
    name: headerName,
    value: headerValue,
    nonce,
    reportingEndpoints: reportingEndpointsValue,
  });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
