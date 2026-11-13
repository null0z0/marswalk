# Data provenance

Every number, coordinate, elevation, image, caption and label shown as DATA in
this app traces to one of the sources below. Reproduce: `sh scripts/fetch_sources.sh`
(downloads all raw files; the SIM 3464 geodatabase extracts into data_raw/), then
`python3 scripts/test_provenance.py` re-verifies every derivation against the raw
sources. Checksums: `data_raw/SHA256SUMS.txt` (the 349 MB SIM 3464 zip is kept
outside the repo; its checksum is recorded).

## Sources and derived files

1. USGS Mars 2020 TRN CTX DTM, 20 m (JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0.tif)
   - https://planetarymaps.usgs.gov/mosaic/mars2020_trn/CTX/JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0.tif (downloaded 2026-11-13, data_raw/dtm.tif)
   - Derives: public/data/heightmap.json (scripts/build_heightmap.py; 3D mesh + station
     elevations; cm-rounded cell values, verified cell-for-cell against the GeoTIFF);
     public/data/legs.json (scripts/build_legs.py; straight-segment distance, 10 m
     nearest-cell samples, ascent = sum of positive steps >= net gain).
2. USGS CTX orthomosaic, 6 m (JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0.tif)
   - https://planetarymaps.usgs.gov/mosaic/mars2020_trn/CTX/JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0.tif (downloaded 2026-11-13, data_raw/orthomosaic_6m.tif)
   - Derives: public/layers/ortho_crop.jpg + ortho_3d.jpg (scripts/build_ortho.py;
     verified pixel-for-pixel against the same window of the GeoTIFF).
3. USGS SIM 3464 geologic map geodatabase (sim3464_database.zip, Geodatabase/Nili.gdb, layer GeoUnits_v1)
   - https://pubs.usgs.gov/sim/3464/sim3464_database.zip (downloaded 2026-11-13; checksum in SHA256SUMS.txt; re-extract with scripts/fetch_sources.sh)
   - Derives: public/geology.geojson (scripts/build_geology.py: reads GeoUnits_v1 in
     MTM_clon77.5E, transforms to Mars geographic lon/lat); station unit labels verified
     by point-in-polygon against the geodatabase polygons (scripts/test_provenance.py).
4. Perseverance waypoints (NASA MMGIS M20 feed archive)
   - https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints_current.json, history via
     https://github.com/stiles/mars-perseverance-waypoints (data_raw/rover_points_full.geojson, downloaded 2026-11-13)
   - Derives: stop coordinates = rover position on the cited sol (Wildcat sol 502,
     Skinner sol 477, Base/Depot sol 654 depot-emplacement position, +/- depot area).
5. Mastcam-Z raw images (NASA Mars 2020 raw-image archive API)
   - https://mars.nasa.gov/mars2020/multimedia/raw-images/ZL0_0502_0711509044_013EBY_N0261222ZCAM07101_1100LMJ (sol 502), .../ZL0_0477_0709275045_285EBY_N0260850ZCAM08498_1100LMJ (sol 477), .../ZL0_0275_0691341248_678EBY_N0080000ZCAM08292_1100LMJ (sol 275)
   - Verified via the NASA raw-images API (imageid, sol, camera; NASA captions state
     only sol/camera, so outcrop attribution in the UI comes from the rover position
     that sol and is labeled as such).

## Declared assumptions (not data)

EVA window (default 300 min), dwell time (default 60 min), pace (default 1.0 km/h),
the +60 overrun rule, and the hypothetical crewed habitat at the real Three Forks
depot site. All are labeled "declared assumptions" in the UI; all times derive from
them applied to the real DTM distances.

## Unavailable items

- Kodiak stop coordinate: no numeric coordinate found in the opened sources (NASA M20
  waypoints feed, USGS SIM 3464 geodatabase, NASA photojournal and published studies
  describe Kodiak butte only relative to the landing site, ~2.3 km west). The earlier
  approximate coordinate (18.4633, 77.4107) was also inconsistent with those
  descriptions and has been REMOVED. The stop shows "position unavailable - not
  routable"; its unit label is unavailable too (it derived from the coordinate).
  Its verified sol-275 photo remains.
- Kodiak route legs, elevation, time savings: removed (they required the coordinate).

## Distance regeneration note

The pre-audit legs.json was produced by an earlier, undocumented process and was
~1% off a straight-segment DTM resample (e.g. Depot-Wildcat 381.44 m old vs
377.33 m recomputed at the same coordinates). The current legs.json is regenerated
by scripts/build_legs.py and re-verified by scripts/test_provenance.py. The Base
coordinate was then moved to the sourced sol-654 waypoint (18.45253, 77.40784),
giving the current loop 380.19 + 20.14 + 389.19 = 789.52 m (header "0.79 km";
table, header and profile agree - locked by tests).
