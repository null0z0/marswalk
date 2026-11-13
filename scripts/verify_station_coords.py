#!/usr/bin/env python3
"""Verify station coordinates against archived NASA M20 waypoint feed snapshots
(verbatim daily captures of https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json,
mirrored at github.com/stiles/mars-perseverance-waypoints data/raw/).

Coordinate selection (per audit rule "matched to the sol of the sample"):
- Wildcat Ridge: rover drive record sol 502; the rover stayed parked there through
  the Wildcat Ridge sampling campaign (samples Hazeltop sealed sol 509, Bearwallow
  sol 516 - NASA samples catalog).
- Skinner Ridge: rover drive record sol 477; parked through the Skinner Ridge
  sampling campaign (Swift Run sol 490, Skyland sol 495).
- Base (Three Forks depot): rover drive record sol 654 during depot emplacement
  (first tube deposited sol 653); the depot is an area, not a point.
- Kodiak: UNAVAILABLE - no numeric coordinate in opened sources; removed from data.
"""
import json

stations = {s['id']: s for s in json.load(open('src/data/stations.json'))}
SRC = {
    'Wildcat': ('data_raw/waypoints_2022-07-19.json', 502),
    'Skinner': ('data_raw/waypoints_2022-06-26.json', 477),
    'Depot': ('data_raw/waypoints_2022-12-23.json', 654),
    'Kukaklek': ('data_raw/waypoints_2022-12-23.json', 629),
}
ok = True
for sid, (path, sol) in SRC.items():
    feats = json.load(open(path))['features']
    recs = [f for f in feats if f['properties'].get('sol') == sol]
    if not recs:
        print(f'{sid}: NO record for sol {sol} in {path} - UNAVAILABLE'); ok = False; continue
    p = recs[-1]['properties']
    s = stations[sid]
    dlat = abs(p['lat'] - s['lat']); dlon = abs(p['lon'] - s['lon'])
    match = dlat <= 5e-6 and dlon <= 5e-6  # 5-decimal rounding only (~0.3 m)
    ok = ok and match
    print(f"{sid}: sol-{sol} drive record ({p['lat']:.8f}, {p['lon']:.8f}) vs file ({s['lat']}, {s['lon']}) -> {'MATCH (rounding)' if match else f'MISMATCH dlat={dlat} dlon={dlon}'}")
print('Kodiak: coordinate UNAVAILABLE (not in sources; excluded from all computations)')
print('STATION COORDS VERIFIED' if ok else 'STATION COORDS FAILED')
