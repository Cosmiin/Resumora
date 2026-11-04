"""Coaching session metadata is profile-only; job copies contain applied wording."""
import json
import unittest


def suite(db):
    literal=lambda value:"'"+json.dumps(value).replace("'","''")+"'::jsonb"
    class ExperienceEnrichment(unittest.TestCase):
        def test_freeze_removes_private_session_metadata_and_keeps_empty_sections(self):
            payload={'schemaVersion':'resumora-editor-draft/1','content':{
                'language':'en','roles':[],'optionalSections':[{'id':'languages','kind':'languages','entries':[]}],
                'technicalSkills':[],'professionalSkills':[],'presentation':{'order':[],'hidden':[]},
                'experienceEnrichment':{'role':{'version':1,'editor':{'text':'PRIVATE DRAFT'},'assessment':{'score':100}}},
                'importSkillChoices':{'a':'technicalSkills'},'referenceProse':[{'text':'PRIVATE SOURCE'}],
                'skillReserves':{'technicalSkills':[{'value':'PRIVATE RESERVE'}],'professionalSkills':[]},
                'skillReview':{'operationId':'PRIVATE REQUEST'},
                'skillExclusions':['PRIVATE DELETED SKILL'],
            },'answers':[{'text':'PRIVATE ANSWER'}]}
            result=json.loads(db.sql(f"SELECT app.freeze_job_document('{{}}', {literal(payload)})"))
            self.assertNotIn('experienceEnrichment',result['content'])
            self.assertNotIn('importSkillChoices',result['content'])
            self.assertNotIn('skillReserves',result['content'])
            self.assertNotIn('skillReview',result['content'])
            self.assertNotIn('skillExclusions',result['content'])
            self.assertNotIn('PRIVATE',json.dumps(result))
            self.assertEqual(result['content']['optionalSections'],payload['content']['optionalSections'])
            self.assertEqual(result['answers'],[])
        def test_freeze_keeps_accepted_point_and_strips_its_evidence_archive(self):
            field={'id':'fact','fieldId':'context','value':'Original text','status':'user_confirmed','sourceId':'source'}
            role={'id':'role','context':field,'bullets':[]}
            payload={'schemaVersion':'resumora-editor-draft/1','content':{'language':'en','roles':[role],'optionalSections':[],
              'technicalSkills':[],'professionalSkills':[],'experienceEnrichment':{'role':{'version':1,'pending':{'id':'private'}}},
              'presentation':{'order':[],'hidden':[],'approvedWording':{'role':{'text':'Accepted point.','scope':'experience','origin':'ai_generated','sources':[{'id':'fact','text':'Original text','sourceId':'source'}]}}}},'answers':[]}
            result=json.loads(db.sql(f"SELECT app.freeze_job_document('{{}}', {literal(payload)})"))
            self.assertEqual(result['content']['roles'][0]['context']['value'],'Accepted point.')
            self.assertEqual(result['content']['roles'][0]['bullets'],[])
            self.assertNotIn('experienceEnrichment',result['content'])
            self.assertNotIn('approvedWording',result['content']['presentation'])
        def test_internal_freeze_function_remains_unavailable_to_clients(self):
            for role in ['anon','authenticated']:
                self.assertIn('permission denied',db.sql("SELECT app.freeze_job_document('{}','{}')",role=role,expect_error=True))
        def test_freeze_selects_reserve_ids_only_when_explicitly_selected(self):
            skill=lambda id,label:{'id':id,'fieldId':id,'value':label,'status':'user_authored','sourceId':'manual','skillOrigin':'self_declared'}
            content={'language':'en','roles':[],'optionalSections':[],'technicalSkills':[skill('sql','SQL')],
                     'professionalSkills':[],'skillReserves':{'technicalSkills':[skill('python','Python')],'professionalSkills':[]},
                     'skillReview':{'operationId':'pending'},'presentation':{'order':[],'hidden':[]}}
            payload={'schemaVersion':'resumora-editor-draft/1','content':content,'answers':[]}
            selected={'presentation':{'technicalSkillIds':['python']}}
            result=json.loads(db.sql(f"SELECT app.freeze_job_document({literal(selected)}, {literal(payload)})"))
            self.assertEqual([f['value'] for f in result['content']['technicalSkills']],['Python'])
            self.assertEqual(result['content']['technicalSkills'][0]['skillOrigin'],'self_declared')
            plain=json.loads(db.sql(f"SELECT app.freeze_job_document('{{}}', {literal(payload)})"))
            self.assertEqual([f['value'] for f in plain['content']['technicalSkills']],['SQL'])
            self.assertNotIn('skillReserves',result['content'])
    return unittest.defaultTestLoader.loadTestsFromTestCase(ExperienceEnrichment)
