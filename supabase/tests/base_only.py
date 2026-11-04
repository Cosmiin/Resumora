"""Forward-migration and retained-product checks on disposable, synthetic Postgres."""
import json, unittest, uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
def uid():return str(uuid.uuid4())
def literal(value):return "'"+json.dumps(value).replace("'","''")+"'::jsonb"

def preserved(db):
 tables=['editor_draft_snapshots','editor_photo_references','career_profiles','profile_versions','claims','claim_provenance','source_spans','cv_import_sessions','cv_import_tasks','tenant_memberships','user_profiles']
 result={}
 for table in tables:
  where=" WHERE profile_id IS NOT NULL" if table=='source_spans' else ''
  result[table]=db.sql(f"SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'')) FROM app.{table} t"+where)
 result['auth']=db.sql("SELECT md5(jsonb_agg(to_jsonb(u) ORDER BY id)::text) FROM auth.users u")
 return result

def prepare_upgrade(db):
 global UPGRADE
 UPGRADE={'users':[],'photos':[],'operations':[],'removedPhotos':[]}
 secret='synthetic-upgrade-worker-secret-123456789'
 db.sql(f"INSERT INTO app.ai_worker_authorization VALUES(true,sha256(convert_to('{secret}','UTF8'))) ON CONFLICT(singleton) DO UPDATE SET secret_hash=excluded.secret_hash")
 for i in range(2):
  user=uid();db.sql(f"INSERT INTO auth.users(id) VALUES('{user}')")
  def call(name,args=''):
   return json.loads(db.sql(f'SELECT app.{name}({args})',user=user,role='authenticated'))
  call('provision_workspace',f"'{uid()}'")
  tenant=db.sql(f"SELECT id FROM app.tenants WHERE owner_user_id='{user}'")
  shared,exclusive=uid(),uid()
  for photo in (shared,exclusive):
   db.sql(f"INSERT INTO app.photo_assets(id,tenant_id,object_key,state,byte_size,width,height,sha256) VALUES('{photo}','{tenant}','{tenant}/{photo}.jpg','ready',100,800,800,repeat('a',64))")
  payload=json.loads((ROOT/'packages/contracts/fixtures/cv-import.json').read_text())
  photo={'assetId':shared,'crop':{'version':1,'centerX':.5,'centerY':.5,'zoom':1},'shape':'circle','visible':True}
  payload['content']['presentation']['photo']=photo
  snapshot=call('save_base_draft',f"'{uid()}',0,{literal(payload)},'checkpoint'")
  job=call('save_target_job',f"'{uid()}',NULL,NULL,{literal({'text':'Synthetic SQL role'})},'[]'")
  frozen=json.loads(db.sql(f"SELECT app.freeze_job_document('{{}}',{literal(payload)})"))
  locale=payload['content']['language']
  call('save_current_job_document',f"'{uid()}','{job['id']}','{locale}',NULL,0,{literal(frozen)},'{snapshot['id']}',NULL,NULL")
  frozen['content']['presentation']['photo']['assetId']=exclusive
  frozen['content']['language']='fr';frozen['content']['documentLocale']='fr'
  call('save_current_job_document',f"'{uid()}','{job['id']}','fr',NULL,0,{literal(frozen)},'{snapshot['id']}',NULL,NULL")
  retained_op,removed_op=uid(),uid()
  call('reserve_enhancement',f"'{retained_op}','{snapshot['id']}',1,'summary','synthetic','{secret}'")
  db.sql(f"INSERT INTO app.ai_enhancement_operations(id,tenant_id,job_id,target_id,policy) VALUES('{removed_op}','{tenant}','{job['id']}','synthetic','synthetic')")
  for op in (retained_op,removed_op):
   db.sql(f"INSERT INTO app.ai_enhancement_attempts(tenant_id,id,operation_id,start_data,result_data) VALUES('{tenant}','{op}-primary','{op}','{{}}','{{\"status\":\"completed\"}}')")
  UPGRADE['users'].append(user);UPGRADE['photos'].append(shared);UPGRADE['removedPhotos'].append(exclusive);UPGRADE['operations'].append(retained_op)
 # Fingerprints exclude job-only source spans, but include every retained snapshot and history row.
 UPGRADE['before']=preserved(db)
 migration=next((ROOT/'supabase/migrations').glob('*_remove_job_product.sql')).read_text()
 # Add ambiguous provenance only inside the failed transaction. Failure must undo both fixture and DDL.
 snapshot=db.sql('SELECT id FROM app.editor_draft_snapshots LIMIT 1')
 error=db.sql("BEGIN; ALTER TABLE app.editor_draft_snapshots DISABLE TRIGGER USER; UPDATE app.editor_draft_snapshots SET payload=jsonb_set(payload,'{answers}','[{\"origin\":{\"jobId\":\"ambiguous\"}}]') WHERE id='"+snapshot+"'; "+migration+' COMMIT;',expect_error=True)
 assert 'BASE_PROVENANCE_REQUIRES_RECONCILIATION' in error,error
 assert preserved(db)==UPGRADE['before']
 UPGRADE['rollback']=True
 # Explicit historic attribution is also a refusal, never a guess at user prose.
 known=db.sql("BEGIN; ALTER TABLE app.editor_draft_snapshots DISABLE TRIGGER USER; UPDATE app.editor_draft_snapshots SET payload=jsonb_set(payload,'{answers}','[{\"id\":\"job_legacy\",\"origin\":{\"jobId\":\""+uid()+"\",\"answerId\":\""+uid()+"\",\"answerRevision\":1}}]') WHERE id='"+snapshot+"'; "+migration+' COMMIT;',expect_error=True)
 assert 'BASE_PROVENANCE_REQUIRES_RECONCILIATION' in known,known
 assert preserved(db)==UPGRADE['before']
 UPGRADE['knownRefused']=True
 legacy=db.sql("BEGIN; ALTER TABLE app.editor_draft_snapshots DISABLE TRIGGER USER; UPDATE app.editor_draft_snapshots SET payload=jsonb_set(payload,'{content,sources}','[{\"id\":\"job_local_manual\",\"kind\":\"manual\",\"label\":\"Private additions\"}]') WHERE id='"+snapshot+"'; "+migration+' COMMIT;',expect_error=True)
 assert 'BASE_PROVENANCE_REQUIRES_RECONCILIATION' in legacy,legacy
 assert preserved(db)==UPGRADE['before']


