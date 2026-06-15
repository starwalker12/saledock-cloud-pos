"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

export type PurchaseFilterOption = {
  value: string;
  label: string;
};

export function PurchaseFilterSelect({
  name,
  label,
  defaultValue,
  options,
}: {
  name: string;
  label: string;
  defaultValue: string;
  options: PurchaseFilterOption[];
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(defaultValue);
  const [activeIndex, setActiveIndex] = useState(() => {
    const index = options.findIndex((option) => option.value === defaultValue);
    return index >= 0 ? index : 0;
  });
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listboxId = useId();

  const selectedOption = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  function chooseOption(option: PurchaseFilterOption, index: number) {
    setValue(option.value);
    setActiveIndex(index);
    setOpen(false);
    buttonRef.current?.focus();
  }

  function focusOption(index: number) {
    window.setTimeout(() => {
      const optionButton = rootRef.current?.querySelector<HTMLButtonElement>(
        `[data-option-index="${index}"]`
      );
      optionButton?.focus();
    }, 0);
  }

  function handleButtonKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const nextIndex = (activeIndex + direction + options.length) % options.length;
      setActiveIndex(nextIndex);
      setOpen(true);
      focusOption(nextIndex);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen((current) => {
        if (!current) focusOption(activeIndex);
        return !current;
      });
    }
  }

  function handleOptionKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    option: PurchaseFilterOption,
    index: number
  ) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      chooseOption(option, index);
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const nextIndex = (index + direction + options.length) % options.length;
      setActiveIndex(nextIndex);
      const nextButton = rootRef.current?.querySelector<HTMLButtonElement>(
        `[data-option-index="${nextIndex}"]`
      );
      nextButton?.focus();
    }
  }

  return (
    <div ref={rootRef} className="relative flex min-w-0 flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </span>
      <input type="hidden" name={name} value={value} />
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleButtonKeyDown}
        className="flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-slate-200 bg-[#fff] px-3 text-left text-sm font-semibold text-slate-900 outline-none transition hover:border-slate-300 hover:bg-slate-50 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:hover:border-slate-700 dark:hover:bg-slate-900"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
      >
        <span className="min-w-0 truncate">{selectedOption?.label ?? "All"}</span>
        <ChevronDown
          className={`size-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-[#fff] p-1.5 shadow-xl shadow-slate-950/10 dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/30"
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            return (
              <button
                key={`${option.value}-${option.label}`}
                type="button"
                role="option"
                aria-selected={isSelected}
                data-option-index={index}
                onClick={() => chooseOption(option, index)}
                onKeyDown={(event) => handleOptionKeyDown(event, option, index)}
                className={`flex w-full min-w-0 items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition ${
                  isSelected
                    ? "bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200"
                    : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {isSelected && <Check className="size-4 shrink-0 text-blue-600 dark:text-blue-300" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
