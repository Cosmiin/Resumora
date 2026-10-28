"""Native synthetic manifest/Storage-policy/snapshot checks; no hosted data."""
import concurrent.futures
import copy
import json
import importlib.util
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
        def checkpoint(self,w,job,layout=None,document=None,revision=0,key=None,error=False,tailored=True):
            args=f"'{key or uid()}',"+(f"'{document}'" if document else 'NULL')+f",{revision},'{w.profile['profileVersionId']}','{job['jobVersionId']}',{lit(layout if layout is not None else w.cv['document'])},'ro',"+('true' if tailored else 'false')
            value=self.call('save_job_cv_checkpoint',args,error=error)
            return value if error else json.loads(value)
        def version(self,result):
            return json.loads(db.sql(f"SELECT canonical_json FROM app.cv_versions WHERE id='{result['cvVersionId']}'",user=self.a,role='authenticated'))
        def test_job_command_pins_latest_base_with_immutable_history_and_replay(self):
            w=self.workspace();job=w.job();self.reserve();self.ready()
            p=self.payload['content']['presentation']['photo'];p.update(shape='square',visible=False,crop={'version':1,'centerX':.2,'centerY':.8,'zoom':2})
            self.save();key=uid();first=self.checkpoint(w,job,key=key);old=self.version(first)
            self.assertEqual(old['document']['photo'],p);self.assertEqual(old['document']['photoMode'],'base')
            newer=copy.deepcopy(self.payload);asset=uid();self.reserve(asset);self.call('finish_photo',f"'{asset}','{self.secret}'")
            newer['content']['presentation']['photo'].update(assetId=asset,shape='circle',visible=True)
            newer['content']['presentation']['photo']['crop'].update(centerX=.7,centerY=.1,zoom=3)
            self.save(newer,1)
            self.assertEqual(self.checkpoint(w,job,key=key),first)
            second=self.checkpoint(w,job,document=first['documentId'],revision=1)
            self.assertEqual(self.version(second)['document']['photo'],newer['content']['presentation']['photo'])
            self.assertEqual(self.version(first),old)
            self.assertEqual(db.sql(f"SELECT content_hash=app.hash_json(canonical_json-'snapshotId'-'baseCvId'-'version'-'parentSnapshotId'-'createdAt') FROM app.cv_versions WHERE id='{second['cvVersionId']}'"),'t')
            self.assertEqual(db.sql(f"SELECT count(*) FROM app.cv_photo_references WHERE cv_version_id IN ('{first['cvVersionId']}','{second['cvVersionId']}')"),'2')
            self.assertIn('VERSION_CONFLICT',self.checkpoint(w,job,document=first['documentId'],revision=1,error=True))
            self.assertIn('IMMUTABLE_RECORD',db.sql(f"UPDATE app.cv_versions SET canonical_json='{{}}' WHERE id='{first['cvVersionId']}'",expect_error=True))
        def test_job_overrides_persist_including_null_until_explicit_use_base(self):
            w=self.workspace();job=w.job();self.reserve();self.ready();self.save()
            override=copy.deepcopy(self.payload['content']['presentation']['photo']);override.update(shape='square',visible=False)
            layout=dict(w.cv['document'],photoMode='override',photo=override)
            first=self.checkpoint(w,job,layout);empty=copy.deepcopy(self.payload);empty['content']['presentation']['photo']=None;self.save(empty,1)
            second=self.checkpoint(w,job,document=first['documentId'],revision=1,tailored=False)
            self.assertEqual(self.version(second)['document']['photo'],override)
            self.assertEqual(self.version(second)['document']['photoMode'],'override')
            third=self.checkpoint(w,job,dict(layout,photo=None),first['documentId'],2)
            self.save(self.payload,2)
            fourth=self.checkpoint(w,job,document=first['documentId'],revision=3)
            self.assertIsNone(self.version(fourth)['document']['photo'])
            fifth=self.checkpoint(w,job,dict(w.cv['document'],photoMode='base'),first['documentId'],4)
            self.assertEqual(self.version(fifth)['document']['photo'],self.payload['content']['presentation']['photo'])
            self.assertEqual(json.loads(self.call('load_base_draft'))['payload'],self.payload)
            restored=json.loads(w.call('restore_cv_version',f"'{uid()}','{first['documentId']}',5,'{third['cvVersionId']}'"))
            self.assertIsNone(self.version(restored)['document']['photo'])
            self.assertEqual(self.version(restored)['document']['photoMode'],'override')
            next_revision=self.checkpoint(w,job,document=first['documentId'],revision=6)
            self.assertIsNone(self.version(next_revision)['document']['photo'])
        def test_base_publication_and_job_restore_pin_exact_historical_settings(self):
            w=self.workspace();job=w.job();self.reserve();self.ready();self.save()
            base=json.loads(w.call('save_cv_checkpoint',f"'{uid()}','{w.profile['baseDocumentId']}',1,'{w.profile['profileVersionId']}',{lit(w.cv['document'])},'ro'"))
            first=self.checkpoint(w,job);historical=self.version(first)['document']
            changed=copy.deepcopy(self.payload);changed['content']['presentation']['photo']['shape']='square';self.save(changed,1)
            second=self.checkpoint(w,job,document=first['documentId'],revision=1)
            restored=json.loads(w.call('restore_cv_version',f"'{uid()}','{first['documentId']}',2,'{first['cvVersionId']}'"))
            self.assertEqual(self.version(restored)['document'],historical)
            restored_base=json.loads(w.call('restore_cv_version',f"'{uid()}','{base['documentId']}',2,'{base['cvVersionId']}'"))
            self.assertEqual(self.version(restored_base)['document']['photo'],historical['photo'])
            next_revision=self.checkpoint(w,job,document=first['documentId'],revision=3)
            self.assertEqual(self.version(next_revision)['document']['photo'],changed['content']['presentation']['photo'])
            self.call('delete_photo',f"'{self.id}',false,'{self.secret}'")
            self.assertIn('PHOTO_NOT_AVAILABLE',w.call('restore_cv_version',f"'{uid()}','{first['documentId']}',4,'{first['cvVersionId']}'",error=True))
            self.assertIn('PHOTO_NOT_FOUND',self.call('read_photo',f"'{self.id}'",error=True))
            self.assertEqual(self.version(first)['document'],historical)
        def test_job_only_assets_validate_ownership_and_retain_transactional_references(self):
            w=self.workspace();job=w.job();self.reserve();self.ready()
            layout=dict(w.cv['document'],photoMode='override',photo=self.payload['content']['presentation']['photo'])
            first=self.checkpoint(w,job,layout)
            db.sql(f"UPDATE app.photo_assets SET created_at=transaction_timestamp()-interval '25 hours' WHERE id='{self.id}'")
            self.assertEqual(json.loads(self.call('expire_photo_uploads',f"'{self.secret}'")),[])
            self.assertEqual(db.sql(f"SELECT count(*) FROM app.editor_photo_references WHERE asset_id='{self.id}'"),'0')
            self.assertEqual(db.sql(f"SELECT count(*) FROM app.cv_photo_references WHERE asset_id='{self.id}'",user=self.b,role='authenticated'),'0')
            self.assertIn('permission denied',db.sql(f"INSERT INTO app.cv_photo_references VALUES('{w.wb}','{first['cvVersionId']}','{self.id}')",user=self.b,role='authenticated',expect_error=True))
            db.sql(f"INSERT INTO app.cv_photo_references VALUES('{w.wb}','{first['cvVersionId']}','{self.id}')",expect_error=True)
            other=behavior.Workspace();other.__dict__.update(w.__dict__);other.a=w.b
            other.cv=behavior.canonical_fixture('minimal.json',other.a);other.profile=other.publish(other.cv);foreign_job=other.job()
            args=f"'{uid()}',NULL,0,'{other.profile['profileVersionId']}','{foreign_job['jobVersionId']}',{lit(layout)},'ro',true"
            self.assertIn('PHOTO_NOT_AVAILABLE',self.call('save_job_cv_checkpoint',args,user=w.b,error=True))
            reserved=uid();self.reserve(reserved);bad=dict(layout,photo=dict(layout['photo'],assetId=reserved));key=uid()
            self.assertIn('PHOTO_NOT_AVAILABLE',self.checkpoint(w,job,bad,first['documentId'],1,key,error=True))
            for field,value in [('shape','triangle'),('visible',None),('crop',{'version':1,'centerX':-1,'centerY':.5,'zoom':1})]:
                bad=dict(layout,photo=dict(layout['photo'],**{field:value}))
                self.assertIn('CANONICAL_SCHEMA_INVALID',self.checkpoint(w,job,bad,first['documentId'],1,error=True))
            second=self.checkpoint(w,job,layout,first['documentId'],1,key)
            self.assertEqual(second['revision'],2)
            self.assertEqual(db.sql(f"SELECT count(*) FROM app.cv_photo_references WHERE asset_id='{self.id}'"),'2')
            self.assertIn('IMMUTABLE_RECORD',db.sql(f"DELETE FROM app.cv_photo_references WHERE asset_id='{self.id}'",expect_error=True))
            self.assertIn('permission denied',db.sql('SELECT * FROM app.cv_photo_references',role='anon',expect_error=True))
            self.assertIn('INVALID_PHOTO',self.checkpoint(w,job,dict(w.cv['document'],photoMode='override'),error=True))
        def test_job_attachment_and_deletion_serialize_without_resurrection(self):
            w=self.workspace();job=w.job();self.reserve();self.ready()
            layout=dict(w.cv['document'],photoMode='override',photo=self.payload['content']['presentation']['photo'])
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                saved=pool.submit(self.checkpoint,w,job,layout)
                deleted=pool.submit(self.call,'delete_photo',f"'{self.id}',false,'{self.secret}'")
                deleted.result()
                try:
                    result=saved.result()
                    self.assertEqual(self.version(result)['document']['photo'],layout['photo'])
                    self.assertEqual(db.sql(f"SELECT count(*) FROM app.cv_photo_references WHERE cv_version_id='{result['cvVersionId']}'"),'1')
                except AssertionError as error:
                    self.assertIn('PHOTO_NOT_AVAILABLE',str(error))
            self.assertIn('PHOTO_NOT_FOUND',self.call('read_photo',f"'{self.id}'",error=True))
        def test_legacy_job_without_photo_remains_valid(self):
            w=self.workspace();job=w.job();first=self.checkpoint(w,job)
            self.assertNotIn('photo',self.version(first)['document'])
            empty=copy.deepcopy(self.payload);empty['content']['presentation']['photo']=None;self.save(empty)
            second=self.checkpoint(w,job,document=first['documentId'],revision=1)
            self.assertIsNone(self.version(second)['document']['photo'])
            self.assertEqual(self.version(second)['document']['photoMode'],'base')
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
            row=self.reserve();self.ready();old=json.loads(self.save())
            db.sql(f"INSERT INTO storage.objects(bucket_id,name) VALUES('cv-photos','{row['objectKey']}')")
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
