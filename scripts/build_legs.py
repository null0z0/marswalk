#!/usr/bin/env python3
"""Rebuild public/data/legs.json from the DTM heightmap and station coordinates.

For each leg (both directions between station pairs), samples the straight
segment every 10 m with nearest-cell DTM heights, and records cumulative
distance and elevation. Ascent = sum of positive steps (>= net gain by
definition). Verifies the result matches the shipped legs.json.
"""
import json, math, sys

# --region gale builds legs_gale.json from the Gale 2 m heightmap (no geology
# polygons exist for Gale); default builds the Jezero legs.json as before.
REGION = 'jezero'
if '--region' in sys.argv:
    REGION = sys.argv[sys.argv.index('--region') + 1]
HM_PATH = 'public/data/heightmap.json' if REGION == 'jezero' else 'public/data/heightmap_gale.json'
OUT_PATH = 'public/data/legs.json' if REGION == 'jezero' else 'public/data/legs_gale.json'
DTM_SRC = ('USGS Mars 2020 TRN CTX DTM 20m (JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0.tif)' if REGION == 'jezero'
           else 'USGS MSL Gale merged DEM 1m decimated to 2m (MSL_Gale_DEM_Mosaic_1m_v3.tif)')

# equidistant-cylindrical Mars CRS (same as app): x = lon*R*pi/180, y = lat*R*pi/180
R = 3396190.0
def to_m(lon, lat):
    return (math.radians(lon) * R, math.radians(lat) * R)

hm = json.load(open(HM_PATH))
stations = {s['id']: s for s in json.load(open('src/data/stations.json')) if s.get('region', 'jezero') == REGION}
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

ids = [st['id'] for st in json.load(open('src/data/stations.json')) if st['lat'] is not None and st.get('region', 'jezero') == REGION]
legs = {}
for ai, a in enumerate(ids):
    for b in ids[ai + 1:]:
        legs[f'{a}|{b}'] = leg(stations[a], stations[b])

# ---- per-leg metadata: slope range (20 m baseline, bilinear) and geology segments ----
def bilinear_h(mx, my):
    fx = (mx - hm['x0']) / hm['dx']; fy = (hm['y0'] - my) / hm['dx']
    i0, j0 = int(math.floor(fx)), int(math.floor(fy))
    tx, ty = fx - i0, fy - j0
    def g(j, i): return VAL[j][i]
    return (g(j0, i0) * (1 - tx) * (1 - ty) + g(j0, i0 + 1) * tx * (1 - ty)
            + g(j0 + 1, i0) * (1 - tx) * ty + g(j0 + 1, i0 + 1) * tx * ty)

def slope_range(a, b, dist):
    ax, ay = to_m(a['lon'], a['lat']); bx, by = to_m(b['lon'], b['lat'])
    BASE = float(hm['dx'])  # slope baseline = grid posting, stated in output
    if dist < BASE:
        return None  # degenerate leg (e.g. base colocated with first stop): no honest slope
    lo, hi = None, None
    x = 0.0
    while x + BASE <= dist + 1e-6:
        def h(at, x=x):
            t = at / dist
            return bilinear_h(ax + (bx - ax) * t, ay + (by - ay) * t)
        s = math.degrees(math.atan2(h(x + BASE) - h(x), BASE))
        lo = s if lo is None else min(lo, s)
        hi = s if hi is None else max(hi, s)
        x += 10.0
    return [round(lo, 1), round(hi, 1)]

if REGION != 'jezero':
    polys = None  # no polygon-scale geology map found for the Gale window
else:
    try:
        from shapely.geometry import shape, Point
        geo = json.load(open('public/geology.geojson'))
        polys = [(shape(f['geometry']), f['properties'].get('symbol'), f['properties'].get('name')) for f in geo['features']]
        def unit_at(lon, lat):
            p = Point(lon, lat)
            for sh, sym, name in polys:
                if sh.contains(p): return sym, name
            return None, None
    except Exception:
        polys = None

def geology_segments(a, b, dist):
    if not polys: return None
    segs = []
    cur = None
    n = max(1, round(dist / 10))
    for k in range(n + 1):
        t = k / n
        lon, lat = a['lon'] + (b['lon'] - a['lon']) * t, a['lat'] + (b['lat'] - a['lat']) * t
        sym, name = unit_at(lon, lat)
        d = t * dist
        if cur and cur[2] == sym:
            cur[1] = d
        else:
            if cur: segs.append(cur)
            cur = [d, d, sym, name]
    if cur: segs.append(cur)
    return [[round(s0, 1), round(s1, 1), sym, name] for s0, s1, sym, name in segs]

slope_key = f"slope{int(hm['dx'])}_deg"
legs_meta = {}
for k in legs:
    aid, bid = k.split('|')
    a, b = stations[aid], stations[bid]
    dist = legs[k][-1][0]
    legs_meta[k] = {slope_key: slope_range(a, b, dist), 'geology': geology_segments(a, b, dist)}

out = {'step_m': 10,
       'dtm': DTM_SRC + ', nearest-cell sampling at 10m along straight segment - not a surveyed path',
       'legs': legs, 'legsMeta': legs_meta}
new = json.dumps(out, separators=(',', ':'))
if '--write' in sys.argv:
    open(OUT_PATH, 'w').write(new)
    print(f'{OUT_PATH} rewritten from DTM samples')
old = None
if REGION == 'jezero' and '--write' not in sys.argv:
    old = json.loads(open(OUT_PATH).read())['legs']
if old:
    o = old
    for k in legs:
        d0, d1 = o[k][-1][0], legs[k][-1][0]
        print(f'{k}: shipped_end={d0} rebuilt_end={d1} asc_shipped={sum(max(0, o[k][i+1][1]-o[k][i][1]) for i in range(len(o[k])-1)):.1f} asc_rebuilt={sum(max(0, legs[k][i+1][1]-legs[k][i][1]) for i in range(len(legs[k])-1)):.1f}')
