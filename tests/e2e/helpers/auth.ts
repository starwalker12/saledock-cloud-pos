import { Page } from "@playwright/test";
import { ENV } from "./env";

async function waitForAuthRedirectToSettle(page: Page): Promise<void> {
  // The callback can queue a final same-destination navigation after the URL
  // first becomes /dashboard. Reloading that destination proves the session
  // is durable and cancels any stale callback transition before the test moves on.
  await page.reload({ waitUntil: "networkidle" });
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
  // Go to login page
  await page.goto("/login");

  // Check if we are already logged in (e.g. session restored). The login
  // route intentionally renders a signed-in card instead of redirecting.
  const pathname = new URL(page.url()).pathname;
  if (pathname === "/dashboard" || pathname === "/pos") {
    return true;
  }
  const existingSessionLink = page.getByRole("link", { name: "Go to dashboard", exact: true });
  if (await existingSessionLink.isVisible().catch(() => false)) {
    await existingSessionLink.click();
    await page.waitForURL(/\/(?:dashboard|pos)(?:\?|$)/, { timeout: 10000 });
    await waitForAuthRedirectToSettle(page);
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
    await waitForAuthRedirectToSettle(page);
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
        await waitForAuthRedirectToSettle(page);
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
