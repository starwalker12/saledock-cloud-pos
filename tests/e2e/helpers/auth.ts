import { Page, type Cookie } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { ENV } from "./env";
import { getLocalAuthConfig, isLocalPlaywrightRun } from "./local-supabase";

const SUPABASE_COOKIE_CHUNK_SIZE = 3180;

function chunkCookieValue(key: string, value: string) {
  if (value.length <= SUPABASE_COOKIE_CHUNK_SIZE) {
    return [{ name: key, value }];
  }
  const chunks: Array<{ name: string; value: string }> = [];
  for (let i = 0; i < value.length; i += SUPABASE_COOKIE_CHUNK_SIZE) {
    chunks.push({
      name: `${key}.${chunks.length}`,
      value: value.slice(i, i + SUPABASE_COOKIE_CHUNK_SIZE),
    });
  }
  return chunks;
}

async function setDirectLocalSession(
  page: Page,
  email: string,
  password: string,
): Promise<boolean> {
  if (!isLocalPlaywrightRun()) return false;

  const { url, anonKey } = getLocalAuthConfig();
  const appUrl = ENV.baseURL;

  const supabase = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    console.warn("[Login Helper] Direct local sign-in failed:", error?.message ?? "no session");
    return false;
  }

  const storageKey = `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
  const cookieValue =
    "base64-" + Buffer.from(JSON.stringify(data.session), "utf8").toString("base64url");

  const cookies: Cookie[] = chunkCookieValue(storageKey, cookieValue).map((c) => ({
    name: c.name,
    value: c.value,
    domain: new URL(appUrl).hostname,
    path: "/",
    expires: -1,
    httpOnly: false,
    secure: false,
    sameSite: "Lax" as const,
  }));

  await page.context().addCookies(cookies);
  return true;
}

/**
 * Log in to the application using test credentials from environment variables.
 * Returns true if login is successful (or already logged in), false otherwise.
 */
export async function login(page: Page): Promise<boolean> {
  if (!ENV.email || !ENV.password) {
    return false;
  }

  return loginWithCredentials(page, ENV.email, ENV.password);
}

/** Log in with an explicit local QA account without exposing credentials in output. */
export async function loginWithCredentials(
  page: Page,
  email: string,
  password: string,
): Promise<boolean> {
  // For local QA runs, sign in directly through the Supabase Auth API and
  // inject the session cookie. This avoids fragile form/CAPTCHA/callback timing.
  if (isLocalPlaywrightRun()) {
    await page.context().clearCookies();
    await page.goto("/");
    await page.evaluate(() => window.localStorage.clear());

    if (await setDirectLocalSession(page, email, password)) {
      await page.goto("/dashboard");
      try {
        await page.waitForURL((url) => {
          const p = url.pathname;
          return p === "/dashboard" || p === "/pos" || p.startsWith("/dashboard/") || p.startsWith("/pos/");
        }, { timeout: 10000 });
        return true;
      } catch {
        console.warn("[Login Helper] Direct local session did not reach dashboard.");
      }
    }
  }

  // Fallback to the real browser login form for non-local or if direct login fails.
  await page.goto("/login");

  // Check if we are already logged in (e.g. session restored)
  const pathname = new URL(page.url()).pathname;
  if (pathname === "/dashboard" || pathname === "/pos") {
    return true;
  }

  // Fill credentials
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);

  // Click Submit
  await page.click('button[type="submit"]');

  // Wait for redirect to dashboard or POS. If the server renders the signed-in
  // card instead (valid local/dev sessions), click through to the dashboard.
  try {
    await page.waitForURL((url) => {
      const p = url.pathname;
      return p === "/dashboard" || p === "/pos" || p.startsWith("/dashboard/") || p.startsWith("/pos/");
    }, { timeout: 10000 });
    return true;
  } catch {
    const goToDashboard = page.locator('a:has-text("Go to dashboard")');
    if (await goToDashboard.isVisible().catch(() => false)) {
      await goToDashboard.click();
      try {
        await page.waitForURL((url) => {
          const p = url.pathname;
          return p === "/dashboard" || p === "/pos" || p.startsWith("/dashboard/") || p.startsWith("/pos/");
        }, { timeout: 10000 });
        return true;
      } catch {
        // fall through to error collection
      }
    }

    // Collect error messages from the page if any
    const errorText = await page.locator("p.bg-red-50, p.bg-amber-50").first().textContent().catch(() => "");
    console.warn(`[Login Helper] Sign-in failed: ${errorText || "timeout/redirect failed"}`);
    return false;
  }
}
