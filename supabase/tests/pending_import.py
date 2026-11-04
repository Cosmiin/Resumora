"""Account discovery uses live import/review receipts, never browser resume state."""
import json
import unittest
import uuid
from concurrent.futures import ThreadPoolExecutor


def suite(db):
    uid=lambda:str(uuid.uuid4())
    literal=lambda value:"'"+json.dumps(value).replace("'","''")+"'::jsonb"
    class PendingImport(unittest.TestCase):
        def setUp(self):
            self.a,self.b=uid(),uid();self.secret='synthetic-worker-only-secret-32-characters'
            db.sql(f"INSERT INTO auth.users(id) VALUES('{self.a}'),('{self.b}')")
            db.sql("INSERT INTO app.ai_worker_authorization VALUES(true,sha256(convert_to('"+self.secret+"','UTF8'))) ON CONFLICT(singleton) DO NOTHING")
            self.call('provision_workspace',f"'{uid()}'",user=self.b)
            self.op=uid();self.row=json.loads(self.call('begin_cv_import',f"'{self.op}','pdf','{'a'*64}',1024,0"))['record']
            self.review={'id':self.row['id'],'sourceHash':'a'*64,'format':'pdf','parserVersion':'synthetic','pages':1,
              'admission':{'kind':'cv','reason':'synthetic','pages':[1]},'confirmedIds':[],
              'extraction':{'schemaVersion':'cv-extraction/1','candidates':[{'id':'name','path':'name','value':'Sample name','quote':'Sample name','page':1,'confidence':'high'}],'warnings':[],'omittedPages':[]}}
            for state in ['uploaded','processing','ready']:
                self.call('complete_cv_import',f"'{self.op}','{state}',{literal(self.review) if state=='ready' else 'NULL'},NULL,'{self.secret}'")
        def call(self,name,args='',user=None,role='authenticated',error=False):
            return db.sql(f'SELECT app.{name}({args})',user=user or self.a,role=role,expect_error=error)
        def pending(self,user=None):
            return json.loads(self.call('get_pending_cv_import',user=user) or 'null')
        def test_concurrent_second_uploads_cannot_pass_a_staged_initial_base(self):
            payload={'schemaVersion':'resumora-editor-draft/1','content':{'importReview':self.review},'answers':[]}
            self.call('save_base_draft',f"'{uid()}',0,{literal(payload)},'checkpoint'")
            def upload(_):return self.call('begin_cv_import',f"'{uid()}','pdf','{'b'*64}',1024,1",error=True)
            with ThreadPoolExecutor(max_workers=2) as pool: results=list(pool.map(upload,range(2)))
            self.assertTrue(all('BASE_CV_EXISTS' in r for r in results))
            self.assertEqual(db.sql(f"SELECT count(*) FROM app.cv_import_sessions WHERE tenant_id=(SELECT id FROM app.tenants WHERE owner_user_id='{self.a}' AND kind='personal')"),'1')
        def test_concurrent_acceptance_has_one_checkpoint_and_same_import_recovery(self):
            review={**self.review,'confirmedIds':['name']};payload={'schemaVersion':'resumora-editor-draft/1','content':{'importReview':review},'answers':[]}
            query=lambda key:f"SELECT app.save_import_review_draft('{key}',0,{literal(payload)},'{self.row['id']}',{literal(['name'])})"
            def accept(key):
                result=__import__('subprocess').run(db.command(),input=f"SET ROLE authenticated;SELECT set_config('request.jwt.claim.sub','{self.a}',false);"+query(key),env=db.env,capture_output=True,text=True,timeout=30)
                return key,result
            keys=[uid(),uid()]
            with ThreadPoolExecutor(max_workers=2) as pool: results=list(pool.map(accept,keys))
            self.assertEqual(sum(r.returncode==0 for _,r in results),1)
            self.assertTrue(any('VERSION_CONFLICT' in r.stderr for _,r in results))
            winner=next(k for k,r in results if r.returncode==0)
            replay=json.loads(self.call('save_import_review_draft',f"'{winner}',0,{literal(payload)},'{self.row['id']}',{literal(['name'])}"));self.assertEqual(replay['revision'],1)
        def test_deletion_generation_fences_old_staged_import_and_allows_fresh_upload(self):
            payload={'schemaVersion':'resumora-editor-draft/1','content':{'importReview':self.review},'answers':[]}
            self.call('save_base_draft',f"'{uid()}',0,{literal(payload)},'checkpoint'")
            state=json.loads(self.call('load_base_state'));removed=json.loads(self.call('remove_base_cv',f"'{uid()}',{state['revision']},{state['generation']}"))
            payload['content']['importReview']['confirmedIds']=['name']
            self.assertIn('BASE_CV_EXISTS',self.call('save_import_review_draft',f"'{uid()}',{removed['revision']},{literal(payload)},'{self.row['id']}',{literal(['name'])}",error=True))
            fresh=json.loads(self.call('begin_cv_import',f"'{uid()}','pdf','{'c'*64}',1024,{removed['revision']}"));self.assertTrue(fresh['created']);self.assertNotEqual(fresh['record']['id'],self.row['id'])
        def test_existing_manual_base_blocks_second_start_pending_and_acceptance(self):
            payload={'schemaVersion':'resumora-editor-draft/1','content':{},'answers':[]}
            self.call('save_base_draft',f"'{uid()}',0,{literal(payload)},'checkpoint'")
            self.assertIn('BASE_CV_EXISTS',self.call('begin_cv_import',f"'{uid()}','pdf','{'b'*64}',1024,1",error=True))
            self.assertIsNone(self.pending())
            payload['content']['importReview']={**self.review,'confirmedIds':['name']}
            self.assertIn('BASE_CV_EXISTS',self.call('save_import_review_draft',f"'{uid()}',1,{literal(payload)},'{self.row['id']}',{literal(['name'])}",error=True))
        def test_same_staged_initial_import_replays_but_different_upload_is_blocked(self):
            payload={'schemaVersion':'resumora-editor-draft/1','content':{'importReview':self.review},'answers':[]}
            self.call('save_base_draft',f"'{uid()}',0,{literal(payload)},'checkpoint'")
            replay=json.loads(self.call('begin_cv_import',f"'{self.op}','pdf','{'a'*64}',1024,0"));self.assertFalse(replay['created'])
            self.assertEqual(self.pending()['id'],self.row['id'])
            self.assertIn('BASE_CV_EXISTS',self.call('begin_cv_import',f"'{uid()}','pdf','{'b'*64}',1024,1",error=True))
            payload['content']['importReview']['confirmedIds']=['name']
            self.call('save_import_review_draft',f"'{uid()}',1,{literal(payload)},'{self.row['id']}',{literal(['name'])}")
            self.assertIsNone(self.pending())
        def test_unedited_review_is_discoverable_without_any_browser_resume_or_draft(self):
            self.assertEqual(db.sql(f"SELECT count(*) FROM app.workspace_drafts WHERE id='{self.row['id']}'"),'0')
            row=self.pending();self.assertEqual(row['operationId'],self.op);self.assertIsNone(row['review'])
            self.assertNotIn('Sample name',json.dumps(row))
        def test_owned_saved_choices_can_be_reopened_and_foreign_or_anonymous_reads_are_denied(self):
            self.call('save_workspace_draft',f"'{uid()}','import-review','{self.row['id']}',0,{literal({'selected':['name']})},0")
            owned=self.pending();self.assertEqual(owned['id'],self.row['id']);self.assertIsNone(self.pending(self.b))
            draft=json.loads(self.call('get_workspace_draft',f"'import-review','{owned['id']}'"))
            self.assertEqual(draft['value']['selected'],['name'])
            self.assertIn('permission denied',self.call('get_pending_cv_import',role='anon',error=True))
            self.assertIn('SNAPSHOT_NOT_FOUND',self.call('get_workspace_draft',f"'import-review','{owned['id']}'",user=self.b,error=True))
        def test_only_committed_confirmation_closes_the_review(self):
            review={**self.review,'confirmedIds':['name']};payload={'schemaVersion':'resumora-editor-draft/1','content':{'importReview':review},'answers':[]}
            args=f"'{uid()}',9,{literal(payload)},'{self.row['id']}',{literal(['name'])}"
            self.assertIn('VERSION_CONFLICT',self.call('save_import_review_draft',args,error=True));self.assertIsNotNone(self.pending())
            self.call('save_import_review_draft',f"'{uid()}',0,{literal(payload)},'{self.row['id']}',{literal(['name'])}")
            self.assertIsNone(self.pending())
        def test_discard_and_expiry_exclude_a_review_from_every_browser(self):
            self.assertIsNotNone(self.pending());self.call('cancel_cv_import',f"'{self.op}'");self.assertIsNone(self.pending())
        def test_expired_ready_review_is_not_resumed(self):
            db.sql(f"UPDATE app.cv_import_sessions SET expires_at=now()-interval '1 second' WHERE source_id='{self.row['id']}'")
            self.assertIsNone(self.pending())
    return unittest.defaultTestLoader.loadTestsFromTestCase(PendingImport)
