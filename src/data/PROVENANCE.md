# Data provenance

Every number, coordinate, elevation, image, caption and label shown as DATA in
this app traces to one of the sources below. Status labels: **REAL DATA** (downloaded source), **DECLARED ASSUMPTION**
(scenario input, including values computed from those assumptions and real
geometry, labeled as such), **UNAVAILABLE** (not found in opened sources;
shown as unavailable, never estimated).

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
| Station elevations Base / Wildcat / Skinner | -2546.64 / -2519.85 / -2516.72 m | REAL DATA | DTM nearest cell (20 m grid) at each coordinate | test resamples via heightmap.json (itself verified cell-equal to the DTM crop, max diff 0.005) and matches leg endpoints |
| Leg distances | 380.19 / 20.96 / 390.34 m (table: 380m / 21m / 390m) | REAL DATA | horizontal straight-line between waypoints; elevation samples from DTM every 10 m | every 10 m sample recomputed from dtm.tif (test); rendered table checked against legs.json (DOM check) |
| Leg ascents | +27 / +3 / +0 m (exact 26.79 / 3.46 / 0.00 in traversal direction) | REAL DATA | sum of positive 10 m DTM steps | recomputed (test); rendered table checked (DOM check) |
| Header "Route 0.79 km" (historical - superseded 2-stop default; see note below) | 791.49 m loop | REAL DATA | sum of leg distances | rendered header checked against legs.json (DOM check) |
| Header "(0.41 left)" (overrun state) | 411.30 m remaining | REAL DATA | 20.96 + 390.34 m | computed from legs.json |
| Header "Budget 300 min" | 5 h EVA window | DECLARED ASSUMPTION | scenario input | labeled in UI |
| Header "Planned 167 min" (default) / "227 min" (overrun) | 47 walk + 120 dwell / +60 overrun | DECLARED ASSUMPTION | computed by planner.js (unchanged) from real distances x declared pace 1.0 km/h + declared dwell 60 min/stop | planner vitest suite; rendered text inspected |
| Header "Buffer 133 min" / "73 min" | 300 - 167 / 300 - 227 | DECLARED ASSUMPTION | computed as above | same |
| Header "Objectives 2 kept" (historical - superseded 2-stop default; see note below) | Wildcat + Skinner retained | DECLARED ASSUMPTION | scenario configuration (priorities user-settable) | rendered text inspected |
| Header legend "walked 0 / science done 0 / walk left 47 / science left 120 min" (default); "walked 23 / science done 120 / walk left 25 / science left 60 min" (overrun) | as shown | DECLARED ASSUMPTION | computed as above (walk = distance / declared pace; science = declared dwell; overrun adds 60 at current stop) | planner vitest suite; rendered text inspected |
| Table times 83 / 61 / 23 min (default); 143 / 61 / 23 min (overrun) | walk 23 + dwell 60 / walk 1 + dwell 60 / walk 23 + dwell 0 | DECLARED ASSUMPTION | computed as above | planner vitest suite |
| Table "(end 83)" / "(end 144)" / "(end 167)"; overrun "(done @ 1.0)" / "(end 204)" / "(end 227)" | cumulative clock | DECLARED ASSUMPTION | computed as above | same |
| "Total 167 / 300 min FITS" / "227 / 300 min FITS" | as shown | DECLARED ASSUMPTION | computed as above | rendered text inspected |
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

## 2026-11-13 update: third science stop (Kukaklek) and route-derived displays

