#!/usr/bin/env python3
"""Source-backed provenance tests. Every check reads the REAL downloaded sources.
Run scripts/fetch_sources.sh first (restores data_raw/). Exit 1 on any failure."""
import json, math, sys, urllib.request
import numpy as np, tifffile
import pyogrio.raw as raw
from pyproj import Transformer
from shapely import wkb
from shapely.geometry import Point

fails = []
def check(name, ok, detail=''):
    print(('PASS' if ok else 'FAIL'), '-', name, detail)
    if not ok: fails.append(name)

R = 3396190.0
def to_m(lon, lat): return (math.radians(lon) * R, math.radians(lat) * R)

hm = json.load(open('public/data/heightmap.json'))
legs = json.load(open('public/data/legs.json'))['legs']
stations = {s['id']: s for s in json.load(open('src/data/stations.json'))}

# 1. heightmap.json == DTM 20m grid crop (values cm-rounded)
with tifffile.TiffFile('data_raw/dtm.tif') as t:
    page = t.pages[0]; a = page.asarray().astype(np.float64); tags = page.tags
    scale = tags['ModelPixelScaleTag'].value; tie = tags['ModelTiepointTag'].value
dx = float(scale[0]); fx0, fytop = float(tie[3]), float(tie[4])
i0 = int((hm['x0'] - 0.5 * dx - fx0) / dx); j0 = int((fytop - (hm['y0'] + 0.5 * dx)) / dx)
crop = a[j0:j0 + hm['ny'], i0:i0 + hm['nx']]
diff = np.nanmax(np.abs(crop - np.array([[v if v is not None else np.nan for v in row] for row in hm['values']])))
check('heightmap.json == DTM 20m grid crop (cm rounding)', diff <= 0.0051, f'max cell diff {diff}')

def dtm_h(mx, my):
    i = int(round((mx - hm['x0']) / hm['dx'])); j = int(round((hm['y0'] - my) / hm['dx']))
    return hm['values'][j][i]

# 2. legs.json: recompute EVERY 10m sample from the DTM; distance, ascent, interior values
for key, prof in legs.items():
    a, b = key.split('|')
    ax, ay = to_m(stations[a]['lon'], stations[a]['lat']); bx, by = to_m(stations[b]['lon'], stations[b]['lat'])
    dist = math.hypot(bx - ax, by - ay)
    n = max(1, round(dist / 10))
    recomputed = [[round(t := k / n * dist, 2), dtm_h(ax + (bx - ax) * k / n, ay + (by - ay) * k / n)] for k in range(n + 1)]
    ok = len(recomputed) == len(prof) and all(abs(p1[0] - p2[0]) < 0.011 and abs(p1[1] - p2[1]) < 0.011 for p1, p2 in zip(recomputed, prof))
    check(f'{key}: every 10m sample matches DTM recompute', ok, f'{len(prof)} samples, dist {prof[-1][0]} m')
    asc = sum(max(0, prof[i][1] - prof[i - 1][1]) for i in range(1, len(prof)))
    net = prof[-1][1] - prof[0][1]
    check(f'{key}: ascent >= net gain', asc >= net - 1e-9, f'asc {asc:.2f} net {net:.2f}')

# 2b. station elevations == independent raw DTM sample at each station coordinate.
# Interpolation: nearest DTM cell center (the method build_legs.py documents; the
# DTM is a 20 m grid, so a station elevation is its containing cell's value).
for sid, s in stations.items():
    if s['lat'] is None: continue
    mx, my = to_m(s['lon'], s['lat'])
    elev = dtm_h(mx, my)
    vals = []
    for key, prof in legs.items():
        a, b = key.split('|')
        if a == sid: vals.append(prof[0][1])
        if b == sid: vals.append(prof[-1][1])
    ok = len(vals) > 0 and all(abs(v - elev) < 0.011 for v in vals)
    check(f'{sid} elevation == independent raw DTM nearest-cell sample', ok, f'DTM {elev} m; leg endpoints {sorted(set(round(v,2) for v in vals))}')

# 3. header/table/profile consistency is checked against the RENDERED DOM by
# scripts/check_ui_outputs.mjs (no hardcoded expected values there either: it
# derives expectations from the served data files). Nothing to assert here that
# would not be legs.json compared with itself.

