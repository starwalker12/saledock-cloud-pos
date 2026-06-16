"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";
import { ChevronDown, Search } from "lucide-react";
import { DEFAULT_PHONE_COUNTRY, normalizePhoneNumberForCountry } from "@/lib/phone-validation";

type CountryOption = {
  iso: CountryCode;
  name: string;
  dialCode: string;
  flag: string;
};

type PhoneNumberInputProps = {
  label: string;
  id?: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  error?: string | null;
  onValidationChange?: (error: string | null) => void;
  defaultCountry?: CountryCode;
  helperText?: string;
  className?: string;
};

const preferredCountries = new Set<CountryCode>([
  "PK",
  "AE",
  "SA",
  "GB",
  "US",
  "CA",
  "AU",
  "IN",
  "BD",
  "AF",
  "MY",
  "SG",
]);

function countryFlag(iso: string) {
  return iso
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
}

function getCountryName(iso: CountryCode) {
  try {
    const names = new Intl.DisplayNames(["en"], { type: "region" });
    return names.of(iso) || iso;
  } catch {
    return iso;
  }
}

function getCountryOptions(): CountryOption[] {
  return getCountries()
    .map((iso) => {
      try {
        return {
          iso,
          name: getCountryName(iso),
          dialCode: `+${getCountryCallingCode(iso)}`,
          flag: countryFlag(iso),
        };
      } catch {
        return null;
      }
    })
    .filter((option): option is CountryOption => Boolean(option))
    .sort((a, b) => {
      const aPreferred = preferredCountries.has(a.iso);
      const bPreferred = preferredCountries.has(b.iso);
      if (aPreferred !== bPreferred) return aPreferred ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

const countryOptions = getCountryOptions();

function findCountry(iso: CountryCode) {
  return countryOptions.find((country) => country.iso === iso) ?? countryOptions.find((country) => country.iso === DEFAULT_PHONE_COUNTRY) ?? countryOptions[0];
}

function splitPhoneValue(value: string, defaultCountry: CountryCode) {
  const trimmed = value.trim();
  const fallbackCountry = findCountry(defaultCountry);
  if (!trimmed) {
    return { country: fallbackCountry, localNumber: "" };
  }

  const parsed = parsePhoneNumberFromString(trimmed, defaultCountry);
  if (parsed?.country) {
    return {
      country: findCountry(parsed.country),
      localNumber: parsed.nationalNumber,
    };
  }

  return {
    country: fallbackCountry,
    localNumber: trimmed.replace(/[^\d\s().-]/g, ""),
  };
}

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function buildPhoneValue(localNumber: string, country: CountryOption) {
  const parsedLocal = parsePhoneNumberFromString(localNumber, country.iso);
  if (parsedLocal?.isValid()) return parsedLocal.number;

  const digits = digitsOnly(localNumber);
  if (!digits) return "";
  const raw = `${country.dialCode}${digits}`;
  return normalizePhoneNumberForCountry(raw, country.iso);
}

function validatePhoneValue(value: string, country: CountryOption, required: boolean) {
  const trimmed = value.trim();
  if (!trimmed) {
    return required ? "Please enter a phone number." : null;
  }

  const parsed = parsePhoneNumberFromString(trimmed, country.iso);
  if (parsed?.isValid()) return null;
  return `Enter a valid phone number for ${country.name} (${country.dialCode}).`;
}

export function PhoneNumberInput({
  label,
  id,
  name,
  value,
  onChange,
  required = false,
  disabled = false,
  error,
  onValidationChange,
  defaultCountry = DEFAULT_PHONE_COUNTRY,
  helperText,
  className = "",
}: PhoneNumberInputProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [touched, setTouched] = useState(false);
  const [{ country, localNumber }, setPhoneParts] = useState(() => splitPhoneValue(value, defaultCountry));

  useEffect(() => {
    const id = window.setTimeout(() => {
      setPhoneParts(splitPhoneValue(value, defaultCountry));
    }, 0);
    return () => window.clearTimeout(id);
  }, [defaultCountry, value]);

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const filteredCountries = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return countryOptions.slice(0, 28);
    return countryOptions
      .filter((option) => {
        return (
          option.name.toLowerCase().includes(normalized) ||
          option.iso.toLowerCase().includes(normalized) ||
          option.dialCode.includes(normalized.replace(/\s/g, ""))
        );
      })
      .slice(0, 40);
  }, [query]);

  const validationError = touched ? validatePhoneValue(value, country, required) : null;
  const visibleError = error ?? validationError;

  function commit(nextLocalNumber: string, nextCountry = country, shouldTouch = true) {
    const nextValue = buildPhoneValue(nextLocalNumber, nextCountry);
    setPhoneParts({ country: nextCountry, localNumber: nextLocalNumber });
    if (shouldTouch) setTouched(true);
    onChange(nextValue);
    onValidationChange?.(validatePhoneValue(nextValue, nextCountry, required));
  }

  function chooseCountry(nextCountry: CountryOption) {
    setCountry(nextCountry);
    setIsOpen(false);
    setQuery("");
    commit(localNumber, nextCountry);
  }

  function setCountry(nextCountry: CountryOption) {
    setPhoneParts((prev) => ({ ...prev, country: nextCountry }));
  }

  function handleLocalChange(nextValue: string) {
    if (nextValue.trim().startsWith("+")) {
      const parsed = parsePhoneNumberFromString(nextValue);
      if (parsed?.country) {
        const nextCountry = findCountry(parsed.country);
        commit(parsed.nationalNumber, nextCountry);
        return;
      }
    }

    commit(nextValue);
  }

  function handleBlur() {
    setTouched(true);
    onValidationChange?.(validatePhoneValue(value, country, required));
  }

  return (
    <div ref={rootRef} className={`relative min-w-0 ${className}`}>
      <label className="block min-w-0">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {label} {required && <span className="text-red-500">*</span>}
        </span>
        {name && <input type="hidden" name={name} value={value} />}
        <div
          className={`mt-1 grid min-w-0 grid-cols-[minmax(118px,140px)_1fr] overflow-hidden rounded-xl border bg-[#fff] shadow-sm transition focus-within:border-blue-600 focus-within:ring-1 focus-within:ring-blue-600 dark:bg-slate-800 ${
            visibleError
              ? "border-red-400 focus-within:border-red-500 focus-within:ring-red-500 dark:border-red-500"
              : "border-slate-200 dark:border-slate-700"
          } ${disabled ? "opacity-70" : ""}`}
        >
          <button
            type="button"
            disabled={disabled}
            onClick={() => setIsOpen((open) => !open)}
            aria-haspopup="listbox"
            aria-expanded={isOpen}
            className="flex h-12 min-w-0 items-center gap-2 border-r border-slate-200 px-3 text-left text-sm font-bold text-slate-800 transition hover:bg-slate-50 focus:outline-none focus-visible:bg-slate-50 disabled:cursor-not-allowed dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-700 dark:focus-visible:bg-slate-700"
          >
            <span className="text-lg" aria-hidden="true">{country.flag}</span>
            <span className="min-w-0 truncate">{country.dialCode}</span>
            <ChevronDown className="ml-auto size-4 shrink-0 text-slate-400" aria-hidden="true" />
          </button>
          <input
            id={id}
            type="tel"
            value={localNumber}
            onChange={(event) => handleLocalChange(event.target.value)}
            onBlur={handleBlur}
            disabled={disabled}
            required={required}
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="300 1234567"
            className="h-12 min-w-0 bg-transparent px-3 text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed dark:text-slate-100 dark:placeholder:text-slate-500"
          />
        </div>
      </label>

      {isOpen && (
        <div className="absolute left-0 right-0 top-full z-[90] mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-[#fff] shadow-2xl shadow-slate-900/15 dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/40">
          <div className="border-b border-slate-100 p-3 dark:border-slate-800">
            <div className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 dark:border-slate-700 dark:bg-slate-950">
              <Search className="size-4 text-slate-400" aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search country or code"
                className="h-full min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-500"
                autoFocus
              />
            </div>
          </div>
          <div role="listbox" className="max-h-72 overflow-y-auto p-2">
            {filteredCountries.length === 0 ? (
              <p className="px-3 py-4 text-sm font-semibold text-slate-500 dark:text-slate-400">
                No matching country found.
              </p>
            ) : (
              filteredCountries.map((option) => (
                <button
                  key={option.iso}
                  type="button"
                  role="option"
                  aria-selected={option.iso === country.iso}
                  onClick={() => chooseCountry(option)}
                  className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-accent-bg)] ${
                    option.iso === country.iso
                      ? "bg-[var(--primary-accent-soft)] text-slate-950 dark:text-white"
                      : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                  }`}
                >
                  <span className="text-xl" aria-hidden="true">{option.flag}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{option.name}</span>
                    <span className="block text-xs font-semibold text-slate-500 dark:text-slate-400">{option.iso}</span>
                  </span>
                  <span className="shrink-0 text-sm font-black">{option.dialCode}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {visibleError ? (
        <p className="mt-1 text-xs font-semibold text-red-600 dark:text-red-400">{visibleError}</p>
      ) : helperText ? (
        <p className="mt-1 text-[10px] font-medium text-slate-400 dark:text-slate-500">{helperText}</p>
      ) : (
        <p className="mt-1 text-[10px] font-medium text-slate-400 dark:text-slate-500">
          Saved as international format, for example {country.dialCode}3001234567.
        </p>
      )}
    </div>
  );
}
