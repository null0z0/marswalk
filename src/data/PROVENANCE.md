# Data provenance

Every number, coordinate, elevation, image, caption and label shown as DATA in
this app traces to one of the sources below. Status labels: **REAL DATA**
(downloaded source), **DERIVED** (computed from REAL DATA plus a DECLARED
ASSUMPTION), **DECLARED ASSUMPTION** (scenario input, labeled as such),
**UNAVAILABLE** (not found in opened sources; shown as unavailable, never
estimated).

Reproduce (repo-relative, no private paths):

```
sh scripts/fetch_sources.sh          # downloads all raw files + verifies sha256
npm ci && npm run build
python3 scripts/test_provenance.py   # 28 checks against the raw sources
node scripts/check_ui_outputs.mjs    # rendered-DOM checks (needs: npm i -D playwright,
                                     #  and a Chrome/Chromium binary or CHROME_PATH)
npx vitest run                       # 11 planner arithmetic tests
```

`check_ui_outputs.mjs` starts its own local static server for `dist/`; nothing
external is needed beyond the browser binary.

## Sources (all retrieved 2026-11-13)

| # | Source | URL | Raw file (sha256 in data_raw/SHA256SUMS.txt) | Used for | Script |
| --- | --- | --- | --- | --- | --- |
| 1 | USGS Mars 2020 TRN CTX DTM, 20 m | https://planetarymaps.usgs.gov/mosaic/mars2020_trn/CTX/JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0.tif | data_raw/dtm.tif (16a1aa66...) | heightmap.json, legs.json, station elevations | build_heightmap.py, build_legs.py |
| 2 | USGS CTX orthomosaic, 6 m | https://planetarymaps.usgs.gov/mosaic/mars2020_trn/CTX/JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0.tif | data_raw/orthomosaic_6m.tif (842b457a...; git-ignored, 36 MB) | public/layers/ortho_crop.jpg, ortho_3d.jpg | build_ortho.py |
| 3 | USGS SIM 3464 geologic map geodatabase (Nili.gdb, layer GeoUnits_v1) | https://pubs.usgs.gov/sim/3464/sim3464_database.zip | data_raw/sim3464_database.zip (a88bd53a...; git-ignored, 349 MB), extracted to data_raw/sim3464_JezeroNili_FINAL/ | public/geology.geojson, station unit labels | build_geology.py, check_geology.py |
| 4 | NASA M20 waypoints feed, archived daily snapshots (verbatim captures of the NASA feed, mirrored at github.com/stiles/mars-perseverance-waypoints, data/raw/) | live: https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints_current.json | data_raw/waypoints_2022-06-26.json (04b9f66d...), waypoints_2022-07-19.json (ae0b9165...), waypoints_2022-12-23.json (d1a3a4c1...) | station coordinates (drive records sols 477 / 502 / 654) | test_provenance.py |
| 5 | NASA M20 waypoints live feed (mutable: always carries the latest sol; checksum records the audit-time bytes, expected to differ on re-fetch; not used for historical positions) | same as above | data_raw/M20_waypoints_current.json (59b68e9c..., audit-time) | structure cross-check only | fetch_sources.sh |
| 6 | NASA Mars 2020 raw-image archive API + frames | https://mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020&feedtype=json | public/img/wildcat.jpg, skinner.jpg | photos + sol/camera metadata | test_provenance.py, verify_photos.py |

Exact photo frames (source pages resolve HTTP 200, checked by test_provenance.py):

| File | NASA imageid | Source page |
| --- | --- | --- |
| public/img/wildcat.jpg | ZL0_0502_0711509044_013EBY_N0261222ZCAM07101_1100LMJ (sol 502, Mastcam-Z left 110 mm) | https://mars.nasa.gov/mars2020/multimedia/raw-images/ZL0_0502_0711509044_013EBY_N0261222ZCAM07101_1100LMJ |
| public/img/skinner.jpg | ZL0_0477_0709275045_285EBY_N0260850ZCAM08498_1100LMJ (sol 477, Mastcam-Z left 110 mm) | https://mars.nasa.gov/mars2020/multimedia/raw-images/ZL0_0477_0709275045_285EBY_N0260850ZCAM08498_1100LMJ |

## Station-to-sample association evidence

