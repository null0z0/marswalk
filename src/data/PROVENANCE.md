# Data provenance

Every number, coordinate, elevation, image, caption and label shown as DATA in
this app traces to one of the sources below. Reproduce: `sh scripts/fetch_sources.sh`
(downloads all raw files and verifies nothing else is needed), then
`python3 scripts/test_provenance.py` re-verifies every derivation against the raw
sources (ALL PASS at commit time), and `node check_ui_outputs.mjs` (in uitest,
against a local build) confirms the rendered UI shows exactly those values.
Checksums: `data_raw/SHA256SUMS.txt`. The 349 MB SIM 3464 zip and the 36 MB
orthomosaic GeoTIFF are git-ignored (re-downloaded by fetch_sources.sh); their
checksums are recorded.

## Sources

1. USGS Mars 2020 TRN CTX DTM, 20 m
   https://planetarymaps.usgs.gov/mosaic/mars2020_trn/CTX/JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0.tif
   -> public/data/heightmap.json (scripts/build_heightmap.py; 3D mesh + station elevations)
   -> public/data/legs.json (scripts/build_legs.py; distances, ascents, elevation profiles)
2. USGS CTX orthomosaic, 6 m
   https://planetarymaps.usgs.gov/mosaic/mars2020_trn/CTX/JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0.tif
   -> public/layers/ortho_crop.jpg, ortho_3d.jpg (scripts/build_ortho.py)
3. USGS SIM 3464 geologic map geodatabase (Nili.gdb, layer GeoUnits_v1)
   https://pubs.usgs.gov/sim/3464/sim3464_database.zip
   -> public/geology.geojson (scripts/build_geology.py: MTM_clon77.5E -> lon/lat)
   -> station unit labels (point-in-polygon, scripts/check_geology.py + test_provenance.py)
4. NASA M20 waypoints feed (archived verbatim daily snapshots)
   live: https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints_current.json
   archive: https://github.com/stiles/mars-perseverance-waypoints data/raw/waypoints_YYYY-MM-DD.json
   -> station coordinates (drive records sols 477 / 502 / 654)
5. NASA Mars 2020 raw-image archive API (mars.nasa.gov/rss/api/)
   -> photo files public/img/*.jpg and their sol/camera metadata

## Exact value table

| UI value (as rendered) | Value | Source | Verification |
| --- | --- | --- | --- |
| Base coordinate | 18.45253, 77.40784 | NASA M20 waypoints, sol-654 drive record (depot emplacement; first tube sol 653 per NASA samples catalog) | matches snapshot record to 5 decimals |
| Wildcat coordinate | 18.45865, 77.40592 | NASA M20 waypoints, sol-502 drive record (rover parked through Hazeltop sol 509 / Bearwallow sol 516 sampling) | matches snapshot record to 5 decimals |
| Skinner coordinate | 18.4589, 77.40617 | NASA M20 waypoints, sol-477 drive record (rover parked through Swift Run sol 490 / Skyland sol 495 sampling) | matches snapshot record to 5 decimals |
| Kodiak coordinate | UNAVAILABLE | no numeric coordinate in opened sources (NASA waypoints, SIM 3464, NASA photojournal + studies give only ~2.3 km west of landing) | excluded from all computations; old value (18.4633, 77.4107) was inconsistent with sources and removed |
| Base / Wildcat / Skinner elevation | -2546.64 / -2519.85 / -2516.72 m | DTM nearest cell at each coordinate | re-sampled from dtm.tif, matches |
| Leg distances | 380.19 / 20.96 / 390.34 m | DTM straight-segment resample (10 m steps) | every sample recomputed from dtm.tif |
| Leg ascents | +27 / +3 / +0 m | sum of positive 10 m DTM steps | >= net gain, recomputed |
| Header route | 0.79 km (0.41 left) | derived from legs.json | rendered UI checked against legs.json |
| Table times 143 / 61 / 23 min | as shown | pace/dwell/dwellUsed (declared assumptions) x real distances | planner tests, rendered UI checked |
| Elevation profile axis | 0.0-0.8k m, -2512 to -2551 m | profile concatenation of legs.json | invariant test: table sum == header == profile end |
| "~20 m apart" note | 20.96 m | Wildcat-Skinner leg distance | recomputed |
| Unit labels Njf / NHjf2 | as shown | SIM 3464 Nili.gdb GeoUnits_v1 | point-in-polygon against geodatabase |
| Photos (3) | sol 502 / 477 / 275, Mastcam-Z left 110 mm | NASA raw-images API (imageid, sol, camera, resolvable source page) | pixel-compared with NASA full-res frames (mean diff <4/255 = JPEG recompression) |
| Kodiak unit label | unavailable | derived from unavailable coordinate | asserted in tests |
| Geology overlay polygons | as shown | SIM 3464 geodatabase, converted by scripts/build_geology.py | point-in-polygon check at stations |
| Map/3D texture | as shown | USGS CTX orthomosaic crop | compared with fresh crop of the GeoTIFF (mean abs diff ~6/255 = JPEG recompression; same window and size) |
| Budget 300 / dwell 60 / pace 1.0 / +60 overrun / priorities / MEDA note | as shown | DECLARED ASSUMPTIONS (user-settable), not data | labeled in UI |
| Vertical exaggeration x2 (3D) | display constant | DECLARED (labeled in 3D view) | - |

## Distance regeneration note

The pre-audit legs.json was produced by an earlier process that was never recorded
in the repo; at identical coordinates its distances were ~1% off the documented
straight-segment DTM resample. The current legs.json is regenerated by
scripts/build_legs.py and every sample is re-verified against the DTM.
