"""Draft-2020-12 plus relational invariants. Run with Python and jsonschema>=4.10."""
import json, copy
from pathlib import Path
from jsonschema import Draft202012Validator, FormatChecker
HERE=Path(__file__).resolve().parent
SCHEMA=json.loads((HERE/'schema.json').read_text())
V=Draft202012Validator(SCHEMA,format_checker=FormatChecker())
CONFIRMED={'user_confirmed','externally_verified'}

def validate(cv):
    V.validate(cv)
    all_ids=[]
    def collect(v):
        if isinstance(v,dict):
            if 'id' in v: all_ids.append(v['id'])
            for child in v.values():collect(child)
        elif isinstance(v,list):
            for child in v:collect(child)
    collect(cv)
    assert len(all_ids)==len(set(all_ids)), 'duplicate stable id'
    claims={c['id']:c for c in cv['claims']}
    sources={s['id']:s for s in cv['sources']}
    prov={p['id']:p for p in cv['provenance']}
    for p in prov.values(): assert p['sourceId'] in sources,'dangling source'
    for c in claims.values():
        assert all(p in prov for p in c['provenanceIds']),'dangling provenance'
    def claim(cid,kind=None):
        if cid is None:return
        assert cid in claims,'dangling claim'
        if kind:assert claims[cid]['kind']==kind,'wrong claim kind'
    def walk(v):
        if isinstance(v,dict):
            for k,val in v.items():
                if k.endswith('ClaimId'):claim(val)
                elif k.endswith('ClaimIds') or k=='claimIds':
                    for cid in val:claim(cid)
                walk(val)
        elif isinstance(v,list):
            for val in v:walk(val)
    walk(cv)
    facts=cv['facts']
    claim(facts['nameClaimId'],'text')
    for title in facts['positioningTitleClaimIds']:claim(title,'text')
    for c in facts['contacts']:
        claim(c['valueClaimId'],'location' if c['kind']=='location' else 'text')
    for record in facts['employment']+facts['education']+facts['optionalEntries']:
        for field in ['startClaimId','endClaimId']:claim(record[field],'date')
        for field in ['titleClaimId','companyClaimId','institutionClaimId','qualificationClaimId','fieldClaimId','labelClaimId']:
            if field in record:claim(record[field],'text')
        if 'locationClaimId' in record:claim(record['locationClaimId'],'location')
        for cid in record.get('metricClaimIds',[]):claim(cid,'metric')
        a=claims[record['startClaimId']]['value'] if record['startClaimId'] else None
        b=claims[record['endClaimId']]['value'] if record['endClaimId'] else None
        if a and b:
            assert (a['year'],a.get('month',1)) <= (b['year'],b.get('month',12)), 'impossible date chronology'
    entity_ids={x['id'] for name in ['contacts','skills','employment','education','optionalEntries'] for x in facts[name]}
    for e in cv['enrichment']:assert e['targetEntityId'] in entity_ids,'dangling enrichment target'
    for link in cv['claimLinks']:
        if link['relation']=='metric_of':claim(link['fromClaimId'],'metric')
    for s in facts['skills']:claim(s['labelClaimId'],'text')
    skills={s['id']:s for s in facts['skills']}
    for e in facts['employment']:assert set(e['skillIds'])<=skills.keys(),'dangling skill'
    generations={g['id'] for g in cv['generations']}
    for p in cv['generatedProse']:
        assert p['origin']!='ai_generated' or p['generationId'] in generations,'missing generation provenance'
        if p['approval']=='approved':
            assert all(claims[c]['status'] in CONFIRMED for c in p['claimIds']),'unconfirmed support in approved prose'
    sections={s['id']:s for s in cv['document']['sections']}
    assert set(cv['document']['sectionOrder'])==set(sections),'section order must cover each instance once'
    prose={p['id'] for p in cv['generatedProse']}
    kind_entries={'identity':set(),'summary':set(),'professional_skills':{s['id'] for s in skills.values() if s['class']=='professional'},'technical_skills':{s['id'] for s in skills.values() if s['class']=='technical'},'experience':{e['id'] for e in facts['employment']},'education':{e['id'] for e in facts['education']}}
    for e in facts['optionalEntries']:kind_entries.setdefault(e['kind'],set()).add(e['id'])
    for s in sections.values():
        assert set(s['entryIds'])<=kind_entries.get(s['kind'],set()),'wrong section entry kind'
        assert set(s['proseIds'])<=prose,'dangling prose'
    contacts={c['id']:c for c in facts['contacts']}
    assert set(cv['document']['contactIds'])<=contacts.keys(),'dangling contact'
    assert all(contacts[c]['visibility']=='export' for c in cv['document']['contactIds']),'private contact selected for export'
    ctx=cv['context']
    assert (ctx['kind']=='tailored')==(ctx['baseSnapshotId'] is not None and ctx['jobSnapshotId'] is not None),'tailored lineage required'
    if ctx['kind']=='base':assert not any(ctx[k] for k in ['baseSnapshotId','jobSnapshotId','previousTailoredSnapshotId']),'base has tailored context'
    return True

