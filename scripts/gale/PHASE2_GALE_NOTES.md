# Phase 2 - Gale Yellowknife scenario: gate results and build design

Status 2026-11-13 18:24 EET: ALL GATES GREEN (full-crop level). Data build IN PROGRESS.
This file is the durable handoff for the remaining work.

## Done since the gate pass
- public/data/heightmap_gale.json: full window 949x919 @ 2 m (scripts/gale/build_gale_heightmap.py,
  range-read 919 strips, threaded), 0 nodata across the ENTIRE crop (not sampled).
- public/layers/gale/ortho_crop.jpg + ortho_crop_extent.json: FULL window rendered
  (scripts/gale/build_gale_ortho.py, 240/240 tiles, 0 empty, 0 dark), extent matches
  heightmap exactly; visually inspected - continuous real terrain.
- stations.json: + region field on all stations; + 5 Gale stations (GaleBase, Rocknest,
  Shaler, JohnKleinCumberland, Departure) with honest flags (viewpoint-vs-outcrop and
  nearest-record timing disclosed).
- scenarios.json: + "gale" (base GaleBase, 4 stops, priorities 1-4).
- public/data/legs_gale.json: build_legs.py --region gale (region-aware: per-region
  heightmap/output, geology null for Gale, slope key = slope2_deg at the 2 m baseline,
  degenerate 0 m leg GaleBase|Rocknest slope=null guarded). 10 legs, 15-60 m.
- public/data/rover_track_gale.json: scripts/gale/build_gale_track.py - 58 recorded
  drive polyline segments + 20 site stops (sites 2-21, sols 3-433) in the window.
  NOTE: lat min/max bounds bug fixed (y0 is the NORTH edge).
- CRS verified: MSL waypoint easting/northing == R*lon/lat(rad) exactly (dx=dy=0.0).
  Stops cluster at the window's NE corner - window covers them with margin elsewhere.
- Suite after all of the above: vitest 11/11, UI checks ALL PASS, coords 6/6, build clean.

## Parent inspection 18:31 - REQUIRED FIXES (next run, in order)
1. Plan table Time column clipped off viewport by long id "JohnKleinCumberland": add short
   display names (e.g. station.shortName: 'John Klein & Cumberland', 'YK Bay departure') used in
   plan table, map labels and profile dots; full names + source detail stay in the station card.
   Fix profile label overlap (JohnKleinCumberland vs Rocknest/Base) via short names/positions.
2. Map imagery covered only a bottom-left rectangle with black top/right around the route:
   VERIFY ortho bounds vs CRS placement live (fit map to ortho_crop_extent.json bounds and
   compare edges; check ImageOverlay anchoring at high zoom with the extended resolutions).
   Fit the view to the usable crop/route. Never pad missing extent with fake imagery:
   add a visible coverage boundary/label where the ortho crop ends.
3. Gale UI acceptance tests: check_ui_outputs.mjs must actually select the Gale scenario and
   exercise region-switch cycles (delta -> amalik -> gale -> delta), deriving expectations from
   scenarios.json + legs_gale.json + planner, never hardcoded. Current green suite is NOT
   acceptance for Gale.
4. Capture full desktop + mobile + 3D after these fixes (shot5_gale_3d.png exists from 18:31
   run end - inspect before reuse).
5. Cosmetic already known: PlanSummary duplicates 'not a surveyed path' (dtm string + template).
6. Then: Gale derived overlays + terrain_meta_gale + contours (generalize build_overlays.py),
   MSL photos (MAST_LEFT sols 59/120/182/324), PROVENANCE.md Gale section.

## NOT done (next run)
- UI wiring for region: App.jsx must fetch legs_gale/track_gale/terrain_meta_gale when
  scenario= gale (currently loads Jezero legs globally - DO NOT switch to Gale in the UI
  until wired; planner would miss legs). MapView gale layers (ortho_crop extent overlay,
  real-polylines track layer), Terrain3D per-region heightmap, ElevationProfile: hide
  geology strip + read slope2_deg for gale, handle 0 m leg (Base=Rocknest colocated).
