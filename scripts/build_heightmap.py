#!/usr/bin/env python3
"""Build public/data/heightmap.json from the USGS Mars 2020 TRN CTX DTM GeoTIFF.

Source: https://planetarymaps.usgs.gov/mosaic/mars2020_trn/CTX/JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0.tif
Reads the native 20 m grid with tifffile, crops the app window around the
delta front, and writes {nx, ny, dx, x0, y0, values}. x0/y0 are the west/
south outer edges in the file's equidistant-cylindrical Mars CRS
(sphere radius 3396190 m), matching worldXY in Terrain3D.jsx.
"""
import json
import numpy as np, tifffile

SRC, OUT = 'data_raw/dtm.tif', 'public/data/heightmap.json'

# app crop window in file CRS (easting x west edge, northing y top edge)
CROP_X0, CROP_Y_TOP, NXC, NYC = 4586373.250853, 1095683.140188, 194, 164

with tifffile.TiffFile(SRC) as t:
    page = t.pages[0]
    a = page.asarray().astype(np.float64)
    tags = page.tags
    scale = tags['ModelPixelScaleTag'].value      # (dx, dy, 0)
    tie = tags['ModelTiepointTag'].value          # (i, j, k, x, y, z)

dx = float(scale[0])
full_x0, full_y_top = float(tie[3]), float(tie[4])
i0 = int((CROP_X0 - full_x0) / dx)   # crop x0/y_top are pixel CENTERS (half-cell)
j0 = int((full_y_top - CROP_Y_TOP) / dx)
a = a[j0:j0 + NYC, i0:i0 + NXC]
ny, nx = a.shape
x0 = full_x0 + (i0 + 0.5) * dx      # pixel-center easting of column 0
y0 = full_y_top - (j0 + 0.5) * dx   # pixel-center northing of row 0 (top)

values = [[None if not np.isfinite(v) else round(float(v), 2) for v in row] for row in a]
json.dump({'nx': nx, 'ny': ny, 'dx': dx, 'x0': x0, 'y0': y0, 'values': values},
          open(OUT, 'w'), separators=(',', ':'))
finite = a[np.isfinite(a)]
print(f'heightmap.json: {nx}x{ny} dx={dx} x0={x0} y0={y0} min={finite.min():.2f} max={finite.max():.2f}')
