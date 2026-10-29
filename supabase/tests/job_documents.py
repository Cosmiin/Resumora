"""Real, disposable PostgreSQL behavior for job-scoped editor document adapter B."""
import concurrent.futures
import copy
import json
import subprocess
import unittest
import uuid


def suite(db):
    uid = lambda: str(uuid.uuid4())
    literal = lambda v: "'" + json.dumps(v).replace("'", "''") + "'::jsonb"

    def source_fixture():
        def fact(key, value):
            return dict(id=key, fieldId=key+'-field', value=value, status='user_authored', sourceId='manual')
        date = dict(year='2020', month='')
        role = dict(id='role', title=fact('title', 'Engineer'), company=fact('company', 'Source company'),
                    location=fact('location', ''), start=fact('start', date), end=fact('end', date),
                    ongoing=fact('ongoing', True), context=fact('context', 'Maintained PLC systems'),
                    bullets=[fact('bullet', 'Reduced downtime')])
        content = dict(id='base-editor', language='en', name=fact('name', 'Synthetic user'),
                       titles=[fact('position1', 'Engineer'), fact('position2', '')], contacts=[],
                       summary=dict(id='summary', text='Original summary', origin='user_authored', approval='approved', claimIds=[]),
                       professionalSkills=[], technicalSkills=[], roles=[role], education=[], optionalSections=[],
                       sources=[dict(id='manual', kind='manual', label='Manual source')], referenceProse=[],
                       presentation=dict(order=['identity', 'summary', 'professionalSkills', 'technicalSkills', 'experience', 'education'],
                                         hidden=[], templateVersionId='future-template-v9'))
        return dict(schemaVersion='resumora-editor-draft/1', content=content, answers=[
            dict(id='answer', targetId='role', question='impact', questionText='Exact question?', text='Exact answer',
                 status='confirmed', sourceId='manual', cvFieldId='context-field')])

    class JobDocuments(unittest.TestCase):
        def setUp(self):
            self.a, self.b = uid(), uid()
            db.sql(f"INSERT INTO auth.users(id) VALUES ('{self.a}'),('{self.b}')")
            self.source = source_fixture()
            self.base = self.jsoncall('save_base_draft', f"'{uid()}',0,{literal(self.source)},'autosave'")
            self.foreign_base = self.jsoncall('save_base_draft', f"'{uid()}',0,{literal(self.source)},'autosave'", user=self.b)
            self.job1, self.job2 = self.job(), self.job()
            self.foreign_job = self.job(user=self.b, snapshot=self.foreign_base)
            self.payload = self.payload_for(self.job1)

        def call(self, name, args='', user=None, error=False, role='authenticated'):
            return db.sql(f'SELECT app.{name}({args})', user=user or self.a, role=role, expect_error=error)

        def jsoncall(self, *args, **kwargs):
            result = self.call(*args, **kwargs)
            return json.loads(result) if result else None

        def job(self, user=None, snapshot=None):
            snap = snapshot or self.base
            return self.jsoncall('save_target_job', f"'{uid()}','{snap['id']}',1,'{{\"text\":\"PLC systems required\",\"title\":\"Engineer\",\"company\":\"Synthetic employer\"}}','[]'", user=user)

        def payload_for(self, job):
            pin = self.jsoncall('job_editor_context', f"'{job['id']}'")['job']
            return dict(schemaVersion='resumora-job-editor/1', acceptance='accepted',
                        source=dict(snapshotId=self.base['id'], revision=1), job=pin,
                        selectedFacts=[dict(entityId='role',fieldId='context-field',valueId='context',sourceId='manual'),
                                       dict(entityId='role',fieldId='bullet-field',valueId='bullet',sourceId='manual')],
                        selectedAnswerIds=['answer'], wording=[dict(targetId='role',text='Maintained PLC systems and reduced downtime.',
                        origin='ai_generated',acceptance='accepted',valueIds=['context','bullet'],answerIds=['answer'])],
                        presentation={},localAdditions=[])

        def save(self, payload=None, doc=None, revision=0, key=None, job=None, user=None, error=False):
            args = f"'{key or uid()}','{job or self.job1['id']}'," + (f"'{doc}'" if doc else 'NULL') + f",{revision},{literal(payload or self.payload)}"
            return self.call('save_job_editor', args, user=user, error=True) if error else self.jsoncall('save_job_editor', args, user=user)

        def history(self, job, doc, cursor='NULL', limit=20, user=None):
            return self.jsoncall('job_editor_history', f"'{job}','{doc}',{cursor},{limit}", user=user)

        def restore(self, saved, version, revision, key=None, job=None, error=False):
            args=f"'{key or uid()}','{job or self.job1['id']}','{saved['documentId']}',{revision},'{version}'"
            return self.call('restore_job_editor', args, error=True) if error else self.jsoncall('restore_job_editor', args)

        def test_two_job_documents_history_restore_preserve_base_and_sources(self):
            first = self.save()
            p2 = self.payload_for(self.job2); p2['wording'][0]['text'] = 'Independent employer wording'
            second_job = self.save(p2, job=self.job2['id'])
            p3 = copy.deepcopy(self.payload); p3['wording'][0]['text'] = 'Revised accepted wording'
            p3['localAdditions'] = [dict(id='job_local_skill', targetId='technicalSkills', kind='technicalSkill',text='SQL',scope='job-only',origin='user_authored')]
            second = self.save(p3, first['documentId'], 1)
            restored = self.restore(first, first['id'], 2)
            self.assertEqual(restored['revision'],3)
            self.assertEqual(restored['restoredFrom'], first['id'])
            self.assertEqual(restored['parentId'],second['id'])
            self.assertEqual(restored['payload'],first['payload'])
            self.assertEqual(restored['sourcePayload'],self.source)
            self.assertEqual(self.history(self.job1['id'], first['documentId']), [restored,second,first])
            self.assertEqual(self.history(self.job2['id'], second_job['documentId']), [second_job])
            self.assertEqual(self.jsoncall('load_job_editor', f"'{self.job2['id']}'"), second_job)
            self.assertEqual(self.jsoncall('load_base_draft'), self.base)
            self.assertEqual(self.jsoncall('base_draft_history'), [self.base])
            # Persistence is neither confirmation, canonical publication nor paid work.
            for table in ['profile_versions','confirmation_events','cv_versions','ai_enhancement_operations','ai_enhancement_attempts']:
                self.assertEqual(db.sql(f"SELECT count(*) FROM app.{table} WHERE tenant_id=(SELECT id FROM app.tenants WHERE owner_user_id='{self.a}')"), '0')

        def test_replay_mismatch_stale_save_restore_and_request_expiry(self):
            key=uid(); first=self.save(key=key)
            second=self.save(doc=first['documentId'],revision=1)
            self.assertEqual(self.save(key=key),first)
            self.assertIn('IDEMPOTENCY_BODY_MISMATCH', self.save(key=key,revision=1,error=True))
            changed=copy.deepcopy(self.payload); changed['wording'][0]['text']='Changed body'
            self.assertIn('IDEMPOTENCY_BODY_MISMATCH',self.save(changed,key=key,error=True))
            self.assertIn('VERSION_CONFLICT',self.save(doc=first['documentId'],revision=1,error=True))
            self.assertIn('VERSION_CONFLICT',self.restore(first,first['id'],1,error=True))
            restore_key=uid(); restored=self.restore(first,first['id'],2,key=restore_key)
            self.assertEqual(self.restore(first,first['id'],2,key=restore_key),restored)
            db.sql(f"UPDATE app.idempotency_requests SET expires_at=now()-interval '1 day' WHERE result_refs->>'id'='{first['id']}'")
            self.assertIn('REQUEST_EXPIRED',self.save(key=key,error=True))
            self.assertEqual(len(self.history(self.job1['id'],first['documentId'])),3)

        def test_concurrent_create_save_restore_exact_replay(self):
            key=uid()
            with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
                created=list(pool.map(lambda _: self.save(key=key),range(4)))
            self.assertTrue(all(row==created[0] for row in created))
            first=created[0]
            def contender(index):
                try:
                    if index % 2:
                        return self.restore(first,first['id'],1)
                    return self.save(doc=first['documentId'],revision=1)
                except AssertionError as e:
                    return str(e)
            with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
                rows=list(pool.map(contender,range(4)))
            self.assertEqual(sum(isinstance(r,dict) for r in rows),1)
            self.assertTrue(all(isinstance(r,dict) or 'VERSION_CONFLICT' in r for r in rows))
            self.assertEqual(len(self.history(self.job1['id'],first['documentId'])),2)

        def test_foreign_job_snapshot_document_version_source_and_anonymous_denied(self):
            first=self.save(); second=self.save(self.payload_for(self.job2), job=self.job2['id'])
            self.assertIn('SNAPSHOT_NOT_FOUND', self.save(job=self.foreign_job['id'],error=True))
            foreign=copy.deepcopy(self.payload); foreign['source']['snapshotId']=self.foreign_base['id']
            self.assertIn('SNAPSHOT_NOT_FOUND',self.save(foreign,doc=first['documentId'],revision=1,error=True))
            foreign=copy.deepcopy(self.payload); foreign['selectedFacts'][0]['sourceId']='foreign'
            self.assertIn('INVALID_EDITOR_PAYLOAD',self.save(foreign,doc=first['documentId'],revision=1,error=True))
            self.assertIn('SNAPSHOT_NOT_FOUND',self.save(doc=second['documentId'],revision=1,error=True))
            self.assertIn('SNAPSHOT_NOT_FOUND',self.restore(first,second['id'],1,error=True))
            self.assertIsNone(self.jsoncall('load_job_editor',f"'{self.job1['id']}'",user=self.b))
            self.assertEqual(self.history(self.job1['id'],first['documentId'],user=self.b),[])
            self.assertIsNone(self.jsoncall('load_job_editor',f"'{self.job1['id']}','{first['documentId']}','{second['id']}'"))
            self.assertEqual(self.history(self.job2['id'],first['documentId']),[])
            self.assertIn('permission denied',db.sql('SELECT app.job_editor_context(NULL)',role='anon',expect_error=True))
            self.assertIn('AUTHENTICATION_REQUIRED',db.sql('SELECT app.job_editor_context(NULL)',role='authenticated',expect_error=True))
            for query in ['SELECT * FROM app.job_editor_versions','SELECT * FROM app.job_editor_documents',
                          'SELECT app.write_job_editor(NULL,NULL,NULL,0,NULL,NULL,false)']:
                self.assertIn('permission denied',db.sql(query,user=self.a,role='authenticated',expect_error=True))
            self.assertIn('IMMUTABLE_RECORD',db.sql(f"UPDATE app.job_editor_versions SET revision=99 WHERE id='{first['id']}'",expect_error=True))

        def test_only_accepted_scoped_wording_and_job_local_manual_additions(self):
            cases=[]
            def add(mutate):
                bad=copy.deepcopy(self.payload); mutate(bad); cases.append(bad)
            add(lambda p:p['wording'][0].update(text='\t\n'))
            add(lambda p:p.update(acceptance='pending'))
            add(lambda p:p['wording'][0].update(acceptance='pending'))
            add(lambda p:p['wording'][0].update(title='CEO'))
            add(lambda p:p['wording'][0].update(targetId='title-field'))
            add(lambda p:p['wording'][0].update(valueIds=['title']))
            add(lambda p:p['wording'][0].update(valueIds=['start']))
            add(lambda p:p['wording'][0].update(valueIds=[],answerIds=[]))
            add(lambda p:p['wording'][0].update(answerIds=['foreign']))
            add(lambda p:p['selectedFacts'][0].update(entityId='foreign'))
            add(lambda p:p['selectedFacts'][0].update(valueId='foreign'))
            add(lambda p:p['selectedFacts'].append(p['selectedFacts'][0]))
            add(lambda p:p['wording'].append(p['wording'][0]))
            add(lambda p:p['presentation'].update(approvedWording={'role':dict(text='Unreviewed')}))
            add(lambda p:p['presentation'].update(contributionHtml={'role':'Unreviewed'}))
            add(lambda p:p['presentation'].update(order=['foreign']))
            add(lambda p:p.update(localAdditions=[dict(id='job_local_one',targetId='identity',kind='title',text='CEO',scope='job-only',origin='user_authored')]))
            add(lambda p:p.update(localAdditions=[dict(id='job_local_one',targetId='technicalSkills',kind='technicalSkill',text='SQL',scope='career',origin='user_authored')]))
            for bad in cases:
                self.assertIn('INVALID_EDITOR_PAYLOAD',self.save(bad,error=True))
            good=copy.deepcopy(self.payload)
            good['localAdditions']=[dict(id='job_local_one',targetId='role',kind='bullet',text='Local fact',scope='job-only',origin='user_authored')]
            self.assertEqual(self.save(good)['payload'],good)
            self.assertEqual(self.jsoncall('load_base_draft'),self.base)

        def test_source_snapshot_is_explicit_and_pinned_not_latest_base(self):
            first=self.save()
            later_source=copy.deepcopy(self.source); later_source['answers'][0]['text']='Later career answer'
            later=self.jsoncall('save_base_draft',f"'{uid()}',1,{literal(later_source)},'autosave'")
            saved=self.save(doc=first['documentId'],revision=1)
            self.assertEqual(saved['sourcePayload']['answers'][0]['text'],'Exact answer')
            mismatch=copy.deepcopy(self.payload); mismatch['source']=dict(snapshotId=later['id'],revision=2)
            self.assertIn('VERSION_CONFLICT',self.save(mismatch,doc=first['documentId'],revision=2,error=True))
            mismatch=copy.deepcopy(self.payload); mismatch['source']['revision']=2
            self.assertIn('SNAPSHOT_NOT_FOUND',self.save(mismatch,doc=first['documentId'],revision=2,error=True))
            self.assertEqual(self.jsoncall('load_base_draft'),later)

        def test_job_fingerprint_and_review_version_fence_stale_acceptance_and_restore(self):
            first=self.save()
            reviewed=self.jsoncall('review_target_job',f"'{uid()}','{self.job1['id']}','Engineer','Reviewed employer','[]'")
            self.assertIn('VERSION_CONFLICT',self.save(doc=first['documentId'],revision=1,error=True))
            self.assertIn('VERSION_CONFLICT',self.restore(first,first['id'],1,error=True))
            fresh=self.payload_for(reviewed); updated=self.save(fresh,doc=first['documentId'],revision=1)
            self.assertEqual(updated['payload']['job']['versionId'], reviewed['versionId'])
            wrong=copy.deepcopy(fresh); wrong['job']['fingerprint']='0'*64
            self.assertIn('VERSION_CONFLICT',self.save(wrong,doc=first['documentId'],revision=2,error=True))

        def test_history_pagination_owned_version_lookup_and_limits(self):
            first=self.save()
            for revision in range(1,4):
                self.save(doc=first['documentId'],revision=revision)
            one=self.history(self.job1['id'],first['documentId'],limit=2)
            two=self.history(self.job1['id'],first['documentId'],cursor=one[-1]['revision'],limit=2)
            self.assertEqual([r['revision'] for r in one+two],[4,3,2,1])
            self.assertEqual(self.jsoncall('load_job_editor',f"'{self.job1['id']}','{first['documentId']}','{first['id']}'"), first)
            self.assertIn('INVALID_COMMAND_ENVELOPE',self.call('job_editor_history',f"'{self.job1['id']}','{first['documentId']}',NULL,21",error=True))
            self.assertIn('INVALID_COMMAND_ENVELOPE',self.call('job_editor_history',f"'{self.job1['id']}','{first['documentId']}',0,20",error=True))

        def test_delete_and_account_revocation_fence_replay_without_deleting_career_knowledge(self):
            key=uid(); first=self.save(key=key); deletion_key=uid()
            args=f"'{deletion_key}','{self.job1['id']}','{first['documentId']}',1"
            self.assertEqual(self.jsoncall('delete_job_editor',args),dict(documentId=first['documentId'],deleted=True))
            self.assertEqual(self.jsoncall('delete_job_editor',args),dict(documentId=first['documentId'],deleted=True))
            self.assertIsNone(self.jsoncall('load_job_editor',f"'{self.job1['id']}'"))
            self.assertEqual(self.history(self.job1['id'],first['documentId']),[])
            self.assertIn('SNAPSHOT_NOT_FOUND',self.save(key=key,error=True))
            self.assertIn('SNAPSHOT_NOT_FOUND',self.restore(first,first['id'],1,error=True))
            self.assertEqual(self.jsoncall('load_base_draft'),self.base)
            replacement=self.save(); self.assertNotEqual(first['documentId'],replacement['documentId'])
            db.sql(f"UPDATE app.tenant_memberships SET state='revoked' WHERE user_id='{self.a}'")
            self.assertIn('ACTIVE_WORKSPACE_REQUIRED',self.save(doc=replacement['documentId'],revision=1,error=True))
            self.assertIn('ACTIVE_WORKSPACE_REQUIRED',self.call('load_job_editor',f"'{self.job1['id']}'",error=True))

        def test_account_deletion_rejects_write_restore_and_replay(self):
            key=uid(); first=self.save(key=key)
            self.call('request_deletion',f"'{uid()}'")
            self.assertIn('ACTIVE_WORKSPACE_REQUIRED',self.save(key=key,error=True))
            self.assertIn('ACTIVE_WORKSPACE_REQUIRED',self.restore(first,first['id'],1,error=True))

        def test_races_waiting_save_is_fenced_by_committed_membership_revocation(self):
            first=self.save()
            workspace=db.sql(f"SELECT id FROM app.tenants WHERE owner_user_id='{self.a}'")
            self.race_fence(f"UPDATE app.tenant_memberships SET state='revoked' WHERE tenant_id='{workspace}'", first, 'RESOURCE_FORBIDDEN')

        def test_races_waiting_save_is_fenced_by_committed_account_deletion(self):
            first=self.save()
            workspace=db.sql(f"SELECT id FROM app.tenants WHERE owner_user_id='{self.a}'")
            self.race_fence(f"UPDATE app.tenants SET state='deleting' WHERE id='{workspace}'", first, 'RESOURCE_FORBIDDEN')

        def test_races_waiting_save_is_fenced_by_deleted_document(self):
            first=self.save()
            self.race_fence(f"UPDATE app.job_editor_documents SET deleted_at=now() WHERE id='{first['documentId']}'",first,'SNAPSHOT_NOT_FOUND')

        def test_races_waiting_save_is_fenced_by_deleted_photo(self):
            secret='synthetic-job-race-photo-worker-secret-32chars'
            db.sql("INSERT INTO app.photo_worker_config VALUES(true,sha256(convert_to('"+secret+"','UTF8'))) ON CONFLICT(singleton) DO NOTHING")
            asset=uid()
            self.call('reserve_photo',f"'{asset}','{'a'*64}',500,500,1000,'{secret}'")
            self.call('finish_photo',f"'{asset}','{secret}'")
            payload=copy.deepcopy(self.payload)
            payload['presentation']['photo']=dict(assetId=asset,crop=dict(version=1,centerX=.5,centerY=.5,zoom=1),shape='circle',visible=True)
            first=self.save(payload)
            self.race_fence(f"UPDATE app.photo_assets SET state='purge_pending' WHERE id='{asset}'",first,'PHOTO_NOT_AVAILABLE',payload)

        def race_fence(self, mutation, first, expected, payload=None):
            # Hold an actual row lock with an uncommitted revocation. The save
            # must wait for that transaction, then observe its committed fence.
            process=subprocess.Popen(db.command(),stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=db.env,text=True,bufsize=1)
            try:
                process.stdin.write('BEGIN; '+mutation+"; SELECT 'locked';\n")
                process.stdin.flush()
                self.assertEqual(process.stdout.readline().strip(),'locked')
                with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                    future=pool.submit(self.save,payload,first['documentId'],1,None,None,None,True)
                    # Prove the save reached a DB lock wait before releasing the
                    # mutator, so this tests a race rather than a sequential denial.
                    import time
                    deadline=time.monotonic()+5
                    while time.monotonic()<deadline:
                        waiting=db.sql("SELECT count(*) FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE 'SELECT app.save_job_editor(%'")
                        if int(waiting)>0:
                            break
                        time.sleep(.01)
                    else:
                        process.stdin.write('ROLLBACK;\n');process.stdin.flush()
                        self.fail('Save did not reach the expected lock wait')
                    process.stdin.write('COMMIT;\n');process.stdin.flush()
                    self.assertIn(expected,future.result(timeout=10))
                self.assertEqual(db.sql(f"SELECT count(*) FROM app.job_editor_versions WHERE document_id='{first['documentId']}'"),'1')
            finally:
                process.stdin.close()
                process.wait(timeout=10)
                process.stdout.close();process.stderr.close()

        def test_photo_owner_ready_state_inheritance_override_retention_and_restore(self):
            secret='synthetic-job-photo-worker-secret-32chars'
            db.sql("INSERT INTO app.photo_worker_config VALUES(true,sha256(convert_to('"+secret+"','UTF8'))) ON CONFLICT(singleton) DO NOTHING")
            def photo(user):
                ident=uid()
                self.call('reserve_photo',f"'{ident}','{'a'*64}',500,500,1000,'{secret}'",user=user)
                self.call('finish_photo',f"'{ident}','{secret}'",user=user)
                return dict(assetId=ident,crop=dict(version=1,centerX=.5,centerY=.5,zoom=1),shape='circle',visible=True)
            owned,foreign=photo(self.a),photo(self.b)
            good=copy.deepcopy(self.payload); good['presentation']['photo']=owned
            first=self.save(good)
            bad=copy.deepcopy(good); bad['presentation']['photo']=foreign
            self.assertIn('PHOTO_NOT_AVAILABLE',self.save(bad,doc=first['documentId'],revision=1,error=True))
            db.sql(f"UPDATE app.photo_assets SET created_at=now()-interval '2 days' WHERE id='{owned['assetId']}'")
            self.assertEqual(self.jsoncall('expire_photo_uploads',f"'{secret}'"),[])
            self.assertEqual(db.sql(f"SELECT photo_asset_id FROM app.job_editor_versions WHERE id='{first['id']}'"),owned['assetId'])
            self.call('delete_photo',f"'{owned['assetId']}',false,'{secret}'")
            self.assertIn('PHOTO_NOT_AVAILABLE',self.restore(first,first['id'],1,error=True))
            no_photo=copy.deepcopy(good); no_photo['presentation']['photo']=None
            self.assertEqual(self.save(no_photo,doc=first['documentId'],revision=1)['payload']['presentation']['photo'],None)
            inherited=photo(self.a); source=copy.deepcopy(self.source); source['content']['presentation']['photo']=inherited
            newer=self.jsoncall('save_base_draft',f"'{uid()}',1,{literal(source)},'autosave'")
            p2=self.payload_for(self.job2);p2['source']=dict(snapshotId=newer['id'],revision=2)
            saved=self.save(p2,job=self.job2['id'])
            self.assertEqual(saved['sourcePayload']['content']['presentation']['photo'],inherited)
            self.assertEqual(db.sql(f"SELECT photo_asset_id FROM app.job_editor_versions WHERE id='{saved['id']}'"),inherited['assetId'])

    return unittest.defaultTestLoader.loadTestsFromTestCase(JobDocuments)