- terrain_meta_gale.json + derived overlays (elev/hillshade/slope/contours) for Gale
  (generalize scripts/build_overlays.py).
- MSL photos: pick MAST_LEFT frames at sols 59/120/182/324, download to public/img/,
  extend public/data/station_photos.json + verify_photos.py (MSL API in section 4 below).
- verify_station_coords.py: add Gale records check (vs data_raw/MSL_waypoints.json).
- test_provenance.py: Gale parked-record checks; PROVENANCE.md Gale section with the
  exact source URLs below. check_ui_outputs.mjs: gale expectations (derive, never hardcode).
- Gale screenshot set + milestone report; update checkpoint tar.

## Verified gates (do not re-run unless sources change)

1. DEM coverage: `MSL_Gale_DEM_Mosaic_1m_v3.tif` (3.87 GB, striped TIFF, LZW, float32,
   1 m posting, nodata -32767, CRS Mars 2000 sphere eqc clon0 R=3396190 - matches
   waypoint easting/northing exactly). Window rows 27200-29037 x cols 17416-19313:
   218,270 px sampled, 0.00% nodata, elev -4522.9..-4491.3 m.
   Range-read + zlib LZW-strip decoder works (~0.1 s/row).
2. Ortho coverage: `MSL_Gale_HiRISE-LRGB_78quads_sharp_cog.tif` (1.03 GB COG,
   36000x76000, 0.25 m/px, RGB, compress=7 JPEG-in-TIFF, 512 px tiles,
   tie (8140000, -270000)). 9/9 sampled tiles across the window decode, no
   black/nodata pixels; sample tile visually confirmed real terrain
   (scripts/gale/gale_ortho_sample.png).
   DECODE RECIPE: tiles are bare JPEG streams missing quantization tables; splice in
   tag 347 JPEGTables: `SOI + tables-body + tile-body` (strip SOI from tile, strip
   SOI/EOI from tables), then imagecodecs.jpeg_decode. PIL alone fails.
   Window in full-res px: cols 21641-29228, rows 7927-15277.
3. Stop names <-> positions (all from data_raw/MSL_waypoints.json records, 1388 features):
   - Rocknest (scoop sols 61-71, PIA16173 jpl.nasa.gov/images/pia16173-curiosity-digs-in/):
     position = sol-59 record site 5: lat -4.5899957, lon 137.4483418
   - Shaler viewpoint (Mastcam view sol 120, PIA16550
     science.nasa.gov/resource/layered-martian-outcrop-shaler-in-glenelg-area/):
     position = sol-120 record site 5: lat -4.5904425, lon 137.4488299
   - John Klein & Cumberland drill sites, MERGED stop (JPL news 2013-05-20:
     Cumberland drilled sol 279, 2.75 m west of John Klein, both Yellowknife Bay;
     John Klein first drill PIA16832 science.nasa.gov/resource/location-of-john-klein-drill-site/):
     position = sol-166 record site 6: lat -4.5894849, lon 137.4491296
     (sol-274 Cumberland record is ~2.4 m away - same walking stop)
   - Yellowknife Bay departure (JPL news 2013-07-08: sol 324 first drive of Mount
     Sharp trek, leaving Glenelg/Shaler): position = sol-324 record site 7:
     lat -4.5902026, lon 137.4487282
   - Point Lake DROPPED as separate stop: sol-193 viewpoint has no distinct record
     (records jump 166 -> 272); it would duplicate the drill-site cluster within meters.
   - Base = declared scenario-start assumption at first stop (Rocknest), same
     convention as Jezero Depot honesty flags. NOT a real installation.
