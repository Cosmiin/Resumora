"""Synthetic language copies/proposals through the existing owned RPC/CAS engines."""
import json,uuid,unittest,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
uid=lambda:str(uuid.uuid4())
lit=lambda v:"'"+json.dumps(v).replace("'","''")+"'::jsonb"
def suite(db):
 class Languages(unittest.TestCase):
  def setUp(self):
   self.a,self.b=uid(),uid();db.sql(f"INSERT INTO auth.users(id) VALUES('{self.a}'),('{self.b}')")
   self.source=json.loads((ROOT/'packages/contracts/fixtures/job-editor-import.json').read_text())
   self.base=self.call('save_base_draft',f"'{uid()}',0,{lit(self.source)},'checkpoint'")
   self.call('provision_workspace',f"'{uid()}'",user=self.b)
   source=self.call('document_language_context')['source']
   self.pin={'kind':'base','documentId':self.source['content']['id'],'currentId':source['id'],'revision':source['revision'],'fingerprint':source['fingerprint']}
   self.locale='ro-RO' if self.source['content']['language']=='en' else 'en-GB'
   self.source_locale='en-GB' if self.locale=='ro-RO' else 'ro-RO'
   self.variant='lang_'+hashlib.sha256((self.pin['documentId']+self.locale).encode()).hexdigest()
   self.target=json.loads(json.dumps(self.source));self.target['content']['language']=self.locale.split('-')[0];self.target['content']['documentLocale']=self.locale;self.target['content']['sourceLocale']=self.source_locale
   self.target['content']['translation']={'schemaVersion':'cv-language/1','documentLocale':self.locale,'sourceLocale':self.source_locale,'source':self.pin,'glossaryVersion':'1','components':[{'id':'summary','fieldId':'summary','sectionId':'summary','sourceFingerprint':'a'*64,'factIds':[],'evidenceIds':[]}]}
   self.target['content']['summary']['text']='Accepted translated wording'
   self.secret='synthetic-language-worker-secret-123456789'
   db.sql("INSERT INTO app.ai_worker_authorization(singleton,secret_hash) VALUES(true,sha256(convert_to('"+self.secret+"','UTF8'))) ON CONFLICT(singleton) DO UPDATE SET secret_hash=excluded.secret_hash")
  def raw(self,name,args='',user=None,error=False):return db.sql(f'SELECT app.{name}({args})',role='authenticated',user=user or self.a,expect_error=error)
  def call(self,*a,**kw):
   value=self.raw(*a,**kw);return json.loads(value) if value else None
  def save(self,expected=0,payload=None,key=None,accept=False,error=False,user=None):return self.raw('write_base_language',f"'{key or uid()}','{self.variant}',{expected},{lit(payload or self.target)},NULL,{str(accept).lower()}",error=error,user=user)
  def test_base_copy_independent_CAS_replay_history_default_evidence_and_foreign_ids(self):
   key=uid();first=json.loads(self.save(key=key));self.assertEqual(json.loads(self.save(key=key)),first)
   second=json.loads(self.save(expected=1));self.assertEqual(second['parentId'],first['id']);self.assertEqual(second['revision'],2)
   self.assertEqual(self.call('load_base_draft')['id'],self.base['id']);self.assertEqual(len(self.call('base_draft_history')),1)
   self.assertEqual(len(self.call('base_language_history',f"'{self.variant}'")),2)
   self.assertIsNone(self.call('load_editor_snapshot',f"'{first['id']}'"));self.assertIsNone(self.call('load_base_language',f"'{self.variant}'",user=self.b))
   self.assertIn('VERSION_CONFLICT',self.save(expected=0,error=True));self.assertTrue(self.save(user=self.b,error=True))
  def test_stale_source_fences_new_acceptance_but_preserves_independent_manual_target(self):
   self.save();changed=json.loads(json.dumps(self.source));changed['content']['summary']['text']='New source wording'
   self.call('save_base_draft',f"'{uid()}',1,{lit(changed)},'checkpoint'")
   self.assertIn('VERSION_CONFLICT',self.save(expected=1,accept=True,error=True))
   edited=json.loads(json.dumps(self.target));edited['content']['summary']['text']='Manual target retained'
   saved=json.loads(self.save(expected=1,payload=edited));self.assertEqual(saved['payload']['content']['summary']['text'],'Manual target retained')
   self.assertEqual(self.call('load_base_draft')['payload'],changed)
  def test_private_proposal_authority_replay_cancellation_and_no_target_write(self):
   request={'source':self.pin,'sourceLocale':self.source_locale,'targetLocale':self.locale,'targetRevision':0,'targetDocumentId':None,'variantId':self.variant,'sectionIds':[],'glossary':[]}
   op=uid();args=f"'start','{op}',{lit(request)},'{self.secret}'";first=self.call('language_proposal_command',args);self.assertEqual(first['state'],'pending');self.assertEqual(self.call('language_proposal_command',args),first)
   self.assertTrue(self.raw('language_proposal_command',f"'get','{op}'",user=self.b,error=True))
   self.assertTrue(self.raw('language_proposal_command',f"'work','{op}',{lit({'operationId':uid(),'expectedStep':0})},'wrong-secret'",error=True))
   cancelled=self.call('language_proposal_command',f"'cancel','{op}'");self.assertEqual(cancelled['state'],'cancelled');self.assertIsNone(cancelled['output']);self.assertIsNone(self.call('load_base_language',f"'{self.variant}'"))
  def test_source_change_invalidates_pending_results_without_overwriting_target(self):
   self.save();op=uid();request={'source':self.pin,'sourceLocale':self.source_locale,'targetLocale':self.locale,'targetRevision':1,'targetDocumentId':None,'variantId':self.variant,'sectionIds':[],'glossary':[]}
   self.call('language_proposal_command',f"'start','{op}',{lit(request)},'{self.secret}'")
   changed=json.loads(json.dumps(self.source));changed['content']['summary']['text']='Changed source'
   self.call('save_base_draft',f"'{uid()}',1,{lit(changed)},'checkpoint'")
   stale=self.call('language_proposal_command',f"'get','{op}'");self.assertEqual(stale['state'],'stale');self.assertIsNone(stale['output']);self.assertEqual(self.call('load_base_language',f"'{self.variant}'")['payload'],self.target)
 return unittest.defaultTestLoader.loadTestsFromTestCase(Languages)
