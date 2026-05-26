"use server";

import { getCurrentContext } from "@/lib/auth/session";
import { searchGlobal, type SearchResult } from "@/lib/data/global-search";

export async function executeGlobalSearchAction(
  searchTerm: string,
): Promise<SearchResult[]> {
  try {
    const ctx = await getCurrentContext();
    if (!ctx.user || !ctx.profile?.organization_id) {
      return [];
    }

    return await searchGlobal(
      ctx.profile.organization_id,
      ctx.profile.role,
      searchTerm,
    );
  } catch (err) {
    console.error("[search-action] Failed to execute global search:", err);
    return [];
  }
}
