#!/usr/bin/env python3
"""Rebuild public/layers/ortho_crop.jpg and ortho_3d.jpg from the USGS CTX
orthomosaic (same window as the DTM crop in build_heightmap.py).

Source: https://planetarymaps.usgs.gov/mosaic/mars2020_trn/CTX/JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0.tif
"""
import json
import numpy as np, tifffile
from PIL import Image

with tifffile.TiffFile('data_raw/orthomosaic_6m.tif') as t:
    page = t.pages[0]
    a = page.asarray()
    tags = page.tags
    scale = tags['ModelPixelScaleTag'].value
    tie = tags['ModelTiepointTag'].value
dx, dy = float(scale[0]), float(scale[1])
x0, ytop = float(tie[3]), float(tie[4])
hm = json.load(open('public/data/heightmap.json'))
i0 = int((hm['x0'] - 0.5 * hm['dx'] - x0) / dx); j0 = int((ytop - (hm['y0'] + 0.5 * hm['dx'])) / dy)
w = int(hm['nx'] * hm['dx'] / dx); h = int(hm['ny'] * hm['dx'] / dy)
crop = a[j0:j0 + h, i0:i0 + w]
if crop.ndim == 3: crop = crop[..., 0]
Image.fromarray(crop).save('public/layers/ortho_crop.jpg', quality=92)
Image.fromarray(crop).save('public/layers/ortho_3d.jpg', quality=92)
print(f'ortho textures rebuilt: {w}x{h} from USGS CTX orthomosaic at ({i0},{j0})')
