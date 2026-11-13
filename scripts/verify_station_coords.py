#!/usr/bin/env python3
"""Verify Wildcat/Skinner stop coordinates against NASA M20 waypoints.

Source: NASA MMGIS feed archived at
  https://github.com/stiles/mars-perseverance-waypoints (data/raw daily snapshots
  of https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints_current.json),
  combined file data/processed/rover_points_full.geojson.
Matches each stop to the rover position on the sol of its Mastcam-Z photo
(Wildcat sol 502, Skinner sol 477). Kodiak has no rover waypoint (never
visited); it stays labeled approximate/unverified.
"""
import json

wp = json.load(open('data_raw/rover_points_full.geojson'))['features']
stations = {s['id']: s for s in json.load(open('src/data/stations.json'))}
WANT = {'Wildcat': 502, 'Skinner': 477}
ok = True
for sid, sol in WANT.items():
    cands = [f for f in wp if f['properties'].get('sol') == sol]
    if not cands:
        print(f'{sid}: NO waypoint for sol {sol} - UNAVAILABLE'); ok = False; continue
    lon, lat = cands[0]['geometry']['coordinates']
    s = stations[sid]
    match = abs(lat - s['lat']) < 1e-4 and abs(lon - s['lon']) < 1e-4
    ok = ok and match
    print(f"{sid}: waypoint sol {sol} ({lat:.5f}, {lon:.5f}) vs stations.json ({s['lat']}, {s['lon']}) -> {'MATCH' if match else 'MISMATCH'}")
k = stations['Kodiak']
print(f"Kodiak: ({k['lat']}, {k['lon']}) - no rover visit; approximate, unverified (kept flagged in UI)")
print('STATION COORDS VERIFIED' if ok else 'STATION COORDS FAILED')