def export_projection(cv):
    """Privacy/provenance demonstration only; a renderer is not implemented."""
    validate(cv)
    claims={c['id']:c for c in cv['claims']}
    approved=[p for p in cv['generatedProse'] if p['approval']=='approved']
    return {'contacts':[claims[c['valueClaimId']]['value'] for c in cv['facts']['contacts'] if c['id'] in cv['document']['contactIds'] and claims[c['valueClaimId']]['status'] in CONFIRMED], 'prose':[p['text'] for p in approved]}

def main():
    Draft202012Validator.check_schema(SCHEMA)
    for p in sorted((HERE/'fixtures').glob('*.json')):
        if 'workspace' in p.stem:
            continue  # Companion workspace fixtures have a separate versioned contract.
        validate(json.loads(p.read_text()));print('PASS',p.name)
    full=json.loads((HERE/'fixtures/full-ro.json').read_text())
    cases=[]
    def bad(name,mutator):
        c=copy.deepcopy(full);mutator(c);cases.append((name,c))
    bad('month 13',lambda c:c['claims'].append({'id':'claim_bad','kind':'date','value':{'year':2020,'month':13},'status':'extracted_unconfirmed','provenanceIds':['prov_manual']}))
    bad('missing confirmation actor',lambda c:c['claims'][0].pop('confirmationActor'))
    bad('external verification has no method',lambda c:c['claims'][0].update(status='externally_verified'))
    bad('private contact leak',lambda c:c['document']['contactIds'].append('contact_address'))
    bad('duplicate section',lambda c:c['document']['sectionOrder'].append('section_identity'))
    bad('dangling claim',lambda c:c['facts'].update(nameClaimId='claim_missing'))
    bad('ongoing with end',lambda c:c['facts']['employment'][0].update(ongoing=True))
    bad('unconfirmed support',lambda c:c['generatedProse'][0]['claimIds'].append('claim_certifications'))
    bad('missing AI provenance',lambda c:c.update(generations=[]))
    bad('wrong section class',lambda c:next(s for s in c['document']['sections'] if s['kind']=='technical_skills')['entryIds'].append('skill_stakeholder'))
    bad('impossible dates',lambda c:next(x for x in c['claims'] if x['id']=='claim_start_a').update(value={'year':2025}))
    bad('missing source',lambda c:c.update(sources=[]))
    bad('three title slots',lambda c:c['facts']['positioningTitleClaimIds'].append(None))
    bad('tailored lineage',lambda c:c['context'].update(kind='tailored'))
    bad('unknown invented property',lambda c:c.update(inventedExperience=10))
    for name,c in cases:
        try:validate(c)
        except Exception:print('REJECT',name)
        else:raise AssertionError('failed to reject '+name)
    exported=export_projection(full)
    assert 'Strada Sintetică' not in json.dumps(exported,ensure_ascii=False)
    assert len(exported['prose'])==1
    assert full['facts']['employment'][1]['ongoing']
    tail=json.loads((HERE/'fixtures/tailored-en.json').read_text())
    assert tail['document']['sectionOrder'][1]=='section_projects'
    print('PASS privacy projection, pending prose exclusion, concurrent/partial/ongoing dates, bilingual independent ordering')
    print('RESULT: canonical CV fixtures passed; 15 negative cases rejected; schema and relational checks passed')
if __name__=='__main__':main()
