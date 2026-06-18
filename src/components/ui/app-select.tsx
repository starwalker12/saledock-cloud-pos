"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

export type AppSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
  description?: string;
};

type AppSelectProps = {
  options: AppSelectOption[];
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  searchable?: boolean;
  className?: string;
  buttonClassName?: string;
  menuClassName?: string;
};

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

export function AppSelect({
  options,
  name,
  value,
  defaultValue = "",
  onChange,
  disabled = false,
  required = false,
  placeholder = "Select option",
  ariaLabel,
  searchable,
  className = "",
  buttonClassName = "",
  menuClassName = "",
}: AppSelectProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [internalValue, setInternalValue] = useState(defaultValue);
  const selectedValue = value ?? internalValue;
  const shouldSearch = searchable ?? options.length > 12;

  const filteredOptions = useMemo(() => {
    const q = normalizeText(query);
    if (!q) return options;
    return options.filter((option) => {
      return (
        normalizeText(option.label).includes(q) ||
        normalizeText(option.value).includes(q) ||
        normalizeText(option.description ?? "").includes(q)
      );
    });
  }, [options, query]);

  const selectedOption = options.find((option) => option.value === selectedValue);
  const displayLabel = selectedOption?.label || placeholder;

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setQuery("");
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        setQuery("");
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const selectedIndex = Math.max(
      0,
      filteredOptions.findIndex((option) => option.value === selectedValue),
    );
    const timer = window.setTimeout(() => setActiveIndex(selectedIndex), 0);
    return () => window.clearTimeout(timer);
  }, [filteredOptions, isOpen, selectedValue]);

  useEffect(() => {
    if (value !== undefined) return undefined;
    const form = rootRef.current?.closest("form");
    if (!form) return undefined;

    function handleReset() {
      window.setTimeout(() => setInternalValue(defaultValue), 0);
    }

    form.addEventListener("reset", handleReset);
    return () => form.removeEventListener("reset", handleReset);
  }, [defaultValue, value]);

  function openMenu() {
    if (disabled) return;
    setIsOpen(true);
  }

  function selectValue(nextValue: string) {
    if (value === undefined) setInternalValue(nextValue);
    onChange?.(nextValue);
    window.setTimeout(() => {
      hiddenInputRef.current?.dispatchEvent(new Event("input", { bubbles: true }));
      hiddenInputRef.current?.dispatchEvent(new Event("change", { bubbles: true }));
    }, 0);
    setIsOpen(false);
    setQuery("");
  }

  function moveActive(delta: number) {
    if (filteredOptions.length === 0) return;
    let nextIndex = activeIndex;
    for (let i = 0; i < filteredOptions.length; i += 1) {
      nextIndex = (nextIndex + delta + filteredOptions.length) % filteredOptions.length;
      if (!filteredOptions[nextIndex]?.disabled) break;
    }
    setActiveIndex(nextIndex);
    optionRefs.current[nextIndex]?.scrollIntoView({ block: "nearest" });
  }

  function handleButtonKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!isOpen) {
        openMenu();
      } else {
        moveActive(event.key === "ArrowDown" ? 1 : -1);
      }
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      if (!isOpen) return;
      event.preventDefault();
      const option = filteredOptions[activeIndex];
      if (option && !option.disabled) selectValue(option.value);
    }
  }

  function handleMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(event.key === "ArrowDown" ? 1 : -1);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const option = filteredOptions[activeIndex];
      if (option && !option.disabled) selectValue(option.value);
    }
  }

  return (
    <div ref={rootRef} className={`relative min-w-0 ${className}`}>
      {name && (
        <input
          ref={hiddenInputRef}
          type="hidden"
          name={name}
          value={selectedValue}
          required={required}
          readOnly
        />
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={() => (isOpen ? setIsOpen(false) : openMenu())}
        onKeyDown={handleButtonKeyDown}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        className={`flex h-10 w-full min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-[#fff] px-3 text-left text-sm font-semibold text-slate-900 shadow-sm outline-none transition hover:border-slate-300 hover:bg-slate-50 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-slate-600 dark:hover:bg-slate-800 dark:focus:border-blue-400 dark:focus:ring-blue-950 dark:disabled:bg-slate-800 dark:disabled:text-slate-500 ${buttonClassName}`}
      >
        <span className={`min-w-0 flex-1 truncate ${selectedOption ? "" : "text-slate-400 dark:text-slate-500"}`}>
          {displayLabel}
        </span>
        <ChevronDown
          className={`size-4 shrink-0 text-slate-400 transition ${isOpen ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <div
          className={`animate-dropdown-in absolute left-0 right-0 top-full z-[95] mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-[#fff] shadow-2xl shadow-slate-900/15 dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/40 ${menuClassName}`}
        >
          {shouldSearch && (
            <div className="border-b border-slate-100 p-2.5 dark:border-slate-800">
              <div className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 dark:border-slate-700 dark:bg-slate-950">
                <Search className="size-4 text-slate-400" aria-hidden="true" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                      event.preventDefault();
                      moveActive(event.key === "ArrowDown" ? 1 : -1);
                      return;
                    }

                    if (event.key === "Enter") {
                      event.preventDefault();
                      const option = filteredOptions[activeIndex];
                      if (option && !option.disabled) selectValue(option.value);
                    }
                  }}
                  autoFocus
                  placeholder="Search options"
                  className="h-full min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-500"
                />
              </div>
            </div>
          )}
          <div
            role="listbox"
            tabIndex={-1}
            onKeyDown={handleMenuKeyDown}
            className="max-h-72 overflow-y-auto p-2"
          >
            {filteredOptions.length === 0 ? (
              <p className="px-3 py-4 text-sm font-semibold text-slate-500 dark:text-slate-400">
                No matching options.
              </p>
            ) : (
              filteredOptions.map((option, index) => {
                const isSelected = option.value === selectedValue;
                const isActive = index === activeIndex;

                return (
                  <button
                    key={`${option.value}-${index}`}
                    ref={(node) => {
                      optionRefs.current[index] = node;
                    }}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    disabled={option.disabled}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => selectValue(option.value)}
                    className={`flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-accent-bg)] disabled:cursor-not-allowed disabled:opacity-45 ${
                      isSelected
                        ? "bg-[var(--primary-accent-soft)] text-slate-950 dark:text-white"
                        : isActive
                          ? "bg-slate-100 text-slate-950 dark:bg-slate-800 dark:text-white"
                          : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">{option.label}</span>
                      {option.description && (
                        <span className="block truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
                          {option.description}
                        </span>
                      )}
                    </span>
                    {isSelected && <Check className="size-4 shrink-0 text-blue-600 dark:text-blue-300" aria-hidden="true" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
