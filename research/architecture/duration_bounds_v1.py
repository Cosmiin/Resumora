"""Date-precision discovery helper; distinguishes calendar coverage from elapsed tenure."""
from datetime import date,timedelta
from calendar import monthrange
from pathlib import Path
import json
HERE=Path(__file__).resolve().parent
ASOF=date(2026,10,23)
def bounds(partial):
 if partial is None:return None
 y=partial['year'];m=partial.get('month')
 return (date(y,m,1),date(y,m,monthrange(y,m)[1])) if m else (date(y,1,1),date(y,12,31))
def union(intervals):
 out=[]
 for start,end in sorted((a,b) for a,b in intervals if b>=a):
  if out and start<=out[-1][1]:out[-1][1]=max(end,out[-1][1])
  else:out.append([start,end])
 return out
def whole_months(a,b):return max(0,(b.year-a.year)*12+b.month-a.month-(b.day<a.day))
def display(months):return {'years':months//12,'months':months%12}
def duration(roles,asof=ASOF):
 low=[];high=[];unknown=[];per=[]
 for r in roles:
  s=bounds(r['start']);e=(asof,asof) if r['ongoing'] else bounds(r['end'])
  if not s or not e:unknown.append(r['id']);continue
  earliest_end=min(e[0],asof);latest_end=min(e[1],asof)
  if latest_end<s[0]:raise ValueError('Impossible date chronology')
  lower=(s[1],earliest_end);upper=(s[0],latest_end)
  low.append(lower);high.append(upper)
  lo=whole_months(*lower) if lower[1]>=lower[0] else 0;hi=whole_months(*upper)
  per.append({'id':r['id'],'lowerWholeMonths':lo,'upperWholeMonths':hi,'lowerDisplay':display(lo),'upperDisplay':display(hi),'label':'Estimated completed elapsed months from stated precision; partial days omitted'})
 lo=sum(whole_months(a,b) for a,b in union(low));hi=sum(whole_months(a,b) for a,b in union(high))
 return {'version':'elapsed-date-bounds-1.0','asOf':asof.isoformat(),'lowerWholeMonths':lo,'upperWholeMonths':hi,'lowerDisplay':display(lo),'upperDisplay':display(hi),'perRole':per,'unknownRoleIds':unknown,'convention':'Analyticalearliest/latestdayboundsarenotpersistedfactualdates;unionoverlapsbeforeconvertingtoelapsedcompletedmonths;partialdaysomitted','notComparableTo':'Historicalcalendar-monthcoverage71–94;elapsedtenureisadifferentnamedcalculation,notascoregain','protectedCharacteristicsUsed':False}
def main():
 roles=[{'id':'role_a','start':{'year':2021,'month':1},'end':{'year':2023,'month':12},'ongoing':False},{'id':'role_b','start':{'year':2022,'month':6},'end':None,'ongoing':True},{'id':'role_c','start':{'year':2019},'end':{'year':2020},'ongoing':False}]
 x=duration(roles);dup=duration(roles+roles)
 assert x['lowerWholeMonths']==dup['lowerWholeMonths'] and x['upperWholeMonths']==dup['upperWholeMonths']
 assert next(r for r in x['perRole'] if r['id']=='role_b')['lowerWholeMonths']==51
 assert next(r for r in x['perRole'] if r['id']=='role_b')['upperWholeMonths']==52
 assert x['lowerWholeMonths']<sum(r['lowerWholeMonths'] for r in x['perRole'])
 assert duration([{'id':'unknown','start':None,'end':None,'ongoing':False}])['unknownRoleIds']==['unknown']
 try:duration([{'id':'bad','start':{'year':2025},'end':{'year':2021},'ongoing':False}])
 except ValueError:pass
 else:raise AssertionError('Impossiblechronologyaccepted')
 (HERE/'duration-worked-v1.json').write_text(json.dumps(x,indent=2)+'\n')
 print('PASS6durationguards;total elapsedwholemonths',x['lowerWholeMonths'],x['upperWholeMonths'],'ongoingrole51–52months;notcalendarcoverageorverifiedexactyears')
if __name__=='__main__':main()
