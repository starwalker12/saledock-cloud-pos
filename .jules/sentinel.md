## 2026-06-04 - Enforcing Unified Open Redirect Prevention
**Vulnerability:** Incomplete open redirect prevention using ad-hoc URL checking.
**Learning:** The codebase had a robust `isSafeRedirectPath` utility in `src/lib/security/sanitize.ts`, but the critical `safeRedirect` function in the authentication callback `src/app/auth/callback/route.ts` was using a more naive `next.startsWith("/") && !next.startsWith("//")` check, which could potentially be bypassed or act inconsistently with the rest of the application's sanitization logic.
**Prevention:** Always use the centralized, well-tested security utilities (like `isSafeRedirectPath`) for validating redirect paths and other inputs to ensure uniform defense-in-depth across the application.
