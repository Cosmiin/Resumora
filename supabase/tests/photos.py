"""Native synthetic manifest/Storage-policy/snapshot checks; no hosted data."""
import concurrent.futures
import copy
import json
import importlib.util
import threading
from pathlib import Path
import unittest
import uuid

def suite(db):
    spec=importlib.util.spec_from_file_location('photo_revision_behavior',Path(__file__).with_name('behavior.py'))
    behavior=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(behavior)
    behavior.DB=db
    def uid(): return str(uuid.uuid4())
    def lit(value): return "'" + json.dumps(value).replace("'", "''") + "'::jsonb"
    class Photos(unittest.TestCase):
        def setUp(self):
            self.a,self.b,self.id=uid(),uid(),uid()
            self.secret='synthetic-photo-worker-secret-only-12345678'
            db.sql(f"INSERT INTO auth.users(id) VALUES('{self.a}'),('{self.b}'); INSERT INTO app.photo_worker_config(secret_hash) VALUES(sha256(convert_to('{self.secret}','UTF8'))) ON CONFLICT(singleton) DO UPDATE SET secret_hash=EXCLUDED.secret_hash")
            self.payload={'schemaVersion':'resumora-editor-draft/1','content':{'presentation':{'order':[], 'hidden':[], 'photo':{'assetId':self.id,'crop':{'version':1,'centerX':.5,'centerY':.5,'zoom':1},'shape':'circle','visible':True}}},'answers':[]}
        def call(self,name,args='',user=None,error=False):
            return db.sql(f'SELECT app.{name}({args})',user=user or self.a,role='authenticated',expect_error=error)
        def reserve(self,id=None):
            return json.loads(self.call('reserve_photo',f"'{id or self.id}','{'a'*64}',256,256,100,'{self.secret}'"))
        def ready(self): return self.call('finish_photo',f"'{self.id}','{self.secret}'")
        def save(self,payload=None,revision=0,key=None,error=False):
            return self.call('save_base_draft',f"'{key or uid()}',{revision},{lit(payload or self.payload)},'autosave'",error=error)
        def workspace(self):
            w=behavior.Workspace();w.setUp();self.a,self.b=w.a,w.b
            return w
        def version(self,result):
            return json.loads(db.sql(f"SELECT canonical_json FROM app.cv_versions WHERE id='{result['cvVersionId']}'",user=self.a,role='authenticated'))
        def test_base_publication_and_restore_pin_exact_historical_settings(self):
            w=self.workspace();self.reserve();self.ready();self.save()
            base=json.loads(w.call('save_cv_checkpoint',f"'{uid()}','{w.profile['baseDocumentId']}',1,'{w.profile['profileVersionId']}',{lit(w.cv['document'])},'ro'"))
            historical=self.version(base)['document']
            changed=copy.deepcopy(self.payload);changed['content']['presentation']['photo']['shape']='square';self.save(changed,1)
            restored_base=json.loads(w.call('restore_cv_version',f"'{uid()}','{base['documentId']}',2,'{base['cvVersionId']}'"))
            self.assertEqual(self.version(restored_base)['document']['photo'],historical['photo'])
            self.call('delete_photo',f"'{self.id}',false,'{self.secret}'")
            self.assertIn('PHOTO_NOT_AVAILABLE',w.call('restore_cv_version',f"'{uid()}','{base['documentId']}',3,'{base['cvVersionId']}'",error=True))
            self.assertEqual(self.version(base)['document'],historical)
        def test_worker_authority_foreign_asset_and_storage_no_overwrite(self):
            self.assertIn('RESOURCE_FORBIDDEN',self.call('reserve_photo',f"'{self.id}','{'a'*64}',256,256,100,'wrong'",error=True))
            row=self.reserve();key=row['objectKey']
            self.assertEqual(row,self.reserve())
            self.assertIn('ACTIVE_WORKSPACE_REQUIRED',self.call('read_photo',f"'{self.id}'",user=self.b,error=True))
            self.call('provision_workspace',f"'{uid()}'",user=self.b)
            self.assertIn('PHOTO_NOT_FOUND',self.call('read_photo',f"'{self.id}'",user=self.b,error=True))
            db.sql(f"SET test_support.storage_operation='storage.object.upload'; INSERT INTO storage.objects(bucket_id,name) VALUES('cv-photos','{key}')",user=self.a,role='authenticated')
            db.sql(f"SET test_support.storage_operation='storage.object.upload'; INSERT INTO storage.objects(bucket_id,name) VALUES('cv-photos','{uid()}/{uid()}.jpg')",user=self.a,role='authenticated',expect_error=True)
            self.assertEqual(db.sql(f"SET test_support.storage_operation='storage.object.get_authenticated'; SELECT count(*) FROM storage.objects WHERE name='{key}'",user=self.b,role='authenticated'),'0')
            self.ready()
            db.sql("CREATE POLICY broad_fixture_policy ON storage.objects FOR SELECT TO authenticated USING(true)")
            self.assertEqual(db.sql(f"SET test_support.storage_operation='storage.object.sign'; SELECT count(*) FROM storage.objects WHERE name='{key}'",user=self.a,role='authenticated'),'0')
            db.sql("DROP POLICY broad_fixture_policy ON storage.objects")
            db.sql(f"UPDATE storage.objects SET name='changed' WHERE name='{key}'; DELETE FROM storage.objects WHERE name='{key}'",user=self.a,role='authenticated')
            self.assertEqual(db.sql(f"SET test_support.storage_operation='storage.object.get_authenticated'; SELECT count(*) FROM storage.objects WHERE name='{key}'"),'1')
            db.sql(f"SET test_support.storage_operation='storage.object.upload'; INSERT INTO storage.objects(bucket_id,name) VALUES('cv-photos','{key}')",user=self.a,role='authenticated',expect_error=True)
        def test_photo_roundtrip_revision_replay_shape_and_restore(self):
            self.reserve();self.ready();request=uid();saved=json.loads(self.save(key=request))
            self.assertEqual(saved,json.loads(self.save(key=request)))
            self.assertEqual(db.sql(f"SELECT count(*) FROM app.editor_photo_references WHERE asset_id='{self.id}'"),'1')
            changed=copy.deepcopy(self.payload);changed['content']['presentation']['photo']['shape']='square'
            newer=json.loads(self.save(changed,1));self.assertEqual(newer['revision'],2)
            restored=json.loads(self.call('restore_base_draft',f"'{uid()}',2,'{saved['id']}'"))
            self.assertEqual(restored['payload'],self.payload)
            self.assertEqual(db.sql(f"SELECT count(*) FROM app.editor_photo_references WHERE asset_id='{self.id}'"),'3')
            self.assertIn('VERSION_CONFLICT',self.save(changed,1,error=True))
        def test_validation_known_foreign_id_and_invalid_crop(self):
            self.reserve();self.ready();self.call('provision_workspace',f"'{uid()}'",user=self.b)
            self.assertIn('PHOTO_NOT_AVAILABLE',self.call('save_base_draft',f"'{uid()}',0,{lit(self.payload)},'autosave'",user=self.b,error=True))
            for bad in [-1,4,'NaN']:
                p=copy.deepcopy(self.payload);p['content']['presentation']['photo']['crop']['zoom']=bad
                self.assertIn('INVALID_PHOTO',self.save(p,error=True))
            p=copy.deepcopy(self.payload);del p['content']['presentation']['photo']['shape'];p['content']['presentation']['photo']['unknown']=1
            self.assertIn('INVALID_PHOTO',self.save(p,error=True))
        def test_delete_revokes_every_reference_replay_cannot_resurrect_and_restore_fails(self):
            row=self.reserve()
            db.sql(f"SET test_support.storage_operation='storage.object.upload'; INSERT INTO storage.objects(bucket_id,name) VALUES('cv-photos','{row['objectKey']}')",user=self.a,role='authenticated')
            self.ready();old=json.loads(self.save())
            self.assertEqual(db.sql(f"SET test_support.storage_operation='storage.object.get_authenticated'; SELECT count(*) FROM storage.objects WHERE name='{row['objectKey']}'",user=self.a,role='authenticated'),'1')
            self.call('delete_photo',f"'{self.id}',false,'{self.secret}'")
            self.assertIn('PHOTO_NOT_FOUND',self.call('read_photo',f"'{self.id}'",error=True))
            self.assertEqual(db.sql(f"SET test_support.storage_operation='storage.object.get_authenticated'; SELECT count(*) FROM storage.objects WHERE name='{row['objectKey']}'",user=self.a,role='authenticated'),'0')
            self.assertIn('PHOTO_NOT_AVAILABLE',self.call('restore_base_draft',f"'{uid()}',1,'{old['id']}'",error=True))
            self.assertIn('PHOTO_NOT_FOUND',self.call('finish_photo',f"'{self.id}','{self.secret}'",error=True))
            self.assertEqual(self.reserve()['state'],'purge_pending')
            db.sql(f"SET test_support.storage_operation='storage.object.delete_many'; DELETE FROM storage.objects WHERE name='{row['objectKey']}'",user=self.a,role='authenticated')
            self.assertEqual(db.sql(f"SELECT count(*) FROM storage.objects WHERE name='{row['objectKey']}'"),'0')
            self.call('delete_photo',f"'{self.id}',true,'{self.secret}'")
            self.assertEqual(self.reserve()['state'],'purged')
            self.assertEqual(json.loads(self.call('load_base_draft'))['payload'],old['payload'])
            p=copy.deepcopy(self.payload);p['content']['presentation']['photo']=None
            self.assertEqual(json.loads(self.save(p,1))['revision'],2)
        def test_cleanup_retains_referenced_sources_and_expires_only_abandoned(self):
            self.reserve();self.ready();self.save();other=uid();self.reserve(other)
            db.sql(f"UPDATE app.photo_assets SET created_at=transaction_timestamp()-interval '25 hours' WHERE id IN ('{self.id}','{other}')")
            rows=json.loads(self.call('expire_photo_uploads',f"'{self.secret}'"))
            self.assertEqual([r['id'] for r in rows],[other]);self.assertEqual(json.loads(self.call('read_photo',f"'{self.id}'"))['state'],'ready')
        def test_cleanup_racing_editor_and_canonical_attachment_retains_successful_saves(self):
            w=self.workspace();revision=0;canonical_revision=1
            for path in ('editor',):
                if path=='canonical':
                    empty=copy.deepcopy(self.payload);empty['content']['presentation']['photo']=None
                    revision=json.loads(self.save(empty,revision))['revision']
                for _ in range(12):
                    asset=uid();self.reserve(asset);self.call('finish_photo',f"'{asset}','{self.secret}'")
                    db.sql(f"UPDATE app.photo_assets SET created_at=transaction_timestamp()-interval '25 hours' WHERE id='{asset}'")
                    payload=copy.deepcopy(self.payload);payload['content']['presentation']['photo']['assetId']=asset
                    layout=dict(w.cv['document'],photoMode='base',photo=payload['content']['presentation']['photo'])
                    start=threading.Barrier(2)
                    def attach():
                        start.wait(timeout=10)
                        if path=='editor':return json.loads(self.save(payload,revision))
                        return json.loads(w.call('save_cv_checkpoint',f"'{uid()}','{w.profile['baseDocumentId']}',{canonical_revision},'{w.profile['profileVersionId']}',{lit(layout)},'ro'"))
                    def cleanup():
                        start.wait(timeout=10)
                        return json.loads(self.call('expire_photo_uploads',f"'{self.secret}'"))
                    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                        saved=pool.submit(attach);expired=pool.submit(cleanup)
                        rows=expired.result()
                        try:result=saved.result()
                        except AssertionError as error:
                            self.assertIn('PHOTO_NOT_AVAILABLE',str(error))
                            self.assertIn(asset,[row['id'] for row in rows])
                        else:
                            if path=='editor':revision=result['revision']
                            else:canonical_revision=result['revision']
                            self.assertNotIn(asset,[row['id'] for row in rows])
                            self.assertEqual(json.loads(self.call('read_photo',f"'{asset}'"))['state'],'ready')
                            self.assertEqual(json.loads(self.call('expire_photo_uploads',f"'{self.secret}'")),[])
                        for row in rows:self.call('delete_photo',f"'{row['id']}',true,'{self.secret}'")
        def test_cleanup_resumes_explicit_deletion_of_referenced_photos(self):
            w=self.workspace();self.reserve();self.ready();self.save()
            self.call('delete_photo',f"'{self.id}',false,'{self.secret}'")
            rows=json.loads(self.call('expire_photo_uploads',f"'{self.secret}'"))
            self.assertEqual([row['id'] for row in rows],[self.id])
            self.assertIn('PHOTO_NOT_FOUND',self.call('read_photo',f"'{self.id}'",error=True))
        def test_photo_read_and_storage_are_fenced_after_membership_revocation(self):
            row=self.reserve();self.ready()
            db.sql(f"UPDATE app.tenant_memberships SET state='revoked' WHERE tenant_id='{row['objectKey'].split('/')[0]}'")
            self.assertIn('ACTIVE_WORKSPACE_REQUIRED',self.call('read_photo',f"'{self.id}'",error=True))
            self.assertEqual(db.sql(f"SELECT app.photo_storage_access('{row['objectKey']}','read')",user=self.a,role='authenticated'),'f')
            db.sql(f"SELECT app.read_photo('{self.id}')",role='anon',expect_error=True)
        def test_concurrent_photo_save_delete_has_no_silent_mutation(self):
            self.reserve();self.ready()
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                saved=pool.submit(self.save,error=False)
                deleted=pool.submit(self.call,'delete_photo',f"'{self.id}',false,'{self.secret}'")
                deleted.result()
                try: value=json.loads(saved.result());self.assertEqual(value['payload'],self.payload)
                except AssertionError as error:self.assertIn('PHOTO_NOT_AVAILABLE',str(error))
            self.assertIn('PHOTO_NOT_FOUND',self.call('read_photo',f"'{self.id}'",error=True))
    return unittest.defaultTestLoader.loadTestsFromTestCase(Photos)
