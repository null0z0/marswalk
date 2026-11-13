# Data provenance

Every number, coordinate, elevation, image, caption and label shown as DATA in
this app traces to one of the sources below. Rebuild: `sh scripts/fetch_sources.sh`
then the listed script. Checksums: `data_raw/SHA256SUMS.txt`.

## Sources

1. USGS Mars 2020 TRN CTX DTM, 20 m (JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0.tif)
   - URL: https://planetarymaps.usgs.gov/mosaic/mars2020_trn/CTX/JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0.tif
   - Product page: https://astrogeology.usgs.gov/search/map/Mars/Mars2020/JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0
   - Downloaded: 2026-11-13 (data_raw/dtm.tif, sha256 in SHA256SUMS.txt)
   - Derives: public/data/heightmap.json (scripts/build_heightmap.py) -> 3D mesh, station elevations;
     public/data/legs.json (scripts/build_legs.py) -> leg distances, ascent, elevation profile.
     Distances = straight-segment length; ascent = sum of positive 10 m DTM steps (>= net gain).
2. CTX orthomosaic (6 m/px), ASU/ArcGIS OnMars CTX service
   - URL: https://astro.arcgis.com/arcgis/rest/services/OnMars/CTX/MapServer
   - Derives: public/layers/ortho_3d.jpg, ortho_crop.jpg (map/terrain textures, display only).
3. USGS SIM 3464 (Geologic Map of Jezero Crater and Nili Planum)
   - URL: https://pubs.usgs.gov/sim/3464/ (GIS data: sim3464_database.zip, checksum recorded)
   - Downloaded: 2026-11-13
   - Derives: public/geology.geojson unit polygons (converted during project build from the
     SIM 3464 geodatabase; conversion not re-runnable here - Esri .gdb needs GDAL).
     Station unit labels verified by point-in-polygon: scripts/check_geology.py.
4. Perseverance waypoints (NASA MMGIS M20 feed)
   - URL: https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints_current.json (live latest),
     history via https://github.com/stiles/mars-perseverance-waypoints (archived NASA feed snapshots)
   - Downloaded: 2026-11-13 (data_raw/rover_points_full.geojson)
   - Derives: Wildcat/Skinner stop coordinates = rover position on the photo sol
     (Wildcat sol 502, Skinner sol 477). Verified: scripts/verify_station_coords.py.
5. Mastcam-Z raw images (NASA Mars 2020 raw image archive)
   - URLs: per image in public/data/station_photos.json, e.g.
     https://mars.nasa.gov/mars2020/multimedia/raw-images/ZL0_0502_0711509044_013EBY_N0261222ZCAM07101_1100LMJ
   - Captions/sols verified against the NASA raw-images API: scripts/verify_photos.py.
   - Kodiak image (sol 275) is a remote view of the butte; the stop coordinate is APPROXIMATE
     and UNVERIFIED (no rover visit, no published surveyed coordinate found) - flagged in the UI.

## Declared assumptions (not data)

EVA window, dwell time, pace, stop costs, the +60 overrun rule, and the
hypothetical crewed habitat at the real Three Forks depot site are declared
scenario inputs, labeled as such in the UI.

## Known limitations

- Kodiak stop coordinate: approximate map reading; no citable surveyed value - flagged unverified.
- geology.geojson conversion from the SIM 3464 geodatabase predates this audit; the source
  database and checksum are recorded but re-conversion requires GDAL.
- MEDA environmental conditions are not modelled (declared in the UI).