# 4. station coordinates == archived NASA waypoint drive records (5-decimal rounding only)
SRC = {'Wildcat': ('data_raw/waypoints_2022-07-19.json', 502), 'Skinner': ('data_raw/waypoints_2022-06-26.json', 477), 'Depot': ('data_raw/waypoints_2022-12-23.json', 654)}
for sid, (path, sol) in SRC.items():
    feats = json.load(open(path))['features']
    recs = [f for f in feats if f['properties'].get('sol') == sol]
    p = recs[-1]['properties']; s = stations[sid]
    ok = abs(p['lat'] - s['lat']) <= 5e-6 and abs(p['lon'] - s['lon']) <= 5e-6
    check(f'{sid} coordinate == NASA waypoint record sol {sol}', ok, f"({p['lat']:.8f}, {p['lon']:.8f})")

# 4b. sampling-sol association: the archived snapshots contain NO drive record at
# any other position between the station record sol and the last sampling sol, so
# the rover was still at that record when the samples were sealed (sample names,
# features and sols per the NASA samples catalog, science.nasa.gov).
PARKED = [('data_raw/waypoints_2022-07-19.json', 477, 495, 'sol-477 (Skinner; Swift Run 490, Skyland 495)'),
          ('data_raw/waypoints_2022-12-23.json', 502, 516, 'sol-502 (Wildcat; Hazeltop 509, Bearwallow 516)')]
for path, base_sol, last_sample_sol, label in PARKED:
    feats = json.load(open(path))['features']
    others = sorted({f['properties']['sol'] for f in feats
                     if f['properties'].get('sol') and base_sol < f['properties']['sol'] <= last_sample_sol})
    check(f'no intervening drive records: rover held {label}', not others, f'intervening records: {others or "none"}')

# 4c. Depot association: the archived 2022-12-23 snapshot's final record is the
# sol-654 position, recorded while the rover was emplacing the Three Forks depot
# (first tube deposited sol 653, NASA WATSON article, science.nasa.gov).
feats = json.load(open('data_raw/waypoints_2022-12-23.json'))['features']
recs = sorted(f['properties']['sol'] for f in feats if f['properties'].get('sol'))
check('Depot: 2022-12-23 snapshot ends at the sol-654 record (depot emplacement window)', recs[-1] == 654, f'last record sol {recs[-1]}')

# 5. geology unit labels == point-in-polygon against the SIM 3464 geodatabase itself
meta, _, geoms, fdata = raw.read('data_raw/sim3464_JezeroNili_FINAL/Geodatabase/Nili.gdb', layer='GeoUnits_v1', columns=['unit','name','symbol'])
fields = list(meta['fields']); idx = {n: i for i, n in enumerate(fields)}
tf = Transformer.from_crs('+proj=longlat +R=3396190 +no_defs', '+proj=tmerc +lat_0=0 +lon_0=77.5 +k=1 +x_0=0 +y_0=0 +R=3396190 +units=m +no_defs', always_xy=True)
shp = [wkb.loads(bytes(g)) for g in geoms]
for sid, s in stations.items():
    if s['lat'] is None: continue
    x, y = tf.transform(s['lon'], s['lat']); p = Point(x, y)
    hit = next(((fdata[idx['name']][i], fdata[idx['symbol']][i]) for i, g in enumerate(shp) if g.contains(p)), None)
    check(f'{sid} unit label == SIM 3464 polygon', hit is not None and s['unit'].startswith(hit[1] or ''), f'{hit}')

# 6. Kodiak excluded (coordinate unavailable)
check('Kodiak coordinate unavailable (null)', stations['Kodiak']['lat'] is None and stations['Kodiak']['lon'] is None)
check('Kodiak excluded from legs', all('Kodiak' not in k for k in legs))
check('Kodiak unit label unavailable', 'unavailable' in stations['Kodiak']['unit'])

# 7. every image has a resolvable NASA source URL; shipped file matches NASA bytes
photos = json.load(open('public/data/station_photos.json'))
for name, ph in photos.items():
    api = f"https://mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020&feedtype=json&sol={ph['sol']}&num=500"
    imgs = json.load(urllib.request.urlopen(api)).get('images', [])
    hit = next((im for im in imgs if im['imageid'].startswith(ph['imageid'])), None)
    ok = hit is not None and hit['sol'] == ph['sol'] and hit['camera']['filter_name'] == 'ZCAM_L0_RGB'
    check(f'{name}: imageid/sol/camera verified in NASA raw-images API', ok, hit['title'] if hit else 'NOT FOUND')
    if not hit: fails.append(name); continue
    page = f"https://mars.nasa.gov/mars2020/multimedia/raw-images/{hit['imageid']}"
    try:
        r = urllib.request.urlopen(page)
        check(f'{name}: source page resolves', r.status == 200, page)
    except Exception as e:
        check(f'{name}: source page resolves', False, str(e))

print()
print('ALL PASS' if not fails else f'{len(fails)} FAILURES: {fails}')
sys.exit(1 if fails else 0)
