"use client";

import { createContext, useCallback, useContext, useRef, type ComponentProps, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import type { CustomerRow } from "@/lib/data/customers";
import type { RepairRow } from "@/lib/data/repairs";
import { RepairForm } from "./repair-form";

const IntakeContext = createContext<(() => void) | null>(null);

function useOpenIntake() {
  const open = useContext(IntakeContext);
  if (!open) throw new Error("Repair intake requires its modal controller");
  return open;
}

export function RepairModalController({ children, customers, editing }: {
  children: ReactNode;
  customers: CustomerRow[];
  editing?: RepairRow;
}) {
  const params = useSearchParams();
  const returnFocus = useRef<HTMLElement | null>(null);
  const repair = editing && params.get("edit") === editing.id ? editing : undefined;
  const open = params.get("add") === "1" || Boolean(repair);

  const openIntake = useCallback(() => {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const url = new URL(window.location.href);
    url.searchParams.delete("edit");
    url.searchParams.set("add", "1");
    // Replace this list entry so repeated modal toggles do not grow browser history.
    window.history.replaceState(null, "", url);
  }, []);

  const close = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("add");
    url.searchParams.delete("edit");
    window.history.replaceState(null, "", url);
    const target = returnFocus.current?.isConnected
      ? returnFocus.current
      : document.querySelector<HTMLElement>("[data-repair-intake-trigger]");
    target?.focus({ preventScroll: true });
  }, []);

  return (
    <IntakeContext.Provider value={openIntake}>
      {children}
      {open && <RepairForm key={repair?.id ?? "intake"} customers={customers} repair={repair} onClose={close} />}
    </IntakeContext.Provider>
  );
}

export function RepairIntakeButton() {
  const open = useOpenIntake();
  return (
    <button type="button" data-repair-intake-trigger onClick={open}
      className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-blue-700 px-4 text-sm font-bold text-white hover:bg-blue-800 transition">
      <Plus className="size-4" /> Intake Repair
    </button>
  );
}

export function RepairEmptyState(props: ComponentProps<typeof EmptyState>) {
  const open = useOpenIntake();
  return <EmptyState {...props} actionOnClick={props.actionLabel ? open : undefined} />;
}
