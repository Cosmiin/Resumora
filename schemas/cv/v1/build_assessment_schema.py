"""Companion assessment contract1.1; canonical CV schema1.0 stays unchanged."""
from pathlib import Path
import json
HERE=Path(__file__).resolve().parent
s={'type':'string','minLength':1};num={'type':'number','minimum':0,'maximum':1};ids={'type':'array','items':s,'uniqueItems':True}
def obj(p,required=None):return {'type':'object','properties':p,'required':list(p) if required is None else required,'additionalProperties':False}
def arr(x):return {'type':'array','items':x}
def en(*v):return {'enum':list(v)}
versions=obj({k:({'type':['string','null']} if k=='profile' else s) for k in ['profile','document','job','requirements','dictionary','normalizer','matcher','rules','asOf']})
req=obj({'id':s,'canonicalId':s,'category':en('technical','responsibilities','experience','achievements','qualifications','professional','title'),'priority':en('required','unspecified','preferred'),'text':s,'jobEvidence':{'type':'array','items':s,'minItems':1,'uniqueItems':True},'polarity':en('positive','not_required','ambiguous'),'hardGate':{'type':'boolean'},'gateKind':en(None,'credential','authorization','nonnegotiable'),'allowEquivalent':{'type':'boolean'},'allowTransferableEquivalent':{'type':'boolean'},'priorityFraction':{'type':'number','exclusiveMinimum':0,'maximum':1},'alternatives':ids},['id','category','priority','text','jobEvidence','polarity','hardGate','gateKind','allowEquivalent'])
evidence=obj({'id':s,'requirementId':s,'scope':en('profile','cv'),'claimIds':ids,'documentItemIds':ids,'claimState':en('user_confirmed','externally_verified','extracted_unconfirmed','suggested','rejected'),'matchClass':en('demonstrated','claimed_limited','transferable','not_evidenced'),'relation':en('exact','approved_equivalent','transferable','unsupported'),'explanation':s,'fulfillment':num,'alternativeId':s},['id','requirementId','scope','claimIds','documentItemIds','claimState','matchClass','relation','explanation'])
assertion=obj({'requirementId':s,'state':{'const':'confirmed_unmet'},'reason':s,'actor':s,'sourceId':s})
x=obj({'id':s,'versions':versions,'requirements':arr(req),'evidence':arr(evidence),'eligibilityAssertions':arr(assertion)})
x.update({'$schema':'https://json-schema.org/draft/2020-12/schema','$id':'https://schemas.example.invalid/cv/v1/assessment-input-1.1.schema.json','title':'Pinned CV/profile to job assessment input1.1 (separate from canonical CV)'})
(HERE/'assessment-input-1.1.schema.json').write_text(json.dumps(x,indent=2)+'\n')
