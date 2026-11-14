#!/usr/bin/env python3
"""Build derived terrain overlay layers from the app's elevation grid
(public/data/heightmap.json, itself derived from the USGS Mars 2020 TRN CTX
DTM, 20 m, Mars 2000 sphere equirectangular clon0).

Outputs (public/layers/ + public/data/terrain_meta.json):
  - elev_ramp.png    elevation color ramp (colorbrewer RdYlBu-reversed)
  - hillshade.png    shaded relief (az 315, alt 45)
  - slope.png        slope magnitude in degrees at the 20 m grid baseline
  - contours.geojson contour lines (MultiLineString per level, lon/lat)
All are DERIVED views of the same elevation data, not independent measurements.
"""
import json, math
from PIL import Image

import sys
region = sys.argv[1] if len(sys.argv) > 1 else 'jezero'
assert region in ('jezero', 'gale')
hm_path = 'public/data/heightmap_gale.json' if region == 'gale' else 'public/data/heightmap.json'
out_layers = 'public/layers/gale' if region == 'gale' else 'public/layers'
meta_path = 'public/data/terrain_meta_gale.json' if region == 'gale' else 'public/data/terrain_meta.json'
hm = json.load(open(hm_path))
nx, ny, dx = hm['nx'], hm['ny'], hm['dx']
x0, y0 = hm['x0'], hm['y0']          # x0 = west edge, y0 = north edge (top row)
V = hm['values']                     # values[row][col], row 0 = north
R = 3396190.0

def to_lonlat(x, y):
    return math.degrees(x / R), math.degrees(y / R)

lon_min, lat_max = to_lonlat(x0, y0)
lon_max, lat_min = to_lonlat(x0 + nx * dx, y0 - ny * dx)

lo = min(v for row in V for v in row)
hi = max(v for row in V for v in row)

# ---- elevation ramp ----
RAMP = [(68, 1, 84), (59, 82, 139), (33, 145, 140), (94, 201, 98), (253, 231, 37)]  # viridis
def ramp(t):
    t = min(max(t, 0), 1) * (len(RAMP) - 1)
    i = min(int(t), len(RAMP) - 2)
    f = t - i
    a, b = RAMP[i], RAMP[i + 1]
    return tuple(round(a[k] + (b[k] - a[k]) * f) for k in range(3))

img = Image.new('RGBA', (nx, ny))
px = img.load()
for r in range(ny):
    for c in range(nx):
        px[c, r] = ramp((V[r][c] - lo) / (hi - lo)) + (255,)
img.save(f'{out_layers}/elev_ramp.png')

# ---- slope (degrees, central differences on 20 m cells) ----
S = [[0.0] * nx for _ in range(ny)]
smax = 0.0
for r in range(ny):
    for c in range(nx):
        dzdx = (V[r][min(c + 1, nx - 1)] - V[r][max(c - 1, 0)]) / (dx * (min(c + 1, nx - 1) - max(c - 1, 0)) or dx)
        dzdy = (V[max(r - 1, 0)][c] - V[min(r + 1, ny - 1)][c]) / (dx * (min(r + 1, ny - 1) - max(r - 1, 0)) or dx)
        s = math.degrees(math.atan(math.hypot(dzdx, dzdy)))
        S[r][c] = s
        smax = max(smax, s)
img = Image.new('RGBA', (nx, ny))
px = img.load()
for r in range(ny):
    for c in range(nx):
        t = S[r][c] / smax
        px[c, r] = (255, round(255 * (1 - t)), 60, 255)
img.save(f'{out_layers}/slope.png')

# ---- hillshade ----
AZ, ALT = math.radians(315), math.radians(45)
img = Image.new('RGBA', (nx, ny))
px = img.load()
for r in range(ny):
    for c in range(nx):
        dzdx = (V[r][min(c + 1, nx - 1)] - V[r][max(c - 1, 0)]) / (dx * (min(c + 1, nx - 1) - max(c - 1, 0)) or dx)
        dzdy = (V[max(r - 1, 0)][c] - V[min(r + 1, ny - 1)][c]) / (dx * (min(r + 1, ny - 1) - max(r - 1, 0)) or dx)
        slope = math.atan(math.hypot(dzdx, dzdy))
        aspect = math.atan2(dzdy, -dzdx)
        shade = math.sin(ALT) * math.cos(slope) + math.cos(ALT) * math.sin(slope) * math.cos(AZ - aspect)
        g = round(255 * (shade + 1) / 2)
        px[c, r] = (g, g, g, 255)
