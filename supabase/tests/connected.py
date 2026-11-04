"""Synthetic SQL ownership, evidence and accounting integrity. Never hosted."""
import json
import unittest
import uuid

def suite(db):
    uid = lambda: str(uuid.uuid4())
    literal = lambda x: "'" + json.dumps(x).replace("'", "''") + "'::jsonb"
    class Connected(unittest.TestCase):
        def setUp(self):
            self.a, self.b = uid(), uid()
            db.sql(f"INSERT INTO auth.users(id) VALUES ('{self.a}'),('{self.b}')")
            self.payload = {'schemaVersion':'resumora-editor-draft/1','content':{},'answers':[]}
            self.snapshot = json.loads(self.call('save_base_draft',f"'{uid()}',0,{literal(self.payload)},'autosave'"))
            self.other = json.loads(self.call('save_base_draft',f"'{uid()}',0,{literal(self.payload)},'autosave'",user=self.b))
            self.secret = 'synthetic-worker-only-secret-32-characters'
            db.sql("INSERT INTO app.ai_worker_authorization VALUES(true,pg_catalog.sha256(pg_catalog.convert_to('"+self.secret+"','UTF8'))) ON CONFLICT(singleton) DO UPDATE SET secret_hash=EXCLUDED.secret_hash")
        def call(self,name,args='',user=None,error=False,role='authenticated'):
            return db.sql(f'SELECT app.{name}({args})',user=user or self.a,role=role,expect_error=error)
        def test_operation_replay_secret_and_unknown_attempt(self):
            op=uid(); args=f"'{op}','{self.snapshot['id']}',1,'role-1','policy-1','{self.secret}'"
            self.assertTrue(json.loads(self.call('reserve_enhancement',args))['created'])
            self.assertFalse(json.loads(self.call('reserve_enhancement',args))['created'])
            self.assertIn('IDEMPOTENCY_BODY_MISMATCH',self.call('reserve_enhancement',args.replace('role-1','role-2'),error=True))
            self.assertIn('RESOURCE_FORBIDDEN',self.call('reserve_enhancement',args.replace(self.secret,'wrong'),error=True))
            self.assertIn('SNAPSHOT_NOT_FOUND',self.call('reserve_enhancement',args,user=self.b,error=True))
            start={'attemptId':op+'-primary','operationId':op,'userId':self.a,'provider':'openrouter','providerScope':'synthetic','modelRequested':'synthetic','startedAt':'2026-10-28T00:00:00Z'}
            attempt=json.loads(self.call('begin_ai_attempt',f"{literal(start)},'{self.secret}'"))
            self.assertIsNone(attempt['attempt']['result'])
            self.assertFalse(json.loads(self.call('begin_ai_attempt',f"{literal(start)},'{self.secret}'"))['created'])
            result={'status':'unknown','errorCode':'TIMEOUT','reportedCost':None,'estimatedNanoUsd':None}
            settled=json.loads(self.call('finish_ai_attempt',f"'{op}-primary',{literal(result)},'{self.secret}'"))
            self.assertEqual(settled['result'],result)
            self.assertIn('IDEMPOTENCY_BODY_MISMATCH',self.call('finish_ai_attempt',f"'{op}-primary',{literal({**result, 'status':'completed'})},'{self.secret}'",error=True))
    return unittest.defaultTestLoader.loadTestsFromTestCase(Connected)