def suite(db):
 class BaseOnly(unittest.TestCase):
  def test_all_tenants_keep_unrelated_base_state(self):
   self.assertEqual(preserved(db),UPGRADE['before'])
  def test_fresh_schema_matches_upgraded_schema(self):
   import subprocess
   name='fresh_'+uuid.uuid4().hex
   db.sql('CREATE DATABASE '+name)
   fresh=object.__new__(type(db));fresh.__dict__.update(db.__dict__);fresh.env=dict(db.env,PGDATABASE=name)
   try:
    fresh.sql((ROOT/'supabase/tests/bootstrap.sql').read_text());fresh.migrate()
    def schema(connection):
     result=subprocess.run([db.binary('pg_dump'),'--schema-only','--schema=app','--no-owner'],env=connection.env,text=True,capture_output=True,check=True)
     return '\n'.join(line for line in result.stdout.splitlines() if not line.startswith(('\\restrict ','\\unrestrict ')))
    self.assertEqual(schema(db),schema(fresh))
   finally:db.sql('DROP DATABASE '+name)
  def test_shared_ledgers_keep_cv_rows(self):
   for op in UPGRADE['operations']:
    self.assertEqual(db.sql(f"SELECT count(*) FROM app.ai_enhancement_operations WHERE id='{op}'"),'1')
    self.assertEqual(db.sql(f"SELECT count(*) FROM app.ai_enhancement_attempts WHERE operation_id='{op}'"),'1')
   self.assertEqual(db.sql('SELECT count(*) FROM app.ai_enhancement_operations'),str(len(UPGRADE['operations'])))
  def test_shared_photo_survives(self):
   for photo in UPGRADE['photos']:self.assertEqual(db.sql(f"SELECT count(*) FROM app.photo_assets WHERE id='{photo}'"),'1')
   for photo in UPGRADE['removedPhotos']:self.assertEqual(db.sql(f"SELECT count(*) FROM app.photo_assets WHERE id='{photo}'"),'0')
  def test_ambiguous_provenance_aborts_atomically(self):
   self.assertTrue(UPGRADE['rollback'])
  def test_known_origin_history_requires_explicit_reconciliation(self):
   self.assertTrue(UPGRADE['knownRefused'])
  def test_postflight_has_zero_residuals(self):
   checks=db.sql((ROOT/'scripts/db/verify-base-only.sql').read_text())
   self.assertTrue(all(row.endswith('|0') for row in checks.splitlines()),checks)
  def test_job_rows_and_objects_absent(self):
   self.assertEqual(db.sql("SELECT count(*) FROM pg_class WHERE relnamespace='app'::regnamespace AND relname ~ '(job|capture|tailor|application|analysis|recommendation|readiness|requirement|match_evidence|evidence_mapping|rule_version|next_action)'"),'0')
   self.assertEqual(db.sql("SELECT count(*) FROM pg_proc WHERE pronamespace='app'::regnamespace AND proname ~ '(job|capture|tailor|application|analysis|readiness|integration|intake|sent_count|mark_sent|retract_sent|next_action)'"),'0')
  def test_old_worker_and_rpc_cannot_publish(self):
   for fn in ['claim_job_workflow(text,boolean)','capture_command(text,text,text,uuid,text,jsonb)','document_language_context(uuid)']:
    self.assertEqual(db.sql(f"SELECT to_regprocedure('app.{fn}') IS NULL"),'t')
  def test_stale_direct_rpc_cannot_reintroduce_retired_provenance(self):
   user=uid();db.sql(f"INSERT INTO auth.users(id) VALUES('{user}')")
   variants=[{'answers':[{'origin':{'jobId':uid(),'answerId':uid(),'answerRevision':1}}]},
     {'content':{'sources':[{'id':'job_local_manual','kind':'manual','label':'Private additions'}]}},
     {'content':{'sources':[{'id':'job_source_legacy','kind':'answer','label':'Old answer'}]}}]
   for delta in variants:
    payload={'schemaVersion':'resumora-editor-draft/1','content':{},'answers':[],**delta}
    result=db.sql(f"SELECT app.save_base_draft('{uid()}',0,{literal(payload)},'autosave')",user=user,role='authenticated',expect_error=True)
    self.assertIn('editor_snapshot_supported_provenance',result)
   self.assertEqual(db.sql(f"SELECT count(*) FROM app.editor_draft_snapshots s JOIN app.tenants t ON t.id=s.tenant_id WHERE t.owner_user_id='{user}'"),'0')
  def test_base_remove_and_restore_keep_ownership_guards(self):
   a,b=uid(),uid();db.sql(f"INSERT INTO auth.users(id) VALUES ('{a}'),('{b}')")
   payload={'schemaVersion':'resumora-editor-draft/1','content':{},'answers':[]}
   def call(name,args='',user=a,error=False):return db.sql(f'SELECT app.{name}({args})',user=user,role='authenticated',expect_error=error)
   saved=json.loads(call('save_base_draft',f"'{uid()}',0,{literal(payload)},'autosave'"))
   call('provision_workspace',f"'{uid()}'",user=b)
   self.assertEqual(call('load_base_draft',user=b),'')
   self.assertIn('SNAPSHOT_NOT_FOUND',call('restore_base_draft',f"'{uid()}',0,'{saved['id']}'",user=b,error=True))
   self.assertEqual(json.loads(call('document_language_context'))['source']['id'],saved['id'])
   self.assertIn('VERSION_CONFLICT',call('remove_base_cv',f"'{uid()}',0,0",error=True))
   self.assertTrue(json.loads(call('remove_base_cv',f"'{uid()}',1,0"))['removed'])
   self.assertEqual(call('load_base_draft'),'')
   self.assertIn('SNAPSHOT_NOT_FOUND',call('restore_base_draft',f"'{uid()}',2,'{saved['id']}'",error=True))
 return unittest.defaultTestLoader.loadTestsFromTestCase(BaseOnly)
