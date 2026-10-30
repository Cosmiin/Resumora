"""Capture capability SQL/ownership/outbox checks. Synthetic native PG only."""
import base64
import concurrent.futures
import hashlib
import json
import time
import unittest
import uuid

def suite(db):
    uid=lambda:str(uuid.uuid4())
    digest=lambda s:hashlib.sha256(s.encode()).hexdigest()
    literal=lambda x:"'"+json.dumps(x).replace("'","''")+"'::jsonb"
    secret='synthetic-capture-worker-only-secret-at-least-32'
    class Capture(unittest.TestCase):
        def setUp(self):
            db.sql("UPDATE app.capture_operations SET state='failed',lease=NULL,lease_until=NULL WHERE state IN ('received','processing')")
            self.a,self.b,self.device=uid(),uid(),uid()
            self.ext='a'*32; self.session=digest(uid()); self.code=digest(uid());self.token=digest(uid());self.connection=digest(uid())
            self.challenge=base64.urlsafe_b64encode(hashlib.sha256(b'v'*43).digest()).decode().rstrip('=')
            db.sql(f"INSERT INTO auth.users(id) VALUES('{self.a}'),('{self.b}'); INSERT INTO app.capture_worker_authorization VALUES(true,pg_catalog.sha256(pg_catalog.convert_to('{secret}','UTF8'))) ON CONFLICT DO NOTHING")
            self.authorize()
            self.exchange()
            self.body={'requestId':uid(),'snapshot':{'text':'Required SQL. <script>untrusted text</script> Preferred reports.', 'sourceUrl':'https://example.invalid/job','adapter':'generic','parserVersion':'1','capturedAt':'2026-10-28T00:00:00Z'}}
        def call(self,name,args='',error=False,user=None,role='anon'):
            return db.sql(f'SELECT app.{name}({args})',role=role,user=user,expect_error=error)
        def authorize(self,user=None,code=None,error=False):
            self.connection=digest(uid());self.token=digest(uid())
            return self.call('authorize_capture',f"'{secret}','{self.ext}','{self.device}','{self.session}','{self.challenge}','{code or self.code}',transaction_timestamp()+interval '1 hour'",error=error,user=user or self.a,role='authenticated')
        def cmd(self,action,credential=None,body=None,error=False,worker=secret,device=None,ext=None):
            return self.call('capture_command',f"'{worker}','{action}','{ext or self.ext}','{device or self.device}','{credential or self.token}',{literal(body or {})}",error=error)
        def exchange(self,error=False):
            return self.cmd('exchange',self.code,{'challenge':self.challenge,'connectionHash':self.connection,'tokenHash':self.token},error=error)
        def save(self,body=None,error=False):return self.cmd('save',body=body or self.body,error=error)
        def test_atomic_code_replay_wrong_proof_device_origin_and_scope(self):
            self.assertIn('CAPTURE_UNAUTHORIZED',self.exchange(error=True))
            self.assertIn('CAPTURE_UNAUTHORIZED',self.cmd('save',body=self.body,device=uid(),error=True))
            self.assertIn('CAPTURE_UNAUTHORIZED',self.cmd('save',body=self.body,ext='b'*32,error=True))
            self.assertIn('CAPTURE_FORBIDDEN',self.cmd('save',body=self.body,worker='wrong',error=True))
            self.assertIn('permission denied',self.call('load_base_draft',error=True))
            self.assertIn('permission denied',db.sql('SELECT * FROM app.capture_connections',role='anon',expect_error=True))
            self.assertIn('CAPTURE_INVALID',self.cmd('read_cv',error=True))
            self.code=digest(uid());self.authorize()
            self.assertIn('CAPTURE_UNAUTHORIZED',self.cmd('exchange',self.code,{'challenge':'x'*43,'connectionHash':self.connection,'tokenHash':self.token},error=True))
            db.sql(f"UPDATE app.capture_connections SET code_until=transaction_timestamp()-interval '1 second' WHERE code_hash='{self.code}'")
            self.assertIn('CAPTURE_UNAUTHORIZED',self.exchange(error=True))
        def test_A_and_B_durable_without_base_before_processing_and_same_id_retry(self):
            start=time.perf_counter();a=json.loads(self.save());elapsed=(time.perf_counter()-start)*1000
            print(f'CAPTURE_SQL_ACCEPTANCE_MS={elapsed:.2f} (local synthetic native PG/psql; no browser or cloud guarantee)')
            self.assertEqual(a['state'],'received');self.assertEqual(json.loads(self.save()),a)
            bbody={**self.body,'requestId':uid()};b=json.loads(self.save(bbody));self.assertNotEqual(a['jobId'],b['jobId'])
            self.assertEqual(json.loads(self.cmd('status',body={'requestId':self.body['requestId']})),a)
            detail=json.loads(self.call('get_target_job',f"'{a['jobId']}'",user=self.a,role='authenticated'))
            self.assertIsNone(detail['snapshotId']);self.assertEqual(detail['intake']['text'],self.body['snapshot']['text'])
            self.assertIn('IDEMPOTENCY_BODY_MISMATCH',self.save({**self.body,'snapshot':{**self.body['snapshot'],'text':'changed'}},error=True))
            # Review without Base is allowed; candidate CVs are untouched.
            reviewed=json.loads(self.call('review_target_job',f"'{uid()}','{a['jobId']}','Role','Company','[]'",user=self.a,role='authenticated'))
            self.assertEqual(reviewed['state'],'reviewed');self.assertIsNone(reviewed['snapshotId'])
            claim=json.loads(self.call('claim_capture',f"'{secret}'"));self.assertIn('lease',claim)
            self.assertEqual(json.loads(self.cmd('status',body={'requestId':self.body['requestId']}))['state'],'processing')
            self.assertEqual(json.loads(self.cmd('status',body={'requestId':bbody['requestId']}))['state'],'received')
            settled=json.loads(self.call('finish_capture',f"'{secret}','{claim['lease']}',{literal({'reviewState':'unreviewed','statedSalary':None})}"))
            self.assertEqual(settled['state'],'ready')
        def test_owner_scope_latest_base_and_no_supplied_ids(self):
            payload={'schemaVersion':'resumora-editor-draft/1','content':{},'answers':[]}
            for revision in (0,1):
                latest=json.loads(self.call('save_base_draft',f"'{uid()}',{revision},{literal(payload)},'autosave'",user=self.a,role='authenticated'))
            a=json.loads(self.save());detail=json.loads(self.call('get_target_job',f"'{a['jobId']}'",user=self.a,role='authenticated'))
            self.assertEqual(detail['snapshotId'],latest['id']);self.assertEqual(detail['snapshotRevision'],2)
            for body in [{**self.body,'tenantId':self.b},{**self.body,'snapshot':{**self.body['snapshot'],'cvId':self.b}}]:
                body['requestId']=uid();self.assertIn('CAPTURE_INVALID',self.save(body,error=True))
            self.code=digest(uid());self.session=digest(uid());self.authorize(user=self.b);self.exchange()
            self.assertEqual(self.cmd('status',body={'requestId':self.body['requestId']}),'')
            self.assertEqual(self.call('get_target_job',f"'{a['jobId']}'",user=self.b,role='authenticated'),'')
            self.assertEqual(json.loads(self.save())['state'],'received') # new owner's same ID cannot reuse A
        def test_logout_session_fence_account_switch_and_expired_access(self):
            self.assertIn('revoked',self.call('revoke_capture_session',f"'{secret}','{self.session}'"))
            self.assertIn('CAPTURE_UNAUTHORIZED',self.save(error=True));self.assertIn('CAPTURE_UNAUTHORIZED',self.authorize(code=digest(uid()),error=True))
            self.session=digest(uid());self.code=digest(uid());self.authorize();self.exchange()
            old=self.token;self.token=digest(uid());self.cmd('renew',self.connection,{'tokenHash':self.token})
            self.assertIn('CAPTURE_UNAUTHORIZED',self.cmd('status',old,{'requestId':self.body['requestId']},error=True))
            db.sql(f"UPDATE app.capture_connections SET token_until=transaction_timestamp()-interval '1 second' WHERE token_hash='{self.token}'")
            self.assertIn('CAPTURE_UNAUTHORIZED',self.save(error=True))
            self.cmd('renew',self.connection,{'tokenHash':self.token});self.cmd('disconnect',self.connection)
            self.assertIn('CAPTURE_UNAUTHORIZED',self.cmd('renew',self.connection,{'tokenHash':self.token},error=True))
        def test_concurrent_retry_one_job_and_atomic_handshake_once(self):
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool: results=list(pool.map(lambda _:json.loads(self.save()),range(2)))
            self.assertEqual(results[0],results[1])
            self.code=digest(uid());self.authorize()
            def exchange(_):
                try:return self.exchange()
                except AssertionError as error:return str(error)
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool: results=list(pool.map(exchange,range(2)))
            self.assertEqual(sum('CAPTURE_UNAUTHORIZED' in x for x in results),1)
        def test_outbox_lease_restart_retry_limit_and_stale_settlement(self):
            self.save()
            for attempt in range(3):
                work=json.loads(self.call('claim_capture',f"'{secret}'"))
                db.sql(f"UPDATE app.capture_operations SET lease_until=transaction_timestamp()-interval '1 second' WHERE lease='{work['lease']}'")
                self.assertIn('CAPTURE_STALE',self.call('finish_capture',f"'{secret}','{work['lease']}','{{}}'",error=True))
            self.call('claim_capture',f"'{secret}'")
            self.assertEqual(json.loads(self.cmd('status',body={'requestId':self.body['requestId']}))['state'],'failed')
        def test_manual_paste_without_base_and_latest_base_retry(self):
            intake={'text':'Manual synthetic recovery advert <script>untrusted</script>'};key=uid()
            first=json.loads(self.call('save_target_job',f"'{key}',NULL,NULL,{literal(intake)},'[]'",user=self.b,role='authenticated'))
            self.assertIsNone(first['snapshotId'])
            payload={'schemaVersion':'resumora-editor-draft/1','content':{},'answers':[]}
            latest=json.loads(self.call('save_base_draft',f"'{uid()}',0,{literal(payload)},'autosave'",user=self.b,role='authenticated'))
            retry=json.loads(self.call('save_target_job',f"'{key}',NULL,NULL,{literal(intake)},'[]'",user=self.b,role='authenticated'))
            self.assertEqual(retry,first)
            second=json.loads(self.call('save_target_job',f"'{uid()}',NULL,NULL,{literal(intake)},'[]'",user=self.b,role='authenticated'))
            self.assertEqual(second['snapshotId'],latest['id']);self.assertNotEqual(second['id'],first['id'])
    return unittest.defaultTestLoader.loadTestsFromTestCase(Capture)
