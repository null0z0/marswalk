#!/usr/bin/env python3
"""Regenerate public/geology.geojson from the SIM 3464 geodatabase itself.

Source: https://pubs.usgs.gov/sim/3464/sim3464_database.zip (Geodatabase/Nili.gdb,
layer GeoUnits_v1, CRS MTM_clon77.5E on Mars_2000_Sphere). Transforms polygons to
Mars geographic lon/lat and crops to the map bbox. Requires pyogrio+pyproj+shapely
(workspace env).
"""
import json, pyogrio.raw as raw
from pyproj import Transformer
from shapely import wkb
from shapely.geometry import mapping, box

gdb = 'data_raw/sim3464_JezeroNili_FINAL/Geodatabase/Nili.gdb'
BBOX = (77.35, 18.40, 77.48, 18.50)  # lon/lat window around the delta front walk area

inv = Transformer.from_crs('+proj=tmerc +lat_0=0 +lon_0=77.5 +k=1 +x_0=0 +y_0=0 +R=3396190 +units=m +no_defs',
                           '+proj=longlat +R=3396190 +no_defs', always_xy=True)
meta, _, geom_arr, field_data = raw.read(gdb, layer='GeoUnits_v1', columns=['unit', 'name', 'symbol'])
fields = list(meta['fields']); idx = {n: i for i, n in enumerate(fields)}
fwd = Transformer.from_crs('+proj=longlat +R=3396190 +no_defs', '+proj=tmerc +lat_0=0 +lon_0=77.5 +k=1 +x_0=0 +y_0=0 +R=3396190 +units=m +no_defs', always_xy=True)
x0, y0 = fwd.transform(BBOX[0], BBOX[1]); x1, y1 = fwd.transform(BBOX[2], BBOX[3])
clip = box(x0, y0, x1, y1)
feats = []
for i, g in enumerate(geom_arr):
    g = wkb.loads(bytes(g))
    if not g.intersects(clip):
        continue
    polys = [g] if g.geom_type == 'Polygon' else list(g.geoms)
    for p in polys:
        xs, ys = inv.transform(*p.exterior.xy)
        rings = [[list(c) for c in zip(xs, ys)]]
        for hole in p.interiors:
            xs, ys = inv.transform(*hole.xy)
            rings.append([list(c) for c in zip(xs, ys)])
        feats.append({'type': 'Feature',
                      'properties': {'unit': field_data[idx['unit']][i], 'name': field_data[idx['name']][i], 'symbol': field_data[idx['symbol']][i]},
                      'geometry': {'type': 'Polygon', 'coordinates': rings}})
out = {'type': 'FeatureCollection', 'crs': {'type': 'name', 'properties': {'name': 'urn:ogc:def:crs:OGC:1.3:CRS84'}},
       'source': 'USGS SIM 3464 Nili.gdb GeoUnits_v1 via scripts/build_geology.py', 'features': feats}
json.dump(out, open('public/geology.geojson', 'w'))
print('features written:', len(feats))
