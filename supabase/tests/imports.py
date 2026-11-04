"""Native synthetic import persistence/privacy tests. No Storage/cloud/provider access."""
import concurrent.futures
import json
import unittest
import uuid

def suite(db):
    uid=lambda:str(uuid.uuid4())
    literal=lambda value:"'"+json.dumps(value).replace("'","''")+"'::jsonb"
    class Imports(unittest.TestCase):
        def setUp(self):
            self.a,self.b=uid(),uid();db.sql(f"INSERT INTO auth.users(id) VALUES('{self.a}'),('{self.b}')")
            self.secret='synthetic-worker-only-secret-32-characters'
            db.sql("INSERT INTO app.ai_worker_authorization VALUES(true,sha256(convert_to('"+self.secret+"','UTF8'))) ON CONFLICT(singleton) DO NOTHING")
            self.op=uid();self.row=json.loads(self.call('begin_cv_import',f"'{self.op}','pdf','{'a'*64}',1024,0"))['record']
            self.call('provision_workspace',f"'{uid()}'",user=self.b)
        def call(self,name,args='',user=None,error=False,role='authenticated'):
            return db.sql(f'SELECT app.{name}({args})',user=user or self.a,role=role,expect_error=error)
        def complete(self,state,review=None,error=False,secret=None):
            return self.call('complete_cv_import',f"'{self.op}','{state}',{literal(review) if review is not None else 'NULL'},NULL,'{secret or self.secret}'",error=error)
        def review(self):
            return {'id':self.row['id'],'sourceHash':'a'*64,'format':'pdf','parserVersion':'synthetic','pages':1,
                    'admission':{'kind':'cv','reason':'synthetic CV','pages':[1]},'extraction':{'schemaVersion':'cv-extraction/1',
                    'candidates':[{'id':'name','path':'name','value':'Mara Ionescu','page':1,'quote':'Mara Ionescu','confidence':'high'}],
                    'warnings':[],'omittedPages':[]},'confirmedIds':[]}
        def test_original_source_requires_owner_ready_unexpired_and_not_cancelled(self):
            args=f"'{self.row['id']}'"
            self.assertIn('SNAPSHOT_NOT_FOUND',self.call('get_cv_import_source',args,error=True))
            self.complete('uploaded');self.complete('processing');self.complete('ready',self.review())
            self.assertEqual(json.loads(self.call('get_cv_import_source',args))['objectKey'],self.row['objectKey'])
            self.assertIn('SNAPSHOT_NOT_FOUND',self.call('get_cv_import_source',args,user=self.b,error=True))
            self.assertIn('permission denied',self.call('get_cv_import_source',args,role='anon',error=True))
            db.sql(f"UPDATE app.cv_import_sessions SET expires_at=transaction_timestamp()-interval '1 second' WHERE source_id='{self.row['id']}'")
            self.assertIn('SNAPSHOT_NOT_FOUND',self.call('get_cv_import_source',args,error=True))
            db.sql(f"UPDATE app.cv_import_sessions SET expires_at=transaction_timestamp()+interval '1 day' WHERE source_id='{self.row['id']}'")
            self.call('cancel_cv_import',f"'{self.op}'")
            self.assertIn('SNAPSHOT_NOT_FOUND',self.call('get_cv_import_source',args,error=True))
        def test_word_source_has_the_same_owner_expiry_and_cancellation_fences(self):
            self.call('cancel_cv_import', f"'{self.op}'")
            for fmt in ('doc', 'docx'):
                self.op = uid()
                self.row = json.loads(self.call('begin_cv_import', f"'{self.op}','{fmt}','{'a'*64}',1024,0"))['record']
                review = self.review(); review['format'] = fmt; review['pages'] = None; review['admission']['pages'] = []
                review['extraction']['candidates'][0]['page'] = None
                self.complete('uploaded'); self.complete('processing'); self.complete('ready', review)
                args = f"'{self.row['id']}'"
                self.assertEqual(json.loads(self.call('get_cv_import_source', args))['sourceHash'], 'a'*64)
                self.assertIn('SNAPSHOT_NOT_FOUND', self.call('get_cv_import_source', args, user=self.b, error=True))
                db.sql(f"UPDATE app.cv_import_sessions SET expires_at=now()-interval '1 second' WHERE source_id='{self.row['id']}'")
                self.assertIn('SNAPSHOT_NOT_FOUND', self.call('get_cv_import_source', args, error=True))
                db.sql(f"UPDATE app.cv_import_sessions SET expires_at=now()+interval '1 day' WHERE source_id='{self.row['id']}'")
                self.call('cancel_cv_import', f"'{self.op}'")
                self.assertIn('SNAPSHOT_NOT_FOUND', self.call('get_cv_import_source', args, error=True))

        def test_owned_manifest_replay_mismatch_and_foreign_direct_write_denial(self):
            again=json.loads(self.call('begin_cv_import',f"'{self.op}','pdf','{'a'*64}',1024,0"));self.assertFalse(again['created']);self.assertEqual(again['record']['id'],self.row['id'])
            self.assertIn('IDEMPOTENCY_BODY_MISMATCH',self.call('begin_cv_import',f"'{self.op}','pdf','{'b'*64}',1024,0",error=True))
            self.assertIn('SNAPSHOT_NOT_FOUND',self.call('get_cv_import',f"'{self.op}'",user=self.b,error=True))
            self.assertIn('permission denied',self.call('list_cv_imports',role='anon',error=True))
            self.assertIn('permission denied',db.sql("UPDATE app.cv_import_sessions SET state='ready'",user=self.a,role='authenticated',expect_error=True))
            self.assertIn('RESOURCE_FORBIDDEN',self.complete('uploaded',secret='wrong',error=True))
            self.assertEqual(self.call('can_access_cv_import_object',f"'{self.row['objectKey']}',true"),'t')
            self.assertEqual(self.call('can_access_cv_import_object',f"'{self.row['objectKey']}',false",user=self.b),'f')
            self.complete('uploaded');self.assertEqual(self.call('can_access_cv_import_object',f"'{self.row['objectKey']}',true"),'f')
        def test_storage_policies_allow_owned_upload_deny_foreign_overwrite_and_cleanup_after_fence(self):
            if db.sql("SELECT to_regclass('storage.objects') IS NOT NULL") != 't':
                self.skipTest('Storage runtime not installed in the full canonical-only harness; focused imports suite includes real RLS tables')
            name=self.row['objectKey']
            object_filter=f"bucket_id='cv-imports' AND name='{name}'"
            db.sql(f"INSERT INTO storage.objects(bucket_id,name) VALUES('cv-imports','{name}')",user=self.a,role='authenticated')
            self.assertEqual(db.sql(f"SELECT count(*) FROM storage.objects WHERE {object_filter}",user=self.b,role='authenticated'),'0')
            self.assertIn('RESOURCE_FORBIDDEN',db.sql(f"INSERT INTO storage.objects(bucket_id,name) VALUES('cv-imports','{name}')",user=self.b,role='authenticated',expect_error=True))
            try:
                self.assertEqual(db.sql(f"SELECT count(*) FROM storage.objects WHERE {object_filter}",role='anon'),'0')
            except AssertionError as error:
                # The shared photo guard can deny the query before import RLS
                # filters rows. This specific denial also proves no anon read.
                self.assertIn('permission denied for function photo_storage_access',str(error))
            self.complete('uploaded')
            try:
                updated=db.sql(f"UPDATE storage.objects SET name='{name}' WHERE {object_filter} RETURNING id",user=self.a,role='authenticated')
            except AssertionError as error:
                # A permissive UPDATE policy exposes the row to WITH CHECK.
                self.assertIn('row-level security',str(error))
            else:
                # Without one, RLS denies UPDATE by filtering out the row.
                self.assertEqual(updated,'')
            self.assertEqual(db.sql(f"SELECT name FROM storage.objects WHERE {object_filter}"),name)
            self.assertEqual(db.sql(f"SELECT count(*) FROM storage.objects WHERE {object_filter}",user=self.a,role='authenticated'),'1')
            self.call('cancel_cv_import',f"'{self.op}'")
            db.sql(f"DELETE FROM storage.objects WHERE {object_filter}",user=self.a,role='authenticated')
            self.assertEqual(db.sql(f"SELECT count(*) FROM storage.objects WHERE {object_filter}"),'0')
            self.call('ack_cv_import_purge',f"'{self.op}','{self.secret}'")
            self.assertEqual(db.sql(f"SELECT state FROM app.source_documents WHERE id='{self.row['id']}'"),'purged')
        def test_cancel_fences_completion_and_dispatch_but_allows_owned_raw_cleanup(self):
            self.complete('uploaded');self.complete('processing')
            stage=uid();args=f"'{stage}','{self.row['id']}','admit','synthetic','{self.secret}'"
            self.assertTrue(json.loads(self.call('reserve_document_operation',args))['created'])
            self.call('cancel_cv_import',f"'{self.op}'")
            self.assertEqual(self.call('can_delete_cv_import_object',f"'{self.row['objectKey']}'"),'t')
            self.assertEqual(self.call('can_delete_cv_import_object',f"'{self.row['objectKey']}'",user=self.b),'f')
            self.assertIn('VERSION_CONFLICT',self.complete('ready',self.review(),error=True))
            start={'attemptId':stage+'-primary','operationId':stage,'userId':self.a,'provider':'openrouter'}
            self.assertIn('RESOURCE_FORBIDDEN',self.call('begin_ai_attempt',f"{literal(start)},'{self.secret}'",error=True))
            self.assertEqual(json.loads(self.call('get_cv_import',f"'{self.op}'"))['state'],'cancelled')
        def test_ready_unconfirmed_result_spans_atomic_confirm_checkpoint_replay_and_stale_rollback(self):
            self.complete('uploaded');self.complete('processing');review=self.review();self.complete('ready',review)
            self.assertEqual(db.sql(f"SELECT count(*) FROM app.source_spans WHERE source_document_id='{self.row['id']}'"),'1')
            listed=json.loads(self.call('list_cv_imports'));self.assertIsNone(listed[0]['review'])
            payload={'schemaVersion':'resumora-editor-draft/1','content':{'importReview':review},'answers':[{'questionText':'Exact Q','options':[{'id':'x','label':'Exact option'}],'selectedOptionIds':['x'],'text':'Exact answer'}]}
            self.call('save_base_draft',f"'{uid()}',0,{literal(payload)},'autosave'")
            selected=['name'];payload['content']['importReview']['confirmedIds']=selected;key=uid();args=f"'{key}',1,{literal(payload)},'{self.row['id']}',{literal(selected)}"
            first=json.loads(self.call('save_import_review_draft',args));self.assertEqual(first['revision'],2)
            self.assertEqual(json.loads(self.call('save_import_review_draft',args)),first)
            self.assertEqual(db.sql(f"SELECT jsonb_array_length(review_decisions) FROM app.cv_import_sessions WHERE source_id='{self.row['id']}'"),'1')
            self.assertIn('VERSION_CONFLICT',self.call('save_import_review_draft',args.replace(key,uid()),error=True))
            self.assertEqual(db.sql(f"SELECT jsonb_array_length(review_decisions) FROM app.cv_import_sessions WHERE source_id='{self.row['id']}'"),'1')
            self.assertEqual(json.loads(self.call('load_base_draft'))['payload']['answers'],payload['answers'])
            self.assertEqual(db.sql('SELECT count(*) FROM app.profile_versions WHERE tenant_id IN (SELECT id FROM app.tenants WHERE owner_user_id=\''+self.a+'\')'),'0')
        def test_multilingual_ready_quotes_keep_full_review_and_byte_bounded_unicode_excerpts(self):
            samples=[
                ('界'*1500,'界'*1365),
                ('界'*1300+'🙂'*60,'界'*1300+'🙂'*49),
                ('界'*1365+'🙂','界'*1365),
                ('a'+'界'*1365,'a'+'界'*1365),
                ('界'*1364+'🙂','界'*1364+'🙂'),
                ('a'+'界'*1364+'🙂','a'+'界'*1364),
                ('Résumé 東京 🙂','Résumé 東京 🙂'),
                ('x'*2000,'x'*2000),
            ]
            for fmt in ('pdf','docx','doc'):
                with self.subTest(format=fmt):
                    if fmt!='pdf':
                        self.call('cancel_cv_import',f"'{self.op}'")
                        self.op=uid();self.row=json.loads(self.call('begin_cv_import',f"'{self.op}','{fmt}','{'a'*64}',1024,0"))['record']
                    self.complete('uploaded');self.complete('processing')
                    review=self.review();review['format']=fmt;review['pages']=1 if fmt=='pdf' else None
                    review['admission']['pages']=[1] if fmt=='pdf' else []
                    review['extraction']['candidates']=[{'id':f'quote-{i}','path':f'roles.0.bullets.{i}','value':'Contribution','page':1 if fmt=='pdf' else None,'quote':quote,'confidence':'high'} for i,(quote,_) in enumerate(samples)]
                    ready=json.loads(self.complete('ready',review))
                    self.assertEqual(ready['state'],'ready');self.assertEqual(ready['review'],review)
                    self.assertEqual(json.loads(self.call('get_cv_import',f"'{self.op}'"))['review'],review)
                    spans=json.loads(db.sql(f"SELECT jsonb_agg(jsonb_build_object('locator',locator,'excerpt',text_excerpt,'bytes',octet_length(text_excerpt),'profileId',profile_id) ORDER BY locator->>'candidateId') FROM app.source_spans WHERE source_document_id='{self.row['id']}'"))
                    self.assertEqual(len(spans),len(samples))
                    profile=db.sql(f"SELECT profile_id FROM app.source_documents WHERE id='{self.row['id']}' AND state='available'")
                    for i,(quote,expected) in enumerate(samples):
                        span=spans[i]
                        self.assertEqual(span['locator'],{'candidateId':f'quote-{i}','page':1 if fmt=='pdf' else None,'kind':'pdf_page' if fmt=='pdf' else 'word_excerpt'})
                        self.assertEqual(span['profileId'],profile)
                        self.assertEqual(span['excerpt'],expected)
                        self.assertEqual(span['bytes'],len(expected.encode('utf-8')))
                        self.assertLessEqual(span['bytes'],4096);self.assertTrue(quote.startswith(span['excerpt']))
                        if len(expected)<len(quote):
                            self.assertGreater(len(quote[:len(expected)+1].encode('utf-8')),4096)
                    self.assertEqual(json.loads(self.complete('ready',review)),ready)
                    self.assertEqual(db.sql(f"SELECT count(*) FROM app.source_spans WHERE source_document_id='{self.row['id']}'"),str(len(samples)))
                    changed=json.loads(json.dumps(review));changed['extraction']['candidates'][0]['quote']='Changed quotation'
                    self.assertIn('VERSION_CONFLICT',self.complete('ready',changed,error=True))
                    self.assertEqual(json.loads(self.call('get_cv_import',f"'{self.op}'"))['review'],review)
        def test_confirmed_checkpoint_survives_cleanup_without_new_or_forged_confirmations(self):
            self.complete('uploaded');self.complete('processing');review=self.review()
            review['extraction']['candidates'].append({'id':'title','path':'titles.0','value':'Engineer','page':1,'quote':'Engineer','confidence':'high'})
            self.complete('ready',review)
            payload={'schemaVersion':'resumora-editor-draft/1','content':{'importReview':review,'photo':{'synthetic':'unchanged'},'presentation':{'hidden':['education']}},'answers':[]}
            payload['content']['importReview']['confirmedIds']=['name']
            def checkpoint(data,revision,selected,key=None,error=False):
                return self.call('save_import_review_draft',f"'{key or uid()}',{revision},{literal(data)},'{self.row['id']}',{literal(selected)}",error=error)
            first_key=uid();first=json.loads(checkpoint(payload,0,['name'],first_key))
            db.sql(f"UPDATE app.cv_import_sessions SET expires_at=now()-interval '1 second' WHERE source_id='{self.row['id']}'")
            self.assertEqual(len(json.loads(self.call('expired_cv_import_objects'))),1)
            self.call('ack_cv_import_purge',f"'{self.op}','{self.secret}'")
            self.assertIsNone(json.loads(self.call('get_cv_import',f"'{self.op}'"))['review'])
            self.assertEqual(json.loads(checkpoint(payload,0,['name'],first_key)),first)
            payload['content']['edited']='Ordinary later edit';key=uid()
            second=json.loads(checkpoint(payload,1,['name'],key));self.assertEqual(second['revision'],2)
            self.assertEqual(json.loads(checkpoint(payload,1,['name'],key)),second)
            self.assertEqual(second['payload'],payload)
            self.assertIn('VERSION_CONFLICT',checkpoint(payload,1,['name'],error=True))
            forged=json.loads(json.dumps(payload));forged['content']['importReview']['confirmedIds']=['name','title']
            self.call('save_base_draft',f"'{uid()}',2,{literal(forged)},'autosave'")
            self.assertIn('SNAPSHOT_NOT_FOUND',checkpoint(forged,3,['name','title'],error=True))
            forged['content']['importReview']['confirmedIds']=['name'];forged['content']['importReview']['extraction']['candidates'][0]['value']='Forged review'
            self.assertIn('SNAPSHOT_NOT_FOUND',checkpoint(forged,3,['name'],error=True))
            self.assertEqual(json.loads(checkpoint(payload,3,['name']))['revision'],4)
            self.assertEqual(db.sql(f"SELECT jsonb_array_length(review_decisions) FROM app.cv_import_sessions WHERE source_id='{self.row['id']}'"),'1')
            self.assertEqual(db.sql(f"SELECT state FROM app.source_documents WHERE id='{self.row['id']}'"),'purged')
        def test_word_stage_reuses_attempt_store_and_unknown_cost_settlement_after_cancel(self):
            self.call('cancel_cv_import',f"'{self.op}'");self.op=uid();self.row=json.loads(self.call('begin_cv_import',f"'{self.op}','doc','{'b'*64}',1024,0"))['record'];self.complete('uploaded');self.complete('processing')
            stage=uid();args=f"'{stage}','{self.row['id']}','admit','synthetic','{self.secret}'"
            self.assertTrue(json.loads(self.call('reserve_document_operation',args))['created']);self.assertFalse(json.loads(self.call('reserve_document_operation',args))['created'])
            start={'attemptId':stage+'-primary','operationId':stage,'userId':self.a,'provider':'openai','providerScope':'direct-word','modelRequested':'synthetic'}
            self.assertTrue(json.loads(self.call('begin_ai_attempt',f"{literal(start)},'{self.secret}'"))['created'])
            self.call('cancel_cv_import',f"'{self.op}'")
            result={'status':'unknown','errorCode':'TIMEOUT','estimatedNanoUsd':None}
            self.assertEqual(json.loads(self.call('finish_ai_attempt',f"'{stage}-primary',{literal(result)},'{self.secret}'"))['result'],result)
            self.assertEqual(json.loads(self.call('get_cv_import',f"'{self.op}'"))['state'],'cancelled')
        def test_expired_processing_is_unknown_not_replayed_and_stale_import_revision_rejected(self):
            db.sql(f"UPDATE app.cv_import_sessions SET created_at=now()-interval '100 seconds' WHERE source_id='{self.row['id']}'")
            self.assertEqual(json.loads(self.call('get_cv_import',f"'{self.op}'"))['state'],'unknown')
            payload={'schemaVersion':'resumora-editor-draft/1','content':{},'answers':[]};self.call('save_base_draft',f"'{uid()}',0,{literal(payload)},'autosave'")
            self.assertIn('BASE_CV_EXISTS',self.call('begin_cv_import',f"'{uid()}','pdf','{'c'*64}',100,0",error=True))
    return unittest.defaultTestLoader.loadTestsFromTestCase(Imports)
