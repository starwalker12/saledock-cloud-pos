import { checkRateLimit, recordAttempt, clearAttempts, extractClientIp } from "./rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

jest.mock("@/lib/supabase/admin");

const createQueryMock = (resolveValue: unknown = { error: null }, rejectValue?: unknown) => {
  const chainable = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    then: jest.fn(function(
      this: unknown,
      resolve: (value: unknown) => void,
      reject: (reason?: unknown) => void
    ) {
      if (rejectValue) {
        reject(rejectValue);
      } else {
        resolve(resolveValue);
      }
    })
  };
  return chainable;
};

describe("rate-limit", () => {
  const email = "Test@Example.com";
  const normalizedEmail = "test@example.com";
  const ipAddress = "127.0.0.1";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("checkRateLimit", () => {
    it("should return allowed: true when count is below limit", async () => {
      // Using a universally safe value like 0 to avoid brittleness if MAX_LIMIT changes.
      const queryMock = createQueryMock({ count: 0, error: null });
      const mockSupabase = { from: jest.fn().mockReturnValue(queryMock) };
      (createAdminClient as jest.Mock).mockReturnValue(mockSupabase);

      const result = await checkRateLimit(email, ipAddress);

      expect(result).toEqual({ allowed: true });
      expect(mockSupabase.from).toHaveBeenCalledWith("login_attempts");
      expect(queryMock.select).toHaveBeenCalledWith("*", { count: "exact", head: true });
      expect(queryMock.eq).toHaveBeenCalledWith("email", normalizedEmail);
      expect(queryMock.eq).toHaveBeenCalledWith("ip_address", ipAddress);
      expect(queryMock.eq).toHaveBeenCalledWith("attempt_type", "signin");
      expect(queryMock.eq).toHaveBeenCalledWith("success", false);
      expect(queryMock.gte).toHaveBeenCalledWith("created_at", expect.any(String));
    });

    it("should return allowed: false when count is equal to or above limit", async () => {
      // Using a high value like 999 to guarantee testing "blocked" path.
      const queryMock = createQueryMock({ count: 999, error: null });
      const mockSupabase = { from: jest.fn().mockReturnValue(queryMock) };
      (createAdminClient as jest.Mock).mockReturnValue(mockSupabase);

      const result = await checkRateLimit(email, ipAddress);
      expect(result).toEqual({ allowed: false });
    });

    it("should fail open and return allowed: true on database error", async () => {
      const queryMock = createQueryMock({ count: null, error: { message: "DB Error" } });
      const mockSupabase = { from: jest.fn().mockReturnValue(queryMock) };
      (createAdminClient as jest.Mock).mockReturnValue(mockSupabase);

      const consoleSpy = jest.spyOn(console, "error").mockImplementation();
      const result = await checkRateLimit(email, ipAddress);

      expect(result).toEqual({ allowed: true });
      expect(consoleSpy).toHaveBeenCalledWith("[rate-limit] check failed, failing open:", "DB Error");
      consoleSpy.mockRestore();
    });
  });

  describe("recordAttempt", () => {
    it("should record a failed attempt successfully", async () => {
       const queryMock = createQueryMock();
       const mockSupabase = { from: jest.fn().mockReturnValue(queryMock) };
       (createAdminClient as jest.Mock).mockReturnValue(mockSupabase);

       await recordAttempt(email, ipAddress, false);

       expect(mockSupabase.from).toHaveBeenCalledWith("login_attempts");
       expect(queryMock.insert).toHaveBeenCalledWith({
         email: normalizedEmail,
         ip_address: ipAddress,
         attempt_type: "signin",
         success: false,
       });
    });

    it("should record a successful attempt successfully", async () => {
       const queryMock = createQueryMock();
       const mockSupabase = { from: jest.fn().mockReturnValue(queryMock) };
       (createAdminClient as jest.Mock).mockReturnValue(mockSupabase);

       await recordAttempt(email, ipAddress, true);

       expect(queryMock.insert).toHaveBeenCalledWith({
         email: normalizedEmail,
         ip_address: ipAddress,
         attempt_type: "signin",
         success: true,
       });
    });

    it("should catch and log errors without throwing", async () => {
       const mockError = new Error("Insert failed");
       const queryMock = createQueryMock(null, mockError);
       const mockSupabase = { from: jest.fn().mockReturnValue(queryMock) };
       (createAdminClient as jest.Mock).mockReturnValue(mockSupabase);

       const consoleSpy = jest.spyOn(console, "error").mockImplementation();

       await recordAttempt(email, ipAddress, false);

       expect(consoleSpy).toHaveBeenCalledWith("[rate-limit] recordAttempt failed:", mockError);
       consoleSpy.mockRestore();
    });
  });

  describe("clearAttempts", () => {
     it("should delete attempts successfully", async () => {
       const queryMock = createQueryMock();
       const mockSupabase = { from: jest.fn().mockReturnValue(queryMock) };
       (createAdminClient as jest.Mock).mockReturnValue(mockSupabase);

       await clearAttempts(email, ipAddress);

       expect(mockSupabase.from).toHaveBeenCalledWith("login_attempts");
       expect(queryMock.delete).toHaveBeenCalled();
       expect(queryMock.eq).toHaveBeenCalledWith("email", normalizedEmail);
       expect(queryMock.eq).toHaveBeenCalledWith("ip_address", ipAddress);
       expect(queryMock.eq).toHaveBeenCalledWith("attempt_type", "signin");
     });

     it("should catch and log errors without throwing", async () => {
       const mockError = new Error("Delete failed");
       const queryMock = createQueryMock(null, mockError);
       const mockSupabase = { from: jest.fn().mockReturnValue(queryMock) };
       (createAdminClient as jest.Mock).mockReturnValue(mockSupabase);

       const consoleSpy = jest.spyOn(console, "error").mockImplementation();

       await clearAttempts(email, ipAddress);

       expect(consoleSpy).toHaveBeenCalledWith("[rate-limit] clearAttempts failed:", mockError);
       consoleSpy.mockRestore();
     });
  });

  describe("extractClientIp", () => {
    it("should return the first IP from forwardedFor", () => {
      expect(extractClientIp("192.168.1.1, 10.0.0.1")).toBe("192.168.1.1");
    });

    it("should return the IP directly if only one is present", () => {
      expect(extractClientIp("192.168.1.1")).toBe("192.168.1.1");
    });

    it("should return null if forwardedFor is null", () => {
      expect(extractClientIp(null)).toBeNull();
    });

    it("should return null if forwardedFor is empty", () => {
      expect(extractClientIp("")).toBeNull();
    });
  });
});
