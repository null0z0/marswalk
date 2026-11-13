#!/usr/bin/env python3
"""Point-in-polygon check of each station's mapped unit against the SIM 3464
geodatabase itself (data_raw/sim3464_JezeroNili_FINAL, extracted by
scripts/fetch_sources.sh from https://pubs.usgs.gov/sim/3464/sim3464_database.zip).
"""
import json
import pyogrio.raw as raw
from pyproj import Transformer
from shapely import wkb
from shapely.geometry import Point

gdb = 'data_raw/sim3464_JezeroNili_FINAL/Geodatabase/Nili.gdb'
meta, _, geoms, fdata = raw.read(gdb, layer='GeoUnits_v1', columns=['unit','name','symbol'])
fields = list(meta['fields']); idx = {n: i for i, n in enumerate(fields)}
tf = Transformer.from_crs('+proj=longlat +R=3396190 +no_defs', '+proj=tmerc +lat_0=0 +lon_0=77.5 +k=1 +x_0=0 +y_0=0 +R=3396190 +units=m +no_defs', always_xy=True)
shp = [wkb.loads(bytes(g)) for g in geoms]
for s in json.load(open('src/data/stations.json')):
    if s['lat'] is None:
        print(f"{s['id']}: position unavailable - no unit lookup"); continue
    x, y = tf.transform(s['lon'], s['lat']); p = Point(x, y)
    hit = next(((fdata[idx['name']][i], fdata[idx['symbol']][i]) for i, g in enumerate(shp) if g.contains(p)), None)
    print(f"{s['id']}: SIM 3464 polygon at ({s['lat']}, {s['lon']}) = {hit}")