img.save(f'{out_layers}/hillshade.png')

# ---- contours (marching squares, segments per level) ----
INTERVAL = 10.0
levels = {}
lv = math.ceil(lo / INTERVAL) * INTERVAL
while lv <= hi:
    levels[lv] = []
    lv += INTERVAL

def X(r, c):  # cell corner west edge
    return x0 + c * dx
def Y(r):     # row top edge (north)
    return y0 - r * dx

for level in levels:
    segs = levels[level]
    for r in range(ny - 1):
        for c in range(nx - 1):
            # corners: tl=(r,c) tr=(r,c+1) br=(r+1,c+1) bl=(r+1,c)
            zs = [V[r][c], V[r][c + 1], V[r + 1][c + 1], V[r + 1][c]]
            pts = [(X(r, c), Y(r)), (X(r, c + 1), Y(r)), (X(r, c + 1), Y(r + 1)), (X(r, c), Y(r + 1))]
            idx = sum(1 << i for i in range(4) if zs[i] >= level)
            if idx in (0, 15):
                continue
            def interp(i, j):
                t = (level - zs[i]) / (zs[j] - zs[i]) if zs[j] != zs[i] else 0.5
                return (pts[i][0] + (pts[j][0] - pts[i][0]) * t, pts[i][1] + (pts[j][1] - pts[i][1]) * t)
            # edges: 0 top(tl-tr), 1 right(tr-br), 2 bottom(bl-br), 3 left(tl-bl)
            edges = {0: (0, 1), 1: (1, 2), 2: (3, 2), 3: (0, 3)}
            EDGE_CASES = {
                1: [3, 2], 2: [1, 2], 3: [3, 1], 4: [0, 1], 5: [3, 0, 1, 2], 6: [0, 2],
                7: [3, 1], 8: [0, 3], 9: [0, 2], 10: [0, 1, 2, 3], 11: [0, 1],
                12: [1, 3], 13: [1, 2], 14: [2, 3],
            }
            el = EDGE_CASES.get(idx, [])
            for k in range(0, len(el), 2):
                e1, e2 = el[k], el[k + 1]
                p1 = interp(*edges[e1])
                p2 = interp(*edges[e2])
                segs.append([p1, p2])

features = []
for level, segs in levels.items():
    if not segs:
        continue
    coords = [[[round(v, 7) for v in to_lonlat(*p)] for p in (seg[0], seg[1])] for seg in segs]
    features.append({'type': 'Feature', 'properties': {'elev': level},
                     'geometry': {'type': 'MultiLineString', 'coordinates': coords}})
json.dump({'type': 'FeatureCollection', 'features': features},
          open(f'{out_layers}/contours.geojson', 'w'), separators=(',', ':'))

meta = {
  'elevMin': round(lo, 1), 'elevMax': round(hi, 1),
  'slopeMaxDeg': round(smax, 1), 'contourIntervalM': INTERVAL,
  'gridM': dx, 'cells': [nx, ny],
  'bounds': [[round(lat_min, 7), round(lon_min, 7)], [round(lat_max, 7), round(lon_max, 7)]],
  'source': ('Derived from the app elevation grid (%s), itself built from %s. Derived views of the same data, not independent measurements.'
           % (hm_path, 'the USGS MSL Gale DEM Mosaic 1 m v3 (decimated to 2 m)' if region == 'gale'
              else 'the USGS Mars 2020 TRN CTX DTM (20 m)')),
}
json.dump(meta, open(meta_path, 'w'), indent=1)
print(f'overlays: elev {lo:.1f}..{hi:.1f} m, slope max {smax:.1f} deg, contours every {INTERVAL} m ({sum(len(f["geometry"]["coordinates"]) for f in features)} segments, {len(features)} levels)')
print('bounds:', meta['bounds'])
