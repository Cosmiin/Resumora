"""A real pre-feature accepted A -> B import history remains editable on upgrade."""
import json,uuid,unittest
uid=lambda:str(uuid.uuid4())
lit=lambda v:"'"+json.dumps(v).replace("'","''")+"'::jsonb"
FIXTURE={}
def prepare_upgrade(db):
 user=uid();db.sql(f"INSERT INTO auth.users(id) VALUES('{user}')")
 secret='synthetic-upgrade-import-secret-123456789'
 db.sql(f"INSERT INTO app.ai_worker_authorization VALUES(true,sha256(convert_to('{secret}','UTF8'))) ON CONFLICT(singleton) DO UPDATE SET secret_hash=EXCLUDED.secret_hash")
 call=lambda name,args:json.loads(db.sql(f'SELECT app.{name}({args})',role='authenticated',user=user))
 rows=[]
 for index in range(2):
  operation=uid();source=call('begin_cv_import',f"'{operation}','pdf','{str(index+1)*64}',1024,{index}")['record']
  review={'id':source['id'],'sourceHash':str(index+1)*64,'format':'pdf','parserVersion':'synthetic','pages':1,'admission':{'kind':'cv','reason':'synthetic','pages':[1]},'confirmedIds':[],'extraction':{'schemaVersion':'cv-extraction/1','candidates':[{'id':'name','path':'name','value':'Imported '+str(index),'quote':'Imported '+str(index),'page':1,'confidence':'high'}],'warnings':[],'omittedPages':[]}}
  for state in ['uploaded','processing','ready']:call('complete_cv_import',f"'{operation}','{state}',{lit(review) if state=='ready' else 'NULL'},NULL,'{secret}'")
  review['confirmedIds']=['name'];payload={'schemaVersion':'resumora-editor-draft/1','content':{'importReview':review,'name':{'value':'Imported '+str(index)}},'answers':[]}
  snapshot=call('save_import_review_draft',f"'{uid()}',{index},{lit(payload)},'{source['id']}',{lit(['name'])}")
  rows.append((source,payload,snapshot))
 FIXTURE.update(user=user,rows=rows)
def suite(db):
 class ImportUpgrade(unittest.TestCase):
  def test_current_accepted_B_can_autosave_but_new_C_and_old_A_are_blocked(self):
   user=FIXTURE['user'];a,b=FIXTURE['rows'];source,payload,snapshot=b
   call=lambda name,args,error=False:db.sql(f'SELECT app.{name}({args})',role='authenticated',user=user,expect_error=error)
   edited=json.loads(json.dumps(payload));edited['content']['name']['value']='Current B edited by user'
   saved=json.loads(call('save_import_review_draft',f"'{uid()}',2,{lit(edited)},'{source['id']}',{lit(['name'])}"))
   self.assertEqual(saved['revision'],3);self.assertEqual(saved['payload']['content']['name']['value'],'Current B edited by user')
   self.assertIn('BASE_CV_EXISTS',call('begin_cv_import',f"'{uid()}','pdf','{'c'*64}',1024,3",True))
   self.assertIn('BASE_CV_EXISTS',call('save_import_review_draft',f"'{uid()}',3,{lit(a[1])},'{a[0]['id']}',{lit(['name'])}",True))
 return unittest.defaultTestLoader.loadTestsFromTestCase(ImportUpgrade)
