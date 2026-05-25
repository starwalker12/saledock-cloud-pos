import "server-only";
import { createClient } from "@/lib/supabase/server";

export type RepairRow = {
  id: string;
  organization_id: string;
  branch_id: string;
  customer_id: string | null;
  job_no: string;
  customer_name: string;
  customer_phone: string | null;
  device_type: string;
  device_model: string | null;
  serial_imei: string | null;
  problem_description: string;
  diagnosis: string | null;
  estimated_cost: number;
  advance_paid: number;
  final_cost: number;
  status: "received" | "waiting_for_parts" | "in_progress" | "completed" | "delivered" | "cancelled";
  expected_delivery_at: string | null;
  delivered_at: string | null;
  notes: string | null;
  accessories_received: string | null;
  payment_method: "cash" | "card" | "easypaisa" | "jazzcash" | "bank_transfer";
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
};

export type RepairHistoryRow = {
  id: string;
  old_status: string | null;
  new_status: string;
  note: string | null;
  created_at: string;
  changed_by_name: string | null;
};

export type RepairStats = {
  openCount: number;
  readyCount: number;
  deliveredThisMonth: number;
  totalAdvances: number;
};

export async function listRepairs(
  organizationId: string,
  filters?: {
    status?: string;
    search?: string;
    startDate?: string;
    endDate?: string;
  }
): Promise<RepairRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("repairs")
    .select(`
      *,
      profiles:created_by (full_name)
    `)
    .eq("organization_id", organizationId);

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }

  if (filters?.search) {
    const term = `%${filters.search}%`;
    query = query.or(`job_no.ilike.${term},customer_name.ilike.${term},customer_phone.ilike.${term},device_type.ilike.${term},device_model.ilike.${term},serial_imei.ilike.${term}`);
  }

  if (filters?.startDate) {
    query = query.gte("created_at", `${filters.startDate}T00:00:00Z`);
  }
  if (filters?.endDate) {
    query = query.lte("created_at", `${filters.endDate}T23:59:59Z`);
  }

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => {
    const prof = r.profiles as { full_name?: string } | { full_name?: string }[] | null;
    const creatorName = Array.isArray(prof) ? prof[0]?.full_name ?? null : prof?.full_name ?? null;

    return {
      id: r.id,
      organization_id: r.organization_id,
      branch_id: r.branch_id,
      customer_id: r.customer_id,
      job_no: r.job_no,
      customer_name: r.customer_name,
      customer_phone: r.customer_phone,
      device_type: r.device_type,
      device_model: r.device_model,
      serial_imei: r.serial_imei,
      problem_description: r.problem_description,
      diagnosis: r.diagnosis,
      estimated_cost: Number(r.estimated_cost ?? 0),
      advance_paid: Number(r.advance_paid ?? 0),
      final_cost: Number(r.final_cost ?? 0),
      status: r.status,
      expected_delivery_at: r.expected_delivery_at,
      delivered_at: r.delivered_at,
      notes: r.notes,
      accessories_received: r.accessories_received,
      payment_method: r.payment_method,
      created_by: r.created_by,
      created_by_name: creatorName,
      created_at: r.created_at,
      updated_at: r.updated_at,
    };
  });
}

