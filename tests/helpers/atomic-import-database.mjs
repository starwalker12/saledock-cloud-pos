import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
export const work=new URL('../../',import.meta.url).pathname.replace(/\/$/,'');
export const container=process.env.ATOMIC_IMPORT_BASELINE_CONTAINER;
assert.match(container??'',/^supabase_db_[a-zA-Z0-9_-]+$/, 'Set an explicitly approved LOCAL baseline container. Only its schema is copied.');
export const db='qa77126_'+crypto.randomBytes(6).toString('hex');
const rest=db+'_rest';
const roles=['backup_import_executor','backup_identity_executor','backup_collision_reader'];
export const org='77126000-0000-4000-8000-000000000001';
export const actor='77126000-0000-4000-8000-000000000002';
export const branch='77126000-0000-4000-8000-000000000003';
export const docker=(args,opts={})=>execFileSync('docker',args,{encoding:'utf8',maxBuffer:128*1024*1024,stdio:['pipe','pipe','pipe'],...opts});
export const sql=(query,database=db)=>docker(['exec','-i',container,'psql','-X','-qAt','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1','-f','-'],{input:query}).trim();
const inspect=name=>JSON.parse(docker(['inspect',name]))[0];
const q=s=>"'"+s.replaceAll("'","''")+"'";
export class Session {
 constructor(){
  this.stdout='';this.stderr='';this.pending=null;
  this.process=spawn('docker',['exec','-i',container,'psql','-X','-qAt','-U','postgres','-d',db,'-v','ON_ERROR_STOP=0']);
  this.process.stdout.on('data',c=>{this.stdout+=c.toString();this.check();});
  this.process.stderr.on('data',c=>{this.stderr+=c.toString();});
  this.exited=new Promise(resolve=>this.process.on('exit',resolve));
 }
 check(){
  if(!this.pending)return;const index=this.stdout.indexOf(this.pending.marker+' ');if(index<0)return;
  const end=this.stdout.indexOf('\n',index);if(end<0)return;
  const p=this.pending;this.pending=null;
  const state=this.stdout.slice(index+p.marker.length+1,end).trim();
  const text=this.stdout.slice(0,index).trim();this.stdout=this.stdout.slice(end+1);
  p.resolve({state,text,ms:performance.now()-p.started});
 }
 run(query){assert.equal(this.pending,null);return new Promise(resolve=>{
  const marker='QA_END_'+crypto.randomBytes(8).toString('hex');
  this.pending={resolve,marker,started:performance.now()};
  this.process.stdin.write(query+'\n\\echo '+marker+' :SQLSTATE\n');
 });}
 async ok(query){const r=await this.run(query);assert.equal(r.state,'00000',r.text+' '+this.stderr);return r;}
 async close(){this.process.stdin.end('rollback;\n\\q\n');await this.exited;}
}
export async function isolated(test){
 let created=false,restCreated=false,rolesCreated=false;
 const result={};
 try{
  assert.equal(sql(`select count(*) from pg_database where datname='${db}'`,'postgres'),'0');
  assert.equal(sql(`select count(*) from pg_roles where rolname=any(array[${roles.map(q)}])`,'postgres'),'0');
  sql(`create database ${db}`,'postgres');created=true;
  const dump=docker(['exec',container,'pg_dump','-U','postgres','-d','postgres','--schema-only','--no-owner','--schema=public','--schema=auth','--schema=extensions','--schema=workspace_private']);
  sql(dump.replaceAll('CREATE SCHEMA public;','CREATE SCHEMA IF NOT EXISTS public;').replace(/^ALTER DEFAULT PRIVILEGES[^\n]*\n/gm,''));
  sql(fs.readFileSync(work+'/supabase/migrations/20260907110844_pos_checkout_database_permission_parity.sql','utf8'));
  const grants=sql(`select string_agg(statement,E'\n') from (
    select format('GRANT USAGE ON SCHEMA %I TO %I;',n,r) statement from unnest(array['public','auth']) n cross join unnest(array['anon','authenticated','service_role']) r where has_schema_privilege(r,n,'USAGE')
    union all select format('GRANT %s ON TABLE public.%I TO %I;',p,c.relname,r) from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join unnest(array['anon','authenticated','service_role']) r cross join unnest(array['SELECT','INSERT','UPDATE','DELETE']) p where n.nspname='public' and c.relkind in ('r','p') and has_table_privilege(r,c.oid,p)) s`,'postgres');
  sql(grants);
  // Existing-org provisioning and subsequently created organizations are both covered.
  sql(`insert into public.organizations(id,name) values('${org}','QA77126 Atomic Restore');
    insert into public.branches(id,organization_id,name) values('${branch}','${org}','QA77126 Branch');
    insert into auth.users(id) values('${actor}');
    insert into public.profiles(id,organization_id,branch_id,full_name,role,is_active)
    values('${actor}','${org}','${branch}','QA77126 Owner','owner',true);`);
  sql(fs.readFileSync(work+'/supabase/migrations/20261001093929_atomic_accounting_import.sql','utf8'));rolesCreated=true;
  const source=inspect(container.replace('supabase_db_','supabase_rest_'));
  const env=Object.fromEntries(source.Config.Env.map(s=>{const i=s.indexOf('=');return [s.slice(0,i),s.slice(i+1)];}));
  const uri=new URL(env.PGRST_DB_URI);uri.pathname='/'+db;
  assert.equal(uri.hostname,container,'Isolated REST must connect only to the approved local Docker database');
  const secret=crypto.randomBytes(48).toString('base64url');
  docker(['run','--detach','--name',rest,'--network',Object.keys(inspect(container).NetworkSettings.Networks)[0],'-p','127.0.0.1::3000',
   '-e','PGRST_DB_URI','-e','PGRST_JWT_SECRET','-e','PGRST_DB_SCHEMAS=public,auth','-e','PGRST_DB_ANON_ROLE=anon','-e','PGRST_DB_POOL=5','-e','PGRST_LOG_LEVEL=crit',source.Config.Image],
   {env:{...process.env,PGRST_DB_URI:uri.toString(),PGRST_JWT_SECRET:secret}});restCreated=true;
  const base='http://127.0.0.1:'+inspect(rest).NetworkSettings.Ports['3000/tcp'][0].HostPort;
  const token=uid=>{
   const enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
   const s=enc({alg:'HS256',typ:'JWT'})+'.'+enc({role:'authenticated',sub:uid,exp:Math.floor(Date.now()/1000)+14400});
   return s+'.'+crypto.createHmac('sha256',secret).update(s).digest('base64url');
  };
  for(let i=0;i<60;i++){try{if((await fetch(base+'/')).ok)break;}catch{}await delay(100);}
  async function request(route,body,uid=actor,method='POST'){
   const start=performance.now();
   const response=await fetch(base+'/'+route,{method,headers:{'Content-Type':'application/json',Prefer:'return=representation',...(uid?{Authorization:'Bearer '+token(uid)}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
   const text=await response.text();return {status:response.status,ms:performance.now()-start,data:text?JSON.parse(text):null};
  }
  const rpc=async(name,args,uid=actor)=>request('rpc/accounting_import_'+name,args,uid);
  async function loseResponseRpc(name,args){
   let observed,failure,calls=0;
   const proxy=createServer(async incoming=>{
    calls++;
    try {
     const response=await fetch(base+'/rpc/accounting_import_'+name,{method:'POST',
      headers:{'Content-Type':'application/json',Authorization:'Bearer '+token(actor)},body:JSON.stringify(args)});
     const data=await response.json();observed={status:response.status,receiptConfirmed:!!data.receipt};
    } catch(error) {failure=error;}
    // Only drop the client-facing response after upstream HTTP completion brackets COMMIT.
    incoming.socket.destroy();
   });
   await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));
   let lost=false;
   try {await fetch('http://127.0.0.1:'+proxy.address().port);}
   catch {lost=true;}
   finally {await new Promise(resolve=>proxy.close(resolve));}
   if(failure)throw failure;
   assert.equal(lost,true,'Client must actually lose the HTTP response');
   assert.equal(calls,1,'Lost-response harness must send the mutation exactly once');
   assert.deepEqual(observed,{status:200,receiptConfirmed:true});
   return {clientResponseLost:lost,upstreamCalls:calls,...observed};
  }
  const {PostgrestClient}=createRequire(work+'/package.json')('@supabase/postgrest-js');
  const client=new PostgrestClient(base,{headers:{Authorization:'Bearer '+token(actor)}});
  await test({sql,rpc,request,result,client,loseResponseRpc});
 } finally {
  if(restCreated)docker(['rm','-f',rest]);
  if(created)sql(`drop database ${db} with (force)`,'postgres');
  if(rolesCreated)for(const role of roles)sql(`drop role ${role}`,'postgres');
  result.cleanup={isolatedDatabaseAbsent:sql(`select count(*) from pg_database where datname='${db}'`,'postgres')==='0',rolesAbsent:sql(`select count(*) from pg_roles where rolname=any(array[${roles.map(q)}])`,'postgres')==='0'};
 }
 return result;
}
