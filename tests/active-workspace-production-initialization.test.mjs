import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const browserClient = readFileSync(
  new URL("../src/lib/supabase/client.ts", import.meta.url),
  "utf8",
);
const guard = readFileSync(
  new URL("../src/components/auth/active-workspace-guard.tsx", import.meta.url),
  "utf8",
);
const workspace = readFileSync(
  new URL("../src/lib/active-workspace.ts", import.meta.url),
  "utf8",
);

test("browser Supabase configuration uses statically inlinable public env access", () => {
  assert.match(browserClient, /process\.env\.NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(browserClient, /process\.env\.NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  assert.doesNotMatch(browserClient, /import \{ env \} from "@\/lib\/env"/);
  assert.doesNotMatch(browserClient, /safeParse\(process\.env\)/);
  assert.match(
    browserClient,
    /createBrowserClient\(supabaseUrl, supabaseAnonKey\)/,
  );
});

test("workspace initialization reports a sanitized internal failure stage", () => {
  for (const stage of [
    "auth-user",
    "storage-device",
    "storage-tab",
    "coordination-channel",
    "lease-read",
    "lease-claim",
    "lease-parse",
  ]) {
    assert.match(guard + workspace, new RegExp(`"${stage}"`));
  }
  assert.match(guard, /sanitizedInitializationFailure/);
  assert.match(guard, /\[active-workspace\] initialization failed/);
  assert.match(guard, /Bearer <redacted>/);
  assert.match(guard, /<redacted-token>/);
  assert.match(guard, /<redacted-session>/);
  assert.match(
    guard,
    /console\.error\([\s\S]*?sanitizedInitializationFailure\(initializationStage, error\)/,
  );
  assert.match(
    guard,
    /Session coordination is temporarily unavailable\. Check your connection and try again\./,
  );
});

test("storage and lease helpers preserve fail-closed typed failures", () => {
  assert.match(workspace, /class ActiveWorkspaceOperationError extends Error/);
  assert.match(workspace, /WORKSPACE_DEVICE_STORAGE_FAILED/);
  assert.match(workspace, /WORKSPACE_TAB_STORAGE_FAILED/);
  assert.match(workspace, /INVALID_LEASE_RESPONSE/);
  assert.match(workspace, /EMPTY_LEASE_RESPONSE/);
  assert.match(workspace, /LEASE_READ_FAILED/);
  assert.match(workspace, /LEASE_CLAIM_FAILED/);
  assert.doesNotMatch(
    guard,
    /setStatus\("active"\)[\s\S]{0,180}catch \(error\)/,
  );
});
