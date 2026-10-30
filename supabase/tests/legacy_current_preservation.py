"""Synthetic canonical-current conversion and transactional preservation seam."""
import json, subprocess, unittest, uuid, importlib.util
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
uid=lambda:str(uuid.uuid4())
lit=lambda v:"'"+json.dumps(v).replace("'","''")+"'::jsonb"

def install_purge_fixture(db):
    # Exact deferred import boundary, only when its real later migration has
    # not been included. No settings/global trigger changes or account state.
    if db.sql("SELECT to_regprocedure('app.require_base_cv_purge(uuid)') IS NOT NULL")=='t':return
    db.sql("""
    CREATE TABLE app.base_cv_lifecycle(tenant_id uuid PRIMARY KEY,generation bigint NOT NULL DEFAULT 0,revision_floor bigint NOT NULL DEFAULT 0,purge_transaction xid8);
    ALTER TABLE app.base_cv_lifecycle ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON app.base_cv_lifecycle FROM PUBLIC,anon,authenticated;
    CREATE FUNCTION app.require_base_cv_purge(w uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
    BEGIN
      IF w IS DISTINCT FROM app.tenant_for_user() OR NOT EXISTS(SELECT 1 FROM app.base_cv_lifecycle WHERE tenant_id=w AND purge_transaction=pg_current_xact_id()) THEN
        RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='BASE_PURGE_AUTHORITY_REQUIRED';END IF;
    END $$;
    REVOKE EXECUTE ON FUNCTION app.require_base_cv_purge(uuid) FROM PUBLIC,anon,authenticated;
    """)

def arm(tenant):
    return f"INSERT INTO app.base_cv_lifecycle(tenant_id,purge_transaction) VALUES('{tenant}',pg_current_xact_id()) ON CONFLICT(tenant_id) DO UPDATE SET purge_transaction=EXCLUDED.purge_transaction;"