4. Photos: MSL raw-images API has MAST_LEFT frames at sols 59, 120, 182, 324
   (instrument filter: condition_4=MAST_LEFT:instrument:eq).
   API base: https://mars.nasa.gov/api/v1/raw_image_items/?order=sol+asc&condition_1=msl:mission&condition_2=SOL:sol:gte&condition_3=SOL:sol:lte&condition_4=MAST_LEFT:instrument:eq&per_page=100
5. Recorded drive polylines: data_raw/MSL_traverse.json (1316 segments) - NASA recorded
   traverse geometry, distinct from Jezero's connected sparse recorded positions.

## Data landed in repo

- data_raw/MSL_waypoints.json, data_raw/MSL_traverse.json + SHA256SUMS.txt entries.

## Build design (agreed)

- stations.json: add `region: "jezero"|"gale"` to every station; add Gale stations:
  GaleBase (scenario start, at Rocknest position, assumption flags), Rocknest,
  Shaler, JohnKleinCumberland, Departure. Honest flags per station (record sol,
  source page, "recorded rover position, not surveyed target point").
- scenarios.json: add "gale": label "Gale - Yellowknife Bay", base "GaleBase",
  stops Rocknest/Shaler/JohnKleinCumberland/Departure, priorities 1-4. Blurb notes
  Curiosity, Sheepbed mudstone, Yellowknife Bay; geometric planning demo only.
- Per-region data files (keep Jezero files untouched):
  public/data/heightmap_gale.json (same schema {nx,ny,dx,x0,y0,values}; crop
    ~500x500 m around easting 8147750, northing -272100 at 1 m or 2 m posting),
  public/data/legs_gale.json (build_legs.py --region gale; geology null),
  public/data/rover_track_gale.json (REAL polylines from MSL_traverse.json cropped
    to window),
  public/data/terrain_meta_gale.json,
  public/layers/gale/ortho_crop.jpg (+ elev_ramp/hillshade/slope/contours from
    build_overlays.py generalized),
  public/img/gale_*.jpg (MSL MAST_LEFT frames).
- App wiring: scenario -> region -> data URL prefix; App.jsx fetches per-region
  legs/track/meta; Terrain3D per-region heightmap; MapView per-region layers;
  geology strip + geology.geojson hidden/null for gale (no SIM-scale polygon map
  FOUND for Gale - wording: "not found", not "none exists"); named mission regions
  with stop-level sources instead.
- Gale CRS note: DEM/ortho/waypoints share eqc clon0 R=3396190; app worldXY already
  uses R=3396190 eqc, so lon/lat -> x/y is the same formula. Keep the
  proj4leaflet Mars-radius override.
- Tests to extend: verify_station_coords.py (+4 Gale records vs MSL_waypoints.json),
  verify_photos.py (+4 MSL frames), test_provenance.py (parked checks: no
  intervening drives between record sols and event sols), check_ui_outputs.mjs
  (gale scenario expectations derived from planner+data, never hardcoded),
  PROVENANCE.md Gale section with the source URLs above.
- Standing constraints: Mars-only data; observed/derived/assumed differentiated;
  no walkability/safety claims; base never a real habitat; no push/deploy without
  separate explicit user approval.

## 18:40 closeout - Gale scenario COMPLETE
- check_ui_outputs.mjs rewritten: per-scenario provenance checks driven by scenarios.json + served legs files; runs default, then every scenario via the real switcher, then back to default (full region-switch cycle). 36 PASS, 0 FAIL.
- Gale acceptance checks included: Gale ortho basemap, geology strip hidden, no BASE HABITAT badge, traverse layer wording.
- 3D fixes: Terrain texture was hardcoded to the Jezero CTX file (Jezero imagery was draped on the Gale DEM) - now per-region; new public/layers/gale/ortho_3d.jpg (grayscale 1024x992 from the Gale crop). Camera distance + marker size now scale with route spread; Gale label offsets added; footer/loading text region-accurate (2 m grid decimated from MSL Gale DEM 1 m v3, HiRISE LRGB texture).
- ElevationProfile: Rocknest dot label bottom (Base/Rocknest share the 0 m point), Departure bottom.
- Full suite green after all edits: vitest 11/11, check_ui_outputs 36 PASS, verify_station_coords VERIFIED, test_provenance ALL PASS, build OK.
- Final captures inspected: /tmp/gale_final_desktop.png, gale_final_3d.png, gale_final_mobile.png (+ /tmp/jezero_3d_check.png regression check).
- Note: GaleBase and Rocknest share the MSL sol-59 record, so leg Base->Rocknest is 0 m by construction; both dots/labels shown, disclosed in station text.

