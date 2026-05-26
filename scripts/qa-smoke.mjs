#!/usr/bin/env node
// Public-surface smoke test for production.
// Usage: node scripts/qa-smoke.mjs [base-url]
// Default base = https://gadget-zone-online-pos.vercel.app
//
// Checks:
//   - /login returns 200 and does NOT show "Supabase is not configured"
//   - all protected routes return 307 to /login?next=<path>
// Exits non-zero if any check fails.

const base = process.argv[2] ?? "https://gadget-zone-online-pos.vercel.app";

const PROTECTED = [
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
];

let failed = 0;

function note(label, ok, detail = "") {
  const mark = ok ? "✓" : "✗";
  const color = ok ? "\x1b[32m" : "\x1b[31m";
  console.log(`${color}${mark}\x1b[0m ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed++;
}

async function head(path) {
  const res = await fetch(`${base}${path}`, { method: "HEAD", redirect: "manual" });
  return { status: res.status, location: res.headers.get("location") };
}

async function get(path) {
  const res = await fetch(`${base}${path}`, { redirect: "manual" });
  const text = res.status === 200 ? await res.text() : "";
  return { status: res.status, body: text };
}

async function main() {
  console.log(`\nQA smoke against ${base}\n`);

  // /login should be 200 and free of the misconfig warning.
  const login = await get("/login");
  note("/login HTTP 200", login.status === 200, `got ${login.status}`);
  const misconfig = login.body.includes("Supabase is not configured");
  note("/login has no Supabase-misconfig warning", !misconfig);
  const registrationBanner = login.body.includes("Registration is closed");
  note("/login shows registration-closed banner", registrationBanner);

  // Protected routes should redirect.
  for (const p of PROTECTED) {
    const r = await head(p);
    const expected = `${base}/login?next=${encodeURIComponent(p)}`;
    const ok = r.status === 307 && r.location === expected;
    note(`${p} → 307 ${expected}`, ok, `got ${r.status} ${r.location ?? ""}`);
  }

  console.log("");
  if (failed > 0) {
    console.error(`\x1b[31m${failed} check(s) failed.\x1b[0m`);
    process.exit(1);
  }
  console.log("\x1b[32mAll checks passed.\x1b[0m");
}

main().catch((err) => {
  console.error("Smoke script crashed:", err);
  process.exit(2);
});