def suite(db):
    spec=importlib.util.spec_from_file_location('legacy_fixture_behavior',ROOT/'supabase/tests/behavior.py')
    b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b);b.DB=db
    class Preservation(unittest.TestCase):
        def setUp(self):
            self.w=b.Workspace();self.w.setUp();self.job=self.w.job()
            # Privileged synthetic creation of the retired representation;
            # public legacy writes are deliberately no longer authorized.
            self.cv=json.loads(db.sql(f"SELECT app.save_job_cv_checkpoint('{uid()}',NULL,0,'{self.w.profile['profileVersionId']}','{self.job['jobVersionId']}',{lit(self.w.cv['document'])},'ro',true)",user=self.w.a))
        def internal(self,sql,error=False,user=None):return db.sql(sql,user=user or self.w.a,expect_error=error)
        def preflight(self,error=False):return self.internal(f"SELECT app.preflight_legacy_current_jobs('{self.w.wa}')",error)
        def transfer(self,error=False):return self.internal(f"BEGIN;{arm(self.w.wa)} SELECT app.prepare_job_documents_for_base_removal('{self.w.wa}');COMMIT;",error)
        def test_convert_selected_identity_validates_wire_without_profile_archive(self):
            plan=json.loads(self.preflight());self.assertEqual(len(plan),1);p=plan[0]['payload']
            self.assertEqual(p['content']['name']['value'],'Ana Exemplu');self.assertEqual(p['answers'],[])
            self.assertNotIn('claims',p['content']);self.assertNotIn('provenance',p['content'])
            script="import {decodeDraft} from './packages/contracts/src/editor/transport.ts';let s='';for await(const c of process.stdin)s+=c;decodeDraft(JSON.parse(s));"
            subprocess.run(['node','--experimental-strip-types','--input-type=module','-e',script],input=json.dumps(p),cwd=ROOT,check=True,capture_output=True,text=True)
        def test_plain_contacts_skills_summary_and_hidden_context_have_exact_subset(self):
            source=json.loads(self.internal(f"SELECT canonical_json FROM app.cv_versions WHERE id='{self.cv['cvVersionId']}'"))
            for ident,value in [('mail','synthetic@example.invalid'),('skill','SQL')]:
                source['claims'].append({'id':ident,'kind':'text','value':value,'status':'user_confirmed'})
            source['facts']['contacts']=[{'id':'mail_contact','kind':'email','visibility':'export','valueClaimId':'mail'}]
            source['document']['contactIds']=['mail_contact']
            source['facts']['skills']=[{'id':'sql_skill','class':'technical','labelClaimId':'skill'}]
            source['facts']['employment']=[{'private':'UNSELECTED_PRIVATE_BASE_CONTEXT'}]
            source['document']['sections'] += [
                {'id':'skills','kind':'technical_skills','label':'Competențe tehnice','visible':True,'entryIds':['sql_skill'],'proseIds':[]},
                {'id':'summary','kind':'summary','label':'Rezumat profesional','visible':True,'entryIds':[],'proseIds':['summary_text']}]
            source['document']['sectionOrder'] += ['skills','summary']
            source['generatedProse']=[{'id':'summary_text','kind':'summary','origin':'user_authored','approval':'approved','locale':'ro','text':'Supported summary.'}]
            p=json.loads(self.internal(f"SELECT app.convert_legacy_current_job({lit(source)})"))
            self.assertEqual(p['content']['summary']['text'],'Supported summary.')
            self.assertEqual(p['content']['contacts'][0]['value']['value'],'synthetic@example.invalid')
            self.assertEqual(p['content']['technicalSkills'][0]['value'],'SQL')
            self.assertNotIn('PRIVATE',json.dumps(p))
            source['generatedProse'][0]['origin']='ai_generated'
            self.assertIn('LEGACY_JOB_DOCUMENT_CONVERSION_REQUIRED',self.internal(f"SELECT app.convert_legacy_current_job({lit(source)})",True))
            source['generatedProse'][0]['origin']='user_authored';source['claims'][-1]['value']={'city':'Synthetic'}
            self.assertIn('LEGACY_JOB_DOCUMENT_CONVERSION_REQUIRED',self.internal(f"SELECT app.convert_legacy_current_job({lit(source)})",True))
        def test_transfer_keeps_original_job_and_current_content_with_exact_photo(self):
            asset=uid();db.sql(f"INSERT INTO app.photo_assets(id,tenant_id,object_key,state,byte_size,width,height,sha256) VALUES('{asset}','{self.w.wa}','{self.w.wa}/{asset}.jpg','ready',100,800,800,repeat('a',64))")
            photo={'assetId':asset,'crop':{'version':1,'centerX':.4,'centerY':.6,'zoom':1.5},'shape':'square','visible':False}
            layout={**self.w.cv['document'],'photoMode':'override','photo':photo}
            # Overwrite canonical CURRENT head via privileged retired command;
            # old no-photo version must not be selected for preservation.
            self.cv=json.loads(self.internal(f"SELECT app.save_job_cv_checkpoint('{uid()}','{self.cv['documentId']}',1,'{self.w.profile['profileVersionId']}','{self.job['jobVersionId']}',{lit(layout)},'ro',true)"))
            self.transfer();current=json.loads(self.w.call('load_current_job_document',f"'{self.job['jobId']}',NULL"))
            self.assertEqual(current['payload']['content']['name']['value'],'Ana Exemplu')
            self.assertEqual(current['payload']['content']['presentation']['photo'],photo)
            self.assertEqual(db.sql(f"SELECT photo_asset_id FROM app.job_editor_versions WHERE tenant_id='{self.w.wa}'"),asset)
            self.assertEqual(db.sql(f"SELECT job_id FROM app.target_job_contexts WHERE tenant_id='{self.w.wa}'"),self.job['jobId'])
            self.transfer();self.assertEqual(db.sql(f"SELECT count(*) FROM app.job_editor_versions WHERE tenant_id='{self.w.wa}'"),'1')
        def test_unsupported_rendering_and_differing_collision_refuse_before_mutation(self):
            source=json.loads(self.internal(f"SELECT canonical_json FROM app.cv_versions WHERE id='{self.cv['cvVersionId']}'"))
            source['document']['templateVersionId']='unknown_template'
            self.assertIn('LEGACY_JOB_DOCUMENT_CONVERSION_REQUIRED',self.internal(f"SELECT app.convert_legacy_current_job({lit(source)})",True))
            self.transfer();db.sql(f"UPDATE app.job_editor_versions SET payload=jsonb_set(payload,'{{content,name,value}}','\"Different accepted name\"') WHERE tenant_id='{self.w.wa}'")
            before=db.sql(f"SELECT payload FROM app.job_editor_versions WHERE tenant_id='{self.w.wa}'")
            self.assertIn('LEGACY_JOB_DOCUMENT_COLLISION',self.transfer(True))
            self.assertEqual(before,db.sql(f"SELECT payload FROM app.job_editor_versions WHERE tenant_id='{self.w.wa}'"))
        def test_equivalent_canonical_heads_deduplicate_without_content_winner(self):
            duplicate=json.loads(self.internal(f"SELECT app.save_job_cv_checkpoint('{uid()}',NULL,0,'{self.w.profile['profileVersionId']}','{self.job['jobVersionId']}',{lit(self.w.cv['document'])},'ro',true)"))
            plan=json.loads(self.preflight());self.assertEqual(len(plan),2)
            target=min(self.cv['documentId'],duplicate['documentId'])
            self.assertEqual({p['targetDocumentId'] for p in plan},{target})
            self.transfer();self.assertEqual(db.sql(f"SELECT count(*) FROM app.job_editor_versions WHERE tenant_id='{self.w.wa}'"),'1')
            self.assertEqual(db.sql(f"SELECT id FROM app.job_editor_documents WHERE tenant_id='{self.w.wa}'"),target)
        def test_two_legacy_locales_without_primary_refuse_without_invented_default(self):
            self.internal(f"SELECT app.save_job_cv_checkpoint('{uid()}',NULL,0,'{self.w.profile['profileVersionId']}','{self.job['jobVersionId']}',{lit(self.w.cv['document'])},'en',true)")
            self.assertIn('primary_locale_selection',self.transfer(True))
            self.assertEqual(db.sql(f"SELECT count(*) FROM app.job_editor_documents WHERE tenant_id='{self.w.wa}'"),'0')
        def test_one_unsupported_head_rolls_back_entire_transfer(self):
            section={'id':'unsupported_experience','kind':'experience','label':'Experience','entryIds':[],'proseIds':[],'visible':True}
            layout=json.loads(json.dumps(self.w.cv['document']));layout['sections'].append(section);layout['sectionOrder'].append(section['id'])
            # Physical canonical identifiers must retain the portable UUID form.
            section['id']='id_'+uid();layout['sectionOrder'][-1]=section['id']
            self.internal(f"SELECT app.save_job_cv_checkpoint('{uid()}',NULL,0,'{self.w.profile['profileVersionId']}','{self.job['jobVersionId']}',{lit(layout)},'ro',true)")
            self.assertIn('LEGACY_JOB_DOCUMENT_CONVERSION_REQUIRED',self.transfer(True))
            self.assertEqual(db.sql(f"SELECT count(*) FROM app.job_editor_documents WHERE tenant_id='{self.w.wa}'"),'0')
            self.assertEqual(db.sql(f"SELECT count(*) FROM app.target_job_contexts WHERE tenant_id='{self.w.wa}'"),'0')
            self.assertEqual(db.sql(f"SELECT count(*) FROM app.cv_documents WHERE tenant_id='{self.w.wa}' AND document_kind='job'"),'2')
        def test_authority_missing_stale_foreign_and_public_execution_denied(self):
            self.assertIn('BASE_PURGE_AUTHORITY_REQUIRED',self.internal(f"SELECT app.prepare_job_documents_for_base_removal('{self.w.wa}')",True))
            self.internal(arm(self.w.wa)) # ends transaction: marker must expire
            self.assertIn('BASE_PURGE_AUTHORITY_REQUIRED',self.internal(f"SELECT app.prepare_job_documents_for_base_removal('{self.w.wa}')",True))
            self.assertIn('BASE_PURGE_AUTHORITY_REQUIRED',self.internal(f"BEGIN;{arm(self.w.wa)} SELECT app.prepare_job_documents_for_base_removal('{self.w.wa}');COMMIT;",True,user=self.w.b))
            for role in ['authenticated','anon']:
                self.assertIn('permission denied',db.sql(f"SELECT app.prepare_job_documents_for_base_removal('{self.w.wa}')",role=role,user=self.w.a,expect_error=True))
            self.assertEqual(db.sql(f"SELECT state FROM app.tenants WHERE id='{self.w.wa}'"),'active')
        def test_application_sent_metadata_survives_and_current_link_is_independent(self):
            app=self.w.application(self.job,self.cv);self.w.mark(app,1,self.cv)
            before=db.sql(f"SELECT row_to_json(e) FROM app.application_events e WHERE tenant_id='{self.w.wa}'")
            self.transfer();self.assertEqual(before,db.sql(f"SELECT row_to_json(e) FROM app.application_events e WHERE tenant_id='{self.w.wa}'"))
            row=json.loads(db.sql(f"SELECT row_to_json(a) FROM app.applications a WHERE tenant_id='{self.w.wa}'"))
            self.assertEqual(row['cv_document_id'],self.cv['documentId']);self.assertEqual(row['chosen_cv_version_id'],self.cv['cvVersionId']);self.assertIsNotNone(row['current_job_document_id'])
            summary=json.loads(self.w.call('search_applications',"''"))['items'][0]
            self.assertEqual(summary['documentId'],row['current_job_document_id']);self.assertEqual(summary['lastSentCvVersionId'],self.cv['cvVersionId'])
            self.assertEqual(summary['latestCvVersionId'],db.sql(f"SELECT id FROM app.job_editor_versions WHERE tenant_id='{self.w.wa}'"))
            # A new pointer may not use arbitrary IDs after FK removal. Old
            # sent rows remain immutable; stage-only updates still work.
            self.assertIn('CV_JOB_LINEAGE_FORBIDDEN',db.sql(f"UPDATE app.applications SET chosen_cv_version_id='{uid()}' WHERE tenant_id='{self.w.wa}'",expect_error=True))
        def test_retired_legacy_publication_and_history_do_not_recreate_content(self):
            self.transfer()
            args=f"'{uid()}',NULL,0,'{self.w.profile['profileVersionId']}','{self.job['jobVersionId']}',{lit(self.w.cv['document'])},'ro',true"
            self.assertIn('CURRENT_JOB_DOCUMENT_REQUIRED',self.w.call('save_job_cv_checkpoint',args,error=True))
            self.assertIn('CURRENT_JOB_DOCUMENT_REQUIRED',self.w.call('restore_cv_version',f"'{uid()}','{self.cv['documentId']}',1,'{self.cv['cvVersionId']}'",error=True))
    return unittest.defaultTestLoader.loadTestsFromTestCase(Preservation)
