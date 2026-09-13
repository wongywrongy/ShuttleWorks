"""Audit observations, not regression acceptance: asserts current defects.
Run: PYTHONPATH=tests/backend:apps/api/src .venv/bin/python -u /tmp/sw-final-audit/test_operator_observed.py
Uses disposable SQLite only; no service, invitation or payment connection.
"""
from pathlib import Path
from tempfile import mkdtemp
import json
import sqlite3
from pytest import MonkeyPatch
from _helpers import isolate_test_database, seed_tournament

def main():
    root=Path(mkdtemp(prefix='sw-operator-observed-'))
    monkeypatch=MonkeyPatch()
    isolate_test_database(root,monkeypatch)
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from bracket import brackets
    from workspaces import tournaments, setup
    app=FastAPI()
    for router in (tournaments.router,brackets.router,setup.router): app.include_router(router)
    client=TestClient(app)
    tid=seed_tournament(client,'Disposable score audit')
    base=f'/tournaments/{tid}'
    body={'courts':2,'total_slots':64,'rest_between_rounds':1,'interval_minutes':30,'time_limit_seconds':1.0,'events':[{'id':'MS','discipline':"Men\'s Singles",'format':'se','participants':[{'id':f'P{i}','name':f'Player {i}','seed':i} for i in range(1,5)],'duration_slots':1}]}
    assert client.post(base+'/bracket',json=body).status_code==200
    state=client.get(base+'/bracket').json()
    unit=next(x for x in state['play_units'] if x['round_index']==0)
    score={'sets':[{'sideA':5,'sideB':21},{'sideA':7,'sideB':21}]}
    result=client.post(base+'/bracket/results',json={'play_unit_id':unit['id'],'winner_side':'A','score':score})
    assert result.status_code==200
    state=client.get(base+'/bracket').json()
    saved=next(x for x in state['results'] if x['play_unit_id']==unit['id'])
    final=next(x for x in state['play_units'] if x['round_index']==1)
    assert saved['score']==score and saved['winner_side']=='A'
    assert final['side_a']==unit['side_a']
    correction=client.post(base+'/bracket/results',json={'play_unit_id':unit['id'],'winner_side':'B','score':score})
    assert correction.status_code==409 and correction.json()['detail']=='Result already recorded for this match'
    setup_read=client.get(base+'/setup')
    locked=client.patch(base+'/setup/rules',headers={'If-Match':setup_read.headers.get('etag','0')},json={'pointsPerSet':11})
    assert locked.status_code==409 and locked.json()['detail']['code']=='CONFIG_LOCKED'
    print(json.dumps({'fixture':str(root/'test.db'),'tournament':tid,'score_status':result.status_code,'saved':saved,'advanced_side_a':final['side_a'],'correction':correction.json(),'setup_after_result':locked.json()}))
    iid=seed_tournament(client,'Disposable import audit')
    ibase=f'/tournaments/{iid}/bracket'
    imported={'courts':1,'total_slots':10,'events':[{'id':'MS','participants':[{'id':'a','name':'A','representation':'TPE'},{'id':'b','name':'B','representation':'KOR'}],'rounds':[[{'id':'M1','side_a':['a'],'side_b':['b']}]]}]}
    response=client.post(ibase+'/import',json=imported)
    assert response.status_code==200
    participants=client.get(ibase).json()['events'][0]['participants']
    assert [p['representation'] for p in participants]==[None,None]
    with sqlite3.connect(root/'test.db') as conn:
        rows=conn.execute("select id,meta from bracket_participants where id in ('a','b') order by id").fetchall()
    assert rows==[('a','{}'),('b','{}')]
    print(json.dumps({'import_tournament':iid,'status':response.status_code,'participants':participants,'stored_meta':rows}))
    print('PASS: current defects reproduced; this is NOT a product correctness pass.')

if __name__=='__main__': main()
