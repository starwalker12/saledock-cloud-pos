import "server-only";
import { type createClient } from "@/lib/supabase/server";
import { sumRestoredProductCost } from "@/lib/return-profit";

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

export async function getRestoredProductCostForReturns(
  supabase: ServerSupabaseClient,
  organizationId: string,
  completedReturnIds: string[],
): Promise<number> {
  if (completedReturnIds.length === 0) return 0;

  const { data, error } = await supabase
    .from("return_stock_allocations")
    .select("quantity, unit_cost")
    .eq("organization_id", organizationId)
    .in("return_id", completedReturnIds);

  if (error) {
    throw new Error(`Return stock allocations query error: ${error.message}`);
  }

  return sumRestoredProductCost(data ?? []);
}