NASA samples catalog (https://science.nasa.gov/mission/mars-2020-perseverance/mars-rock-samples/),
rows as rendered on the page:

- `| Swift Run | Skinner Ridge | Delta Front |` - Sol Sealed 490 (July 7, 2022)
- `| Skyland | Skinner Ridge | Delta Front |` - Sol Sealed 495 (July 12, 2022)
- `| Hazeltop | Wildcat Ridge | Delta Front |` - Sol Sealed 509
- `| Bearwallow | Wildcat Ridge | Delta Front |` - Sol Sealed 516

Archived waypoint snapshots (source 4) contain the rover's drive records:

- waypoints_2022-07-19.json (covers through sol 503): drive records on sols 477,
  then 501, then 502 - **no drive record at any other position between sols 478
  and 500**, so the rover was still at the sol-477 record
  (18.45889532, 77.40616769) when Swift Run (490) and Skyland (495) were sealed
  at Skinner Ridge. Checked by test: "no intervening drive records".
- waypoints_2022-12-23.json (covers through sol 654): no drive record between
  sols 503 and 516, so the rover was still at the sol-502 record
  (18.45864728, 77.40592495) when Hazeltop (509) and Bearwallow (516) were
  sealed at Wildcat Ridge.
- Depot: the same snapshot's final record is the sol-654 position
  (18.45253023, 77.40784155), recorded while the rover was emplacing the Three
  Forks sample depot: NASA's WATSON article
  (https://science.nasa.gov/resource/watson-documents-first-sample-on-the-martian-surface/)
  states the first tube was deposited "on Dec. 21, 2022, the 653rd Martian day,
  or sol, of the mission"; depot map:
  https://science.nasa.gov/resource/perseverances-three-forks-sample-depot-map/.
  The depot is an area, not a surveyed point (records of sols 652-654 span
  ~15 m within it).

Kodiak candidate viewpoint: **removed entirely on 2026-11-13** (user
directive). No numeric coordinate exists in any opened source (NASA M20
waypoints, SIM 3464, NASA photojournal; published studies describe the butte
only relative to the landing site, ~2.3 km west). The pre-audit value
(18.4633, 77.4107) contradicted those descriptions. The station, its sol-275
photo (ZL0_0275_0691341248_678EBY_N0080000ZCAM08292_1100LMJ) and all Kodiak UI
were removed rather than kept as an estimate.

## Geometry and safety labeling

Leg distances are **horizontal straight-line distances between waypoint
coordinates** (geometric, waypoint-derived; equirectangular Mars CRS,
R = 3396190 m). They are not terrain-following 3D surface lengths and not the
driven path. Heights and ascents come from the 20 m DTM (nearest-cell samples
every 10 m along each straight segment; 20 m is the grid spacing, not a
vertical-accuracy guarantee). None of the geometry is a human-safety or
walkability assessment. The UI states this in the plan and profile captions.

## Exact value inventory (default state and "+60 min overrun" state)

| UI value | Value | Status | Source / derivation | Verification |
| --- | --- | --- | --- | --- |
| Base coordinate | 18.45253, 77.40784 | REAL DATA | NASA M20 archived snapshot, sol-654 drive record (depot emplacement; first tube sol 653 per NASA WATSON article) - last recorded position at the depot area | matches snapshot record to 5 decimals (test) |
| Wildcat coordinate | 18.45865, 77.40592 | REAL DATA | sol-502 drive record; last recorded position near the Hazeltop / Bearwallow sample location (samples catalog + no intervening drive records) | matches snapshot to 5 decimals (test) |
| Skinner coordinate | 18.4589, 77.40617 | REAL DATA | sol-477 drive record; last recorded position near the Swift Run / Skyland sample location | matches snapshot to 5 decimals (test) |
| Exact sample-collection spots (Swift Run, Skyland, Hazeltop, Bearwallow) | UNAVAILABLE | UNAVAILABLE | opened sources give sample names, features and sols, and recorded rover positions - not exact equality | reported to user 2026-11-13; stations labeled "near the X sample location" |
| Kodiak (all data) | removed | - | no numeric coordinate in opened sources | removal asserted in tests (absent from stations/legs/photos) |
| Station elevations Base / Wildcat / Skinner | -2546.64 / -2519.85 / -2516.72 m | REAL DATA | DTM nearest cell (20 m grid) at each coordinate | independent re-sample from dtm.tif equals leg endpoints (test) |
| Leg distances | 380.19 / 20.96 / 390.34 m (table: 380m / 21m / 390m) | REAL DATA | horizontal straight-line between waypoints; elevation samples from DTM every 10 m | every 10 m sample recomputed from dtm.tif (test); rendered table checked against legs.json (DOM check) |
| Leg ascents | +27 / +3 / +0 m (exact 26.79 / 3.46 / 0.00 in traversal direction) | REAL DATA | sum of positive 10 m DTM steps | recomputed (test); rendered table checked (DOM check) |
| Header "Route 0.79 km" | 791.49 m loop | REAL DATA | sum of leg distances | rendered header checked against legs.json (DOM check) |
| Header "(0.41 left)" (overrun state) | 411.30 m remaining | REAL DATA | 20.96 + 390.34 m | computed from legs.json |
| Header "Budget 300 min" | 5 h EVA window | DECLARED ASSUMPTION | scenario input | labeled in UI |
| Header "Planned 167 min" (default) / "227 min" (overrun) | 47 walk + 120 dwell / +60 overrun | DERIVED | real distances x declared pace 1.0 km/h + declared dwell 60 min/stop (planner.js, unchanged) | planner vitest suite; rendered text inspected |
| Header "Buffer 133 min" / "73 min" | 300 - 167 / 300 - 227 | DERIVED | as above | same |
| Header "Objectives 2 kept" | Wildcat + Skinner retained | DECLARED ASSUMPTION | scenario configuration (priorities user-settable) | rendered text inspected |
| Header legend "walked 0 / science done 0 / walk left 47 / science left 120 min" (default); "walked 23 / science done 120 / walk left 25 / science left 60 min" (overrun) | as shown | DERIVED | same derivation (walk = distance / declared pace; science = declared dwell; overrun adds 60 at current stop) | planner vitest suite; rendered text inspected |
| Table times 83 / 61 / 23 min (default); 143 / 61 / 23 min (overrun) | walk 23 + dwell 60 / walk 1 + dwell 60 / walk 23 + dwell 0 | DERIVED | as above | planner vitest suite |
| Table "(end 83)" / "(end 144)" / "(end 167)"; overrun "(done @ 1.0)" / "(end 204)" / "(end 227)" | cumulative clock | DERIVED | as above | same |
| "Total 167 / 300 min FITS" / "227 / 300 min FITS" | as shown | DERIVED | as above | rendered text inspected |
| Elevation profile x axis 0.0k-0.8k, station dots Base/Wildcat/Skinner/Base(return), profile end at 791.49 m | as plotted | REAL DATA | concatenated leg profiles | DOM check: curve endpoint at full data span, dots at cumulative leg distances (42.0/142.4/147.9/251.0 px, exact match) |
| Elevation profile y ticks -2512 to -2549 m (domain -2550.6..-2512.4) | as plotted | REAL DATA | DTM elevation range of the route | DOM check: plotted y endpoint maps to -2546.6 m == Base DTM elevation |
| "~21 m apart (~1 DTM cell)" note (Skinner flag + 3D label) | 20.96 m, about one 20 m DTM cell | REAL DATA | Wildcat-Skinner leg distance | recomputed (test) |
| Unit labels Njf (Base) / NHjf2 (Wildcat, Skinner) | as shown | REAL DATA | SIM 3464 Nili.gdb GeoUnits_v1 | point-in-polygon against the geodatabase itself (test) |
| Photos: sol 502 / 477, "Mastcam-Z left 110mm" | as shown | REAL DATA | NASA raw-images API (imageid, sol, camera filter ZCAM_L0_RGB); 110 mm from the filename focal code verified against the ASU decoder table (https://mastcamz.asu.edu/decoding-the-raw-publicly-released-mastcam-z-image-filenames/) | API record match + source pages HTTP 200 + pixel-compare vs NASA full-res frames (mean diff <4/255 = JPEG recompression) |
| Photo captions ("NASA metadata confirms sol and camera; it does not identify the feature shown") | as shown | provenance statement | - | - |
| Geology overlay polygons | as shown | REAL DATA | SIM 3464 geodatabase, MTM_clon77.5E -> lon/lat | build_geology.py; point-in-polygon check at stations |
| Map/3D texture (grayscale) | as shown | REAL DATA | USGS CTX orthomosaic crop | fresh crop compared (mean abs diff ~6/255 = JPEG recompression; same window and size) |
| 3D heights / heightmap | as shown | REAL DATA | DTM 20 m grid crop (cm rounding) | heightmap.json == DTM crop, max cell diff 0.005 (test) |
| Vertical exaggeration x2 (3D) | display constant | DECLARED ASSUMPTION | labeled in 3D view ("display only") | - |
| Pace 1.0 km/h, dwell 60 min, +60 overrun, window 300 min, priorities | as shown | DECLARED ASSUMPTION | scenario inputs, user-settable | labeled in UI |
| "Environmental conditions (MEDA dust, temperature, wind) are not modelled" | note | provenance statement | - | - |
| Title "MARSWalk Planner - Jezero Delta Front", button/toggle labels | text | labels, not data | - | - |

## Distance regeneration note

The pre-audit legs.json was produced by an earlier process that was never
recorded in the repo; at identical coordinates its distances were ~1% off the
documented straight-segment DTM resample. The current legs.json is regenerated
by scripts/build_legs.py and every sample is re-verified against the DTM.
Removed unused artifact: data_raw/rover_points_full.geojson (superseded by the
archived snapshots). Kodiak station, photo and UI removed 2026-11-13 (no
verifiable coordinate). A shortlist of farther delta-front sample-site
candidates (Shuyak, Mageik, Kukaklek; records in the archived snapshots) was
reported to the user for a decision; no candidate has been added to the app.
