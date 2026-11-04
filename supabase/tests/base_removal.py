"""Real synthetic Base purge, canonical preservation and authorization checks."""
import json,uuid,unittest,importlib.util,subprocess,concurrent.futures,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
uid=lambda:str(uuid.uuid4())
lit=lambda v:"'"+json.dumps(v).replace("'","''")+"'::jsonb"
def suite(db):
 spec=importlib.util.spec_from_file_location('removal_canonical',ROOT/'supabase/tests/behavior.py')
 b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b);b.DB=db
 class Removal(unittest.TestCase):
  def setUp(self):
   self.w=b.Workspace();self.w.setUp()
   self.initial_operation=uid();self.initial_admission=self.call('begin_cv_import',f"'{self.initial_operation}','pdf','{'a'*64}',100,0")
   self.source=json.loads((ROOT/'packages/contracts/fixtures/cv-import.json').read_text())
   self.source['content']['importReview']['id']=self.initial_admission['record']['id']
   self.base=self.call('save_base_draft',f"'{uid()}',0,{lit(self.source)},'checkpoint'")
  def raw(self,name,args='',error=False,user=None,role='authenticated'):
   return db.sql(f'SELECT app.{name}({args})',user=user or self.w.a,role=role,expect_error=error)
  def call(self,*a,**kw):
   s=self.raw(*a,**kw);return s=='t' if s in ('t','f') else json.loads(s) if s else None
  def remove(self,key=None,revision=1,generation=0,error=False):return self.raw('remove_base_cv',f"'{key or uid()}',{revision},{generation}",error=error)
  def count(self,t):return db.sql(f"SELECT count(*) FROM app.{t} WHERE tenant_id='{self.w.wa}'")
  def test_full_canonical_closure_leaves_auth_and_account_intact(self):
   result=json.loads(self.remove());self.assertTrue(result['removed']);self.assertEqual((result['generation'],result['revision']),(1,2))
   for table in ['editor_draft_snapshots','career_profiles','profile_versions','claims','cv_versions','cv_documents','cv_import_sessions','editor_photo_references']:
    self.assertEqual(self.count(table),'0',table)
   self.assertIsNone(self.call('load_base_draft'));self.assertEqual(self.call('base_draft_history'),[])
   self.assertEqual(db.sql(f"SELECT state FROM app.tenants WHERE id='{self.w.wa}'"),'active')
  def test_replay_expiration_and_monotonic_no_resurrection(self):
   key=uid();first=json.loads(self.remove(key));self.assertEqual(json.loads(self.remove(key)),first)
   self.assertIn('REQUEST_EXPIRED',self.raw('save_profile_checkpoint',f"'{uid()}',NULL,0,0,'{{}}','{{}}','2026-10-30'",error=True))
   self.assertEqual(db.sql(f"SELECT count(*) FROM app.idempotency_requests WHERE tenant_id='{self.w.wa}' AND command_kind IN ('save_profile_checkpoint','save_base_draft') AND result_refs<>'{{}}'::jsonb"),'0')
   self.assertIn('VERSION_CONFLICT',self.raw('save_base_draft',f"'{uid()}',0,{lit(self.source)},'autosave'",error=True))
   self.assertIn('SNAPSHOT_NOT_FOUND',self.raw('restore_base_draft',f"'{uid()}',2,'{self.base['id']}'",error=True))
   fresh=self.call('save_base_draft',f"'{uid()}',2,{lit({'schemaVersion':'resumora-editor-draft/1','content':{},'answers':[]})},'autosave'")
   self.assertEqual(fresh['revision'],3);self.assertIsNone(fresh['parentId']);self.assertEqual(fresh['payload']['answers'],[])
   self.assertIn('REQUEST_EXPIRED',self.remove(key,error=True));self.assertEqual(self.call('load_base_draft')['id'],fresh['id'])
  def test_foreign_and_direct_guard_access_and_conflict_are_atomic(self):
   before=self.call('load_base_draft');self.assertIn('VERSION_CONFLICT',self.remove(revision=0,error=True));self.assertEqual(self.call('load_base_draft'),before)
   for sql in ["SELECT app.remove_base_cv(gen_random_uuid(),1,0)","SELECT app.base_removal_objects()"]:
    self.assertIn('permission denied',db.sql(sql,role='anon',expect_error=True))
   self.assertIn('permission denied',self.raw('require_base_cv_purge',f"'{self.w.wa}'",error=True))
   self.assertIn('permission denied',db.sql(f"UPDATE app.base_cv_lifecycle SET purge_transaction=pg_current_xact_id() WHERE tenant_id='{self.w.wa}'",user=self.w.a,role='authenticated',expect_error=True))
   self.assertEqual(self.call('base_removal_objects',user=self.w.b),[])
   self.assertEqual(self.call('load_base_draft'),before)
  def test_private_cleanup_outbox_and_deleted_import_replay_fence(self):
   op=self.initial_operation;admission=self.initial_admission;source=admission['record']['id'];key=admission['record']['objectKey']
   db.sql(f"INSERT INTO storage.objects(bucket_id,name) VALUES('cv-imports','{key}')",user=self.w.a,role='authenticated')
   result=json.loads(self.remove());self.assertTrue(result['cleanupPending']);self.assertEqual(self.count('source_documents'),'0')
   self.assertTrue(self.call('can_delete_cv_import_object',f"'{key}'"));self.assertFalse(self.call('can_access_cv_import_object',f"'{key}',false"));self.assertFalse(self.call('can_access_cv_import_object',f"'{key}',true"))
   self.assertFalse(self.call('can_delete_cv_import_object',f"'{key}'",user=self.w.b))
   self.assertEqual(self.call('base_removal_objects'),[{'bucket':'cv-imports','objectKey':key}])
   self.assertIn('SOURCE_CLEANUP_PENDING',self.raw('ack_base_removal_object',f"'cv-imports','{key}'",error=True))
   self.assertIn('RESOURCE_FORBIDDEN',db.sql(f"INSERT INTO storage.objects(bucket_id,name) VALUES('cv-imports','{key}')",user=self.w.a,expect_error=True))
   db.sql(f"DELETE FROM storage.objects WHERE bucket_id='cv-imports' AND name='{key}'",user=self.w.a,role='authenticated')
   self.call('ack_base_removal_object',f"'cv-imports','{key}'");self.assertFalse(self.call('load_base_state')['cleanupPending'])
   self.assertIn('REQUEST_EXPIRED',self.raw('begin_cv_import',f"'{op}','pdf','{'a'*64}',100,0",error=True))
   self.assertIn('VERSION_CONFLICT',self.raw('begin_cv_import',f"'{uid()}','pdf','{'a'*64}',100,0",error=True))
  def test_upload_and_remove_serialize_in_both_orders_without_source_resurrection(self):
   for index,upload_first in enumerate([True,False]):
    with self.subTest(upload_first=upload_first):
     if index:self.setUp()
     admission=self.initial_admission
     key=admission['record']['objectKey'];tenant=self.w.wa;user=self.w.a
     held=subprocess.Popen(db.command(),stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env=db.env)
     def send(sql):held.stdin.write(sql+'\n');held.stdin.flush()
     try:
      send(f"SELECT set_config('request.jwt.claim.sub','{user}',false);BEGIN;SET LOCAL statement_timeout='10s';")
      send(f"SELECT 1 FROM app.tenants WHERE id='{tenant}' FOR UPDATE;SET LOCAL ROLE authenticated;" if upload_first else f"SET LOCAL ROLE authenticated;SELECT app.remove_base_cv('{uid()}',1,0);")
      send("SELECT 'held_ready';")
      while True:
       line=held.stdout.readline()
       if not line:raise AssertionError(held.stderr.read())
       if line.strip()=='held_ready':break
      with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
       if upload_first:
        blocked=pool.submit(db.sql,f"SET application_name='synthetic_remove_wait';SELECT app.remove_base_cv('{uid()}',1,0)",user=user,role='authenticated')
       else:
        blocked=pool.submit(db.sql,f"SET application_name='synthetic_upload_wait';INSERT INTO storage.objects(bucket_id,name) VALUES('cv-imports','{key}')",user=user,role='authenticated',expect_error=True)
       name='synthetic_remove_wait' if upload_first else 'synthetic_upload_wait'
       deadline=time.monotonic()+3
       while db.sql(f"SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='{name}' AND wait_event_type='Lock')")!='t':
        if time.monotonic()>deadline:raise AssertionError('Expected tenant lock interleaving was not observed')
        time.sleep(.02)
       if upload_first:send(f"INSERT INTO storage.objects(bucket_id,name) VALUES('cv-imports','{key}');")
       send("COMMIT;\\q")
       held.wait(timeout=10)
       outcome=blocked.result(timeout=10)
       if upload_first:
        self.assertTrue(json.loads(outcome)['cleanupPending'])
        self.assertEqual(db.sql(f"SELECT count(*) FROM storage.objects WHERE name='{key}'"),'1')
       else:
        self.assertIn('RESOURCE_FORBIDDEN',outcome)
        self.assertEqual(db.sql(f"SELECT count(*) FROM storage.objects WHERE name='{key}'"),'0')
      self.assertEqual(self.count('source_documents'),'0')
      self.assertFalse(self.call('can_access_cv_import_object',f"'{key}',true"))
      self.assertFalse(self.call('can_access_cv_import_object',f"'{key}',false"))
      self.assertIsNone(self.call('load_base_draft'))
     finally:
      if held.poll() is None:
       send('ROLLBACK;\\q');held.wait(timeout=10)
      held.stdin.close();held.stdout.close();held.stderr.close()
  def test_managed_storage_completion_keeps_owner_reservation_and_removal_fences(self):
   # Model Storage's caller permission probe followed by service-role metadata
   # completion. Roles/owner column below exist only in this isolated fixture.
   db.sql("ALTER TABLE storage.objects ADD COLUMN IF NOT EXISTS owner_id text;DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS;END IF;IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='supabase_storage_admin') THEN CREATE ROLE supabase_storage_admin NOLOGIN;END IF;END $$;GRANT service_role TO supabase_storage_admin;GRANT USAGE ON SCHEMA storage TO service_role;GRANT INSERT ON storage.objects TO service_role;")
   upload=self.initial_admission
   key=upload['record']['objectKey'];owner=self.w.a
   insert=lambda path,actor:f"INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES('cv-imports','{path}','{actor}')"
   db.sql('BEGIN;'+insert(key,owner)+';ROLLBACK;',user=owner,role='authenticated')
   prefix="SET SESSION AUTHORIZATION supabase_storage_admin;SET ROLE service_role;SELECT set_config('request.jwt.claim.sub','',false);"
   db.sql('BEGIN;'+prefix+insert(key,owner)+';ROLLBACK;')
   # A spoofed owner without the actual privileged DB role is never accepted.
   self.assertIn('AUTHENTICATION_REQUIRED',db.sql(insert(key,owner),role='authenticated',expect_error=True))
   self.assertIn('RESOURCE_FORBIDDEN',db.sql(prefix+insert(key,self.w.b),expect_error=True))
   self.assertIn('RESOURCE_FORBIDDEN',db.sql(prefix+insert(key,'not-a-uuid'),expect_error=True))
   self.assertIn('RESOURCE_FORBIDDEN',db.sql(prefix+insert(key+'-foreign',owner),expect_error=True))
   db.sql(f"UPDATE app.tenants SET state='deleting' WHERE id='{self.w.wa}'")
   self.assertIn('RESOURCE_FORBIDDEN',db.sql(prefix+insert(key,owner),expect_error=True))
   db.sql(f"UPDATE app.tenants SET state='active' WHERE id='{self.w.wa}'")
   photo=uid();photo_key=f"{self.w.wa}/{photo}.jpg"
   db.sql(f"INSERT INTO app.photo_assets(id,tenant_id,object_key,state,byte_size,width,height,sha256) VALUES('{photo}','{self.w.wa}','{photo_key}','reserved',100,800,800,repeat('a',64))")
   photo_insert=f"INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES('cv-photos','{photo_key}','{owner}')"
   db.sql('BEGIN;'+prefix+photo_insert+';ROLLBACK;')
   db.sql(f"UPDATE app.cv_import_sessions SET expires_at=now()-interval '1 second' WHERE source_id='{upload['record']['id']}'")
   self.assertIn('RESOURCE_FORBIDDEN',db.sql(prefix+insert(key,owner),expect_error=True))
   db.sql(f"UPDATE app.cv_import_sessions SET expires_at=now()+interval '1 hour' WHERE source_id='{upload['record']['id']}'")
   self.remove()
   self.assertIn('RESOURCE_FORBIDDEN',db.sql(prefix+insert(key,owner),expect_error=True))
   self.assertIn('RESOURCE_FORBIDDEN',db.sql(prefix+photo_insert,expect_error=True))
   self.assertEqual(db.sql("SELECT count(*) FROM storage.objects WHERE bucket_id IN ('cv-imports','cv-photos')"),'0')
  def test_language_variants_proposals_and_provider_dispatch_are_retired(self):
   context=self.call('document_language_context')['source']
   pin={'kind':'base','documentId':self.source['content']['id'],'currentId':context['id'],'revision':context['revision'],'fingerprint':context['fingerprint']}
   source_locale='en-GB' if self.source['content']['language']=='en' else 'ro-RO';locale='ro-RO' if source_locale=='en-GB' else 'en-GB'
   target=json.loads(json.dumps(self.source));target['content']['documentLocale']=locale;target['content']['translation']={'schemaVersion':'cv-language/1','documentLocale':locale,'sourceLocale':source_locale,'source':pin,'glossaryVersion':'1','components':[]}
   self.call('write_base_language',f"'{uid()}','lang_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',0,{lit(target)},NULL,false")
   secret='synthetic-base-removal-worker-secret-123456789'
   db.sql(f"INSERT INTO app.ai_worker_authorization(singleton,secret_hash) VALUES(true,sha256(convert_to('{secret}','UTF8'))) ON CONFLICT(singleton) DO UPDATE SET secret_hash=excluded.secret_hash")
   op=uid();self.call('reserve_enhancement',f"'{op}','{self.base['id']}',1,'summary','synthetic','{secret}'")
   request={'source':pin,'sourceLocale':source_locale,'targetLocale':locale,'targetRevision':0,'targetDocumentId':None,'variantId':'lang_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','sectionIds':[],'glossary':[]}
   proposal=uid();self.call('language_proposal_command',f"'start','{proposal}',{lit(request)},'{secret}'")
   self.remove();self.assertEqual(self.count('document_language_proposals'),'0');self.assertEqual(self.count('editor_draft_snapshots'),'0')
   self.assertIn('VERSION_CONFLICT',self.raw('write_base_language',f"'{uid()}','lang_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',0,{lit(target)},NULL,false",error=True))
   self.assertIn('VERSION_CONFLICT',self.raw('language_proposal_command',f"'start','{uid()}',{lit(request)},'{secret}'",error=True))
   attempt={'operationId':op,'attemptId':op+'-primary','provider':'openrouter','userId':self.w.a}
   self.assertIn('VERSION_CONFLICT',self.raw('begin_ai_attempt',f"{lit(attempt)},'{secret}'",error=True))
   self.assertEqual(db.sql(f"SELECT base_removed AND snapshot_id IS NULL AND import_id IS NULL FROM app.ai_enhancement_operations WHERE id='{op}'"),'t')
 return unittest.defaultTestLoader.loadTestsFromTestCase(Removal)