export async function getRepairDetail(
  repairId: string,
  organizationId: string
): Promise<{ repair: RepairRow; history: RepairHistoryRow[] } | null> {
  const supabase = await createClient();
  const { data: repair, error } = await supabase
    .from("repairs")
    .select(`
      *,
      profiles:created_by (full_name)
    `)
    .eq("organization_id", organizationId)
    .eq("id", repairId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!repair) return null;

  const prof = repair.profiles as { full_name?: string } | { full_name?: string }[] | null;
  const creatorName = Array.isArray(prof) ? prof[0]?.full_name ?? null : prof?.full_name ?? null;

  const repairRow: RepairRow = {
    id: repair.id,
    organization_id: repair.organization_id,
    branch_id: repair.branch_id,
    customer_id: repair.customer_id,
    job_no: repair.job_no,
    customer_name: repair.customer_name,
    customer_phone: repair.customer_phone,
    device_type: repair.device_type,
    device_model: repair.device_model,
    serial_imei: repair.serial_imei,
    problem_description: repair.problem_description,
    diagnosis: repair.diagnosis,
    estimated_cost: Number(repair.estimated_cost ?? 0),
    advance_paid: Number(repair.advance_paid ?? 0),
    final_cost: Number(repair.final_cost ?? 0),
    status: repair.status,
    expected_delivery_at: repair.expected_delivery_at,
    delivered_at: repair.delivered_at,
    notes: repair.notes,
    accessories_received: repair.accessories_received,
    payment_method: repair.payment_method,
    created_by: repair.created_by,
    created_by_name: creatorName,
    created_at: repair.created_at,
    updated_at: repair.updated_at,
  };

  const { data: history, error: historyError } = await supabase
    .from("repair_status_history")
    .select(`
      *,
      profiles:changed_by (full_name)
    `)
    .eq("organization_id", organizationId)
    .eq("repair_id", repairId)
    .order("created_at", { ascending: false });

  if (historyError) throw new Error(historyError.message);

  const historyRows = (history ?? []).map((h) => {
    const hProf = h.profiles as { full_name?: string } | { full_name?: string }[] | null;
    const changerName = Array.isArray(hProf) ? hProf[0]?.full_name ?? null : hProf?.full_name ?? null;

    return {
      id: h.id,
      old_status: h.old_status,
      new_status: h.new_status,
      note: h.note,
      created_at: h.created_at,
      changed_by_name: changerName,
    } satisfies RepairHistoryRow;
  });

  return { repair: repairRow, history: historyRows };
}

export async function listCustomerRepairs(
  customerId: string,
  organizationId: string
): Promise<RepairRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("repairs")
    .select(`
      *,
      profiles:created_by (full_name)
    `)
    .eq("organization_id", organizationId)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => {
    const prof = r.profiles as { full_name?: string } | { full_name?: string }[] | null;
    const creatorName = Array.isArray(prof) ? prof[0]?.full_name ?? null : prof?.full_name ?? null;

    return {
      id: r.id,
      organization_id: r.organization_id,
      branch_id: r.branch_id,
      customer_id: r.customer_id,
      job_no: r.job_no,
      customer_name: r.customer_name,
      customer_phone: r.customer_phone,
      device_type: r.device_type,
      device_model: r.device_model,
      serial_imei: r.serial_imei,
      problem_description: r.problem_description,
      diagnosis: r.diagnosis,
      estimated_cost: Number(r.estimated_cost ?? 0),
      advance_paid: Number(r.advance_paid ?? 0),
      final_cost: Number(r.final_cost ?? 0),
      status: r.status,
      expected_delivery_at: r.expected_delivery_at,
      delivered_at: r.delivered_at,
      notes: r.notes,
      accessories_received: r.accessories_received,
      payment_method: r.payment_method,
      created_by: r.created_by,
      created_by_name: creatorName,
      created_at: r.created_at,
      updated_at: r.updated_at,
    };
  });
}

export async function getRepairsStats(organizationId: string): Promise<RepairStats> {
  const supabase = await createClient();
  
  // Fetch active counts and advances
  const { data, error } = await supabase
    .from("repairs")
    .select("status, advance_paid, delivered_at")
    .eq("organization_id", organizationId);

  if (error) throw new Error(error.message);

  const openStatuses = ["received", "waiting_for_parts", "in_progress"];
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth(); // 0-indexed

  let openCount = 0;
  let readyCount = 0;
  let deliveredThisMonth = 0;
  let totalAdvances = 0;

  for (const r of data ?? []) {
    const status = r.status;
    const advance = Number(r.advance_paid ?? 0);
    totalAdvances += advance;

    if (openStatuses.includes(status)) {
      openCount++;
    } else if (status === "completed") {
      readyCount++;
    } else if (status === "delivered" && r.delivered_at) {
      const delDate = new Date(r.delivered_at);
      if (delDate.getUTCFullYear() === currentYear && delDate.getUTCMonth() === currentMonth) {
        deliveredThisMonth++;
      }
    }
  }

  return {
    openCount,
    readyCount,
    deliveredThisMonth,
    totalAdvances,
  };
}
