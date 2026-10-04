"use server";

import { getCurrentContext } from "@/lib/auth/session";
import { logAudit } from "@/lib/audit";

export type DemoActionState = {
  success: boolean;
  error?: string;
  message?: string;
};

export async function loadDemoDataAction(
  _prevState: DemoActionState | null,
  _formData: FormData
): Promise<DemoActionState> {
  try {
    const { user, profile } = await getCurrentContext();
    void _prevState;
    void _formData;
    if (!user || !profile) {
      return { success: false, error: "Not authenticated." };
    }

    if (profile.role !== "owner" && profile.role !== "admin") {
      logAudit({ module: "settings", action: "permission.denied", details: "Demo data creation denied" });
      return { success: false, error: "Only Owners and Admins can create demo data." };
    }

    return {
      success: false,
      error: "Demo data creation is temporarily unavailable while SaleDock protects accounting history. Existing shop data was not changed.",
    };
  } catch {
    return { success: false, error: "We couldn't verify your access. Please try again." };
  }
}

export async function removeDemoDataAction(
  _prevState: DemoActionState | null,
  _formData: FormData
): Promise<DemoActionState> {
  try {
    const { user, profile } = await getCurrentContext();
    void _prevState;
    void _formData;
    if (!user || !profile) {
      return { success: false, error: "Not authenticated." };
    }

    if (profile.role !== "owner" && profile.role !== "admin") {
      logAudit({ module: "settings", action: "permission.denied", details: "Demo data removal denied" });
      return { success: false, error: "Only Owners and Admins can remove demo data." };
    }

    return {
      success: false,
      error: "Demo data removal is temporarily unavailable while SaleDock protects accounting history. Existing demo and shop data were left unchanged.",
    };
  } catch {
    return { success: false, error: "We couldn't verify your access. Please try again." };
  }
}
