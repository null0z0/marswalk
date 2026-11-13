#!/usr/bin/env python3
"""Point-in-polygon check of each station's mapped unit against geology.geojson
(unit boundaries from USGS SIM 3464, https://pubs.usgs.gov/sim/3464/)."""
import json

gj = json.load(open('public/geology.geojson'))
stations = {s['id']: s for s in json.load(open('src/data/stations.json'))}

def in_poly(pt, poly):
    x, y = pt; inside = False
    for ring in poly:
        n = len(ring)
        for i in range(n):
            x1, y1 = ring[i][:2]; x2, y2 = ring[(i + 1) % n][:2]
            if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
                inside = not inside
    return inside

def unit_at(pt):
    for f in gj['features']:
        g = f['geometry']
        polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
        for poly in polys:
            if in_poly(pt, poly):
                return f['properties'].get('name') or f['properties'].get('symbol')
    return None

for sid, s in stations.items():
    print(f"{sid}: unit at ({s['lat']}, {s['lon']}) = {unit_at((s['lon'], s['lat']))}")
