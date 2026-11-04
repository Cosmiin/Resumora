"""Behavioral tests against real PostgreSQL, using synthetic Auth subjects only."""
import concurrent.futures
import json
import unittest
import uuid


def uid():
    return str(uuid.uuid4())


def literal(value):
    return "'" + json.dumps(value,ensure_ascii=False).replace("'", "''") + "'::jsonb"


DB = None


class Foundation(unittest.TestCase):
    def setUp(self):
        self.a,self.b=uid(),uid()
        DB.sql(f"INSERT INTO auth.users(id) VALUES ('{self.a}'),('{self.b}');")
        self.key=uid()
        self.wa=json.loads(DB.sql(f"SELECT app.provision_workspace('{self.key}')",user=self.a,role='authenticated'))['tenantId']
        self.wb=json.loads(DB.sql(f"SELECT app.provision_workspace('{uid()}')",user=self.b,role='authenticated'))['tenantId']

    def call(self,name,args,user=None,error=False):
        return DB.sql(f'SELECT app.{name}({args})',user=user or self.a,role='authenticated',expect_error=error)

    def test_provision_replay_and_stable_uid(self):
        replay=json.loads(self.call('provision_workspace',f"'{self.key}'"))
        other=json.loads(self.call('provision_workspace',f"'{uid()}'"))
        self.assertEqual(replay['tenantId'],self.wa)
        self.assertEqual(other['tenantId'],self.wa)
        self.assertEqual(replay['userId'],self.a)
        self.assertEqual(DB.sql(f"SELECT count(*) FROM app.tenant_memberships WHERE tenant_id='{self.wa}'"),'1')

    def test_anonymous_and_cross_tenant_reads(self):
        self.assertIn('permission denied',DB.sql('SELECT * FROM app.tenants',role='anon',expect_error=True))
        visible=DB.sql('SELECT id FROM app.tenants',user=self.a,role='authenticated')
        self.assertEqual(visible,self.wa)
        self.assertEqual(DB.sql(f"SELECT count(*) FROM app.tenants WHERE id='{self.wb}'",user=self.a,role='authenticated'),'0')

    def test_no_direct_elevation_or_internal_ledger(self):
        for sql in [f"UPDATE app.tenants SET owner_user_id='{self.b}' WHERE id='{self.wa}'",
                    f"INSERT INTO app.tenant_memberships VALUES ('{self.wb}','{self.a}','owner','active',now())",
                    'SELECT * FROM app.idempotency_requests',
                    'SELECT * FROM app.audit_events',
                    f"SELECT * FROM app.begin_request('{self.wb}','forged','{uid()}','{{}}')"]:
            with self.subTest(sql=sql):
                self.assertIn('permission denied',DB.sql(sql,user=self.a,role='authenticated',expect_error=True))

    def test_same_request_returns_original_result(self):
        key=uid()
        first=self.call('set_preferences',f"'{key}','en','{{\"density\":\"compact\"}}'")
        second=self.call('set_preferences',f"'{key}','en','{{\"density\":\"compact\"}}'")
        self.assertEqual(first,second)
        self.assertEqual(DB.sql(f"SELECT count(*) FROM app.audit_events WHERE tenant_id='{self.wa}' AND action='preferences.updated'"),'1')

    def test_key_reuse_with_changed_payload_conflicts(self):
        key=uid()
        self.call('set_preferences',f"'{key}','ro','{{}}'")
        self.assertIn('IDEMPOTENCY_BODY_MISMATCH',self.call('set_preferences',f"'{key}','en','{{}}'",error=True))
        self.assertEqual(DB.sql(f"SELECT ui_locale FROM app.user_profiles WHERE user_id='{self.a}'"),'ro')

    def test_expired_ledger_is_not_reused_for_new_command(self):
        key=uid()
        self.call('set_preferences',f"'{key}','ro','{{}}'")
        DB.sql(f"UPDATE app.idempotency_requests SET expires_at=now()-interval '1 day' WHERE tenant_id='{self.wa}' AND command_kind='set_preferences'")
        self.assertIn('REQUEST_EXPIRED',self.call('set_preferences',f"'{key}','ro','{{}}'",error=True))
        self.assertEqual(DB.sql(f"SELECT count(*) FROM app.idempotency_requests WHERE tenant_id='{self.wa}' AND command_kind='set_preferences'"),'1')

    def test_concurrent_same_request_commits_once(self):
        key=uid()
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            results=list(pool.map(lambda _:self.call('set_preferences',f"'{key}','en','{{}}'"),range(8)))
        self.assertEqual(len(set(results)),1)
        self.assertEqual(DB.sql(f"SELECT count(*) FROM app.audit_events WHERE tenant_id='{self.wa}' AND action='preferences.updated'"),'1')

    def test_transaction_failure_rolls_back_key_and_domain(self):
        user=uid();key=uid()
        DB.sql(f"INSERT INTO auth.users(id) VALUES ('{user}')")
        DB.sql(f"BEGIN; SELECT app.provision_workspace('{key}'); SELECT 1/0; COMMIT;",user=user,role='authenticated',expect_error=True)
        self.assertEqual(DB.sql(f"SELECT count(*) FROM app.tenants WHERE owner_user_id='{user}'"),'0')
        result=json.loads(self.call('provision_workspace',f"'{key}'",user=user))
        self.assertEqual(result['userId'],user)

    def test_revocation_reauthorizes_cached_results(self):
        DB.sql(f"UPDATE app.tenant_memberships SET state='revoked' WHERE tenant_id='{self.wa}' AND user_id='{self.a}'")
        self.assertIn('RESOURCE_FORBIDDEN',self.call('provision_workspace',f"'{self.key}'",error=True))
        self.assertEqual(DB.sql(f"SELECT count(*) FROM app.tenants WHERE id='{self.wa}'",user=self.a,role='authenticated'),'0')

    def test_deletion_fences_writes_and_replays_its_own_request(self):
        key=uid()
        first=self.call('request_deletion',f"'{key}'")
        self.assertEqual(first,self.call('request_deletion',f"'{key}'"))
        self.assertEqual(DB.sql(f"SELECT deletion_generation FROM app.tenants WHERE id='{self.wa}'"),'1')
        self.assertIn('ACTIVE_WORKSPACE_REQUIRED',self.call('set_preferences',f"'{uid()}','ro','{{}}'",error=True))
        self.assertEqual(DB.sql(f"SELECT count(*) FROM app.tenants WHERE id='{self.wa}'",user=self.a,role='authenticated'),'0')

    def test_audit_is_immutable_even_to_accidental_owner_update(self):
        self.assertIn('IMMUTABLE_RECORD',DB.sql(f"UPDATE app.audit_events SET action='rewritten' WHERE tenant_id='{self.wa}'",expect_error=True))



