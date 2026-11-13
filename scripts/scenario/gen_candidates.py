#!/usr/bin/env python3
"""ANALYSIS ONLY - not part of the app. Generates scripts/scenario/candidates.json:
station entries and DTM leg profiles for the shortlisted delta-front sample
sites, using the SAME method as scripts/build_legs.py (horizontal straight-line
distance between records; nearest-cell DTM sample every 10 m). Coordinates are
the last archived NASA M20 drive record at/before each sample's sealing sol
(last recorded position; the exact sample spot is UNAVAILABLE)."""
import json, math, sys
import numpy as np, tifffile

R = 3396190.0
def to_m(lon, lat): return (math.radians(lon) * R, math.radians(lat) * R)

with tifffile.TiffFile('data_raw/dtm.tif') as t:
    page = t.pages[0]; a = page.asarray().astype(np.float64); tags = page.tags
    scale = tags['ModelPixelScaleTag'].value; tie = tags['ModelTiepointTag'].value
dx = float(scale[0]); fx0, fytop = float(tie[3]), float(tie[4])
def dtm_h(lon, lat):
    mx, my = to_m(lon, lat)
    i = int(round((mx - (fx0 + 0.5 * dx)) / dx)); j = int(round(((fytop - 0.5 * dx) - my) / dx))
    return round(float(a[j, i]), 2)

feats = json.load(open('data_raw/waypoints_2022-12-23.json'))['features']
recs = sorted([(f['properties']['sol'], f['geometry']['coordinates'][0], f['geometry']['coordinates'][1])
               for f in feats if f['properties'].get('sol')])
CANDS = [('Shuyak', 'Amalik', 575), ('Mageik', 'Amalik', 619), ('Kukaklek', 'Hidden Harbor', 631)]
FIXED = {'Depot': (77.40784, 18.45253), 'Wildcat': (77.40592, 18.45865), 'Skinner': (77.40617, 18.4589)}  # (lon, lat)

def profile(p, q):
    ax, ay = to_m(p[0], p[1]); bx, by = to_m(q[0], q[1])
    dist = math.hypot(bx - ax, by - ay)
    n = max(1, round(dist / 10))
    return [[round(k / n * dist, 2), dtm_h(p[0] + (q[0] - p[0]) * k / n, p[1] + (q[1] - p[1]) * k / n)] for k in range(n + 1)]

stations, legs = [], {}
for name, feat, sol in CANDS:
    prior = [r for r in recs if r[0] <= sol]
    rsol, lon, lat = prior[-1]
    between = [r for r in recs if rsol < r[0] <= sol]
    assert not between, f'{name}: intervening drive records {between}'
    lat5, lon5 = round(lat, 5), round(lon, 5)
    stations.append({'id': name, 'feature': feat, 'sampleSol': sol, 'recordSol': rsol,
                     'lat': lat5, 'lon': lon5, 'elev': dtm_h(lon5, lat5)})
    for other, (olon, olat) in [('Depot', FIXED['Depot']), ('Wildcat', FIXED['Wildcat']), ('Skinner', FIXED['Skinner'])]:
        legs[f'{name}|{other}'] = profile((lon5, lat5), (olon, olat))
json.dump({'stations': stations, 'legs': legs}, open('scripts/scenario/candidates.json', 'w'), indent=1)
for s in stations:
    print(s['id'], 'record sol', s['recordSol'], 'sample sol', s['sampleSol'], (s['lat'], s['lon']), 'elev', s['elev'])
    for o in ['Depot', 'Wildcat', 'Skinner']:
        print(f"  to {o}: {legs[s['id'] + '|' + o][-1][0]:.2f} m")
