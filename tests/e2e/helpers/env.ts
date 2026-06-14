export const ENV = {
  baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
  email: process.env.PLAYWRIGHT_TEST_EMAIL || "",
  password: process.env.PLAYWRIGHT_TEST_PASSWORD || "",
};

export function hasCredentials(): boolean {
  return !!(ENV.email && ENV.password);
}
