#!/usr/bin/env python3
"""Rebuild public/data/legs.json from the DTM heightmap and station coordinates.

For each leg (both directions between station pairs), samples the straight
segment every 10 m with nearest-cell DTM heights, and records cumulative
distance and elevation. Ascent = sum of positive steps (>= net gain by
definition). Verifies the result matches the shipped legs.json.
"""
import json, math

# equidistant-cylindrical Mars CRS (same as app): x = lon*R*pi/180, y = lat*R*pi/180
R = 3396190.0
def to_m(lon, lat):
    return (math.radians(lon) * R, math.radians(lat) * R)

hm = json.load(open('public/data/heightmap.json'))
stations = {s['id']: s for s in json.load(open('src/data/stations.json'))}
VAL = hm['values']

def nearest_h(mx, my):
    i = int(round((mx - hm['x0']) / hm['dx']))
    j = int(round((hm['y0'] - my) / hm['dx']))
    return VAL[j][i]

def leg(a, b):
    ax, ay = to_m(a['lon'], a['lat']); bx, by = to_m(b['lon'], b['lat'])
    dist = math.hypot(bx - ax, by - ay)
    n = max(1, round(dist / 10))
    prof = []
    for k in range(n + 1):
        t = k / n
        mx, my = ax + (bx - ax) * t, ay + (by - ay) * t
        prof.append([round(t * dist, 2), nearest_h(mx, my)])
    return prof

ids = [st['id'] for st in json.load(open('src/data/stations.json')) if st['lat'] is not None]
legs = {}
for ai, a in enumerate(ids):
    for b in ids[ai + 1:]:
        legs[f'{a}|{b}'] = leg(stations[a], stations[b])

out = {'step_m': 10,
       'dtm': 'USGS Mars 2020 TRN CTX DTM 20m (JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0.tif), nearest-cell sampling at 10m along straight segment - not a surveyed path',
       'legs': legs}
new = json.dumps(out, separators=(',', ':'))
import sys
if '--write' in sys.argv:
    open('public/data/legs.json','w').write(new)
    print('legs.json rewritten from DTM samples')
old = json.loads(open('public/data/legs.json').read())['legs'] if '--write' not in sys.argv else None
if old:
    o = old
    for k in legs:
        d0, d1 = o[k][-1][0], legs[k][-1][0]
        print(f'{k}: shipped_end={d0} rebuilt_end={d1} asc_shipped={sum(max(0, o[k][i+1][1]-o[k][i][1]) for i in range(len(o[k])-1)):.1f} asc_rebuilt={sum(max(0, legs[k][i+1][1]-legs[k][i][1]) for i in range(len(legs[k])-1)):.1f}')