| Item | Value | Status | Basis | Verification |
| --- | --- | --- | --- | --- |
| Kukaklek (Hidden Harbor) station position | lat 18.45163, lon 77.40144 | REAL DATA | sol-629 drive record in archived NASA M20 waypoints snapshot (2022-12-23); rover parked through the Kukaklek sample sealed sol 631 per the NASA samples catalog; last recorded position near the sample, not a surveyed point | scripts/verify_station_coords.py (MATCH), scripts/test_provenance.py parked-check |
| Kukaklek objective wording | "Sedimentary rock core with varied textures and colors of sulfate minerals, indicating possible multiple water interactions" | REAL DATA (wording) | NASA "Meet the Mars Samples: Kukaklek (Sample 16)" page wording only (https://science.nasa.gov/resource/meet-the-mars-samples-kukaklek-sample-16/) | text taken from the opened NASA page; NASA does not state "sulfate veins" or "alteration halos" |
| Kukaklek geology unit | NHjf2 (Jezero fan unit 2, SIM 3464 point-in-polygon) | REAL DATA | SIM 3464 Nili.gdb GeoUnits_v1 | unit assignment computed from the geodatabase polygons |
| Unit one-line descriptions + map-sheet link | as shown on station cards | REAL DATA (close paraphrase of cited entries) | SIM 3464 pamphlet, Description of Map Units, Jezero crater units (https://pubs.usgs.gov/sim/3464/sim3464.pdf). Njf entry: "Rugged, moderately to heavily cratered, light- to dark-toned, planar unit ... Associated with mafic composition ... Previously mapped as 'volcanic floor unit'"; NHjf2 entry: "Lightly cratered, intermediate-toned, stratified unit ... located at the mouth of Neretva Vallis ... Associated with Fe/Mg clay and carbonate ... Previously mapped as 'western fan deposit'" | descriptions condensed from those opened entries; link on each card |
| Base context photo | REMOVED 2026-11-13 | UNAVAILABLE | no sol-653/654 rover frame visibly shows the depot or a sample tube (both sol-654 Mastcam-Z 34 mm frames show featureless ground; sol 653 has only WATSON arm close-ups); the user's wider-view condition was not met, so the photo was removed rather than kept with a sol+camera caption that could read as depicting the depot | both candidate frames viewed (ZL0_0654_0724997362_303EBY_N0320148ZCAM08649_0340LMJ, ZL0_0654_0725005132_784EBY_N0320250ZCAM07114_0340LMJ); NASA raw-images API sol 653/654 reviewed |
| Dwell 60 min floor in UI | minimum 60 min, not shortenable | DECLARED ASSUMPTION | declared scenario protocol choice, labeled in UI; not a NASA standard | TimeControl slider min=60 + label |
| Route with 3 kept stops (default) | Base -> Skinner -> Wildcat -> Kukaklek -> Base; 1.29 km; planned 257 min; buffer 43 min | DECLARED ASSUMPTION | planner.js optimization over real leg geometry + declared pace/dwell | scripts/check_ui_outputs.mjs (DOM vs legs.json) |
| +60 overrun at Wildcat | drops Kukaklek (lowest-priority non-must-have); 227.5 min; buffer 72.5 min | DECLARED ASSUMPTION | planner.js drop rule | recomputed via buildPlan |
| +90 overrun at Wildcat | drops Kukaklek; 257.5 min; buffer 42.5 min | DECLARED ASSUMPTION | planner.js drop rule | recomputed via buildPlan |
| 360-min window with +60 at Wildcat | all 3 stops kept; 317.9 min; buffer 42.1 min | DECLARED ASSUMPTION | planner.js | recomputed via buildPlan |
| Geology strip + slope per leg under elevation profile | per-leg SIM 3464 unit segments; 20 m-baseline bilinear slope ranges | REAL DATA (derived) | legs.json legsMeta, rebuilt from dtm.tif + SIM 3464 polygons (scripts/build_legs.py); 20 m grid smooths micro-relief, not a surveyed path | build_legs.py rebuild verification; rendered strip/slopes inspected |
| Sol-653/654 depot context frame | REMOVED 2026-11-13 - none used | UNAVAILABLE | sol 653 has only WATSON arm close-ups and both sol-654 Mastcam-Z 34 mm frames show featureless ground, so no frame meets the wider-view depot condition, per NASA raw-images API sol-653/654 review and visual inspection | photo removed from the UI (see second-pass table); the sol-654 frame it refers to is no longer shown |

The earlier table's default-route rows ("Route 0.79 km", "Objectives 2 kept", per-leg
times) describe the previous 2-stop default and are superseded by the route-derived
rows above; check_ui_outputs.mjs now derives expectations from the planner and the
shipped legs.json instead of hardcoded route values.

## 2026-11-13 second review pass

| Item | Value | Status | Basis | Verification |
| --- | --- | --- | --- | --- |
| Map scale-bar distances | Mars meters (sphere R = 3396190 m) | REAL DATA (display) | proj4leaflet defaults CRS.R to Earth's 6371000 m, inflating distances ~1.88x; MapView.jsx now overrides crs.R = 3396190 | scale control now uses the Mars sphere radius |
| 3D/map texture file ortho_3d.jpg | regenerated from USGS CTX orthomosaic | REAL DATA | scripts/build_ortho.py re-crops the same DTM window; regenerated ortho_crop.jpg matches the committed file byte-for-byte in length (63,803 bytes); content compared only by byte size, not a hash | build_ortho.py run against the verified 36 MB orthomosaic (sha256 in SHA256SUMS.txt) |
| Slope display for return legs | reversed traversal: sign and endpoint order flipped from the stored outbound leg | REAL DATA (derived) | ElevationProfile.jsx derives the reverse direction from the same leg samples instead of reusing the outbound range | planner/check_ui_outputs.mjs table-vs-legs.json checks; rendered ranges inspected |
| MEDA weather data | recorded conditions shown as context captions on the Wildcat and Skinner station cards (explicitly not planner inputs) | SHIPPED as per-sensor recorded context | PDS MEDA calibrated products for sol 477 and sol 502 verified: sol_0477 CAL_ATS urn:nasa:pds:mars2020_meda:data_calibrated_env:we__0477___________cal_ats_________________p (v1.0, 30957 records; fields SCLK, LMST, LTST, ATS_LOCAL_TEMP1-5) and CAL_PS (30329 records; BAROCAP1/2_PRESSURE + uncertainty, THERMOCAP temps); sol_0502 CAL_ATS (39433 records; measured 188.6-270.8 K) and CAL_PS (38947 records). No quality-flag fields and no fill/special constants exist in these CAL product labels (both XML labels read directly). Label record counts (30957 ATS / 30329 PS) include the single header line; data rows parsed: 30956 / 30328 for sol 477 and 39432 / 38946 for sol 502. Captions state exactly what was verified: parsed columns contained no empty, non-numeric, or non-finite cells, and no instrument-quality filtering was applied beyond parsing - scripts/test_meda.py recomputes every per-sensor range from the raw CSVs and asserts the captions carry those values. Products under https://atmos.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/data_calibrated_env/sol_0420_0539/sol_0477/ and .../sol_0502/ | direct fetch of the PDS directories, both XML labels, and the full CAL_ATS + CAL_PS CSVs for sols 477 and 502 (measured ranges computed from every record: sol 477 ATS 193.1-264.5 K, PS 766.8-819.8 Pa; sol 502 ATS 188.6-270.8 K, PS 770.0-818.8 Pa); caption wording states the conditions are recorded context only and are not used by the planner |
| HiRISE DTM terrain | not used in the app (evaluation only) | UNAVAILABLE for display use (audit documented; comparison covered the original four Jezero stations only - the Amalik six-stop scenario was not evaluated against the HiRISE DTM) | DTM DTEEC_045994_1985_046060_1985_U01.IMG (stereo pair ESP_045994_1985 + ESP_046060_1985): 14266x6673 float32, 380,814,764 bytes, equirectangular planetocentric, local sphere R=3394839.813 m, center 15.0/77.44, 1.0096633 m/px (58684.049 px/deg), coverage lat 18.30529-18.54839, lon 77.38338-77.50109 (all four stations inside), valid range -2679.20..-2388.31 m; ortho images ESP_045994_1985_RED_*_ORTHO.JP2 and ESP_046060_1985_RED_*_ORTHO.JP2 at 0.2524 m/px; NASA PDS, produced by USGS Astrogeology (A. McEwen), free to use with credit. Fair comparison (same 10 m sampling, bilinear, 20 m baseline on both grids; relative values only; the two products disagree by 6.8-16.5 m depending on station, so no single datum offset separates them): relative-to-Base elevation Wildcat +35.6 m (HiRISE) vs +28.0 m (CTX), Skinner +39.2 vs +30.2, Kukaklek +21.6 vs +22.3; per-leg 20 m-baseline slope ranges: Depot->Skinner 0.2..19.8 deg (HiRISE) vs 0.2..12.8 (CTX), Depot->Kukaklek 0.1..16.2 vs -3.0..8.9, Wildcat->Skinner 10.1 vs 6.2, Skinner->Kukaklek -21.9..6.5 vs -10.9..3.3, Wildcat->Kukaklek -20.8..6.4 vs -10.6..3.3. These differences are indicative only: the products disagree (station elevation offsets vary 6.8-16.5 m), and datum, horizontal-registration, and processing differences are not disentangled, so the gap cannot be attributed purely to 20 m smoothing; the UI slope note already states the 20 m grid smooths micro-relief | scripts/compare_hirise_slopes.py (range-request reads of the PDS label and pixel window); app keeps the labeled 20 m CTX DTM |
| Base context photo content | REMOVED from the UI 2026-11-13 (unmet wider-view condition) | REMOVED | visual inspection of the shipped frame and the second sol-654 34 mm frame (ZL0_0654_0725005132_784EBY_N0320250ZCAM07114_0340LMJ); neither shows a wider identifiable depot view | frames viewed; station card now carries the position caveat text only |

## 2026-11-13 expansion pass (Amalik scenario + recorded-route and derived terrain layers)

| Item | Value | Status | Basis | Verification |
| --- | --- | --- | --- | --- |
| Shuyak (Amalik outcrop) station position | lat 18.45073, lon 77.40144 | REAL DATA | sol-565 record in archived NASA M20 waypoints snapshot (2022-12-23); no intervening records through the Shuyak sample sealed sol 575 per the NASA samples catalog; last recorded position near the sample, not a surveyed point | scripts/verify_station_coords.py (MATCH), scripts/test_provenance.py parked-check |
| Mageik (Amalik outcrop) station position | lat 18.45364, lon 77.39915 | REAL DATA | sol-609 drive record in archived NASA M20 waypoints snapshot (2022-12-23); no intervening records through the Mageik sample sealed sol 619 per the NASA samples catalog; last recorded position near the sample, not a surveyed point | scripts/verify_station_coords.py (MATCH), scripts/test_provenance.py parked-check |
| Shuyak/Mageik objective wording | fine-grained clay-bearing mudstone/siltstone from the "Amalik" rock, Delta Front; biosignature-preservation potential; Mageik deposited at the Three Forks depot | REAL DATA (wording) | NASA "Meet the Mars Samples: Shuyak and Mageik (Samples 14 and 15)" page transcript (https://science.nasa.gov/resource/meet-the-mars-samples-shuyak-and-mageik-samples-14-and-15/) | text condensed from the opened NASA page transcript |
| Shuyak/Mageik geology unit | NHjf2 (Jezero fan unit 2, SIM 3464 point-in-polygon) | REAL DATA | SIM 3464 Nili.gdb GeoUnits_v1 | unit assignment computed from the geodatabase polygons; UI states the Amalik scenario is the same unit as the Delta Front stops (different samples/route, not a different environment) |
| Shuyak photo | Mastcam-Z left 110 mm frame, sol 565 (ZL0_0565_0717112266_568EBY_N0290000ZCAM07115_1100LMJ) | REAL DATA (photo) + ASSUMED content attribution | NASA raw-images API metadata (sol, camera, caption verbatim); content = terrain at the rover's recorded position that sol, not necessarily the sampled rock | scripts/verify_photos.py (API re-check); frame visually inspected |
| Mageik photo | Mastcam-Z left 110 mm frame, sol 609 (ZL0_0609_0721008552_410EBY_N0301096ZCAM03478_1100LMJ) | REAL DATA (photo) + ASSUMED content attribution | NASA raw-images API metadata (sol, camera, caption verbatim); content = terrain at the rover's recorded position that sol, not necessarily the sampled rock | scripts/verify_photos.py (API re-check); frame visually inspected |
| Scenario definitions | src/data/scenarios.json (delta, amalik) | DECLARED ASSUMPTION (scenario design) | stop membership from real station records; switching resets plan state | UI scenario switcher; planner unchanged |
| Amalik-scenario legs (distances, elevation profiles, geology strip, slopes) | Depot-Shuyak 394 m, Shuyak-Mageik 219 m, Depot-Mageik 519 m etc. | REAL DATA (derived) | legs.json rebuilt from the verified CTX DTM + SIM 3464 polygons by scripts/build_legs.py --write (all 15 station pairs) | build_legs.py output; check_ui_outputs.mjs DOM-vs-legs.json |
| Recorded rover positions (connected) + stop markers layer | 149 recorded positions, 21 site markers within the map window, sols 109-654 | REAL DATA (verbatim record lon/lat) | archived NASA M20 waypoints snapshot 2022-12-23 (data_raw/waypoints_2022-12-23.json); toggleable layer labeled as recorded positions connected by straight lines - NOT the measured driven path, and not live tracking | scripts/build_rover_track.py; rendered layer inspected |
| Derived terrain overlays (elevation ramp, hillshade, slope shading, 10 m contours) | elev -2575.7..-2418.4 m; slope max 32.7 deg at 20 m grid | REAL DATA (derived views) | computed from public/data/heightmap.json (USGS Mars 2020 TRN CTX DTM 20 m); labeled in UI as derived views of the same data, not independent measurements; slope labeled steepness display, not a safety rating | scripts/build_overlays.py; rendered overlays visually inspected |

## 2026-11-13 Gale crater scenario (Yellowknife Bay / Curiosity)

| Item | Value | Status | Basis | Verification |
| --- | --- | --- | --- | --- |
| Gale elevation grid (public/data/heightmap_gale.json) | 949x919 cells at 2 m, whole crop 0 nodata | REAL DATA (derived) | USGS MSL Gale DEM Mosaic 1 m v3 (MSL_Gale_DEM_Mosaic_1m_v3.tif, https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Mars/MSL/MSL_Gale_DEM_Mosaic_1m_v3.tif), decimated to 2 m, Mars sphere R=3396190 EQC | whole-crop nodata scan; test_provenance.py Gale section |
| Gale ortho basemap (public/layers/gale/ortho_crop.jpg) | full station window, 240/240 source tiles present | REAL DATA | USGS MSL Gale HiRISE-LRGB mosaic COG (MSL_Gale_HiRISE-LRGB_78quads_sharp_cog.tif, same bucket); JPEG-in-TIFF tiles decoded via tag-347 JPEGTables splice | full-window tile census (240/240, no gaps); rendered crop visually inspected; map shows a dashed coverage-boundary marker outside the frame |
| Gale station positions (Rocknest sol 59 site 5, Shaler sol 120 site 5, JohnKleinCumberland sol 166 site 6, Departure sol 324 site 7) | lat/lon in stations.json, elevations from the Gale DEM | REAL DATA (verbatim record lon/lat) | NASA MMGIS MSL_waypoints.json (1388 records; easting/northing equal R*lon/lat(rad) exactly), https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json | scripts/verify_station_coords.py MATCH; test_provenance.py Gale section (station coords == MSL records; elevations inside the DEM window; every 10 m sample of all 10 legs recomputed vs heightmap_gale.json) |
| Shaler label | recorded rover viewpoint of the Shaler outcrop, not the outcrop coordinate | REAL DATA (wording) | NASA Science PIA16550 page (sol-120 Mastcam view); the outcrop's own coordinate is not surveyed in any source used | station card discloses viewpoint-not-outcrop |
| Drill-sites label timing | sol-166 waypoint record; drilling-period parking disclosed | REAL DATA (record) + DECLARED wording | MSL_waypoints site-6 records span sols 166-317; JPL John Klein / Cumberland pages | station card disclosure |
| Base - scenario start at Rocknest | declared scenario assumption, same record as Rocknest (0 m first leg) | DECLARED ASSUMPTION | no habitat/base exists in Gale sources; UI shows a DECLARED SCENARIO START badge, never BASE HABITAT | check_ui_outputs.mjs Gale check (badge absent) |
| Gale geology unit claims | none; named mission region only | UNAVAILABLE (map not found) | no downloadable SIM-scale polygon geology map covering Yellowknife Bay found; station cards state this explicitly and claim no unit | wording inspected in UI |
| MSL recorded traverse layer (public/data/rover_track_gale.json) | 58 recorded drive polylines + 20 site stops in the window | REAL DATA (verbatim record geometry) | NASA MMGIS MSL_traverse.json (1316 MultiLineString drive polylines), labeled "NASA recorded traverse geometry" in UI | rendered layer inspected; layer-label check in check_ui_outputs.mjs |
| Gale legs (public/data/legs_gale.json) | 10 legs, 0-60 m, 2 m-baseline slopes, geology null | REAL DATA (derived) | straight-segment sampling of heightmap_gale.json at 10 m | test_provenance.py recomputes every sample vs the grid |
| Gale station photos (public/img/gale/) | MSL Mastcam left E01 frames sols 59 / 120 / 182 / 324 | REAL DATA (photo) + ASSUMED content attribution | NASA raw-image feed metadata (sol, instrument MAST_LEFT); content = surface at the rover's recorded position that sol (deck-plate close-up candidate rejected by inspection) | scripts/verify_photos.py MSL section (feed ids 29246, 42459, 57908, 80376); frames visually inspected |
| Gale derived overlays (public/layers/gale/{elev_ramp,hillshade,slope}.png, contours.geojson, data/terrain_meta_gale.json) | elev -4523.0..-4491.2 m; slope max 37.1 deg at 2 m grid; 10 m contours | REAL DATA (derived views) | computed from heightmap_gale.json by scripts/build_overlays.py gale; UI labels them derived views of the same data, not independent measurements; slope labeled steepness display, not a safety rating | rendered overlays visually inspected |
| Gale 3D view | per-region heightmap + grayscale texture from the Gale HiRISE crop (public/layers/gale/ortho_3d.jpg) | REAL DATA (derived display) | footer text region-accurate (2 m grid decimated from MSL Gale DEM 1 m v3; HiRISE LRGB texture); camera/marker scale adapt to route spread, positions unmodified | rendered 3D visually inspected (all five station labels readable) |
| CRISM overlay (public/layers/gale/crism_vna.png) | 770 nm apparent reflectance over the full app window (pixel range 107-199, no nodata), 19.295149 m/px | REAL DATA (browse product; surface brightness, NOT mineral identification) | Opened sources: mosaic page http://crism.jhuapl.edu/msl_landing_sites/index_news.php ; GeoTIFF http://crism.jhuapl.edu/msl_landing_sites/2012July_Mosaics/VNA/MSL_gale_crater_targeted_mosaic_VNA_120723.tif ; world file http://crism.jhuapl.edu/msl_landing_sites/2012July_Mosaics/VNA/MSL_gale_crater_targeted_mosaic_VNA_120723.tfw (19.295149 m/px, origin x 8130184.3476 y -253707.2276). Product metadata from the page: simple cylindrical, 3072 px/deg, center of projection lon 0 / lat 0 (19.295149 m/px matches R=3396190 at that px/deg), constituent targeted observations RST-warped to the CTX basemap in ENVI with possible small residual offsets; VNA grayscale component is R770 (brightness reference). Stretch: provider-rendered browse grayscale, no additional stretch applied by us. Resampling: none - integer-pixel window crop; the browser smooth-scales at render | georegistration verified by transforming all four station lon/lat (R=3396190 simple cylindrical) through the world file: all land on covered pixels (Rocknest patch mean 184/255); integer-pixel crop, so window edges match the ortho extent approximately within one 19.3 m source pixel (small spatial offsets possible); isolated layer render visually inspected |
| CRISM HYD parameter mosaic | evaluated, NOT shipped | UNAVAILABLE for honest display | same product set (HYD_120723); in the app window the parameter signal is at/near zero at the default stretch and the page's caveat table would be needed to interpret it, so a black-looking overlay would mislead | pixel statistics of the window crop (196/9310 px above near-black) |
| Gale stop name status | informal mission names; no IAU-approved feature names at the stops | REAL DATA (status) | bounded search finding (not proof of absence): a 2026-11-13 search of the USGS Gazetteer found no IAU-approved names for Rocknest, Shaler, John Klein, or Cumberland (the only "Yellowknife" entry is a separate Mars crater, Feature 15032); a parallel bounded search found no approved names for the Jezero stops (Wildcat, Skinner, Kukaklek, Shuyak, Mageik) | legend note in the Gale map UI |
| Rover record timeline slider (SolTimeline.jsx) | slider over the full archived sol range per region filters the archived route/stop layers by metadata sol: Jezero archive sols 109-654 (per-position sol records; prefix filter), Gale archive site stops by solFirst (archive sols 3-433; drive polylines carry no per-segment sol record in the MSL archive and are explicitly not filtered) | REAL DATA (records) | same waypoint/traverse archives as the map layers; stop dots use the station record sols (Wildcat 502, Skinner 477, Kukaklek 629, Shuyak 565, Mageik 609; Gale Base/Rocknest 59, Shaler 120, John Klein/Cumberland 166, Departure 324); declared scenario starts have no record and are omitted; resets on region switch; UI states sparse records are not the measured driven path and that filtering never changes the walk plan | rendered slider visually inspected at mid-range and full extents in both regions; vitest asserts the sol-metadata contract on both archives |
| Plan A/B compare (PlanSummary.jsx) | user-pinned baseline plan vs current plan: planned minutes, route km, total ascent, objectives kept/deferred, time delta | FEATURE (derived from plan state) | computed live from the same plan object that drives the plan table; ascent is the exact sum of the DTM-derived leg ascents (legMetrics over public/data/legs*.json), no other source; pin clears on scenario switch so regions are never compared against each other | interaction tested in UI preview; vitest asserts per-leg ascent is finite and non-negative in both regions and that the compare total is the exact leg-ascent sum |
| Wider Jezero map extent (SIM 3464) | evaluated, NOT shipped | UNAVAILABLE within current data build | GeoUnits_v1 full-map extent measured from Nili.gdb: lon 76.8000-77.8017, lat 17.6988-18.7011 - the geology polygons exist far wider than the app window, and the shipped geology export window (lon 77.35-77.48, lat 18.40-18.50) already exceeds the ortho/DEM window; widening the map would require a new wider CTX DTM + orthomosaic download and rebuild | pyogrio extent read of Geodatabase/Nili.gdb GeoUnits_v1 |
