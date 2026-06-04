import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";

vi.mock("server-only", () => ({}));

import { checkRateLimit, recordAttempt, clearAttempts, extractClientIp, RATE_LIMIT_MAX_ATTEMPTS } from "../rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

// Mock the admin client
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

describe("rate-limit", () => {
  let mockSupabase: {
    from: Mock;
    select: Mock;
    eq: Mock;
    gte: Mock;
    insert: Mock;
    delete: Mock;
  };

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
    };

    vi.mocked(createAdminClient).mockReturnValue(mockSupabase as never);

    // Silence console.error for clean test output
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("checkRateLimit", () => {
    it("should allow when attempts are below max", async () => {
      mockSupabase.gte.mockResolvedValue({ count: 5, error: null });

      const result = await checkRateLimit("test@example.com", "127.0.0.1");

      expect(result.allowed).toBe(true);
      expect(mockSupabase.from).toHaveBeenCalledWith("login_attempts");
      expect(mockSupabase.select).toHaveBeenCalledWith("*", { count: "exact", head: true });
      expect(mockSupabase.eq).toHaveBeenCalledWith("email", "test@example.com");
      expect(mockSupabase.eq).toHaveBeenCalledWith("ip_address", "127.0.0.1");
    });

    it(`should allow when attempts are exactly 1 below max (${RATE_LIMIT_MAX_ATTEMPTS - 1})`, async () => {
      mockSupabase.gte.mockResolvedValue({ count: RATE_LIMIT_MAX_ATTEMPTS - 1, error: null });

      const result = await checkRateLimit("test@example.com", "127.0.0.1");

      expect(result.allowed).toBe(true);
    });

    it(`should block when attempts reach max (${RATE_LIMIT_MAX_ATTEMPTS})`, async () => {
      mockSupabase.gte.mockResolvedValue({ count: RATE_LIMIT_MAX_ATTEMPTS, error: null });

      const result = await checkRateLimit("test@example.com", "127.0.0.1");

      expect(result.allowed).toBe(false);
    });

    it("should fail open (allow) when database error occurs", async () => {
      mockSupabase.gte.mockResolvedValue({ count: null, error: { message: "Database error" } });

      const result = await checkRateLimit("test@example.com", "127.0.0.1");

      expect(result.allowed).toBe(true);
      expect(console.error).toHaveBeenCalledWith("[rate-limit] check failed, failing open:", "Database error");
    });

    it("should normalize email address", async () => {
      mockSupabase.gte.mockResolvedValue({ count: 0, error: null });

      await checkRateLimit("  TeSt@ExAmPlE.cOm  ", "127.0.0.1");

      expect(mockSupabase.eq).toHaveBeenCalledWith("email", "test@example.com");
    });
  });

  describe("recordAttempt", () => {
    it("should insert a record successfully", async () => {
      mockSupabase.insert.mockResolvedValue({ error: null });

      await recordAttempt("test@example.com", "127.0.0.1", false);

      expect(mockSupabase.from).toHaveBeenCalledWith("login_attempts");
      expect(mockSupabase.insert).toHaveBeenCalledWith({
        email: "test@example.com",
        ip_address: "127.0.0.1",
        attempt_type: "signin",
        success: false,
      });
    });

    it("should handle and log errors during insert", async () => {
      const error = new Error("Insert failed");
      mockSupabase.insert.mockRejectedValue(error);

      await recordAttempt("test@example.com", "127.0.0.1", false);

      expect(console.error).toHaveBeenCalledWith("[rate-limit] recordAttempt failed:", error);
    });
  });

  describe("clearAttempts", () => {
    it("should delete records successfully", async () => {
      // Mock the final `.eq` to resolve correctly for chained calls
      const lastEq = vi.fn().mockResolvedValue({ error: null });
      const midEq = vi.fn().mockReturnValue({ eq: lastEq });
      const firstEq = vi.fn().mockReturnValue({ eq: midEq });

      mockSupabase.delete.mockReturnValue({ eq: firstEq });

      await clearAttempts("test@example.com", "127.0.0.1");

      expect(mockSupabase.from).toHaveBeenCalledWith("login_attempts");
      expect(mockSupabase.delete).toHaveBeenCalled();
      expect(firstEq).toHaveBeenCalledWith("email", "test@example.com");
      expect(midEq).toHaveBeenCalledWith("ip_address", "127.0.0.1");
      expect(lastEq).toHaveBeenCalledWith("attempt_type", "signin");
    });

    it("should handle and log errors during delete", async () => {
      const error = new Error("Delete failed");

      // Mock the final `.eq` to reject for chained calls
      const lastEq = vi.fn().mockRejectedValue(error);
      const midEq = vi.fn().mockReturnValue({ eq: lastEq });
      const firstEq = vi.fn().mockReturnValue({ eq: midEq });

      mockSupabase.delete.mockReturnValue({ eq: firstEq });

      await clearAttempts("test@example.com", "127.0.0.1");

      expect(console.error).toHaveBeenCalledWith("[rate-limit] clearAttempts failed:", error);
    });
  });

  describe("extractClientIp", () => {
    it("should extract the first IP from a comma-separated list", () => {
      const ip = extractClientIp("203.0.113.195, 70.41.3.18, 150.172.238.178");
      expect(ip).toBe("203.0.113.195");
    });

    it("should handle a single IP", () => {
      const ip = extractClientIp("203.0.113.195");
      expect(ip).toBe("203.0.113.195");
    });

    it("should return null for null input", () => {
      const ip = extractClientIp(null);
      expect(ip).toBeNull();
    });

    it("should handle empty string", () => {
      const ip = extractClientIp("");
      expect(ip).toBeNull();
    });
  });
});
