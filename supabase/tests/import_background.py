"""Real SQL lease/privacy/timeout tests, isolated identities and source bytes only."""
import base64
import concurrent.futures
import json
import unittest
import uuid


def suite(db):
    uid=lambda:str(uuid.uuid4())
    literal=lambda value:"'"+json.dumps(value).replace("'","''")+"'::jsonb"
    class BackgroundImports(unittest.TestCase):
        def setUp(self):
            self.a,self.b,self.op=uid(),uid(),uid()
            self.secret='synthetic-worker-only-secret-32-characters'
            db.sql(f"INSERT INTO auth.users(id) VALUES('{self.a}'),('{self.b}')")
            db.sql("INSERT INTO app.ai_worker_authorization VALUES(true,sha256(convert_to('"+self.secret+"','UTF8'))) ON CONFLICT(singleton) DO NOTHING")
            self.row=json.loads(self.call('begin_cv_import',f"'{self.op}','pdf','{'a'*64}',1024,0"))['record']
            self.call('provision_workspace',f"'{uid()}'",user=self.b)
            self.call('complete_cv_import',f"'{self.op}','uploaded',NULL,NULL,'{self.secret}'")
            self.bytes=base64.b64encode(bytes(1024)).decode()
        def tearDown(self):
            self.call('cancel_cv_import',f"'{self.op}'")
        def call(self,name,args='',user=None,error=False,role='authenticated'):
            return db.sql(f'SELECT app.{name}({args})',user=None if role=='anon' else user or self.a,role=role,expect_error=error)
        def queue(self):
            return json.loads(self.call('queue_cv_import',f"'{self.op}','{self.bytes}'"))
        def claim(self):
            return json.loads(self.call('claim_cv_import_task',f"'{self.secret}'",role='anon') or 'null')
        def review(self):
            return {'id':self.row['id'],'sourceHash':'a'*64,'format':'pdf','parserVersion':'synthetic','pages':1,
              'admission':{'kind':'cv','reason':'synthetic','pages':[1]},'confirmedIds':[],
              'extraction':{'schemaVersion':'cv-extraction/1','candidates':[{'id':'name','path':'name','value':'Synthetic name','quote':'Synthetic name','page':1,'confidence':'high'}],'warnings':[],'omittedPages':[]}}
        def test_only_owner_can_queue_and_private_bytes_are_never_public(self):
            self.assertIn('SNAPSHOT_NOT_FOUND',self.call('queue_cv_import',f"'{self.op}','{self.bytes}'",user=self.b,error=True))
            self.assertIn('permission denied',self.call('queue_cv_import',f"'{self.op}','{self.bytes}'",role='anon',error=True))
            self.assertEqual(self.queue()['stage'],'queued')
            self.queue()
            self.assertEqual(db.sql(f"SELECT count(*) FROM app.cv_import_tasks WHERE source_id='{self.row['id']}'"),'1')
            for role in ('anon','authenticated'):
                self.assertIn('permission denied',db.sql('SELECT source_base64 FROM app.cv_import_tasks',user=self.a,role=role,expect_error=True))
            self.assertNotIn(self.bytes,self.call('get_cv_import',f"'{self.op}'"))
        def test_queue_age_and_concurrent_claims_use_processing_clock(self):
            self.queue()
            db.sql(f"UPDATE app.cv_import_sessions SET created_at=now()-interval '20 minutes' WHERE source_id='{self.row['id']}'")
            self.assertEqual(json.loads(self.call('get_cv_import',f"'{self.row['id']}'"))['state'],'uploaded')
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                claims=list(pool.map(lambda _:self.claim(),range(2)))
            self.assertEqual(sum(c is not None for c in claims),1)
            self.assertEqual(json.loads(self.call('get_cv_import',f"'{self.op}'"))['state'],'processing')
            self.assertIsNone(self.claim())
        def test_ready_publishes_review_once_and_clears_temporary_bytes(self):
            self.queue();claim=self.claim();args=f"'{self.secret}','{claim['lease']}','ready',{literal(self.review())},NULL"
            self.assertEqual(json.loads(self.call('finish_cv_import_task',args,role='anon'))['state'],'ready')
            self.assertEqual(self.call('finish_cv_import_task',args,role='anon'),'')
            self.assertEqual(db.sql(f"SELECT source_base64 IS NULL FROM app.cv_import_tasks WHERE source_id='{self.row['id']}'"),'t')
            self.assertEqual(db.sql(f"SELECT count(*) FROM app.source_spans WHERE source_document_id='{self.row['id']}'"),'1')
            self.assertIsNone(self.claim())
        def test_cancel_blocks_new_dispatch_and_late_publication_but_settles_known_attempt(self):
            self.queue();claim=self.claim();lease=claim['lease'];stage=uid()
            self.call('reserve_cv_import_task_stage',f"'{self.secret}','{lease}','{stage}','{self.row['id']}','admit','synthetic'",role='anon')
            start={'attemptId':stage+'-primary','operationId':stage,'userId':self.a,'provider':'openrouter','providerScope':'synthetic','modelRequested':'synthetic'}
            self.call('cv_import_task_attempt',f"'{self.secret}','{lease}',{literal(start)},NULL,NULL",role='anon')
            self.call('cancel_cv_import',f"'{self.op}'")
            self.assertIn('VERSION_CONFLICT',self.call('reserve_cv_import_task_stage',f"'{self.secret}','{lease}','{uid()}','{self.row['id']}','extract','synthetic'",role='anon',error=True))
            result={'status':'unknown','errorCode':'TIMEOUT'}
            settled=json.loads(self.call('cv_import_task_attempt',f"'{self.secret}','{lease}',NULL,'{stage}-primary',{literal(result)}",role='anon'))
            self.assertEqual(settled['result'],result)
            self.assertEqual(self.call('finish_cv_import_task',f"'{self.secret}','{lease}','ready',{literal(self.review())},NULL",role='anon'),'')
            self.assertEqual(db.sql(f"SELECT source_base64 IS NULL FROM app.cv_import_tasks WHERE source_id='{self.row['id']}'"),'t')
        def test_stale_claim_is_unknown_and_never_automatically_redispatched(self):
            self.queue();claim=self.claim()
            db.sql(f"UPDATE app.cv_import_tasks SET started_at=now()-interval '421 seconds' WHERE source_id='{self.row['id']}'")
            status=json.loads(self.call('get_cv_import',f"'{self.op}'"))
            self.assertEqual((status['state'],status['error']),('unknown','AI_TIMEOUT_UNKNOWN'))
            self.assertIsNone(self.claim())
            self.queue();self.assertIsNone(self.claim())
        def test_long_extraction_retains_lease_and_can_publish_after_old_timeout(self):
            self.queue();claim=self.claim()
            db.sql(f"UPDATE app.cv_import_tasks SET started_at=now()-interval '180 seconds' WHERE source_id='{self.row['id']}'")
            self.assertEqual(json.loads(self.call('get_cv_import',f"'{self.op}'"))['state'],'processing')
            result=json.loads(self.call('finish_cv_import_task',f"'{self.secret}','{claim['lease']}','ready',{literal(self.review())},NULL",role='anon'))
            self.assertEqual(result['state'],'ready')
        def test_worker_capability_and_import_scope_are_enforced(self):
            self.queue();claim=self.claim()
            self.assertIn('RESOURCE_FORBIDDEN',self.call('claim_cv_import_task',"'incorrect-secret'",role='anon',error=True))
            self.assertIn('permission denied',self.call('cv_import_task_context',f"'{self.secret}','{claim['lease']}',false",role='anon',error=True))
            self.assertIn('RESOURCE_FORBIDDEN',self.call('reserve_cv_import_task_stage',f"'{self.secret}','{claim['lease']}','{uid()}','{uid()}','admit','synthetic'",role='anon',error=True))
            start={'attemptId':uid()+'-primary','operationId':uid(),'userId':self.b,'provider':'openrouter'}
            self.assertIn('RESOURCE_FORBIDDEN',self.call('cv_import_task_attempt',f"'{self.secret}','{claim['lease']}',{literal(start)},NULL,NULL",role='anon',error=True))
        def test_revoked_owner_is_not_claimed_and_payload_is_cleared(self):
            self.queue()
            db.sql(f"UPDATE app.tenant_memberships SET state='revoked' WHERE user_id='{self.a}'")
            self.assertIsNone(self.claim())
            self.assertEqual(db.sql(f"SELECT source_base64 IS NULL FROM app.cv_import_tasks WHERE source_id='{self.row['id']}'"),'t')
            db.sql(f"UPDATE app.tenant_memberships SET state='active' WHERE user_id='{self.a}'")
    return unittest.defaultTestLoader.loadTestsFromTestCase(BackgroundImports)
