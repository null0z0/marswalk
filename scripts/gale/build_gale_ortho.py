#!/usr/bin/env python3
"""Build public/layers/gale/ortho_crop.jpg from the USGS MSL Gale HiRISE LRGB COG.

Source: https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Mars/MSL/MSL_Gale_HiRISE-LRGB_78quads_sharp_cog.tif
(1.03 GB cloud-optimized GeoTIFF, 36000x76000, 0.25 m/px, RGB, JPEG-in-TIFF
compression with shared JPEGTables tag 347, 512 px tiles,
tie point (8140000, -270000), same Mars 2000 sphere eqc clon0 R=3396190 CRS as
the DEM and the MSL waypoint archive).

Decodes ONLY the tiles intersecting the Yellowknife Bay window (HTTP range
reads), assembles the full window in memory, decimates 0.25 m -> 1 m/px, and
writes a JPEG whose extent exactly matches public/data/heightmap_gale.json:
  x 8145409.49 .. 8147307.49  (1898 m)
  y -271981.08 .. -273819.08  (1838 m, top to bottom)
Every tile in the window is decoded - this is a full-crop validity check, not
a sample. Any missing/empty/black tile is reported and fails the build.
"""
import json, struct, urllib.request, os, sys
from concurrent.futures import ThreadPoolExecutor
import imagecodecs
from PIL import Image

SRC = 'https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Mars/MSL/MSL_Gale_HiRISE-LRGB_78quads_sharp_cog.tif'
OUT = 'public/layers/gale/ortho_crop.jpg'
META_OUT = 'public/layers/gale/ortho_crop_extent.json'

# window in full-res pixels (matches heightmap_gale.json extent; see header)
C0, C1 = 21638, 29230          # cols (7592 px = 1898 m)
R0, R1 = 7924, 15276           # rows (7352 px = 1838 m)
DS = 4                         # 0.25 m -> 1 m

def rng(a, b):
    req = urllib.request.Request(SRC, headers={'Range': f'bytes={a}-{b}'})
    return urllib.request.urlopen(req).read()

io0 = struct.unpack('<I', rng(0, 7)[4:8])[0]
head = rng(io0, io0 + 200000)
n = struct.unpack('<H', head[:2])[0]
TYPES = {1: ('B', 1), 2: ('c', 1), 3: ('H', 2), 4: ('I', 4), 5: ('II', 8),
         6: ('b', 1), 7: ('B', 1), 8: ('h', 2), 9: ('i', 4), 10: ('ii', 8),
         11: ('f', 4), 12: ('d', 8), 16: ('Q', 8), 17: ('q', 8), 18: ('Q', 8)}
tags = {}
for i in range(n):
    e = head[2 + i * 12:14 + i * 12]
    tid, ttype, cnt = struct.unpack('<HHI', e[:8])
    raw = e[8:12]
    fmt, sz = TYPES[ttype]
    tags[tid] = (ttype, cnt, raw if cnt * sz <= 4 else struct.unpack('<I', raw)[0], cnt * sz <= 4)

def vals(tid):
    ttype, cnt, payload, inline = tags[tid]
    fmt, sz = TYPES[ttype]
    data = payload if inline else rng(payload, payload + cnt * sz - 1)
    return struct.unpack('<' + fmt * cnt, data[:cnt * sz])

W = vals(256)[0]
tw = vals(322)[0]
offs, cnts = vals(324), vals(325)
tables = bytes(vals(347))
if tables[:2] == b'\xff\xd8':
    tables = tables[2:]
if tables[-2:] == b'\xff\xd9':
    tables = tables[:-2]
tiles_x = (W + tw - 1) // tw

def decode_tile(ti):
    if cnts[ti] == 0:
        return None
    tile = rng(offs[ti], offs[ti] + cnts[ti] - 1)
    body = tile[2:] if tile[:2] == b'\xff\xd8' else tile
    return imagecodecs.jpeg_decode(b'\xff\xd8' + tables + body)

tc0, tc1 = C0 // tw, C1 // tw
tr0, tr1 = R0 // tw, R1 // tw
jobs = [(tc, tr, tr * tiles_x + tc) for tr in range(tr0, tr1 + 1) for tc in range(tc0, tc1 + 1)]
print(f'window tiles: {len(jobs)} ({tc1-tc0+1} x {tr1-tr0+1})')

import numpy as np
mosaic = np.zeros(((tr1 - tr0 + 1) * tw, (tc1 - tc0 + 1) * tw, 3), dtype=np.uint8)
empty, dark = [], []

def work(job):
    tc, tr, ti = job
    img = decode_tile(ti)
    return tc, tr, ti, img

with ThreadPoolExecutor(max_workers=16) as ex:
    for tc, tr, ti, img in ex.map(work, jobs):
        if img is None:
            empty.append((tc, tr))
            continue
        lum = img[:, :, 0]
        if (lum < 8).mean() > 0.95:
            dark.append((tc, tr))
        mosaic[(tr - tr0) * tw:(tr - tr0 + 1) * tw, (tc - tc0) * tw:(tc - tc0 + 1) * tw] = img

print(f'empty tiles: {len(empty)} {empty[:5]}; >95% dark tiles: {len(dark)} {dark[:5]}')
if empty or dark:
    print('FAIL: window has missing/dark tiles')
    sys.exit(1)

# cut mosaic to the exact window, decimate to 1 m
x0m, y0m = tc0 * tw, tr0 * tw
win = mosaic[R0 - y0m: R0 - y0m + (R1 - R0), C0 - x0m: C0 - x0m + (C1 - C0)]
win = win[::DS, ::DS]
print('output px:', win.shape)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
Image.fromarray(win).save(OUT, quality=87)

# georeference sidecar: top-left pixel CENTER at 1 m posting
tie = vals(33922)
scale = vals(33550)
fx, fy = float(tie[3]), float(tie[4])
x0 = fx + (C0 + 0.5 * DS) * float(scale[0])
y0 = fy - (R0 + 0.5 * DS) * float(scale[1])
json.dump({'nx': int(win.shape[1]), 'ny': int(win.shape[0]), 'dx': DS * float(scale[0]),
           'x0': round(x0, 4), 'y0': round(y0, 4), 'src': SRC},
          open(META_OUT, 'w'), indent=1)
print('wrote', OUT, 'and', META_OUT)
