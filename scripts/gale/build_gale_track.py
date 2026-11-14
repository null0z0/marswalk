#!/usr/bin/env python3
"""Build public/data/rover_track_gale.json from the archived MSL drive polylines.

Source: data_raw/MSL_traverse.json (NASA MMGIS MSL traverse layer,
https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_traverse.json, 1316
MultiLineString segments of recorded drive polylines, lon/lat/elev).

Unlike the Jezero rover_track.json (recorded positions connected by straight
lines), these are the actual archived drive polylines. Output keeps the
segments intersecting the app window (heightmap_gale.json extent plus a small
margin) as [lat, lon] polylines, plus the per-site stop records from
data_raw/MSL_waypoints.json inside the same window.
"""
import json

TRAVERSE = 'data_raw/MSL_traverse.json'
WAYPOINTS = 'data_raw/MSL_waypoints.json'
HM = 'public/data/heightmap_gale.json'
OUT = 'public/data/rover_track_gale.json'

R = 3396190.0
import math
hm = json.load(open(HM))
x0, x1 = hm['x0'], hm['x0'] + (hm['nx'] - 1) * hm['dx']
y0, y1 = hm['y0'], hm['y0'] - (hm['ny'] - 1) * hm['dx']   # y0 top, y1 bottom
PAD = 100.0  # metres of margin so the approach/departure drives stay visible
lon_min, lon_max = (x0 - PAD) / R * 180 / math.pi, (x1 + PAD) / R * 180 / math.pi
lat_min, lat_max = (y1 - PAD) / R * 180 / math.pi, (y0 + PAD) / R * 180 / math.pi  # y0 is north edge, y1 south

def inside(lon, lat):
    return lon_min <= lon <= lon_max and lat_min <= lat <= lat_max

t = json.load(open(TRAVERSE))
feats = t['features'] if isinstance(t, dict) else t
segments = []
for f in feats:
    g = f['geometry']
    lines = g['coordinates'] if g['type'] == 'MultiLineString' else [g['coordinates']]
    for line in lines:
        pts = [[p[1], p[0]] for p in line]
        if any(inside(lon, lat) for lat, lon in pts):
            segments.append(pts)

wp = json.load(open(WAYPOINTS))['features']
# collapse records to one stop entry per (site, parked run) inside the window
stops = {}
for r in wp:
    pr = r['properties']
    if not inside(pr['lon'], pr['lat']):
        continue
    key = pr['site']
    cur = stops.get(key)
    if not cur:
        stops[key] = {'site': key, 'lat': pr['lat'], 'lon': pr['lon'],
                      'solFirst': pr['sol'], 'solLast': pr['sol'], 'records': 1}
    else:
        cur['solFirst'] = min(cur['solFirst'], pr['sol'])
        cur['solLast'] = max(cur['solLast'], pr['sol'])
        cur['records'] += 1

out = {
    'source': 'NASA MSL MMGIS traverse layer (data_raw/MSL_traverse.json) + waypoint archive (data_raw/MSL_waypoints.json)',
    'note': 'NASA recorded traverse geometry: drive polylines from the archived MSL MMGIS traverse layer (distinct from the Jezero layer, which connects sparse recorded positions by straight lines). Historical record, not live tracking.',
    'window': {'lon': [round(lon_min, 7), round(lon_max, 7)], 'lat': [round(lat_min, 7), round(lat_max, 7)]},
    'segments': segments,
    'stops': sorted(stops.values(), key=lambda s: s['solFirst']),
}
json.dump(out, open(OUT, 'w'), separators=(',', ':'))
print(f"segments kept: {len(segments)} of {len(feats)}; stops: {len(out['stops'])}; pts: {sum(len(s) for s in segments)}")
for s in out['stops']:
    print(' site', s['site'], 'sols', s['solFirst'], '-', s['solLast'], f"({s['lat']:.6f},{s['lon']:.6f})", s['records'], 'records')
