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

    def job_input(self,title='Engineer',company='Synthetic Org'):
        return {'title':title,'company':company,'text':'SQL required. Communication preferred.',
                'requirements':[{'key':'sql','category':'technical','priority':'required',
                  'sourceText':'SQL required.','atoms':[{'operator':'AND','concept':'sql','weightShare':1}]},
                 {'key':'communication','category':'professional','priority':'preferred',
                  'sourceText':'Communication preferred.','atoms':[{'operator':'AND','concept':'communication','weightShare':1}]}]}

    def job(self,body=None,*,job=None,revision=0,key=None,user=None,error=False):
        body=body or self.job_input()
        result=self.call('confirm_job',f"'{key or uid()}',"+(f"'{job}'" if job else 'NULL')+f",{revision},{literal(body)}",user=user,error=error)
        return result if error else json.loads(result)

    def job_cv(self,job,*,document=None,revision=0,tailored=True,key=None,error=False):
        result=self.call('save_job_cv_checkpoint',f"'{key or uid()}',"+(f"'{document}'" if document else 'NULL')+f",{revision},'{self.profile['profileVersionId']}','{job['jobVersionId']}',{literal(self.cv['document'])},'ro',"+('true' if tailored else 'false'),error=error)
        return result if error else json.loads(result)

    def application(self,job,cv=None,*,application=None,revision=0,stage='saved',key=None,error=False):
        result=self.call('save_application',f"'{key or uid()}',"+(f"'{application}'" if application else 'NULL')+f",{revision},'{job['jobVersionId']}',"+(f"'{cv['documentId']}','{cv['cvVersionId']}'" if cv else 'NULL,NULL')+f",'{stage}'",error=error)
        return result if error else json.loads(result)

    def mark(self,application,revision,cv=None,*,key=None,error=False):
        result=self.call('mark_sent',f"'{key or uid()}','{application['applicationId']}',{revision},"+(f"'{cv['cvVersionId']}'" if cv else 'NULL')+',NULL',error=error)
        return result if error else json.loads(result)

    def test_job_review_replay_and_required_preferred_are_separate(self):
        body=self.job_input();key=uid();first=self.job(body,key=key)
        self.assertEqual(first,self.job(body,key=key))
        self.assertEqual(DB.sql(f"SELECT string_agg(priority,',' ORDER BY requirement_key) FROM app.job_requirements WHERE job_version_id='{first['jobVersionId']}'"),'preferred,required')
        self.assertEqual(DB.sql(f"SELECT count(*) FROM app.job_requirements WHERE job_version_id='{first['jobVersionId']}' AND hard_gate"),'0')
        self.assertEqual(DB.sql(f"SELECT count(*) FROM app.job_versions WHERE job_id='{first['jobId']}'"),'1')
        self.assertEqual(DB.sql(f"SELECT count(*) FROM app.job_versions WHERE id='{first['jobVersionId']}'",user=self.b,role='authenticated'),'0')

    def test_review_source_and_atom_weight_validation(self):
        import copy
        body=self.job_input();bad=copy.deepcopy(body);bad['requirements'][0]['sourceText']='Not in original source'
        self.assertIn('REQUIREMENT_SOURCE_NOT_IN_JOB',self.job(bad,error=True))
        bad=copy.deepcopy(body);bad['requirements'][0]['atoms'][0]['weightShare']=.5
        self.assertIn('AND_WEIGHT_SHARES',self.job(bad,error=True))
        bad=copy.deepcopy(body);bad['requirements'].append(copy.deepcopy(bad['requirements'][0]))
        self.assertIn('DUPLICATE_REQUIREMENT',self.job(bad,error=True))
        self.assertEqual(DB.sql(f"SELECT count(*) FROM app.jobs WHERE tenant_id='{self.wa}'"),'0')

    def test_requirement_and_atom_ids_are_server_owned(self):
        import copy
        body=self.job_input()
        for location in ['requirement','atom']:
            bad=copy.deepcopy(body)
            target=bad['requirements'][0] if location=='requirement' else bad['requirements'][0]['atoms'][0]
            target['id']=uid()
            with self.subTest(location=location):
                self.assertIn('INVALID_REQUIREMENT' if location=='requirement' else 'FLAT_REVIEWED_AND_OR',self.job(bad,error=True))
        first=self.job(body);second=self.job(body,job=first['jobId'],revision=1)
        self.assertEqual([q['key'] for q in first['requirements']],[q['key'] for q in second['requirements']])
        for before,after in zip(first['requirements'],second['requirements']):
            self.assertNotEqual(before['requirementId'],after['requirementId'])
            self.assertNotEqual(before['atoms'][0]['atomId'],after['atoms'][0]['atomId'])
            self.assertEqual(DB.sql(f"SELECT requirement_key FROM app.job_requirements WHERE id='{after['requirementId']}'"),after['key'])
            self.assertEqual(DB.sql(f"SELECT requirement_id FROM app.requirement_atoms WHERE id='{after['atoms'][0]['atomId']}'"),after['requirementId'])

    def test_hard_gate_requires_nonblank_basis_in_command_and_table(self):
        for basis in [None,'','   ',' \t\n']:
            for omitted in ([True,False] if basis is None else [False]):
                body=self.job_input();requirement=body['requirements'][0];requirement['hardGate']=True
                if not omitted:requirement['gateBasis']=basis
                with self.subTest(basis=basis,omitted=omitted):
                    self.assertIn('INVALID_JOB_GRAPH',self.job(body,error=True))
        body=self.job_input();body['requirements'][0].update(hardGate=True,gateBasis='Reviewed mandatory SQL condition')
        job=self.job(body);req=next(q for q in job['requirements'] if q['key']=='sql')
        for value in ['NULL',"''","E' \\t\\n'"]:
            with self.subTest(direct=value):
                self.assertIn('ck_job_requirements_2',DB.sql(f"INSERT INTO app.job_requirements SELECT (jsonb_populate_record(NULL::app.job_requirements,to_jsonb(q)||jsonb_build_object('id',gen_random_uuid(),'requirement_key','basis_probe','gate_basis',{value}))).* FROM app.job_requirements q WHERE id='{req['requirementId']}'",expect_error=True))

    def test_job_fractions_reject_rounding_and_out_of_range_values(self):
        for value in [-.0000001,0,.0000001,.9999999,1.0000001]:
            for field in ['priorityFraction','weightShare']:
                body=self.job_input()
                target=body['requirements'][0] if field=='priorityFraction' else body['requirements'][0]['atoms'][0]
                target[field]=value
                with self.subTest(field=field,value=value):
                    self.assertIn('INVALID_PRIORITY_FRACTION' if field=='priorityFraction' else 'INVALID_WEIGHT_SHARE',self.job(body,error=True))
        body=self.job_input();body['requirements'][0]['atoms']=[{'operator':'AND','weightShare':v} for v in [.3333333333,.3333333333,.3333333334]]
        self.assertIn('INVALID_WEIGHT_SHARE',self.job(body,error=True))
        body['requirements'][0]['atoms']=[{'operator':'AND','weightShare':v} for v in [.333333,.333333,.333333]]
        self.assertIn('AND_WEIGHT_SHARES',self.job(body,error=True))
        self.assertEqual(DB.sql(f"SELECT count(*) FROM app.jobs WHERE tenant_id='{self.wa}'"),'0')
        body['requirements'][0]['atoms'][-1]['weightShare']=.333334
        body['requirements'][0]['priorityFraction']=.999999
        job=self.job(body)
        self.assertEqual(DB.sql(f"SELECT sum(weight_share) FROM app.requirement_atoms WHERE requirement_id='{next(q for q in job['requirements'] if q['key']=='sql')['requirementId']}'"),'1.000000')

    def test_restore_linked_and_tailored_job_versions_preserves_historical_inputs(self):
        import copy
        initial_profile=copy.deepcopy(self.profile)
        job=self.job();branches=[self.job_cv(job,tailored=tailored) for tailored in [False,True]]
        old_rows={branch['cvVersionId']:DB.sql(f"SELECT to_jsonb(v) FROM app.cv_versions v WHERE id='{branch['cvVersionId']}'") for branch in branches}
        self.cv['document']['sections'][0]['label']='New layout'
        self.profile=self.publish(self.cv,profile=self.profile['profileId'],revision=1,base_revision=1)
        body=self.job_input();body['title']='Changed target';new_job=self.job(body,job=job['jobId'],revision=1)
        for branch in branches:
            newer=json.loads(self.call('save_job_cv_checkpoint',f"'{uid()}','{branch['documentId']}',1,'{self.profile['profileVersionId']}','{new_job['jobVersionId']}',{literal(self.cv['document'])},'en',"+('false' if branch['tailoringState']=='tailored' else 'true')))
            key=uid();args=f"'{key}','{branch['documentId']}',2,'{branch['cvVersionId']}'"
            restored=json.loads(self.call('restore_cv_version',args))
            self.assertEqual(restored,json.loads(self.call('restore_cv_version',args)))
            self.assertNotIn(restored['cvVersionId'],[branch['cvVersionId'],newer['cvVersionId']])
            row=json.loads(DB.sql(f"SELECT to_jsonb(v) FROM app.cv_versions v WHERE id='{restored['cvVersionId']}'"))
            old=json.loads(old_rows[branch['cvVersionId']])
            for field in ['document_id','profile_version_id','job_version_id','locale','tailoring_state']:
                self.assertEqual(row[field],old[field],field)
            self.assertEqual(row['canonical_json']['document'],old['canonical_json']['document'])
            self.assertEqual(row['parent_version_id'],newer['cvVersionId']);self.assertEqual(row['sequence'],3)
            self.assertEqual(restored['revision'],3);self.assertEqual(restored['restoredFrom'],branch['cvVersionId'])
            self.assertEqual(old_rows[branch['cvVersionId']],DB.sql(f"SELECT to_jsonb(v) FROM app.cv_versions v WHERE id='{branch['cvVersionId']}'"))
            self.assertEqual(DB.sql(f"SELECT head_version_id FROM app.cv_documents WHERE id='{branch['documentId']}'"),restored['cvVersionId'])
        self.assertEqual(DB.sql(f"SELECT head_version_id FROM app.cv_documents WHERE id='{initial_profile['baseDocumentId']}'"),self.profile['baseCvVersionId'])
        self.assertEqual(DB.sql(f"SELECT head_version_id FROM app.career_profiles WHERE id='{self.profile['profileId']}'"),self.profile['profileVersionId'])

    def test_job_restore_preserves_base_snapshot_after_base_only_save(self):
        import copy
        job=self.job();branches=[self.job_cv(job,tailored=tailored) for tailored in [False,True]]
        historical={branch['cvVersionId']:DB.sql(f"SELECT canonical_json FROM app.cv_versions WHERE id='{branch['cvVersionId']}'") for branch in branches}
        layout=copy.deepcopy(self.cv['document']);layout['sections'][0]['label']='Base-only layout edit'
        base=json.loads(self.call('save_cv_checkpoint',f"'{uid()}','{self.profile['baseDocumentId']}',1,'{self.profile['profileVersionId']}',{literal(layout)},'en'"))
        for branch in branches:
            tailored=branch['tailoringState']=='tailored'
            newer=self.job_cv(job,document=branch['documentId'],revision=1,tailored=tailored)
            current=json.loads(DB.sql(f"SELECT canonical_json FROM app.cv_versions WHERE id='{newer['cvVersionId']}'"))
            old=json.loads(historical[branch['cvVersionId']])
            self.assertEqual(current['context']['baseSnapshotId'],'id_'+base['cvVersionId'] if tailored else None)
            key=uid();args=f"'{key}','{branch['documentId']}',2,'{branch['cvVersionId']}'"
            restored=json.loads(self.call('restore_cv_version',args))
            self.assertEqual(restored,json.loads(self.call('restore_cv_version',args)))
            saved=json.loads(DB.sql(f"SELECT canonical_json FROM app.cv_versions WHERE id='{restored['cvVersionId']}'"))
            self.assertEqual(saved['context']['baseSnapshotId'],old['context']['baseSnapshotId'])
            self.assertEqual(saved['context']['baseSnapshotId'],'id_'+self.profile['baseCvVersionId'] if tailored else None)
            self.assertEqual(saved['context']['jobSnapshotId'],old['context']['jobSnapshotId'])
            self.assertEqual(saved['baseCvId'],old['baseCvId']);self.assertEqual(saved['document'],old['document'])
            self.assertEqual(saved['parentSnapshotId'],'id_'+newer['cvVersionId'])
            self.assertNotIn(restored['cvVersionId'],[branch['cvVersionId'],newer['cvVersionId']])
            self.assertEqual(DB.sql(f"SELECT content_hash=app.hash_json(canonical_json-'snapshotId'-'baseCvId'-'version'-'parentSnapshotId'-'createdAt') FROM app.cv_versions WHERE id='{restored['cvVersionId']}'"),'t')
            self.assertEqual(historical[branch['cvVersionId']],DB.sql(f"SELECT canonical_json FROM app.cv_versions WHERE id='{branch['cvVersionId']}'"))
        self.assertEqual(DB.sql(f"SELECT head_version_id FROM app.cv_documents WHERE id='{self.profile['baseDocumentId']}'"),base['cvVersionId'])
        self.assertEqual(DB.sql(f"SELECT head_version_id FROM app.career_profiles WHERE id='{self.profile['profileId']}'"),self.profile['profileVersionId'])

    def test_section_prose_references_are_rejected_by_all_publication_commands(self):
        import copy
        layout=copy.deepcopy(self.cv['document']);layout['sections'][0]['proseIds']=['id_'+uid()]
        bad=copy.deepcopy(self.cv);bad['document']=layout
        self.assertIn('DEFERRED_FEATURE_NOT_IN_P0_P3',self.publish(bad,profile=self.profile['profileId'],revision=1,base_revision=1,error=True))
        self.assertIn('DEFERRED_FEATURE_NOT_IN_P0_P3',self.call('save_cv_checkpoint',f"'{uid()}','{self.profile['baseDocumentId']}',1,'{self.profile['profileVersionId']}',{literal(layout)},'ro'",error=True))
        job=self.job()
        for tailored in ['true','false']:
            self.assertIn('DEFERRED_FEATURE_NOT_IN_P0_P3',self.call('save_job_cv_checkpoint',f"'{uid()}',NULL,0,'{self.profile['profileVersionId']}','{job['jobVersionId']}',{literal(layout)},'ro',{tailored}",error=True))
        self.assertEqual(DB.sql(f"SELECT count(*) FROM app.cv_versions WHERE tenant_id='{self.wa}'"),'1')

    def test_job_cv_does_not_move_base_or_profile(self):
        job=self.job();branch=self.job_cv(job)
        self.assertEqual(branch['tailoringState'],'tailored')
        self.assertEqual(DB.sql(f"SELECT head_version_id FROM app.career_profiles WHERE id='{self.profile['profileId']}'"),self.profile['profileVersionId'])
        self.assertEqual(DB.sql(f"SELECT head_version_id FROM app.cv_documents WHERE id='{self.profile['baseDocumentId']}'"),self.profile['baseCvVersionId'])
        projection=json.loads(DB.sql(f"SELECT canonical_json FROM app.cv_versions WHERE id='{branch['cvVersionId']}'"))
        self.assertEqual(projection['context']['jobSnapshotId'],'id_'+job['jobVersionId'])
        self.assertEqual(projection['context']['baseSnapshotId'],'id_'+self.profile['baseCvVersionId'])
        self.assertEqual(projection['baseCvId'],'id_'+self.profile['baseDocumentId'])

    def test_linked_branch_does_not_claim_tailoring(self):
        job=self.job();branch=self.job_cv(job,tailored=False)
        self.assertEqual(branch['tailoringState'],'not_tailored')
        self.assertEqual(DB.sql(f"SELECT canonical_json#>>'{{context,kind}}' FROM app.cv_versions WHERE id='{branch['cvVersionId']}'"),'base')
        self.assertEqual(self.call('sent_count',''),'0')

    def test_same_tenant_wrong_job_document_or_version_is_rejected(self):
        job1=self.job();job2=self.job();branch1=self.job_cv(job1);branch2=self.job_cv(job2)
        self.assertIn('INVALID_APPLICATION_LINEAGE',self.application(job1,branch2,error=True))
        self.assertIn('JOB_CV_LINEAGE_FORBIDDEN',self.job_cv(job2,document=branch1['documentId'],revision=1,error=True))
        second=self.job_cv(job1)
        mismatched={'documentId':branch1['documentId'],'cvVersionId':second['cvVersionId']}
        self.assertIn('INVALID_APPLICATION_LINEAGE',self.application(job1,mismatched,error=True))
        self.assertIn('foreign key',DB.sql(f"UPDATE app.cv_documents SET head_version_id='{second['cvVersionId']}' WHERE id='{branch1['documentId']}'",expect_error=True))

    def test_explicit_sent_replay_distinct_counter_and_retraction(self):
        job=self.job();cv=self.job_cv(job);app=self.application(job,cv,stage='applied')
        self.assertEqual(self.call('sent_count',''),'0','Stage does not attest an external send')
        key=uid();first=self.mark(app,1,cv,key=key)
        self.assertEqual(first,self.mark(app,1,cv,key=key))
        self.assertEqual(first['sentCount'],1)
        second=self.mark(app,2,cv)
        self.assertEqual(second['sentCount'],1,'Multiple submissions count one application')
        one=json.loads(self.call('retract_sent',f"'{uid()}','{app['applicationId']}',3,'{first['sentEventId']}'"))
        self.assertEqual(one['sentCount'],1)
        two=json.loads(self.call('retract_sent',f"'{uid()}','{app['applicationId']}',4,'{second['sentEventId']}'"))
        self.assertEqual(two['sentCount'],0)
        self.assertEqual(DB.sql(f"SELECT actual_sent_date IS NULL FROM app.application_events WHERE id='{first['sentEventId']}'"),'t')

    def test_sent_cv_stays_fixed_when_latest_content_advances(self):
        job=self.job();first=self.job_cv(job);app=self.application(job,first);sent=self.mark(app,1,first)
        newest=self.job_cv(job,document=first['documentId'],revision=1)
        result=json.loads(self.call('search_applications',"''"))['items'][0]
        self.assertEqual(result['latestCvVersionId'],newest['cvVersionId'])
        self.assertEqual(result['chosenCvVersionId'],first['cvVersionId'])
        self.assertEqual(result['lastSentCvVersionId'],first['cvVersionId'])
        self.assertIsNone(result['latestGenerationId'])
        self.assertEqual(DB.sql(f"SELECT cv_version_id FROM app.application_events WHERE id='{sent['sentEventId']}'"),first['cvVersionId'])

    def test_retraction_must_target_same_application_sent_event(self):
        job=self.job();a=self.application(job);b=self.application(job);sent=self.mark(a,1)
        self.assertIn('RETRACTION_LINEAGE_FORBIDDEN',self.call('retract_sent',f"'{uid()}','{b['applicationId']}',1,'{sent['sentEventId']}'",error=True))
        self.assertEqual(self.call('sent_count',''),'1')

    def test_concurrent_sent_key_and_two_distinct_stale_commands(self):
        job=self.job();app=self.application(job);key=uid()
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
            results=list(pool.map(lambda _:self.mark(app,1,key=key),range(5)))
        self.assertTrue(all(result==results[0] for result in results))
        self.assertEqual(self.call('sent_count',''),'1')
        self.assertIn('VERSION_CONFLICT',self.mark(app,1,error=True))
        self.assertEqual(DB.sql(f"SELECT count(*) FROM app.application_events WHERE application_id='{app['applicationId']}'"),'1')

    def test_search_is_bounded_literal_tenant_scoped_and_separate_from_sent_total(self):
        job=self.job(self.job_input('Platform Engineer','Synthetic Company'));app=self.application(job)
        self.mark(app,1)
        self.call('save_next_action',f"'{uid()}','{app['applicationId']}',NULL,0,'custom','Review interview notes',NULL,'open'")
        self.assertEqual(json.loads(self.call('search_applications',"'interview'"))['resultCount'],1)
        self.assertEqual(json.loads(self.call('search_applications',"'%'"))['resultCount'],0)
        self.assertEqual(json.loads(self.call('search_applications',"'no matches'"))['sentCount'],1)
        self.assertEqual(json.loads(self.call('search_applications',"'Platform'",user=self.b))['resultCount'],0)
        self.assertIn('INVALID_APPLICATION_QUERY',self.call('search_applications',"'',NULL,NULL,NULL,101",error=True))
        self.assertEqual(self.call('sent_count',''),'1','Next actions do not create sent attestations')
        romanian=self.job(self.job_input('Inginer Șef','Organizație Sintetică'));self.application(romanian)
        self.assertEqual(json.loads(self.call('search_applications',"'șEF'"))['resultCount'],1)

    def test_changed_job_is_visible_without_overwriting_historical_cv(self):
        body=self.job_input();job=self.job(body);cv=self.job_cv(job);self.application(job,cv)
        body['title']='Updated role'
        self.job(body,job=job['jobId'],revision=1)
        item=json.loads(self.call('search_applications',"''"))['items'][0]
        self.assertTrue(item['targetChanged'])
        self.assertEqual(item['latestCvVersionId'],cv['cvVersionId'])


