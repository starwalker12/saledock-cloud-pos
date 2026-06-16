import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

export const DEFAULT_PHONE_COUNTRY: CountryCode = "PK";

/**
 * Validates a phone number, defaulting to Pakistan (PK) region.
 * Returns true if empty/null/undefined (optional field) or valid.
 */
export function isValidPhoneNumber(
  phone: string | null | undefined,
  defaultCountry: CountryCode = DEFAULT_PHONE_COUNTRY,
): boolean {
  if (!phone) return true;
  const trimmed = phone.trim();
  if (!trimmed) return true;

  try {
    const phoneNumber = parsePhoneNumberFromString(trimmed, defaultCountry);
    return phoneNumber ? phoneNumber.isValid() : false;
  } catch {
    return false;
  }
}

export function normalizePhoneNumberForCountry(
  phone: string | null | undefined,
  defaultCountry: CountryCode = DEFAULT_PHONE_COUNTRY,
): string {
  if (!phone) return "";
  const trimmed = phone.trim();
  if (!trimmed) return "";

  try {
    const phoneNumber = parsePhoneNumberFromString(trimmed, defaultCountry);
    return phoneNumber?.isValid() ? phoneNumber.number : trimmed;
  } catch {
    return trimmed;
  }
}
