/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export const DASHBOARD_KEY = "saledock-dashboard-layout-v1";
export const SIDEBAR_KEY = "saledock-sidebar-preferences-v1";
export const DASHBOARD_EVENT = "saledock-dashboard-layout-changed";
export const SIDEBAR_EVENT = "saledock-sidebar-preferences-changed";

export function useUIPreferencesSync() {
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    let active = true;
    const supabase = createClient();

    async function sync() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !active) return;

        // Fetch user preferences from Supabase
        const { data, error } = await supabase
          .from("user_ui_preferences")
          .select("dashboard_layout, sidebar_preferences")
          .eq("user_id", user.id)
          .single();

        if (error && error.code !== "PGRST116") {
          // PGRST116 indicates no rows returned. Other codes mean database is not ready or query failed.
          console.warn("DB preferences query failed (failing open):", error);
          return;
        }

        const localDashboard = localStorage.getItem(DASHBOARD_KEY);
        const localSidebar = localStorage.getItem(SIDEBAR_KEY);

        if (data) {
          const dbDashboard = data.dashboard_layout;
          const dbSidebar = data.sidebar_preferences;

          let updatedDb = false;
          const updates: any = {};

          // Sync dashboard layout
          if (dbDashboard) {
            localStorage.setItem(DASHBOARD_KEY, JSON.stringify(dbDashboard));
            window.dispatchEvent(new Event(DASHBOARD_EVENT));
          } else if (localDashboard) {
            updates.dashboard_layout = JSON.parse(localDashboard);
            updatedDb = true;
          }

          // Sync sidebar preferences
          if (dbSidebar) {
            localStorage.setItem(SIDEBAR_KEY, JSON.stringify(dbSidebar));
            window.dispatchEvent(new Event(SIDEBAR_EVENT));
          } else if (localSidebar) {
            updates.sidebar_preferences = JSON.parse(localSidebar);
            updatedDb = true;
          }

          if (updatedDb) {
            await supabase
              .from("user_ui_preferences")
              .update(updates)
              .eq("user_id", user.id);
          }
        } else {
          // No database preferences row exists. Seed from localStorage if available.
          const dashboard_layout = localDashboard ? JSON.parse(localDashboard) : null;
          const sidebar_preferences = localSidebar ? JSON.parse(localSidebar) : null;

          if (dashboard_layout || sidebar_preferences) {
            await supabase
              .from("user_ui_preferences")
              .insert({
                user_id: user.id,
                dashboard_layout,
                sidebar_preferences,
              });
          }
        }
      } catch (err) {
        console.warn("UI preferences sync caught error (failing open):", err);
      } finally {
        if (active) setSynced(true);
      }
    }

    sync();
    return () => {
      active = false;
    };
  }, []);

  return synced;
}

let saveDashboardTimeout: NodeJS.Timeout | null = null;
let saveSidebarTimeout: NodeJS.Timeout | null = null;

export async function saveDashboardLayout(layout: any) {
  if (typeof window === "undefined") return;

  // 1. Update localStorage synchronously for instant UI updates
  localStorage.setItem(DASHBOARD_KEY, JSON.stringify(layout));
  window.dispatchEvent(new Event(DASHBOARD_EVENT));

  // 2. Save asynchronously to database (fail-open) with a debounce
  if (saveDashboardTimeout) {
    clearTimeout(saveDashboardTimeout);
  }

  saveDashboardTimeout = setTimeout(async () => {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase
        .from("user_ui_preferences")
        .upsert(
          {
            user_id: user.id,
            dashboard_layout: layout,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );
    } catch (err) {
      console.error("Failed to save dashboard layout preferences to database (failing open):", err);
    }
  }, 1000);
}

export async function saveSidebarPreferences(prefs: any) {
  if (typeof window === "undefined") return;

  // 1. Update localStorage synchronously for instant UI updates
  localStorage.setItem(SIDEBAR_KEY, JSON.stringify(prefs));
  window.dispatchEvent(new Event(SIDEBAR_EVENT));

  // 2. Save asynchronously to database (fail-open) with a debounce
  if (saveSidebarTimeout) {
    clearTimeout(saveSidebarTimeout);
  }

  saveSidebarTimeout = setTimeout(async () => {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase
        .from("user_ui_preferences")
        .upsert(
          {
            user_id: user.id,
            sidebar_preferences: prefs,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );
    } catch (err) {
      console.error("Failed to save sidebar preferences to database (failing open):", err);
    }
  }, 1000);
}
