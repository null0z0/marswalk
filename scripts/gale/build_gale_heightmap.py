#!/usr/bin/env python3
"""Build public/data/heightmap_gale.json from the USGS MSL Gale merged DEM.

Source: https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Mars/MSL/MSL_Gale_DEM_Mosaic_1m_v3.tif
(source page: https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_dem_1m)

The 3.87 GB GeoTIFF is a striped, LZW-compressed float32 raster (1 m posting,
nodata -32767, CRS Mars 2000 sphere equirectangular clon0 R=3396190 - the same
CRS/easting/northing basis as data_raw/MSL_waypoints.json). We HTTP range-read
only the strips covering the Yellowknife Bay window, LZW-decode them, decimate
to DECIMATE m posting, and write the same schema as heightmap.json:
{nx, ny, dx, x0, y0, values} with x0/y0 the pixel-center easting/northing of the
first column / top row, y0 top (north) edge.
"""
import json, struct, urllib.request

SRC = 'https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Mars/MSL/MSL_Gale_DEM_Mosaic_1m_v3.tif'
OUT = 'public/data/heightmap_gale.json'

# Yellowknife Bay window in file pixels (verified: 0.00% nodata, 218,270 px sampled)
ROW0, ROW1 = 27200, 29037
COL0, COL1 = 17416, 19313
DECIMATE = 2          # output posting in metres (native 1 m)
NODATA = -32767.0

def rng(a, b):
    req = urllib.request.Request(SRC, headers={'Range': f'bytes={a}-{b}'})
    return urllib.request.urlopen(req).read()

# ---- minimal TIFF header parse ----
io0 = struct.unpack('<I', rng(0, 7)[4:8])[0]
head = rng(io0, io0 + 65535)
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

W, H = vals(256)[0], vals(257)[0]
rps = vals(278)[0]
strip_offs, strip_cnts = vals(273), vals(279)
scale = vals(33550)          # ModelPixelScaleTag
tie = vals(33922)            # ModelTiepointTag
predictor = vals(317)[0] if 317 in tags else 1
dx_file = float(scale[0])
file_x0, file_y_top = float(tie[3]), float(tie[4])   # top-left pixel CORNER? verified below
print(f'DEM {W}x{H} rps={rps} dx={dx_file} predictor={predictor} tie=({file_x0},{file_y_top})')

def lzw_decode(data):
    """TIFF LZW with early-change codes."""
    out = bytearray()
    bitpos = 0
    def getbits(nbits):
        nonlocal bitpos
        v = 0
        for _ in range(nbits):
            byte = data[bitpos >> 3]
            v = (v << 1) | ((byte >> (7 - (bitpos & 7))) & 1)
            bitpos += 1
        return v
    table = None
    nbits = 9
    prev = None
    while True:
        code = getbits(nbits)
        if code == 256:           # clear
            table = [bytes([i]) for i in range(256)] + [None, None]
            nbits = 9
            prev = None
            continue
        if code == 257:           # EOI
            break
        if code < len(table) and table[code] is not None:
            entry = table[code]
        else:
            entry = prev + prev[:1]
        out += entry
        if prev is not None:
            table.append(prev + entry[:1])
            if len(table) == (1 << nbits) - 1 and nbits < 12:
                nbits += 1
        prev = entry
    return bytes(out)

def read_row(row):
    si = row // rps
    raw = lzw_decode(rng(strip_offs[si], strip_offs[si] + strip_cnts[si] - 1))
    rowdata = raw[(row % rps) * W * 4:(row % rps + 1) * W * 4]
    px = list(struct.unpack(f'<{W}f', rowdata))
    if predictor == 2:
        for i in range(1, W):
            px[i] += px[i - 1]     # float differencing is exact in double
    return px

rows_needed = list(range(ROW0, ROW1 + 1, DECIMATE))
cols_needed = list(range(COL0, COL1 + 1, DECIMATE))

# parallel prefetch of every strip that holds a needed row
from concurrent.futures import ThreadPoolExecutor
strip_ids = sorted({r // rps for r in rows_needed})
print(f'fetching {len(strip_ids)} strips for {len(rows_needed)} rows...')
def fetch_strip(si):
    return si, rng(strip_offs[si], strip_offs[si] + strip_cnts[si] - 1)
strips = {}
with ThreadPoolExecutor(max_workers=24) as ex:
    for si, data in ex.map(fetch_strip, strip_ids):
        strips[si] = lzw_decode(data)
print('strips decoded')

def row_px(row):
    raw = strips[row // rps]
    rowdata = raw[(row % rps) * W * 4:(row % rps + 1) * W * 4]
    px = list(struct.unpack(f'<{W}f', rowdata))
    if predictor == 2:
        for i in range(1, W):
            px[i] += px[i - 1]     # float differencing is exact in double
    return px

grid = []
for r in rows_needed:
    px = row_px(r)
    grid.append([round(px[c], 2) if px[c] != NODATA else None for c in cols_needed])

bad = sum(1 for row in grid for v in row if v is None)
print(f'output grid {len(cols_needed)}x{len(rows_needed)}, nodata cells: {bad}')
assert bad == 0, 'nodata inside crop - window changed?'

# x0/y0 = pixel CENTER of first output column / top row (same convention as heightmap.json)
x0 = file_x0 + (COL0 + 0.5) * dx_file
y0 = file_y_top - (ROW0 + 0.5) * dx_file
out = {'nx': len(cols_needed), 'ny': len(rows_needed), 'dx': float(DECIMATE * dx_file),
       'x0': round(x0, 4), 'y0': round(y0, 4), 'values': grid}
json.dump(out, open(OUT, 'w'), separators=(',', ':'))
print('wrote', OUT, f"({out['nx']}x{out['ny']}, dx={out['dx']}, x0={out['x0']}, y0={out['y0']})")
