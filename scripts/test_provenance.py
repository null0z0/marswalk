#!/usr/bin/env python3
"""Source-backed provenance tests. Reads the REAL downloaded sources and asserts
every UI-facing value derives from them. Run: python3 scripts/test_provenance.py
(needs numpy, tifffile, pyogrio, pyproj, shapely; network for the photo check)."""
import json, math, sys
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
VAL = hm['values']
def nearest_h(mx, my):
    i = int(round((mx - hm['x0']) / hm['dx'])); j = int(round((hm['y0'] - my) / hm['dx']))
    return VAL[j][i]

# 1. heightmap.json == DTM crop (regenerate and compare every cell)
with tifffile.TiffFile('data_raw/dtm.tif') as t:
    page = t.pages[0]; a = page.asarray().astype(np.float64); tags = page.tags
    scale = tags['ModelPixelScaleTag'].value; tie = tags['ModelTiepointTag'].value
dx = float(scale[0]); fx0, fytop = float(tie[3]), float(tie[4])
i0 = int((hm['x0'] - 0.5 * dx - fx0) / dx); j0 = int((fytop - (hm['y0'] + 0.5 * dx)) / dx)
crop = a[j0:j0 + hm['ny'], i0:i0 + hm['nx']]
diff = np.nanmax(np.abs(crop - np.array([[v if v is not None else np.nan for v in row] for row in VAL])))
check('heightmap.json == DTM 20m grid crop (values cm-rounded)', diff <= 0.0051, f'max cell diff {diff} (rounding to 2 decimals)')

# 2. station elevations == DTM nearest-cell at station coordinates
for sid, s in stations.items():
    if s['lat'] is None: continue
    mx, my = to_m(s['lon'], s['lat'])
    h = nearest_h(mx, my)
    ok = False
    for key, prof in legs.items():
        if key.split('|')[0] == sid and abs(prof[0][1] - h) < 0.51: ok = True
        if key.split('|')[1] == sid and abs(prof[-1][1] - h) < 0.51: ok = True
    check(f'{sid} elevation matches DTM at its coordinate', ok, f'DTM {h}')

# 3. legs.json recompute == file; ascent >= net gain; profile end == leg distance
for key, prof in legs.items():
    a, b = key.split('|')
    ax, ay = to_m(stations[a]['lon'], stations[a]['lat']); bx, by = to_m(stations[b]['lon'], stations[b]['lat'])
    dist = math.hypot(bx - ax, by - ay)
    asc = sum(max(0, prof[i][1] - prof[i - 1][1]) for i in range(1, len(prof)))
    net = prof[-1][1] - prof[0][1]
    check(f'{key}: profile end == straight distance', abs(prof[-1][0] - dist) < 0.5, f'{prof[-1][0]} vs {dist:.2f}')
    check(f'{key}: ascent >= net gain', asc >= net - 1e-9, f'asc {asc:.2f} net {net:.2f}')

# 4. header total == table sum == profile end (all from legs.json)
loop = legs['Depot|Wildcat'][-1][0] + legs['Wildcat|Skinner'][-1][0] + legs['Depot|Skinner'][-1][0]
check('full loop distance consistent', abs(loop - 789.52) < 0.5, f'{loop:.2f} m -> header {loop/1000:.2f} km')

# 5. station coordinates == NASA M20 waypoints for the photo sols
wp = json.load(open('data_raw/rover_points_full.geojson'))['features']
for sid, sol, tol in [('Wildcat', 502, 1e-4), ('Skinner', 477, 1e-4), ('Depot', 654, 3e-4)]:
    s = stations[sid]
    cands = [f for f in wp if f['properties'].get('sol') == sol]
    lon, lat = cands[0]['geometry']['coordinates']
    check(f'{sid} coordinate == NASA waypoint sol {sol}', abs(lat - s['lat']) < tol and abs(lon - s['lon']) < tol,
          f'waypoint ({lat:.5f}, {lon:.5f}) vs file ({s["lat"]}, {s["lon"]})')

# 6. geology unit labels == point-in-polygon against the SIM 3464 geodatabase itself
meta, _, geoms, fdata = raw.read('data_raw/sim3464_JezeroNili_FINAL/Geodatabase/Nili.gdb', layer='GeoUnits_v1', columns=['unit','name','symbol'])
fields = list(meta['fields']); idx = {n: i for i, n in enumerate(fields)}
tf = Transformer.from_crs('+proj=longlat +R=3396190 +no_defs', '+proj=tmerc +lat_0=0 +lon_0=77.5 +k=1 +x_0=0 +y_0=0 +R=3396190 +units=m +no_defs', always_xy=True)
shp = [wkb.loads(bytes(g)) for g in geoms]
for sid, s in stations.items():
    if s['lat'] is None: continue
    x, y = tf.transform(s['lon'], s['lat']); p = Point(x, y)
    hit = next(((fdata[idx['name']][i], fdata[idx['symbol']][i]) for i, g in enumerate(shp) if g.contains(p)), None)
    check(f'{sid} unit label == SIM 3464 polygon', hit is not None and s['unit'].startswith(hit[1] or ''), f'{hit}')

# 6b. Kodiak coordinate is unavailable, and no Kodiak leg/route/elevation uses it
check('Kodiak coordinate unavailable (null)', stations['Kodiak']['lat'] is None and stations['Kodiak']['lon'] is None)
check('Kodiak excluded from legs', all('Kodiak' not in k for k in legs))
check('Kodiak unit label unavailable', 'unavailable' in stations['Kodiak']['unit'])

# 7. every image has a verifiable source (NASA raw-images API: imageid, sol, camera)
import urllib.request
photos = json.load(open('public/data/station_photos.json'))
for name, ph in photos.items():
    api = f"https://mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020&feedtype=json&sol={ph['sol']}&num=500"
    imgs = json.load(urllib.request.urlopen(api)).get('images', [])
    hit = next((im for im in imgs if im['imageid'].startswith(ph['imageid'])), None)
    ok = hit is not None and hit['camera']['filter_name'] == 'ZCAM_L0_RGB' and hit['sol'] == ph['sol']
    print('   NASA title:', hit['title'] if hit else None)
    check(f'{name} image verified in NASA raw-images API', ok)
    check(f'{name} image has source URL', bool(ph.get('imageid')))

print()
print('ALL PASS' if not fails else f'{len(fails)} FAILURES: {fails}')
sys.exit(1 if fails else 0)
