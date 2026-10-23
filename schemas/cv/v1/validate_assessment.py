from pathlib import Path
import json,copy
from jsonschema import Draft202012Validator
HERE=Path(__file__).resolve().parent
schema=json.loads((HERE/'assessment-input-1.1.schema.json').read_text());Draft202012Validator.check_schema(schema);v=Draft202012Validator(schema)
root=HERE.parents[2]
fixtures=json.loads((root/'research/ats/fixtures-v1.1.json').read_text())
for name,x in fixtures.items():
 v.validate(x)
 canonical={r.get('canonicalId',r['id']) for r in x['requirements']}
 assert all(e['requirementId'] in canonical for e in x['evidence'])
 assert all(a['requirementId'] in canonical and a['actor'] and a['sourceId'] for a in x['eligibilityAssertions'])
 assert len({e['id'] for e in x['evidence']})==len(x['evidence'])
 print('PASS assessment',name)
for name,change in [('invalid strength',lambda x:x['evidence'][0].update(matchClass='arbitrary_ai_score')),('missing job evidence',lambda x:x['requirements'][0].update(jobEvidence=[])),('denial without provenance',lambda x:x['eligibilityAssertions'].append({'requirementId':'degree','state':'confirmed_unmet','reason':'Missing','actor':'user_demo'}))]:
 x=copy.deepcopy(fixtures['before']);change(x)
 try:v.validate(x)
 except Exception:print('REJECT',name)
 else:raise AssertionError(name)
print('PASS companion assessment5fixtures +3invalid variants; original CV schema/fixtures retained unchanged')
