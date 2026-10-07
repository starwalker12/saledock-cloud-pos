import { execFileSync } from 'node:child_process';
import type { SupabaseClient } from '@supabase/supabase-js';

function localSql(query: string) {
  const container = process.env.LOCAL_SUPABASE_DB_CONTAINER;
  if (!/^supabase_db_qa[0-9]+-[a-z0-9-]+$/.test(container ?? '')) {
    throw new Error('Accounting fixtures require a task-isolated local database');
  }
  return execFileSync('docker', ['exec', '-i', container!, 'psql', '-XqAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], { input: query, encoding: 'utf8' }).trim();
}

// Privileged SQL seeds are QA setup only, never an application financial write.
export async function seedLocalAccountingAccount(client: SupabaseClient, table: 'customers' | 'suppliers', row: Record<string, unknown>) {
  if (!process.env.LOCAL_SUPABASE_DB_CONTAINER || localSql("select to_regnamespace('ledger_private') is not null;") !== 't') {
    const result = await client.from(table).insert(row);
    if (result.error) throw new Error(result.error.message);
    return;
  }
  const literal = JSON.stringify(row).replaceAll("'", "''");
  const columns = table === 'customers' ? 'id,organization_id,branch_id,name,outstanding_balance' : 'id,organization_id,name,outstanding_balance';
  localSql(`insert into public.${table}(${columns}) select ${columns} from jsonb_populate_record(null::public.${table},'${literal}'::jsonb);`);
}

export async function resetLocalAccountingFixture(client: SupabaseClient, organizationId: string) {
  if (!process.env.LOCAL_SUPABASE_DB_CONTAINER || localSql("select to_regnamespace('ledger_private') is not null;") !== 't') return false;
  // The existing platform-only Factory Reset capability is the reviewed cleanup path.
  const result = await client.rpc('reset_organization_to_factory_defaults', { p_organization_id: organizationId, p_actor_id: null, p_reset_settings: false });
  if (result.error) throw new Error(result.error.message);
  // Existing Factory Reset does not include held bills; remove only this QA shop's fixture rows.
  const held = await client.from('pos_held_bills').delete().eq('organization_id', organizationId);
  if (held.error) throw new Error(held.error.message);
  return true;
}
