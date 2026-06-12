import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";

const protectedPrefixes = [
  "/dashboard",
  "/pos",
  "/products",
  "/customers",
  "/invoices",
  "/returns",
  "/expenses",
  "/daily-closing",
  "/repairs",
  "/reports",
  "/settings",
  "/users",
  "/audit-log",
  "/suppliers",
  "/platform",
  "/purchases",
];

export async function updateSession(
  request: NextRequest,
  csp?: { name: string; value: string; nonce: string; reportingEndpoints?: string }
) {
  let requestHeaders = new Headers(request.headers);
  let hasCsp = false;

  if (csp) {
    try {
      requestHeaders.set("x-nonce", csp.nonce);
      requestHeaders.set(csp.name, csp.value);
      if (csp.reportingEndpoints) {
        requestHeaders.set("Reporting-Endpoints", csp.reportingEndpoints);
      }
      hasCsp = true;
    } catch (err) {
      console.error("CSP updateSession request headers setup failed (failing open):", err);
      requestHeaders = new Headers(request.headers);
      hasCsp = false;
    }
  }

  let response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  if (!env.isSupabaseConfigured) {
    if (hasCsp && csp) {
      try {
        response.headers.set(csp.name, csp.value);
        if (csp.reportingEndpoints) {
          response.headers.set("Reporting-Endpoints", csp.reportingEndpoints);
        }
      } catch (err) {
        console.error("CSP updateSession response headers setup failed (failing open):", err);
        try {
          response.headers.delete(csp.name);
          if (csp.reportingEndpoints) {
            response.headers.delete("Reporting-Endpoints");
          }
        } catch {}
      }
    }
    return response;
  }

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({
            request: {
              headers: requestHeaders,
            },
          });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isProtected = protectedPrefixes.some((prefix) => pathname.startsWith(prefix));

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    const redirectResponse = NextResponse.redirect(url);
    if (hasCsp && csp) {
      try {
        redirectResponse.headers.set(csp.name, csp.value);
        if (csp.reportingEndpoints) {
          redirectResponse.headers.set("Reporting-Endpoints", csp.reportingEndpoints);
        }
      } catch (err) {
        console.error("CSP updateSession redirect headers setup failed (failing open):", err);
      }
    }
    return redirectResponse;
  }

  if (hasCsp && csp) {
    try {
      response.headers.set(csp.name, csp.value);
      if (csp.reportingEndpoints) {
        response.headers.set("Reporting-Endpoints", csp.reportingEndpoints);
      }
    } catch (err) {
      console.error("CSP updateSession response headers setup failed (failing open):", err);
      try {
        response.headers.delete(csp.name);
        if (csp.reportingEndpoints) {
          response.headers.delete("Reporting-Endpoints");
        }
      } catch {}
    }
  }

  return response;
}
