#!/usr/bin/env python3
"""Derive the recorded-rover-route layer for the app from the archived
NASA M20 waypoints snapshot (data_raw/waypoints_2022-12-23.json, a verbatim
2022-12-23 capture of mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json).

Output: public/data/rover_track.json
  - route: recorded rover positions within the map window, ordered by sol
  - stops: one marker per visited site in the window (first record position,
           sol range, record count)
All positions are verbatim record lon/lat values (no reprojection: the feed's
easting/northing use the same Mars 2000 sphere equirectangular clon0 CRS as the
app). These are recorded positions, not live tracking.
"""
import json

SNAP = 'data_raw/waypoints_2022-12-23.json'
# app map window with margin (matches MapView BOUNDS [[18.43,77.375],[18.485,77.44]])
LAT0, LAT1, LON0, LON1 = 18.40, 18.50, 77.36, 77.45

feats = json.load(open(SNAP))['features']
recs = [f['properties'] for f in feats]
recs = [p for p in recs if p.get('lat') is not None and p.get('lon') is not None and p.get('sol') is not None]
recs.sort(key=lambda p: p['sol'])
inwin = [p for p in recs if LAT0 <= p['lat'] <= LAT1 and LON0 <= p['lon'] <= LON1]

route = [[round(p['lat'], 7), round(p['lon'], 7), p['sol']] for p in inwin]

sites = {}
for p in inwin:
    s = sites.setdefault(p['site'], {'site': p['site'], 'lat': p['lat'], 'lon': p['lon'],
                                     'solFirst': p['sol'], 'solLast': p['sol'], 'records': 0})
    s['solFirst'] = min(s['solFirst'], p['sol'])
    s['solLast'] = max(s['solLast'], p['sol'])
    s['records'] += 1
stops = [{'site': s['site'], 'lat': round(s['lat'], 7), 'lon': round(s['lon'], 7),
          'solFirst': s['solFirst'], 'solLast': s['solLast'], 'records': s['records']}
         for s in sorted(sites.values(), key=lambda s: s['solFirst'])]

out = {
  'source': 'NASA Mars 2020 MMGIS waypoints feed, archived snapshot 2022-12-23 (data_raw/waypoints_2022-12-23.json)',
  'note': 'Recorded rover positions from the snapshot, ordered by sol. Historical record, not live tracking; gaps between records are unrecorded drives.',
  'route': route,
  'stops': stops,
}
json.dump(out, open('public/data/rover_track.json', 'w'), separators=(',', ':'))
print(f'rover_track.json: {len(route)} route positions, {len(stops)} site stops, sols {route[0][2]}-{route[-1][2]}')