def canonical_fixture(name,user):
    from pathlib import Path
    source=Path(__file__).resolve().parents[2]/'schemas/cv/v1/fixtures'/name
    value=json.loads(source.read_text())
    namespace=uuid.uuid5(uuid.NAMESPACE_URL,'resumora-db-tests:canonical:'+user)
    def mapped(text):
        return 'id_'+str(uuid.uuid5(namespace,text))
    def walk(value,key=''):
        if isinstance(value,dict):return {k:walk(v,k) for k,v in value.items()}
        if isinstance(value,list):
            if key.endswith('Ids') or key=='sectionOrder':return [mapped(v) if v is not None else None for v in value]
            return [walk(v) for v in value]
        if isinstance(value,str):
            if key=='confirmationActor':return 'id_'+user
            if (key=='id' or key.endswith('Id')) and key!='conceptId':return mapped(value)
        return value
    value=walk(value)
    value['context']={'kind':'base'}
    # P0-P3 is the factual/manual subset. Prose/interviews/rendering stay P4/P5.
    value['generatedProse']=[];value['generations']=[];value['interviews']=[]
    value['document']['templateVersionId']=None
    for section in value['document']['sections']:section['proseIds']=[]
    return value


class Profiles(unittest.TestCase):
    call=Foundation.call
    setUp=Foundation.setUp

    def publish(self,cv=None,*,key=None,profile=None,revision=0,base_revision=0,confirm=True,error=False):
        cv=cv or canonical_fixture('minimal.json',self.a)
        ids=[c['id'].removeprefix('id_') for c in cv['claims']] if confirm else []
        array="ARRAY["+','.join("'"+c+"'::uuid" for c in ids)+"]::uuid[]"
        result=self.call('save_profile_checkpoint',f"'{key or uid()}',"+("'"+profile+"'" if profile else 'NULL')+f",{revision},{base_revision},{literal(cv)},{array},'2026-10-23'",error=error)
        return result if error else json.loads(result)

    def test_manual_profile_roundtrip_and_server_confirmation(self):
        cv=canonical_fixture('minimal.json',self.a)
        result=self.publish(cv)
        saved=json.loads(DB.sql(f"SELECT canonical_json FROM app.cv_versions WHERE id='{result['baseCvVersionId']}'"))
        self.assertEqual(saved['facts'],cv['facts'])
        self.assertEqual(saved['sources'],cv['sources'])
        self.assertEqual(saved['claims'][0]['confirmationActor'],'id_'+self.a)
        self.assertEqual(saved['claims'][0]['status'],'user_confirmed')
        self.assertEqual(saved['snapshotId'],'id_'+result['baseCvVersionId'])
        self.assertEqual(saved['baseCvId'],'id_'+result['baseDocumentId'])
        self.assertEqual(DB.sql(f"SELECT count(*) FROM app.cv_versions WHERE id='{result['baseCvVersionId']}'",user=self.b,role='authenticated'),'0')

    def test_full_canonical_facts_keep_partial_dates_skills_titles_relations(self):
        cv=canonical_fixture('full-ro.json',self.a)
        result=self.publish(cv)
        saved=json.loads(DB.sql(f"SELECT canonical_json FROM app.cv_versions WHERE id='{result['baseCvVersionId']}'"))
        self.assertEqual(saved['facts'],cv['facts'])
        self.assertEqual(saved['enrichment'],cv['enrichment'])
        self.assertEqual(saved['claimLinks'],cv['claimLinks'])
        self.assertEqual(len(saved['facts']['positioningTitleClaimIds']),2)
        self.assertEqual({s['class'] for s in saved['facts']['skills']},{'professional','technical'})
        self.assertTrue(any(c['kind']=='date' and 'month' not in c['value'] for c in saved['claims']))
        self.assertEqual(DB.sql(f"SELECT count(*) FROM app.entity_revision_entities WHERE tenant_id='{self.wa}'"),str(sum(len(e['skillIds']) for e in cv['facts']['employment'])+len(cv['enrichment'])))

    def test_input_status_does_not_silently_confirm(self):
        error=self.publish(confirm=False,error=True)
        self.assertIn('EXPLICIT_CONFIRMATION_REQUIRED',error)
        self.assertEqual(DB.sql(f"SELECT count(*) FROM app.profile_versions WHERE tenant_id='{self.wa}'"),'0')
        self.assertEqual(DB.sql(f"SELECT count(*) FROM app.idempotency_requests WHERE tenant_id='{self.wa}' AND command_kind='save_profile_checkpoint'"),'0')

    def test_profile_replay_survives_head_advance_and_new_stale_edit_conflicts(self):
        key=uid();cv=canonical_fixture('minimal.json',self.a)
        first=self.publish(cv,key=key)
        second=self.publish(cv,profile=first['profileId'],revision=1,base_revision=1)
        self.assertNotEqual(first['profileVersionId'],second['profileVersionId'])
        self.assertEqual(first,self.publish(cv,key=key))
        self.assertIn('VERSION_CONFLICT',self.publish(cv,profile=first['profileId'],revision=1,base_revision=1,error=True))
        self.assertEqual(DB.sql(f"SELECT count(*) FROM app.profile_versions WHERE tenant_id='{self.wa}'"),'2')

    def test_claim_and_published_versions_are_immutable(self):
        cv=canonical_fixture('minimal.json',self.a);first=self.publish(cv)
        old=DB.sql(f"SELECT canonical_json FROM app.profile_versions WHERE id='{first['profileVersionId']}'")
        cv['claims'][0]['value']='Changed without a replacement claim ID'
        self.assertIn('IMMUTABLE_CLAIM_CONTENT',self.publish(cv,profile=first['profileId'],revision=1,base_revision=1,error=True))
        self.assertEqual(old,DB.sql(f"SELECT canonical_json FROM app.profile_versions WHERE id='{first['profileVersionId']}'"))
        self.assertIn('IMMUTABLE_RECORD',DB.sql(f"UPDATE app.profile_versions SET canonical_json='{{}}' WHERE id='{first['profileVersionId']}'",expect_error=True))

    def test_restore_creates_new_cv_version(self):
        cv=canonical_fixture('minimal.json',self.a);first=self.publish(cv)
        newer=json.loads(self.call('save_cv_checkpoint',f"'{uid()}','{first['baseDocumentId']}',1,'{first['profileVersionId']}',{literal(cv['document'])},'en'"))
        restored=json.loads(self.call('restore_cv_version',f"'{uid()}','{first['baseDocumentId']}',2,'{first['baseCvVersionId']}'"))
        self.assertNotEqual(restored['cvVersionId'],first['baseCvVersionId'])
        self.assertEqual(DB.sql(f"SELECT sequence FROM app.cv_versions WHERE id='{restored['cvVersionId']}'"),'3')
        self.assertEqual(DB.sql(f"SELECT locale FROM app.cv_versions WHERE id='{restored['cvVersionId']}'"),'ro')
        self.assertEqual(DB.sql(f"SELECT locale FROM app.cv_versions WHERE id='{newer['cvVersionId']}'"),'en')

    def test_revoked_support_blocks_new_cv_but_not_historical_read(self):
        cv=canonical_fixture('minimal.json',self.a);first=self.publish(cv)
        self.call('revoke_claim',f"'{uid()}','{cv['claims'][0]['id'].removeprefix('id_')}','Correction needed'")
        error=self.call('save_cv_checkpoint',f"'{uid()}','{first['baseDocumentId']}',1,'{first['profileVersionId']}',{literal(cv['document'])},'ro'",error=True)
        self.assertIn('PROFILE_CONFIRMATION_REVOKED',error)
        self.assertEqual(DB.sql(f"SELECT count(*) FROM app.cv_versions WHERE id='{first['baseCvVersionId']}'",user=self.a,role='authenticated'),'1')

    def test_concurrent_checkpoint_key_publishes_one_graph(self):
        cv=canonical_fixture('minimal.json',self.a);key=uid()
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
            results=list(pool.map(lambda _:self.publish(cv,key=key),range(5)))
        self.assertTrue(all(result==results[0] for result in results))
        self.assertEqual(DB.sql(f"SELECT count(*) FROM app.profile_versions WHERE tenant_id='{self.wa}'"),'1')
        self.assertEqual(DB.sql(f"SELECT count(*) FROM app.cv_versions WHERE tenant_id='{self.wa}'"),'1')

    def test_foreign_claim_cannot_be_inserted_into_a_revision(self):
        first=self.publish();cvb=canonical_fixture('minimal.json',self.b)
        claim_b=cvb['claims'][0]['id'].removeprefix('id_')
        # Owner SQL probes the FK itself; API grants do not mask the integrity test.
        profile_b=uid();DB.sql(f"INSERT INTO app.career_profiles(id,tenant_id,draft_payload,draft_revision,draft_schema_version) VALUES('{profile_b}','{self.wb}','{{}}',0,'canonical-cv-1.0.0')")
        DB.sql(f"INSERT INTO app.claims(id,tenant_id,profile_id,claim_kind,value,content_hash) VALUES('{claim_b}','{self.wb}','{profile_b}','text',{literal('Synthetic')},app.hash_json({literal('Synthetic')}))")
        revision=DB.sql(f"SELECT entity_revision_id FROM app.profile_version_entities WHERE profile_version_id='{first['profileVersionId']}' LIMIT 1")
        self.assertIn('foreign key',DB.sql(f"INSERT INTO app.entity_revision_claims(tenant_id,profile_id,entity_revision_id,field_role,claim_id) VALUES('{self.wa}','{first['profileId']}','{revision}','nameClaimId','{claim_b}')",expect_error=True))

    def test_invalid_dates_titles_contacts_and_unsupported_prose_rejected(self):
        import copy
        cv=canonical_fixture('full-ro.json',self.a)
        invalid=[]
        x=copy.deepcopy(cv);x['facts']['positioningTitleClaimIds'].append(None);invalid.append(x)
        x=copy.deepcopy(cv);next(c for c in x['claims'] if c['kind']=='date')['value']['month']=13;invalid.append(x)
        x=copy.deepcopy(cv);x['document']['sectionOrder'].append(x['document']['sectionOrder'][0]);invalid.append(x)
        x=copy.deepcopy(cv);x['document']['contactIds'].append(next(c['id'] for c in x['facts']['contacts'] if c['visibility']!='export'));invalid.append(x)
        for index,item in enumerate(invalid):
            with self.subTest(index=index):self.assertIn('ERROR',self.publish(item,error=True))


