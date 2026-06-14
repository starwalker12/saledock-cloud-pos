import { Page } from "@playwright/test";
import { ENV } from "./env";

/**
 * Log in to the application using test credentials from environment variables.
 * Returns true if login is successful (or already logged in), false otherwise.
 */
export async function login(page: Page): Promise<boolean> {
  if (!ENV.email || !ENV.password) {
    return false;
  }

  // Go to login page
  await page.goto("/login");

  // Check if we are already logged in (e.g. session restored)
  const pathname = new URL(page.url()).pathname;
  if (pathname === "/dashboard" || pathname === "/pos") {
    return true;
  }

  // Fill credentials
  await page.fill('input[name="email"]', ENV.email);
  await page.fill('input[name="password"]', ENV.password);

  // Click Submit
  await page.click('button[type="submit"]');

  // Wait for redirect to dashboard or POS
  try {
    await page.waitForURL((url) => {
      const p = url.pathname;
      return p === "/dashboard" || p === "/pos" || p.startsWith("/dashboard/") || p.startsWith("/pos/");
    }, { timeout: 10000 });
    return true;
  } catch {
    // Collect error messages from the page if any
    const errorText = await page.locator("p.bg-red-50, p.bg-amber-50").first().textContent().catch(() => "");
    console.warn(`[Login Helper] Sign-in failed: ${errorText || "timeout/redirect failed"}`);
    return false;
  }
}
