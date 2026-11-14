#!/usr/bin/env python3
"""Crop the USGS Jezero delta-front 4 m DTM (CC0, DOI 10.5066/P9REJ9JN) to the
app's Jezero window and export it as a Float32 binary grid + JSON meta, same
pixel-center / rows-north-to-south convention as public/data/heightmap.json.

Checked before writing (see task notes): both DTMs belong to the USGS
MOLA-DeltaGeoid product family by file naming and are numerically close
(median offset -1.7 m on rough ground, ~0 m on flat), but neither GeoTIFF
carries an explicit vertical-datum tag, so the shared vertical reference is
qualified inference from the product family, not a documented tag. 100%
valid pixels inside the app window.
"""
import rasterio
import numpy as np
import json

SRC = '/downloads/jezero_dl_dtm_4m-e5590da8.tif'
OUT_BIN = 'public/data/heightmap_jezero_4m.bin'
OUT_META = 'public/data/heightmap_jezero_4m.json'

# app Jezero window = shipped 20 m grid extent (pixel-edge)
app = json.load(open('public/data/heightmap.json'))
xMin = app['x0'] - app['dx'] / 2
xMax = app['x0'] + (app['nx'] - 1) * app['dx'] + app['dx'] / 2
yMax = app['y0'] + app['dx'] / 2
yMin = app['y0'] - (app['ny'] - 1) * app['dx'] - app['dx'] / 2

with rasterio.open(SRC) as ds:
    r0, c0 = ds.index(xMin, yMax)
    r1, c1 = ds.index(xMax, yMin)
    r0, r1 = sorted((r0, r1))
    c0, c1 = sorted((c0, c1))
    r1 += 1  # include the edge pixel
    c1 += 1
    a = ds.read(1, window=((r0, r1), (c0, c1))).astype('<f4')
    nd = ds.nodata
    valid = a != nd
    print('crop', a.shape, 'valid %.2f%%' % (100 * valid.mean()))
    assert valid.mean() > 0.999, 'expected full coverage in app window'
    a[~valid] = np.nan
    ny, nx = a.shape
    # pixel-center of column 0 / top row from the raster transform
    x0 = ds.transform.c + (c0 + 0.5) * ds.transform.a
    y0 = ds.transform.f + (r0 + 0.5) * ds.transform.e
    a.tofile(OUT_BIN)
    meta = {
        'nx': int(nx), 'ny': int(ny), 'dx': 4.0,
        'x0': x0, 'y0': y0,
        'bin': '/data/heightmap_jezero_4m.bin',
        'srcLabel': 'USGS Jezero delta front DTM 4 m (CC0, DOI 10.5066/P9REJ9JN)',
    }
    json.dump(meta, open(OUT_META, 'w'), indent=1)
    print('wrote', OUT_BIN, a.nbytes, 'bytes;', OUT_META, meta)
