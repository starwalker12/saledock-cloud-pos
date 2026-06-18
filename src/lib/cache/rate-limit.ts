import "server-only";
import { createHash } from "crypto";

/**
 * Small, dependency-free rate-limit / short-lived cooldown helper.
 *
 * Backends, in priority order:
 *  1. Upstash Redis REST API — used ONLY when both UPSTASH_REDIS_REST_URL and
 *     UPSTASH_REDIS_REST_TOKEN are configured. Uses plain `fetch`, so no extra
 *     package is required. If the call fails it silently falls back.
 *  2. In-memory per-instance Map — the default. Good enough for invite-form
 *     cooldowns and duplicate-submit protection. Not shared across serverless
 *     instances, which is acceptable for a best-effort UX guard.
 *
 * Design rules:
 *  - This is ONLY for invite UX / rate-limiting. It must never be used for
 *    money, stock, permissions, auth, or any business data.
 *  - It fails OPEN: any backend error results in the request being allowed, so
 *    a cache problem can never block legitimate staff invites.
 *  - Keys are hashed; raw emails are never stored.
 */

type RateLimitResult = { allowed: boolean; remaining: number };

type MemoryEntry = { count: number; resetAt: number };

const memoryStore = new Map<string, MemoryEntry>();
const MEMORY_MAX_KEYS = 5000;

function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex").slice(0, 40);
}

function redisConfigured(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

/** Returns the post-increment count, or null if the Redis backend is unavailable. */
async function redisIncrement(key: string, windowSeconds: number): Promise<number | null> {
  try {
    const base = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!base || !token) return null;

    const res = await fetch(`${base.replace(/\/$/, "")}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      // INCR the counter, then set an expiry only if one is not already set (NX).
      body: JSON.stringify([
        ["INCR", key],
        ["EXPIRE", key, String(windowSeconds), "NX"],
      ]),
      cache: "no-store",
    });
    if (!res.ok) return null;

    const data: unknown = await res.json();
    if (!Array.isArray(data)) return null;
    const first = data[0] as { result?: unknown } | undefined;
    const count = Number(first?.result);
    return Number.isFinite(count) ? count : null;
  } catch {
    // Fail open — fall back to the in-memory store.
    return null;
  }
}

function memoryIncrement(key: string, windowSeconds: number): number {
  const now = Date.now();

  // Opportunistic cleanup so the map cannot grow unbounded.
  if (memoryStore.size > MEMORY_MAX_KEYS) {
    for (const [k, entry] of memoryStore) {
      if (entry.resetAt <= now) memoryStore.delete(k);
    }
  }

  const entry = memoryStore.get(key);
  if (!entry || entry.resetAt <= now) {
    memoryStore.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return 1;
  }
  entry.count += 1;
  return entry.count;
}

/**
 * Increment a counter for `rawKey` within a rolling window and report whether
 * the caller is still under `limit`. Always fails open on backend errors.
 */
export async function rateLimit(
  rawKey: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const key = `rl:${hashKey(rawKey)}`;

  let count: number | null = null;
  if (redisConfigured()) {
    count = await redisIncrement(key, windowSeconds);
  }
  if (count === null) {
    count = memoryIncrement(key, windowSeconds);
  }

  return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
}

/** Whether a shared/distributed cache backend (Redis) is configured. */
export function isDistributedCacheConfigured(): boolean {
  return redisConfigured();
}
