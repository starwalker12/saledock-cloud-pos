import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

export function isolatedLedgerTrust() {
  const container=process.env.LOCAL_SUPABASE_DB_CONTAINER;
  if(!container) return false;
  assert.match(container,/^supabase_db_qa[0-9]+-[a-z0-9-]+$/,'Task-isolated local database required');
  const result=spawnSync('docker',['exec',container,'psql','-XqAt','-U','postgres','-d','postgres','-c',"select to_regnamespace('ledger_private') is not null;"],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  return result.stdout.trim()==='t';
}

export async function resetFixtureOrganization(client,organizationId) {
  if(!isolatedLedgerTrust()) return false;
  const reset=await client.rpc('reset_organization_to_factory_defaults',{p_organization_id:organizationId,p_actor_id:null,p_reset_settings:false});
  assert.ifError(reset.error);
  // Caller must supply only its disposable fixture organization.
  for(const table of ['pos_held_bills','audit_logs']) assert.ifError((await client.from(table).delete().eq('organization_id',organizationId)).error);
  return true;
}
