#!/usr/bin/env python3
"""HiRISE DTM vs CTX DTM slope/relative-elevation comparison.

Same sampling method on both grids: samples every 10 m along each leg,
bilinear interpolation in each grid's own pixel space, slope over a 20 m
baseline (two sample steps).

Projection handling (no raw degree/flat mixing):
- Both products are equirectangular PLANETOCENTRIC, so lat/lon values are
  directly comparable between them.
- HiRISE DTM (label values): sphere R=3394839.813 m, center 15.0/77.44,
  MAP_SCALE=1.0096633 m/px, MAP_RESOLUTION=58684.049 px/deg.
  Latitude -> pixel via MAP_RESOLUTION from the label's MAXIMUM_LATITUDE
  edge: line0 = (MAXIMUM_LATITUDE - lat_deg) * MAP_RESOLUTION - 1
  (LINE_FIRST_PIXEL=1, so -1 converts to a 0-based array index).
  Longitude -> pixel in true meters at the center latitude, as the label
  specifies MAP_SCALE is true there:
  samp0 = radians(lon_deg - 77.44) * R * cos(radians(15.0)) / MAP_SCALE
          + SAMPLE_PROJECTION_OFFSET (3210.5) - 1
  Cross-check: this reproduces the label's WESTERNMOST_LONGITUDE at
  sample 0 and sensible elevations at all four stations.
- CTX DTM: heightmap.json gives grid origin (x0,y0) and step dx=20 m in
  the DTM's own meter grid (R=3396190 sphere): mx = radians(lon)*R,
  my = radians(lat)*R, i = (mx - x0)/dx, j = (y0 - my)/dx. Verified
  == data_raw/dtm.tif cell-for-cell by scripts/test_provenance.py.

Limits: absolute elevations use different reference surfaces (HiRISE
local sphere vs CTX MOLA delta-geoid), and the observed station offsets
vary 6.8-16.5 m, so no single datum constant separates the products;
only RELATIVE differences are compared. Differences between the two
grids are indicative only: datum, horizontal-registration, and
processing differences are not disentangled, so slope gaps cannot be
attributed purely to 20 m smoothing.

Sources (both verified against recorded checksums / label reads):
- HiRISE DTM DTEEC_045994_1985_046060_1985_U01.IMG
  https://hirise-pds.lpl.arizona.edu/PDS/DTM/ESP/ORB_045900_045999/ESP_045994_1985_ESP_046060_1985/DTEEC_045994_1985_046060_1985_U01.IMG
- USGS CTX DTM 20 m crop via public/data/heightmap.json
  (verified == data_raw/dtm.tif by scripts/test_provenance.py)
"""
import json, math, urllib.request
import numpy as np

URL = "https://hirise-pds.lpl.arizona.edu/PDS/DTM/ESP/ORB_045900_045999/ESP_045994_1985_ESP_046060_1985/DTEEC_045994_1985_046060_1985_U01.IMG"
LBL_BYTES = 26692; SAMPS = 6673
RES = 58684.0491709; SCALE = 1.0096633268711
MAXLAT = 18.548391096554; CLON = 77.44; CLAT = math.radians(15.0); R_H = 3394839.8133163

def hr_pix(lat, lon):
    return ((MAXLAT - lat) * RES - 1.0,
            math.radians(lon - CLON) * R_H * math.cos(CLAT) / SCALE + 3210.5 - 1.0)

stations = {s['id']: s for s in json.load(open('src/data/stations.json')) if s['lat'] is not None}
ls = [hr_pix(s['lat'], s['lon'])[0] for s in stations.values()]
l0, l1 = int(min(ls)) - 30, int(max(ls)) + 31
req = urllib.request.Request(URL, headers={'Range': f'bytes={LBL_BYTES + l0*SAMPS*4}-{LBL_BYTES + (l1+1)*SAMPS*4 - 1}'})
buf = urllib.request.urlopen(req).read()
grid = np.frombuffer(buf, dtype='<f4').reshape(l1 - l0 + 1, SAMPS).astype(np.float64)
grid[grid < -1e30] = np.nan
print(f'HiRISE window lines {l0}..{l1}, valid {np.isfinite(grid).mean()*100:.1f}% of pixels')

