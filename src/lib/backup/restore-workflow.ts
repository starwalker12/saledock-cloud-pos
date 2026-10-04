import {
  ACCOUNTING_TABLES, ANCILLARY_TABLES, accountingChunks, type RestoreTable,
} from "./accounting-import";
import { prepareRestore } from "./source-adapter";

export type RestoreAction = (operation: string, args: Record<string, unknown>) => Promise<{
  success: boolean; data?: Record<string, unknown>; error?: string;
}>;
export type RestorePhase = "Uploading/staging" | "Validating" | "Ready" | "Restoring accounting data" | "Restoring remaining data" | "Completed";
export type RestoreProgress = { phase: RestorePhase; table?: RestoreTable; chunk?: number; chunks?: number; committed?: boolean };

async function confirmed(action: RestoreAction, operation: string, args: Record<string, unknown>) {
  const result = await action(operation, args);
  if (!result.success || !result.data || result.data.ok !== true) {
    throw new Error(String(result.data?.message ?? result.error ?? "Restore could not be confirmed. Check its saved status before trying again."));
  }
  return result.data;
}

// No automatic mutation retry. A lost response is recovered through the saved job/receipt.
export async function restoreBackup(
  action: RestoreAction, input: Record<string, unknown>, format: "native" | "desktop", version: string,
  includeAudit: boolean, progress: (value: RestoreProgress) => void, rememberJob: (id: string) => void,
) {
  // This pass verifies source capability before creating even a disposable job.
  const provisional = prepareRestore(input, format, { actorId: "00000000-0000-4000-8000-000000000000", branchId: null }, includeAudit);
  const ancillary = Object.fromEntries(ANCILLARY_TABLES.map(t => [t, provisional[t].length]));
  const start = await confirmed(action, "start_job", { p_format: format, p_version: version, p_ancillary: ancillary });
  const jobId = String(start.job_id);
  rememberJob(jobId);
  const plan = prepareRestore(input, format, { actorId: String(start.actor_id), branchId: start.branch_id ? String(start.branch_id) : null }, includeAudit);
  for (const table of ACCOUNTING_TABLES) {
    const chunks = accountingChunks(jobId, table, plan[table]);
    for (let index = 0; index < chunks.length; index++) {
      progress({ phase: "Uploading/staging", table, chunk: index + 1, chunks: chunks.length });
      await confirmed(action, "stage_chunk", { p_job: jobId, p_table: table, p_index: index, p_rows: chunks[index] });
    }
  }
  // Source counts must match the authoritative uploaded manifest before it is sealed.
  const current = await confirmed(action, "get_job", { p_job: jobId });
  const manifest = current.manifest as Record<string, { rows: number }>;
  for (const table of ACCOUNTING_TABLES) {
    if (manifest[table]?.rows !== plan[table].length) throw new Error("Uploaded accounting counts do not match this backup. No shop data changed.");
  }
  const seal = await confirmed(action, "seal_job", { p_job: jobId, p_manifest: manifest });
  progress({ phase: "Validating" });
  await confirmed(action, "validate_job", { p_job: jobId });
  progress({ phase: "Ready" });
  progress({ phase: "Restoring accounting data" });
  const final = await confirmed(action, "finalize_job", { p_job: jobId, p_digest: seal.digest });
  progress({ phase: "Restoring remaining data", committed: true });
  for (const table of ANCILLARY_TABLES) {
    const chunks = accountingChunks(jobId, table, plan[table]);
    for (let index = 0; index < chunks.length; index++) {
      progress({ phase: "Restoring remaining data", table, chunk: index + 1, chunks: chunks.length, committed: true });
      await confirmed(action, "restore_ancillary", { p_job: jobId, p_table: table, p_index: index, p_rows: chunks[index] });
    }
  }
  await confirmed(action, "finish_job", { p_job: jobId });
  progress({ phase: "Completed", committed: true });
  return { jobId, receipt: final.receipt, counts: Object.fromEntries([...ACCOUNTING_TABLES, ...ANCILLARY_TABLES].map(t => [t, plan[t].length])) };
}