class Workspace(unittest.TestCase):
    call=Foundation.call
    publish=Profiles.publish

    def setUp(self):
        Foundation.setUp(self)
        self.cv=canonical_fixture('minimal.json',self.a)
        self.profile=self.publish(self.cv)


    def item_ids(self,version=None):
        version=version or self.profile['baseCvVersionId']
        return json.loads(DB.sql(f"SELECT coalesce(jsonb_object_agg(claim_id,item_id),'{{}}') FROM (SELECT ec.claim_id,min(i.id::text) item_id FROM app.cv_items i JOIN app.entity_revision_claims ec ON (ec.tenant_id,ec.entity_revision_id)=(i.tenant_id,i.entity_revision_id) WHERE i.cv_version_id='{version}' AND i.selected GROUP BY ec.claim_id)s"))

    def test_section_prose_references_are_rejected_by_all_publication_commands(self):
        import copy
        layout=copy.deepcopy(self.cv['document']);layout['sections'][0]['proseIds']=['id_'+uid()]
        bad=copy.deepcopy(self.cv);bad['document']=layout
        self.assertIn('DEFERRED_FEATURE_NOT_IN_P0_P3',self.publish(bad,profile=self.profile['profileId'],revision=1,base_revision=1,error=True))
        self.assertIn('DEFERRED_FEATURE_NOT_IN_P0_P3',self.call('save_cv_checkpoint',f"'{uid()}','{self.profile['baseDocumentId']}',1,'{self.profile['profileVersionId']}',{literal(layout)},'ro'",error=True))
        self.assertEqual(DB.sql(f"SELECT count(*) FROM app.cv_versions WHERE tenant_id='{self.wa}'"),'1')

    def test_identity_items_support_both_titles_and_respect_selection(self):
        import copy
        title_claims=[]
        for label in ['Platform Engineer','Technical Lead','selected@example.invalid','omitted@example.invalid','private@example.invalid']:
            claim='id_'+uid();title_claims.append(claim)
            self.cv['claims'].append({'id':claim,'kind':'text','value':label,'status':'extracted_unconfirmed','provenanceIds':self.cv['claims'][0]['provenanceIds']})
        self.cv['facts']['positioningTitleClaimIds']=title_claims[:2]
        contacts=[{'id':'id_'+uid(),'kind':'email','valueClaimId':claim,'visibility':'private' if index==2 else 'export'} for index,claim in enumerate(title_claims[2:])]
        self.cv['facts']['contacts']=contacts
        self.cv['document']['contactIds']=[contacts[0]['id']]
        self.profile=self.publish(self.cv,profile=self.profile['profileId'],revision=1,base_revision=1)
        base_saved=json.loads(self.call('save_cv_checkpoint',f"'{uid()}','{self.profile['baseDocumentId']}',2,'{self.profile['profileVersionId']}',{literal(self.cv['document'])},'en'"))
        versions=[self.profile['baseCvVersionId'],base_saved['cvVersionId']]
        for version in versions:
            with self.subTest(version=version):
                items=self.item_ids(version)
                for claim in [self.cv['facts']['nameClaimId']]+title_claims[:3]:self.assertIn(claim.removeprefix('id_'),items)
                for claim in title_claims[3:]:self.assertNotIn(claim.removeprefix('id_'),items)
        hidden=copy.deepcopy(self.cv['document']);next(s for s in hidden['sections'] if s['kind']=='identity')['visible']=False
        hidden_version=json.loads(self.call('save_cv_checkpoint',f"'{uid()}','{self.profile['baseDocumentId']}',3,'{self.profile['profileVersionId']}',{literal(hidden)},'ro'"))['cvVersionId']
        hidden_items=self.item_ids(hidden_version)
        for claim in [self.cv['facts']['nameClaimId']]+title_claims:self.assertNotIn(claim.removeprefix('id_'),hidden_items)
        deselected=copy.deepcopy(self.cv['document']);deselected['contactIds']=[]
        deselected_version=json.loads(self.call('save_cv_checkpoint',f"'{uid()}','{self.profile['baseDocumentId']}',4,'{self.profile['profileVersionId']}',{literal(deselected)},'ro'"))['cvVersionId']
        self.assertNotIn(title_claims[2].removeprefix('id_'),self.item_ids(deselected_version))
        self.assertIn(title_claims[0].removeprefix('id_'),self.item_ids(deselected_version))

    def test_native_duration_matches_existing_precision_union_method(self):
        from datetime import date
        from pathlib import Path
        import importlib.util
        source=Path(__file__).resolve().parents[2]/'research/architecture/duration_bounds_v1.py'
        spec=importlib.util.spec_from_file_location('duration_reference',source);reference=importlib.util.module_from_spec(spec);spec.loader.exec_module(reference)
        roles=[{'id':'role_a','start':{'year':2021,'month':1},'end':{'year':2023,'month':12},'ongoing':False},
               {'id':'role_b','start':{'year':2022,'month':6},'end':None,'ongoing':True},
               {'id':'role_c','start':{'year':2019},'end':{'year':2020},'ongoing':False}]
        expected=reference.duration(roles,date(2026,10,23))
        result=json.loads(DB.sql(f"SELECT app.calculate_duration({literal(roles)},'2026-10-23')"))
        self.assertEqual((result['lowerWholeMonths'],result['upperWholeMonths']),(expected['lowerWholeMonths'],expected['upperWholeMonths']))
        duplicate=json.loads(DB.sql(f"SELECT app.calculate_duration({literal(roles+roles)},'2026-10-23')"))
        self.assertEqual((duplicate['lowerWholeMonths'],duplicate['upperWholeMonths']),(result['lowerWholeMonths'],result['upperWholeMonths']))
        ongoing=next(r for r in result['perRole'] if r['id']=='role_b');self.assertEqual((ongoing['lowerWholeMonths'],ongoing['upperWholeMonths']),(51,52))
        unknown=json.loads(DB.sql(f"SELECT app.calculate_duration({literal([{'id':'unknown','start':None,'end':None,'ongoing':False}])},'2026-10-23')"))
        self.assertEqual(unknown['unknownRoleIds'],['unknown'])
        self.assertEqual(json.loads(self.call('duration_bounds',f"'{self.profile['profileVersionId']}','2026-10-23'"))['lowerWholeMonths'],0)

def suite(database):
    global DB
    DB=database
    result=unittest.TestSuite()
    for cls in [Foundation,Profiles,Workspace]:result.addTests(unittest.defaultTestLoader.loadTestsFromTestCase(cls))
    return result