class Analysis(unittest.TestCase):
    call=Foundation.call
    publish=Profiles.publish
    job_input=Workspace.job_input
    job=Workspace.job
    job_cv=Workspace.job_cv

    def setUp(self):
        Foundation.setUp(self)
        self.cv=canonical_fixture('minimal.json',self.a)
        self.claims={};self.entities={}
        provenance=self.cv['claims'][0]['provenanceIds']
        for name,label,kind in [('sql','SQL','technical'),('communication','Stakeholder communication','professional'),('attestation','A scoped synthetic authorization attestation',None)]:
            claim='id_'+uid();self.claims[name]=claim.removeprefix('id_')
            self.cv['claims'].append({'id':claim,'kind':'text','value':label,'status':'extracted_unconfirmed','provenanceIds':provenance})
            if kind:
                entity='id_'+uid();self.entities[name]=entity
                self.cv['facts']['skills'].append({'id':entity,'class':kind,'labelClaimId':claim,'conceptId':name,'evidenceClaimIds':[claim]})
                section={'id':'id_'+uid(),'kind':kind+'_skills','label':label,'entryIds':[entity],'proseIds':[],'visible':True}
                self.cv['document']['sections'].append(section);self.cv['document']['sectionOrder'].append(section['id'])
        self.profile=self.publish(self.cv)

    def item_ids(self,version=None):
        version=version or self.profile['baseCvVersionId']
        return json.loads(DB.sql(f"SELECT coalesce(jsonb_object_agg(claim_id,item_id),'{{}}') FROM (SELECT ec.claim_id,min(i.id::text) item_id FROM app.cv_items i JOIN app.entity_revision_claims ec ON (ec.tenant_id,ec.entity_revision_id)=(i.tenant_id,i.entity_revision_id) WHERE i.cv_version_id='{version}' AND i.selected GROUP BY ec.claim_id)s"))

    def evidence(self,job,*,profile=True,cv=True,version=None,classes=None):
        items=self.item_ids(version);rows=[];classes=classes or {}
        for req in job['requirements']:
            key=req['key']
            if key not in self.claims:continue
            for scope in ['profile','cv']:
                if (scope=='profile' and not profile) or (scope=='cv' and not cv):continue
                claim=self.claims[key]
                if scope=='cv' and claim not in items:continue
                row={'atomId':req['atoms'][0]['atomId'],'claimId':claim,'scope':scope,'matchClass':classes.get(key,'demonstrated'),'relation':'exact','explanation':'Explicit synthetic reviewed support'}
                if scope=='cv':row['cvItemId']=items[claim]
                rows.append(row)
        return rows

    def analyse(self,job,evidence,*,gates=None,profile=True,cv_version='default',key=None,error=False):
        version=self.profile['baseCvVersionId'] if cv_version=='default' else cv_version
        profile_arg=f"'{self.profile['profileVersionId']}'" if profile else 'NULL'
        cv_arg=f"'{version}'" if version else 'NULL'
        result=self.call('publish_analysis',f"'{key or uid()}',{profile_arg},{cv_arg},'{job['jobVersionId']}',{literal(evidence)},{literal(gates or [])},'2026-10-23','ro'",error=error)
        return result if error else json.loads(result)

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
        job=self.job({'title':'Title evidence','company':'Synthetic Org','text':'Reviewed titles.',
          'requirements':[{'key':'titles','category':'title','priority':'required','hardGate':True,'gateBasis':'Reviewed title requirement',
           'atoms':[{'operator':'AND','concept':'primary','weightShare':.5},{'operator':'AND','concept':'secondary','weightShare':.5}]}]})
        base_saved=json.loads(self.call('save_cv_checkpoint',f"'{uid()}','{self.profile['baseDocumentId']}',2,'{self.profile['profileVersionId']}',{literal(self.cv['document'])},'en'"))
        versions=[self.profile['baseCvVersionId'],base_saved['cvVersionId']]+[self.job_cv(job,tailored=value)['cvVersionId'] for value in [False,True]]
        for version in versions:
            with self.subTest(version=version):
                items=self.item_ids(version)
                for claim in [self.cv['facts']['nameClaimId']]+title_claims[:3]:self.assertIn(claim.removeprefix('id_'),items)
                for claim in title_claims[3:]:self.assertNotIn(claim.removeprefix('id_'),items)
                rows=[]
                for atom,claim in zip(job['requirements'][0]['atoms'],title_claims[:2]):
                    for scope in ['profile','cv']:
                        row={'atomId':atom['atomId'],'claimId':claim.removeprefix('id_'),'scope':scope,'matchClass':'demonstrated','relation':'exact'}
                        if scope=='cv':row['cvItemId']=items[claim.removeprefix('id_')]
                        rows.append(row)
                result=self.analyse(job,rows,cv_version=version)
                self.assertEqual(result['candidateFit'],100);self.assertEqual(result['cvMatch'],100)
                self.assertEqual(result['eligibility'],'requirements_satisfied')
        hidden=copy.deepcopy(self.cv['document']);next(s for s in hidden['sections'] if s['kind']=='identity')['visible']=False
        hidden_version=json.loads(self.call('save_cv_checkpoint',f"'{uid()}','{self.profile['baseDocumentId']}',3,'{self.profile['profileVersionId']}',{literal(hidden)},'ro'"))['cvVersionId']
        hidden_items=self.item_ids(hidden_version)
        for claim in [self.cv['facts']['nameClaimId']]+title_claims:self.assertNotIn(claim.removeprefix('id_'),hidden_items)
        self.assertIn(self.claims['sql'],hidden_items)
        hidden_row={'atomId':job['requirements'][0]['atoms'][0]['atomId'],'claimId':title_claims[0].removeprefix('id_'),'scope':'cv','matchClass':'demonstrated','relation':'exact'}
        hidden_row['cvItemId']=DB.sql(f"SELECT i.id FROM app.cv_items i JOIN app.entity_revision_claims ec ON (ec.tenant_id,ec.entity_revision_id)=(i.tenant_id,i.entity_revision_id) WHERE i.cv_version_id='{hidden_version}' AND ec.claim_id='{hidden_row['claimId']}'")
        self.assertIn('CLAIM_NOT_REPRESENTED_BY_CV_ITEM',self.analyse(job,[hidden_row],cv_version=hidden_version,error=True))
        deselected=copy.deepcopy(self.cv['document']);deselected['contactIds']=[]
        deselected_version=json.loads(self.call('save_cv_checkpoint',f"'{uid()}','{self.profile['baseDocumentId']}',4,'{self.profile['profileVersionId']}',{literal(deselected)},'ro'"))['cvVersionId']
        self.assertNotIn(title_claims[2].removeprefix('id_'),self.item_ids(deselected_version))
        self.assertIn(title_claims[0].removeprefix('id_'),self.item_ids(deselected_version))

    def test_stored_six_decimal_shares_preserve_full_gate_coverage(self):
        job=self.job({'title':'Conserved shares','company':'Synthetic Org','text':'Three required elements.',
          'requirements':[{'key':'combined','category':'technical','priority':'required','priorityFraction':.999999,'hardGate':True,'gateBasis':'Reviewed combined gate',
            'atoms':[{'operator':'AND','weightShare':share} for share in [.333333,.333333,.333334]]}]})
        rows=[]
        for atom in job['requirements'][0]['atoms']:
            for scope in ['profile','cv']:
                row={'atomId':atom['atomId'],'claimId':self.claims['sql'],'scope':scope,'matchClass':'demonstrated','relation':'exact'}
                if scope=='cv':row['cvItemId']=self.item_ids()[self.claims['sql']]
                rows.append(row)
        result=self.analyse(job,rows)
        self.assertEqual(result['candidateFit'],100);self.assertEqual(result['cvMatch'],100)
        self.assertEqual(result['eligibility'],'requirements_satisfied')
        for value in [-.0000001,.9999999,1.0000001]:
            for scope in ['profile','cv']:
                bad=[dict(row) for row in rows]
                next(row for row in bad if row['scope']==scope)['fulfillment']=value
                with self.subTest(value=value,scope=scope):self.assertIn('INVALID_FULFILLMENT',self.analyse(job,bad,error=True))
        for value,eligibility in [(0,'needs_verification'),(.999999,'needs_verification'),(1,'requirements_satisfied')]:
            result=self.analyse(job,[{**row,'fulfillment':value} for row in rows])
            self.assertEqual(result['eligibility'],eligibility)
            self.assertEqual(result['candidateFitRaw'],result['cvMatchRaw'])
            self.assertAlmostEqual(result['candidateFitRaw'],value*100,places=5)

    def test_weighted_components_and_unavailable_profile_scope(self):
        job=self.job();result=self.analyse(job,self.evidence(job,classes={'communication':'transferable'}))
        self.assertAlmostEqual(result['candidateFitRaw'],(30+5*.4)/35*100,places=5)
        self.assertAlmostEqual(result['cvMatchRaw'],result['candidateFitRaw'],places=6)
        points=sum(c['contribution'] for c in result['components'] if c['key'].startswith('cv:'))
        self.assertAlmostEqual(points,result['cvMatchRaw'],places=5)
        self.assertFalse(result['calibrated']);self.assertEqual(result['readability']['state'],'untested')
        only_cv=self.analyse(job,self.evidence(job,profile=False),profile=False)
        self.assertIsNone(only_cv['candidateFit']);self.assertEqual(only_cv['cvMatch'],100)

    def test_pinned_fingerprint_reuses_normalized_evidence_and_replays(self):
        job=self.job();evidence=self.evidence(job);key=uid()
        first=self.analyse(job,evidence,key=key)
        self.assertEqual(first,self.analyse(job,evidence,key=key))
        second=self.analyse(job,list(reversed(evidence))+[evidence[0]])
        self.assertEqual(first['analysisId'],second['analysisId'])
        self.assertEqual(DB.sql(f"SELECT count(*) FROM app.analysis_runs WHERE tenant_id='{self.wa}'"),'1')
        self.assertEqual(DB.sql(f"SELECT count(*) FROM app.evidence_mappings WHERE tenant_id='{self.wa}'"),'1')

    def test_concurrent_distinct_request_keys_share_one_analysis(self):
        job=self.job();evidence=self.evidence(job)
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
            results=list(pool.map(lambda _:self.analyse(job,evidence),range(5)))
        self.assertEqual(len({r['analysisId'] for r in results}),1)
        self.assertEqual(DB.sql(f"SELECT count(*) FROM app.evidence_mappings WHERE tenant_id='{self.wa}'"),'1')

    def test_selection_changes_cv_only_and_wording_changes_neither_score(self):
        import copy
        job=self.job();layout=copy.deepcopy(self.cv['document'])
        next(s for s in layout['sections'] if s['kind']=='professional_skills')['entryIds']=[]
        omitted=json.loads(self.call('save_cv_checkpoint',f"'{uid()}','{self.profile['baseDocumentId']}',1,'{self.profile['profileVersionId']}',{literal(layout)},'ro'"))
        before=self.analyse(job,self.evidence(job,version=omitted['cvVersionId']),cv_version=omitted['cvVersionId'])
        after=self.analyse(job,self.evidence(job))
        self.assertEqual(before['candidateFit'],after['candidateFit'])
        self.assertLess(before['cvMatch'],after['cvMatch'])
        self.assertTrue(any(r['kind']=='profile_present_cv_omitted' for r in before['recommendations']))
        self.assertTrue(all(r['estimatedDelta'] is None for r in before['recommendations']))
        layout=copy.deepcopy(self.cv['document']);layout['sections'][0]['label']='Renamed section only'
        renamed=json.loads(self.call('save_cv_checkpoint',f"'{uid()}','{self.profile['baseDocumentId']}',2,'{self.profile['profileVersionId']}',{literal(layout)},'en'"))
        cosmetic=self.analyse(job,self.evidence(job,version=renamed['cvVersionId']),cv_version=renamed['cvVersionId'])
        self.assertEqual(after['candidateFit'],cosmetic['candidateFit']);self.assertEqual(after['cvMatch'],cosmetic['cvMatch'])

    def test_authorization_attestation_is_independent_of_semantic_scores(self):
        body=self.job_input();body['text']+=' Authorization required.'
        body['requirements'].append({'key':'work_authorization','category':'qualifications','priority':'required','hardGate':True,'gateKind':'authorization','gateBasis':'Reviewed synthetic noncompensatory condition','sourceText':'Authorization required.','atoms':[{'operator':'AND','weightShare':1}]})
        job=self.job(body);evidence=self.evidence(job);before=self.analyse(job,evidence)
        self.assertEqual(before['eligibility'],'needs_verification')
        requirement=next(q for q in job['requirements'] if q['key']=='work_authorization')
        gate={'requirementId':requirement['requirementId'],'state':'supported','claimId':self.claims['attestation'],'reason':'Explicit synthetic user attestation; not external verification'}
        after=self.analyse(job,evidence,gates=[gate])
        self.assertEqual(after['eligibility'],'requirements_satisfied')
        self.assertEqual(before['candidateFit'],after['candidateFit']);self.assertEqual(before['cvMatch'],after['cvMatch'])
        denied=self.analyse(job,evidence,gates=[{**gate,'state':'confirmed_unmet','reason':'Explicit synthetic contrary attestation'}])
        self.assertEqual(denied['eligibility'],'confirmed_requirement_gap')
        self.assertEqual(after['candidateFit'],denied['candidateFit'])

    def test_credential_equivalence_and_transfer_cannot_satisfy_strict_gate(self):
        for allowed in [False,True]:
            body=self.job_input();body['text']+=' Licence required.'
            body['requirements'].append({'key':'licence','category':'qualifications','priority':'required','hardGate':True,'gateKind':'credential','gateBasis':'Explicit reviewed synthetic licence condition','allowEquivalent':allowed,'allowTransferableEquivalent':allowed,'sourceText':'Licence required.','atoms':[{'operator':'AND','weightShare':1}]})
            job=self.job(body);req=next(q for q in job['requirements'] if q['key']=='licence')
            for relation,match_class in [('approved_equivalent','demonstrated'),('approved_equivalent','transferable'),('transferable','demonstrated'),('transferable','claimed_limited'),('exact','transferable')]:
                rows=self.evidence(job)
                for scope in ['profile','cv']:
                    row={'atomId':req['atoms'][0]['atomId'],'claimId':self.claims['sql'],'scope':scope,'matchClass':match_class,'relation':relation}
                    if scope=='cv':row['cvItemId']=self.item_ids()[self.claims['sql']]
                    rows.append(row)
                for profile,cv_version in [(True,'default'),(True,None),(False,'default')]:
                    scoped=[row for row in rows if (row['scope']=='profile' and profile) or (row['scope']=='cv' and cv_version)]
                    with self.subTest(allowed=allowed,relation=relation,match_class=match_class,profile=profile,cv_version=cv_version):
                        result=self.analyse(job,scoped,profile=profile,cv_version=cv_version)
                        expected='requirements_satisfied' if allowed and match_class=='demonstrated' else 'needs_verification'
                        self.assertEqual(result['eligibility'],expected)
                        for component in result['components']:
                            if component['key'].endswith(req['requirementId']) and not allowed:self.assertEqual(component['contribution'],0)

    def test_mapping_requires_exact_job_and_cv_item_lineage(self):
        import copy
        job=self.job();other=self.job();rows=self.evidence(job)
        bad=copy.deepcopy(rows);bad[0]['atomId']=other['requirements'][0]['atoms'][0]['atomId']
        self.assertIn('EVIDENCE_JOB_LINEAGE_MISMATCH',self.analyse(job,bad,error=True))
        branch=self.job_cv(job);wrong_items=self.item_ids(branch['cvVersionId']);bad=copy.deepcopy(rows)
        next(e for e in bad if e['scope']=='cv')['cvItemId']=next(iter(wrong_items.values()))
        self.assertIn('CLAIM_NOT_REPRESENTED_BY_CV_ITEM',self.analyse(job,bad,error=True))

    def test_revocation_invalidates_current_output_but_keeps_historical_result(self):
        job=self.job();result=self.analyse(job,self.evidence(job));self.assertTrue(result['confirmationValid'])
        self.call('revoke_claim',f"'{uid()}','{self.claims['sql']}','Scoped correction'")
        current=json.loads(self.call('get_analysis',f"'{result['analysisId']}'"))
        self.assertFalse(current['confirmationValid']);self.assertIsNone(current['candidateFit'])
        self.assertEqual(current['historicalResult']['candidateFit'],100)
        self.assertIn('PROFILE_CONFIRMATION_REVOKED',self.analyse(job,self.evidence(job),error=True))

    def test_catalog_and_internal_functions_have_no_client_write_or_bypass(self):
        job=self.job();result=self.analyse(job,self.evidence(job))
        self.assertIn('ANALYSIS_FORBIDDEN',self.call('get_analysis',f"'{result['analysisId']}'",user=self.b,error=True))
        self.assertIn('permission denied',DB.sql('UPDATE app.rule_versions SET config=\'{}\'',user=self.a,role='authenticated',expect_error=True))
        self.assertIn('IMMUTABLE_RULE_VERSION',DB.sql('UPDATE app.rule_versions SET config=\'{}\'',expect_error=True))
        self.assertIn('permission denied',self.call('calculate_scores',f"'{uid()}','{uid()}',true,true",error=True))
        self.assertEqual(DB.sql("SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND c.relkind='r' AND NOT c.relrowsecurity ORDER BY c.relname"),'')

    def test_readiness_is_qualitative_pending_and_scope_checked(self):
        checks={k:{'state':'pending','reason':'Review not completed'} for k in ['content','structure','jobOptimization','writing','application']}
        args=f"'{uid()}','{self.profile['profileVersionId']}','{self.profile['baseCvVersionId']}',NULL,{literal(checks)}"
        result=json.loads(self.call('publish_readiness',args))
        self.assertIsNone(result['numericScore']);self.assertEqual(result['checks']['content']['state'],'pending')
        bad={**checks,'score':100}
        self.assertIn('QUALITATIVE_CATEGORIES_REQUIRED',self.call('publish_readiness',f"'{uid()}','{self.profile['profileVersionId']}',NULL,NULL,{literal(bad)}",error=True))
        job=self.job();checks['jobOptimization']={'state':'not_applicable','reason':'Cannot claim context absence while job exists'}
        self.assertIn('NOT_APPLICABLE_REQUIRES_TRUE_CONTEXT_ABSENCE',self.call('publish_readiness',f"'{uid()}','{self.profile['profileVersionId']}',NULL,'{job['jobVersionId']}',{literal(checks)}",error=True))

    def test_readiness_uses_pinned_job_and_actual_application_context(self):
        import copy
        checks={k:{'state':'pending','reason':'Review not completed'} for k in ['content','structure','jobOptimization','writing','application']}
        def publish(cv_version,job_version=None,*,profile=True,checks=checks,error=False,key=None):
            profile_arg=f"'{self.profile['profileVersionId']}'" if profile else 'NULL'
            cv_arg=f"'{cv_version}'" if cv_version else 'NULL'
            job_arg=f"'{job_version}'" if job_version else 'NULL'
            result=self.call('publish_readiness',f"'{key or uid()}',{profile_arg},{cv_arg},{job_arg},{literal(checks)}",error=error)
            return result if error else json.loads(result)
        absent=copy.deepcopy(checks)
        for category in ['jobOptimization','application']:absent[category]={'state':'not_applicable','reason':'No selected context'}
        for profile,version in [(True,None),(True,self.profile['baseCvVersionId']),(False,self.profile['baseCvVersionId'])]:
            self.assertIsNone(publish(version,profile=profile,checks=absent)['numericScore'])
        other=self.job()
        for tailored in [False,True]:
            job=self.job()
            body=self.job_input();body['title']='Updated target';updated=self.job(body,job=job['jobId'],revision=1)
            cv=self.job_cv(job,tailored=tailored)
            for profile in [False,True]:
                with self.subTest(tailored=tailored,profile=profile):
                    implicit=publish(cv['cvVersionId'],profile=profile)
                    explicit=publish(cv['cvVersionId'],job['jobVersionId'],profile=profile)
                    self.assertEqual(implicit['readinessId'],explicit['readinessId'])
                    saved=json.loads(DB.sql(f"SELECT to_jsonb(r) FROM app.readiness_runs r WHERE id='{implicit['readinessId']}'"))
                    self.assertEqual(saved['job_version_id'],job['jobVersionId'])
                    self.assertEqual(saved['checks']['context'],{'jobVersionId':job['jobVersionId'],'hasApplication':False})
                    bad=copy.deepcopy(checks);bad['jobOptimization']=absent['jobOptimization']
                    self.assertIn('NOT_APPLICABLE_REQUIRES_TRUE_CONTEXT_ABSENCE',publish(cv['cvVersionId'],profile=profile,checks=bad,error=True))
                    no_application=copy.deepcopy(checks);no_application['application']=absent['application']
                    self.assertEqual(publish(cv['cvVersionId'],profile=profile,checks=no_application)['checks']['application']['state'],'not_applicable')
                    for conflict in [other['jobVersionId'],updated['jobVersionId']]:
                        self.assertIn('READINESS_JOB_LINEAGE_MISMATCH',publish(cv['cvVersionId'],conflict,profile=profile,error=True))
            application=Workspace.application(self,updated,cv)
            for profile in [False,True]:
                for supplied_job in [None,job['jobVersionId']]:
                    with self.subTest(attached=True,profile=profile,supplied_job=supplied_job):
                        for category in ['jobOptimization','application']:
                            bad=copy.deepcopy(checks);bad[category]=absent[category]
                            self.assertIn('NOT_APPLICABLE_REQUIRES_TRUE_CONTEXT_ABSENCE',publish(cv['cvVersionId'],supplied_job,profile=profile,checks=bad,error=True))
                        result=publish(cv['cvVersionId'],supplied_job,profile=profile)
                        self.assertEqual(DB.sql(f"SELECT checks#>>'{{context,hasApplication}}' FROM app.readiness_runs WHERE id='{result['readinessId']}'"),'true')
            sent=Workspace.mark(self,application,1,cv)
            Workspace.application(self,updated,application=application['applicationId'],revision=2)
            self.assertIn('NOT_APPLICABLE_REQUIRES_TRUE_CONTEXT_ABSENCE',publish(cv['cvVersionId'],checks=no_application,error=True))
            self.assertEqual(DB.sql(f"SELECT cv_version_id FROM app.application_events WHERE id='{sent['sentEventId']}'"),cv['cvVersionId'])
        no_application=copy.deepcopy(checks);no_application['application']=absent['application']
        self.assertIn('NOT_APPLICABLE_REQUIRES_TRUE_CONTEXT_ABSENCE',publish(None,job['jobVersionId'],checks=no_application,error=True))
        key=uid();first=publish(self.profile['baseCvVersionId'],key=key)
        self.assertEqual(first,publish(self.profile['baseCvVersionId'],key=key))
        self.assertIn('READINESS_JOB_FORBIDDEN',publish(None,uid(),error=True))
        self.assertIn('READINESS_CV_LINEAGE_FORBIDDEN',self.call('publish_readiness',f"'{uid()}',NULL,'{self.profile['baseCvVersionId']}',NULL,{literal(checks)}",user=self.b,error=True))

    def test_applicable_atoms_conserve_scores_and_hard_gates(self):
        cases=[('AND',['not_required','positive'],[.5,.5]),
               ('AND',['not_required','positive','positive'],[.333334,.333333,.333333]),
               ('OR',['not_required','positive','positive'],[1,1,1])]
        for operator,polarities,shares in cases:
            job=self.job({'title':'Applicable criteria','company':'Synthetic Org','text':'Reviewed mixed polarity.',
              'requirements':[{'key':'mixed','category':'technical','priority':'required','hardGate':True,'gateBasis':'Reviewed applicable gate',
                'atoms':[{'operator':operator,'polarity':polarity,'weightShare':share} for polarity,share in zip(polarities,shares)]}]})
            requirement=job['requirements'][0]
            positive=[atom for atom,polarity in zip(requirement['atoms'],polarities) if polarity=='positive']
            for bound in [[],positive[:1],positive]:
                expected=100 if bound and operator=='OR' else 100*len(bound)/len(positive)
                rows=[]
                excluded=[atom for atom,polarity in zip(requirement['atoms'],polarities) if polarity=='not_required']
                for atom in bound+excluded:
                    for scope in ['profile','cv']:
                        row={'atomId':atom['atomId'],'claimId':self.claims['sql'],'scope':scope,'matchClass':'demonstrated','relation':'exact'}
                        if scope=='cv':row['cvItemId']=self.item_ids()[self.claims['sql']]
                        rows.append(row)
                for profile,cv_version in [(True,'default'),(True,None),(False,'default')]:
                    with self.subTest(operator=operator,positive=len(positive),bound=len(bound),profile=profile,cv_version=cv_version):
                        scoped=[row for row in rows if (row['scope']=='profile' and profile) or (row['scope']=='cv' and cv_version)]
                        result=self.analyse(job,scoped,profile=profile,cv_version=cv_version)
                        for field,available in [('candidateFitRaw',profile),('cvMatchRaw',cv_version)]:
                            if available:self.assertAlmostEqual(result[field],expected,places=5)
                            else:self.assertIsNone(result[field])
                        self.assertEqual(result['eligibility'],'requirements_satisfied' if expected==100 else 'needs_verification')
                        if expected==100:self.assertEqual(result['recommendations'],[])
                        gate={'requirementId':requirement['requirementId'],'state':'supported','claimId':self.claims['attestation'],'reason':'Reviewed applicable condition'}
                        supported=self.analyse(job,scoped,profile=profile,cv_version=cv_version,gates=[gate])
                        self.assertEqual(supported['eligibility'],'requirements_satisfied')
                        self.assertEqual(DB.sql(f"SELECT a.polarity FROM app.analysis_runs r JOIN app.match_evidence e ON e.evidence_mapping_id=r.evidence_mapping_id JOIN app.requirement_atoms a ON a.id=e.requirement_atom_id WHERE r.id='{supported['analysisId']}' AND e.evidence_role='eligibility'"),'positive')

    def test_excluded_hard_gates_and_ambiguity_in_both_scopes(self):
        for polarities in [['not_required'],['ambiguous'],['not_required','ambiguous'],['positive','ambiguous']]:
            for gate_kind in ['other','credential','authorization']:
                job=self.job({'title':'Gate applicability','company':'Synthetic Org','text':'Reviewed polarity.',
                  'requirements':[{'key':'polarity','category':'qualifications','priority':'required','hardGate':True,'gateKind':gate_kind,'gateBasis':'Reviewed polarity condition',
                    'atoms':[{'operator':'AND','polarity':polarity,'weightShare':1/len(polarities)} for polarity in polarities]}]})
                requirement=job['requirements'][0]
                for profile,cv_version in [(True,'default'),(True,None),(False,'default')]:
                    with self.subTest(polarities=polarities,gate_kind=gate_kind,profile=profile,cv_version=cv_version):
                        result=self.analyse(job,[],profile=profile,cv_version=cv_version)
                        self.assertIsNone(result['candidateFit']);self.assertIsNone(result['cvMatch']);self.assertEqual(result['components'],[])
                        self.assertEqual(result['eligibility'],'needs_verification' if 'ambiguous' in polarities else 'requirements_satisfied')
                        self.assertEqual(DB.sql(f"SELECT eligibility FROM app.analysis_runs WHERE id='{result['analysisId']}'"),result['eligibility'])
                        for state in ['supported','confirmed_unmet']:
                            gate={'requirementId':requirement['requirementId'],'state':state,'claimId':self.claims['attestation'],'reason':'Reviewed gate assertion'}
                            if 'ambiguous' not in polarities:
                                self.assertIn('GATE_ASSERTION_LINEAGE_MISMATCH',self.analyse(job,[],profile=profile,cv_version=cv_version,gates=[gate],error=True))
                            else:
                                asserted=self.analyse(job,[],profile=profile,cv_version=cv_version,gates=[gate])
                                self.assertEqual(asserted['eligibility'],'confirmed_requirement_gap' if state=='confirmed_unmet' else 'needs_verification')

    def test_needs_verification_is_output_only_for_gate_assertions(self):
        body=self.job_input();body['requirements'][0].update(hardGate=True,gateKind='authorization',gateBasis='Reviewed authorization condition')
        job=self.job(body);requirement=next(q for q in job['requirements'] if q['key']=='sql')
        for profile,cv_version in [(True,'default'),(True,None),(False,'default')]:
            baseline=self.analyse(job,[],profile=profile,cv_version=cv_version)
            self.assertEqual(baseline['eligibility'],'needs_verification')
            count_sql='SELECT jsonb_build_array('+','.join(f"(SELECT count(*) FROM app.{table} WHERE tenant_id='{self.wa}')" for table in ['analysis_runs','evidence_mappings','match_evidence','idempotency_requests','audit_events'])+')'
            before=DB.sql(count_sql)
            for claim in [None,self.claims['attestation']]:
                key=uid();gate={'requirementId':requirement['requirementId'],'state':'needs_verification'}
                if claim:gate.update(claimId=claim,reason='Unused assertion must be rejected')
                with self.subTest(profile=profile,cv_version=cv_version,claim=claim):
                    self.assertIn('INVALID_GATE_ASSERTION',self.analyse(job,[],profile=profile,cv_version=cv_version,gates=[gate],key=key,error=True))
            self.assertEqual(DB.sql(count_sql),before)
            valid=self.analyse(job,[],profile=profile,cv_version=cv_version,key=key)
            self.assertEqual(valid['analysisId'],baseline['analysisId'])
            gate={'requirementId':requirement['requirementId'],'state':'supported','claimId':self.claims['attestation'],'reason':'Reviewed affirmative support'}
            supported=self.analyse(job,[],profile=profile,cv_version=cv_version,gates=[gate])
            self.assertEqual(supported['eligibility'],'requirements_satisfied')
            denied=self.analyse(job,[],profile=profile,cv_version=cv_version,gates=[{**gate,'state':'confirmed_unmet'}])
            self.assertEqual(denied['eligibility'],'confirmed_requirement_gap')
            self.assertIn('check constraint',DB.sql(f"INSERT INTO app.match_evidence SELECT (jsonb_populate_record(NULL::app.match_evidence,to_jsonb(e)||jsonb_build_object('id',gen_random_uuid(),'gate_state','needs_verification'))).* FROM app.match_evidence e JOIN app.analysis_runs r ON r.evidence_mapping_id=e.evidence_mapping_id WHERE r.id='{supported['analysisId']}' AND e.evidence_role='eligibility'",expect_error=True))

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

    def test_saved_ats_math_vectors_match_reference_calculator_with_separate_ids(self):
        # Abstract item_* handles are not canonical FKs. This builds an explicit,
        # separately namespaced synthetic graph for arithmetic regression only.
        from pathlib import Path
        import importlib.util
        source=Path(__file__).resolve().parents[2]/'research/ats'
        vectors=json.loads((source/'fixtures-v1.1.json').read_text())
        spec=importlib.util.spec_from_file_location('ats_reference',source/'score_v1_1.py')
        reference=importlib.util.module_from_spec(spec);spec.loader.exec_module(reference)
        for case_name,vector in vectors.items():
            with self.subTest(case=case_name):
                Foundation.setUp(self)
                namespace=uuid.uuid5(uuid.NAMESPACE_URL,'resumora-db-tests:ats:'+case_name+':'+self.a)
                def mapped(kind,label):return 'id_'+str(uuid.uuid5(namespace,kind+':'+label))
                cv=canonical_fixture('minimal.json',self.a)
                confirmed={c for e in vector['evidence'] if e['claimState'] in reference.CONFIRMED for c in e['claimIds']}
                denial_handles={a['requirementId']:'denial_'+a['requirementId'] for a in vector.get('eligibilityAssertions',[]) if a['state']=='confirmed_unmet'}
                confirmed.update(denial_handles.values())
                selected={c for e in vector['evidence'] if e['scope']=='cv' and e['claimState'] in reference.CONFIRMED and e['documentItemIds'] for c in e['claimIds']}
                provenance=cv['claims'][0]['provenanceIds']
                for handle in sorted(confirmed):
                    claim=mapped('claim',handle);entity=mapped('entity',handle)
                    cv['claims'].append({'id':claim,'kind':'text','value':'Synthetic reviewed evidence: '+handle,'status':'extracted_unconfirmed','provenanceIds':provenance})
                    cv['facts']['optionalEntries'].append({'id':entity,'kind':'custom','labelClaimId':claim,'detailClaimIds':[],'startClaimId':None,'endClaimId':None,'linkClaimIds':[],'metricClaimIds':[]})
                section={'id':mapped('section','synthetic-evidence'),'kind':'custom','label':'Separate ATS arithmetic fixture','entryIds':[mapped('entity',h) for h in sorted(selected)],'proseIds':[],'visible':True}
                cv['document']['sections'].append(section);cv['document']['sectionOrder'].append(section['id'])
                self.cv=cv;self.profile=self.publish(cv)
                requirements=[];key_map={}
                normalized,_=reference.normalize(vector['requirements'])
                for index,q in enumerate(normalized):
                    key='criterion_'+str(index);key_map[q['id']]=key
                    alternatives=q.get('alternatives') or [q['id']]
                    requirements.append({'key':key,'category':q['category'],'priority':q['priority'],'priorityFraction':q.get('priorityFraction',1),
                        'hardGate':q.get('hardGate',False),'gateKind':q.get('gateKind') or 'other',
                        'gateBasis':'Explicit synthetic structured requirement' if q.get('hardGate',False) else None,
                        'allowEquivalent':q.get('allowEquivalent',False),'allowTransferableEquivalent':q.get('allowTransferableEquivalent',False),
                        'atoms':[{'operator':'OR' if q.get('alternatives') else 'AND','concept':alt,'polarity':q.get('polarity','positive'),'weightShare':1} for alt in alternatives]})
                job=self.job({'title':'Separate ATS arithmetic case '+case_name,'company':'Synthetic Vector','text':'Reviewed structured arithmetic requirements, not a live job.','requirements':requirements})
                saved={q['key']:q for q in job['requirements']};items=self.item_ids();rows=[]
                for evidence in vector['evidence']:
                    if evidence['claimState'] not in reference.CONFIRMED or (evidence['scope']=='profile' and vector['versions']['profile'] is None):continue
                    if evidence['scope']=='cv' and not evidence['documentItemIds']:continue
                    requirement=saved[key_map[evidence['requirementId']]]
                    atom=next((a for a in requirement['atoms'] if a['concept']==evidence.get('alternativeId',evidence['requirementId'])),None)
                    if atom is None:continue
                    for claim_handle in evidence['claimIds']:
                        claim=mapped('claim',claim_handle).removeprefix('id_')
                        row={'atomId':atom['atomId'],'claimId':claim,'scope':evidence['scope'],'matchClass':evidence['matchClass'],'relation':evidence['relation'],'fulfillment':evidence.get('fulfillment',1),'explanation':evidence['explanation']}
                        if evidence['scope']=='cv':row['cvItemId']=items[claim]
                        rows.append(row)
                gates=[{'requirementId':saved[key_map[a['requirementId']]]['requirementId'],'state':'confirmed_unmet','claimId':mapped('claim',denial_handles[a['requirementId']]).removeprefix('id_'),'reason':a['reason']} for a in vector.get('eligibilityAssertions',[]) if a['state']=='confirmed_unmet']
                actual=self.analyse(job,rows,gates=gates,profile=vector['versions']['profile'] is not None)
                expected=reference.evaluate(vector)
                self.assertEqual(actual['candidateFit'],expected['candidateFit']['score'])
                self.assertEqual(actual['cvMatch'],expected['cvMatch']['score'])
                self.assertEqual(actual['eligibility'],expected['eligibility']['status'])
                self.assertEqual(actual['sourceMethod'],vector['versions']['rules'])
                self.assertEqual(DB.sql(f"SELECT result_hash=app.hash_json(app.calculate_scores(evidence_mapping_id,rules_version_id,profile_version_id IS NOT NULL,cv_version_id IS NOT NULL)) FROM app.analysis_runs WHERE id='{actual['analysisId']}'"),'t')

    def test_and_or_negation_and_empty_criteria_do_not_create_bonus_points(self):
        for operator,expected in [('AND',50),('OR',100)]:
            with self.subTest(operator=operator):
                job=self.job({'title':'Boolean requirement case','company':'Synthetic Vector','text':'A reviewed Boolean requirement.',
                 'requirements':[{'key':'combined','category':'technical','priority':'required','atoms':[{'operator':operator,'concept':'one','weightShare':.5 if operator=='AND' else 1},{'operator':operator,'concept':'two','weightShare':.5 if operator=='AND' else 1}]}]})
                atom=job['requirements'][0]['atoms'][0]['atomId'];rows=[]
                for scope in ['profile','cv']:
                    row={'atomId':atom,'claimId':self.claims['sql'],'scope':scope,'matchClass':'demonstrated','relation':'exact'}
                    if scope=='cv':row['cvItemId']=self.item_ids()[self.claims['sql']]
                    rows.append(row)
                result=self.analyse(job,rows);self.assertEqual(result['candidateFit'],expected);self.assertEqual(result['cvMatch'],expected)
        for polarity in ['not_required','ambiguous']:
            job=self.job({'title':'Excluded criterion','company':'Synthetic Vector','text':'Reviewed exclusion.',
             'requirements':[{'key':'excluded','category':'technical','priority':'required','atoms':[{'operator':'AND','polarity':polarity,'weightShare':1}]}]})
            for profile,cv_version in [(True,'default'),(True,None),(False,'default')]:
                result=self.analyse(job,[],profile=profile,cv_version=cv_version)
                self.assertIsNone(result['candidateFit']);self.assertIsNone(result['cvMatch'])
                expected='needs_verification' if polarity=='ambiguous' else 'requirements_satisfied'
                self.assertEqual(result['eligibility'],expected)
                self.assertEqual(DB.sql(f"SELECT eligibility FROM app.analysis_runs WHERE id='{result['analysisId']}'"),expected)


def suite(database):
    global DB
    DB=database
    result=unittest.TestSuite()
    for cls in [Foundation,Profiles,Workspace,Analysis]:result.addTests(unittest.defaultTestLoader.loadTestsFromTestCase(cls))
    return result
