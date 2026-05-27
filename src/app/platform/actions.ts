"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin, setPlatformSetting } from "@/lib/platform/admin";

export type PlatformSettingsState = {
  success: boolean;
  error?: string;
};

const BOOLEAN_KEYS = new Set([
  "public_signup_enabled",
  "maintenance_mode_enabled",
  "backup_import_enabled",
  "demo_data_enabled",
  "factory_reset_enabled",
]);

const STRING_KEYS = new Set([
  "maintenance_message",
  "default_currency",
  "default_timezone",
  "app_name",
]);

export async function updatePlatformSettingsAction(
  prevState: PlatformSettingsState,
  formData: FormData,
): Promise<PlatformSettingsState> {
  try {
    await requirePlatformAdmin();

    const entries: { key: string; value: unknown }[] = [];

    for (const key of BOOLEAN_KEYS) {
      const raw = formData.get(key);
      entries.push({ key, value: raw === "on" || raw === "true" });
    }

    for (const key of STRING_KEYS) {
      const raw = formData.get(key)?.toString().trim();
      entries.push({ key, value: raw || null });
    }

    for (const { key, value } of entries) {
      await setPlatformSetting(key, value);
    }

    revalidatePath("/platform");
    revalidatePath("/login");
    revalidatePath("/settings");

    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to update settings";
    return { success: false, error: msg };
  }
}