def hr_bilinear(lat, lon):
    l, s = hr_pix(lat, lon)
    j, i = l - l0, s
    j0, i0 = int(math.floor(j)), int(math.floor(i))
    dj, di = j - j0, i - i0
    q = grid[j0:j0+2, i0:i0+2]
    if not np.isfinite(q).all(): return None
    return float(q[0,0]*(1-dj)*(1-di) + q[0,1]*(1-dj)*di + q[1,0]*dj*(1-di) + q[1,1]*dj*di)

hm = json.load(open('public/data/heightmap.json'))
R_C = 3396190.0
def ctx_bilinear(lat, lon):
    mx, my = math.radians(lon)*R_C, math.radians(lat)*R_C
    fi = (mx - hm['x0']) / hm['dx']; fj = (hm['y0'] - my) / hm['dx']
    j0, i0 = int(math.floor(fj)), int(math.floor(fi))
    dj, di = fj - j0, fi - i0
    vals = hm['values']
    q = [[vals[j0][i0], vals[j0][i0+1]], [vals[j0+1][i0], vals[j0+1][i0+1]]]
    if any(v is None for r in q for v in r): return None
    return q[0][0]*(1-dj)*(1-di) + q[0][1]*(1-dj)*di + q[1][0]*dj*(1-di) + q[1][1]*dj*di

legs = json.load(open('public/data/legs.json'))['legs']
print()
print('station elevations (m; datums differ - compare RELATIVE columns only):')
base_h = hr_bilinear(stations['Depot']['lat'], stations['Depot']['lon'])
base_c = ctx_bilinear(stations['Depot']['lat'], stations['Depot']['lon'])
print(f"{'station':10s} {'HiRISE abs':>10s} {'CTX abs':>10s} {'HiRISE rel':>10s} {'CTX rel':>10s}")
for sid, s in stations.items():
    h, c = hr_bilinear(s['lat'], s['lon']), ctx_bilinear(s['lat'], s['lon'])
    print(f"{sid:10s} {h:10.2f} {c:10.2f} {h-base_h:10.2f} {c-base_c:10.2f}")
print()
print('per-leg slope ranges over 20 m baseline (deg), 10 m sampling, bilinear both grids:')
for key in legs:
    a, b = key.split('|')
    A, B = stations[a], stations[b]
    ax, ay = math.radians(A['lon'])*R_C, math.radians(A['lat'])*R_C
    bx, by = math.radians(B['lon'])*R_C, math.radians(B['lat'])*R_C
    dist = math.hypot(bx-ax, by-ay)
    n = max(1, round(dist/10))
    ll = [(math.degrees((ay + (by-ay)*k/n)/R_C), math.degrees((ax + (bx-ax)*k/n)/R_C)) for k in range(n+1)]
    hs = [hr_bilinear(la, lo) for la, lo in ll]
    cs = [ctx_bilinear(la, lo) for la, lo in ll]
    def rng(vals):
        sl = [(vals[i+2]-vals[i])/20.0 for i in range(len(vals)-2) if vals[i] is not None and vals[i+2] is not None]
        return (math.degrees(math.atan(min(sl))), math.degrees(math.atan(max(sl)))) if sl else (None, None)
    hmin, hmax = rng(hs); cmin, cmax = rng(cs)
    nvalid = sum(1 for v in hs if v is not None)
    print(f"{key:18s} dist {dist:6.1f} m  HiRISE {hmin:6.2f}..{hmax:5.2f}  CTX {cmin:6.2f}..{cmax:5.2f}  (valid {nvalid}/{len(hs)})")