## 18:44 - Gale derived overlays live + parent fix round 2
- build_overlays.py generalized: `python3 scripts/build_overlays.py gale|jezero`. Gale outputs: public/layers/gale/{elev_ramp,hillshade,slope}.png + contours.geojson (3 levels x 10 m on the 31.8 m window), public/data/terrain_meta_gale.json (slopeMax 37.1 deg @ 2 m grid, source names USGS MSL Gale DEM Mosaic 1 m v3 decimated to 2 m). Jezero outputs regenerated identical.
- MapView OVERLAY_LAYERS now region-aware (was hardcoded /layers/...); App.jsx already fetched terrain_meta_gale + gale contours soft-fail.
- ElevationProfile provenance note gets break-all (long DEM filename no longer spills).
- Terrain3D camera min clamp 0.28 -> 0.15: Gale cluster now fills the 3D view; all 5 labels readable (screenshot inspected).
- Suite after edits: build OK, vitest 11/11, check_ui_outputs ALL PASS (36), verify_station_coords VERIFIED, test_provenance ALL PASS.
- Captures: gale_final_desktop.png (Elevation colors + Contours on, layers panel shows Gale-derived source text), gale_final_3d.png (tighter framing), gale_final_mobile_profile.png (mobile lower view: full plan table w/ Time col, profile dots, wrapped provenance notes).

