import json,urllib.request,hashlib
from pathlib import Path
B='http://127.0.0.1:8601';tid='4576799f-f4c8-4566-a129-47beec0751f7'
def get(p):return json.load(urllib.request.urlopen(B+p))
a=get('/tournaments/'+tid+'/bracket');rs={r['play_unit_id']:r for r in a['results']};units={r['id']:r for r in a['play_units']}
report={'tournamentId':tid,'matchesCompared':0,'resultsCompared':0,'mismatches':[],'examples':[]}
for event in ['MS','WS','MD','WD','XD']:
 p=get('/e/api/page/2026-taipei-open-t029/draws/'+event)
 for seg in p['segments']:
  for rd in seg['rounds']:
   for n in rd['matches']:
    key=n['nodeKey'];report['matchesCompared']+=1
    if key not in units:report['mismatches'].append([key,'missing operator match']);continue
    r=rs.get(key);pr=n.get('result')
    if r and pr:
     report['resultsCompared']+=1
     sets=[[x['sideA'],x['sideB']] for x in (r.get('score') or {}).get('sets',[])]
     if r['winner_side']!=pr['winnerSide'] or sets!=(pr['score'] or []) or r['walkover']!=pr['walkover']:report['mismatches'].append([key,'result'])
     if len(report['examples'])<3:report['examples'].append({'matchId':key,'winner':pr['winnerSide'],'sets':pr['score'],'scheduledDate':n['scheduledDate'],'scheduledTime':n['scheduledTime']})
a2=get('/tournaments/'+tid+'/bracket')
report['stableOperatorSnapshot']=a==a2
report['operatorSnapshotSHA256']=hashlib.sha256(json.dumps(a,sort_keys=True).encode()).hexdigest()
Path('/tmp/sw-final-audit/parity.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
assert report['stableOperatorSnapshot'] and not report['mismatches'] and report['resultsCompared']>0