## 18:48 - MSL photos live + parent fix round 3
- MSL photos wired for all four Gale stops (public/img/gale/*.jpg, 800px, from MSSS E01 full frames):
  Rocknest sol 59 0059ML0002690010102306E01 (wheel+surface; same sol as record),
  Shaler sol 120 0120ML0007520010103767E01 (layered outcrop from the recorded viewpoint),
  Drill sites sol 182 0182ML0007400000105276E01 (veined drilled mudstone; site-6 parking spans sols 166-317 in MSL_waypoints),
  Departure sol 324 0324ML0013150010107838E01 (terrain at trek start; same sol as record).
- station_photos.json gains MSL entries; verify_photos.py extended for the MSL api/v1 feed - all 4 verified in NASA feed (ids 29246/42459/57908/80376; photoNote links use those).
- Photo selection was visually inspected: the first sol-59 candidate was a deck-plate close-up, rejected; chosen frame shows wheel + Rocknest surface.
- ElevationProfile X axis: sub-km routes now tick in meters ("0 m .. 157 m"); km ticks unchanged for Jezero.
- Terrain3D Gale label offsets widened (Rocknest/Departure no longer near-touching).
- Suite after edits: build OK, vitest 11/11, check_ui_outputs ALL PASS (36).
- 18:49 PROVENANCE.md Gale section appended (src/data/PROVENANCE.md) with the full evidence table above.

## 18:54 - Phase 3 start: CRISM shipped, IAU bounded result
- CRISM: bounded check FOUND coverage. JHU/APL Gale targeted-mosaic VNA_120723 (19.295 m/px simple cylindrical, tfw origin 8130184.35,-253707.23): station pixels verified covered (patch mean ~184, range 107-199 full window). Cropped to the app window -> public/layers/gale/crism_vna.png (98x95), Gale-only layer toggle with caveat label. HYD parameter mosaic evaluated but NOT shipped: signal near-zero across the window (196/9310 px above near-black) and needs the product's caveat table to interpret - black overlay would mislead. PROVENANCE rows added for both.
- IAU names: bounded result - no IAU-approved feature names at the stops (USGS Gazetteer searched 2026-11-13; only "Yellowknife" entry is a separate crater, Feature 15032). Legend shows the informal-name note; Gale source links corrected (Gale DEM, MSL waypoints MMGIS, CRISM mosaic) replacing the Jezero SIM 3464 link; station color legend uses short names.
- Suite after edits: build OK, check_ui_outputs ALL PASS, vitest 11/11.
- TODO next run: MEDA Jezero captions (sols 477/502 CAL_ATS/CAL_PS already audited - fetch CSVs, compute measured ranges, add per-stop "measured conditions" captions labeled not-modelled), HiRISE Gale gate note (already 1 m DEM - document), sol timeline, A/B compare.
- 18:55 CRISM sourcing hardened per parent: exact tif/tfw URLs, 19.295149 m/px simple-cyl metadata, no-resampling note, georegistration = station-pixel verification; label now "brightness only, NOT a mineral map"; IAU wording now "bounded search found no approved names" (Jezero stops also checked, none found). Isolated CRISM-on capture: /tmp/gale_crism_isolated.png.

## 2026-11-13 19:12 EET - "finish it" complete
Final state: ALL approved features shipped, suite fully green.
- SolTimeline.jsx: interactive sol slider filters archive layers by metadata sol
  (Jezero per-point prefix filter over rover_track.json sols 109-654; Gale stops
  by solFirst over rover_track_gale.json sols 3-433; drive segments have NO
  per-segment sol in MSL_traverse.json - stated in UI, not invented). Resets on
  region switch (App.jsx region effect).
- PlanSummary A/B compare with ascent (exact sum of legMetrics asc). Pin clears
  on scenario switch.
- MEDA per-sensor captions (T1-T5 + BAROCAP1/2/3) from data_raw/meda CSVs;
  scripts/test_meda.py recomputes and asserts captions. Label record counts
  include the header line (30957 label = 30956 data rows).
- Fixed: "BASE HABITAT" tag -> "DECLARED SCENARIO START" (StationPanel.jsx);
  test_provenance.py MSL feed branch (was mars2020-only, 8 false failures).
- Suite: build, vitest 15/15, test_meda, check_ui_outputs (36), test_provenance,
  verify_station_coords, verify_photos - ALL PASS.
- Final previews: /tmp/fin_*.png, /tmp/shot4_*.png, /tmp/gale_final_*.png
  (regenerate with CHROME_PATH=/usr/bin/google-chrome node scripts/shot_finish.mjs etc.)
- Checkpoint: /tmp/marswalk_checkpoint_final.tar.gz (11.3 MB; excludes
  node_modules, dist, SIM gdb/zip, big tif/IMG raws; includes data_raw/meda).
- Omitted (documented in PROVENANCE): CRISM HYD, highres opt-in basemap, wider
  SIM extent (needs new DTM/ortho build), Kodiak, Gale geology strip.
- OPEN: push to ziad branch never approved/answered. No push/deploy done.

## 2026-11-13 19:18 EET - closeout fixes
- SolTimeline label collisions fixed via 4-lane greedy assignment with leader lines.
- check_ui_outputs.mjs: +9 timeline assertions on RENDERED layers (route polyline
  shrinks/restores with slider, exact record-count text, marker dimming, Gale
  stops filter by solFirst, segments unfiltered + honesty text). Note: Leaflet
  viewport-simplifies polylines, so vertex counts are subsets - assert relative
  change + on-screen counts, not raw record counts.
- Proof shots: scripts/shot_proof.mjs -> /tmp/proof_*.png (before/after route and
  stop filtering with archive layers ON; mobile per scenario).
- Layer checkbox automation: click input inside label via
  locator('label', {hasText}).locator('input').check(); text= clicks hit wrong nodes.
