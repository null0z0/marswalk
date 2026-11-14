
## M8 - Global overview + catalog (2026-11-14)
- GlobalView: NASA/JPL Mars Trek WMTS tile service, Viking MDIM 2.1 color mosaic, 232 m/px, layer `Mars_Viking_MDIM21_ClrMosaic_global_232m`, tile URL pattern https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0//default/default028mm/{z}/{y}/{x}.jpg (verified live: HTTP 200 JPEG tiles, streamed in-app with Leaflet EPSG:4326). No key, free. Visual orientation ONLY - banner in-app states this verbatim; no planet-wide routing or numeric elevation is claimed from this layer.
- public/data/mission_sites.json: 16 real Mars sites (ingenuity-final omitted per catalog instruction), lon normalized to +/-180, site_type drives marker symbols, positions labeled "context precision - not routing targets" in popups. Source: mars-mission-sites-catalog-461080d6.json input; NOT all independently verified.
- Detailed windows: two clickable rectangles (Jezero, Gale) jump into the existing numeric 20 m / 2 m workspaces; only inside those does route computation exist.
- Global numeric elevation feasibility probe (not integrated): USGS HRSC/MOLA blended global 200 m DEM v2, https://planetarymaps.usgs.gov/mosaic/Mars/HRSC_MOLA_Blend/Mars_HRSC_MOLA_BlendDEM_Global_200mp_v2.tif - verified reachable, 11,384,463,908 bytes BigTIFF, HTTP range requests supported (206). HF mirror Biscut4Biscuit/mola-hrsc-baseline-cog (3.55 GB COG, ZSTD, 512px tiles, overviews; claims lossless conversion - claims unverified, ZSTD browser decode + CORS untested). Not incorporated into the app.

## M9 - Globe presentation + traverse connector honesty (2026-11-14)
- GlobalView is now a rotatable 3D globe (react-three-fiber/three, existing deps). Texture: public/data/mars_viking_mdim21_2048.jpg (2048x1024 equirectangular, 534 KB) composited by scripts (32 tiles, zoom 3, EPSG:4326) from NASA/JPL Mars Trek Viking MDIM 2.1 color mosaic 232 m/px, tile pattern https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0//default/default028mm/{z}/{y}/{x}.jpg. Visual orientation only; banner states the globe does not imply planet-wide detail or routing.
- Marker/site alignment check: #globelon=77.45&globelat=18.44 test URL centers the camera on Jezero; Perseverance marker lands at canvas center (493,298 vs 500,303, within marker half-size). Marker shapes distinct per site_type (circle/triangle/diamond/square/cross) + color.
- Traverse synthetic connectors: stop-pad join edges (<=15 m) are tagged synthetic in src/lib/traverse.js; drawn dashed with tooltip "no recorded drive data across this gap"; header model label and route card disclose connector meters (e.g. Rocknest->Drill: 0.10 km total incl. 90 m connectors). Connectors are NOT recorded drive ground; endpoints snap within 120 m and snap distances are shown; direction vs driven record (sol order) disclosed when reversed.
- Global elevation feasibility (NOT integrated): HF COG https://huggingface.co/datasets/Biscut4Biscuit/mola-hrsc-baseline-cog (3.55 GB, int16 - README says float32, wrong but values plausible) and USGS source https://planetarymaps.usgs.gov/mosaic/Mars/HRSC_MOLA_Blend/Mars_HRSC_MOLA_BlendDEM_Global_200mp_v2.tif (11.38 GB BigTIFF) both support HTTP range + CORS *. geotiff.js (Node) decoded the COG: header <1 s, ~1 s per tile sample. Point checks vs independent sources: Gale sample (-4.5895, 137.4417) = -4503 m vs published Curiosity landing -4501 m MOLA (space.stackexchange.com/questions/22844 citing MOLA; JPL mission pages agree ~-4500 m) -> |2 m|. Jezero sample (18.4447, 77.4508) = -2573 m; independent citation for exact floor elevation still weak (approx -2.57 km crater floor) - flagged, not claimed validated.
- License (verbatim from USGS page https://astrogeology.usgs.gov/search/map/mars_mgs_mola_mex_hrsc_blended_dem_global_200m): "Access Constraints: MOLA (CC0) and HRSC (CC BY-SA 3.0 IGO)". CC BY-SA 3.0 IGO requires attribution + share-alike; applies to derived DEM data products. HF mirror sets no own license ("Check the source provider's terms"). Citation: Fergason, R. L, Hare, T. M., & Laura, J. (2018). HRSC and MOLA Blended DEM at 200m v2. Astrogeology PDS Annex, USGS.
- Method-claim discipline: sampling a straight chord between two global points is NOT global terrain-aware pathfinding; any global route output must be labeled by its actual method and actual sample spacing (200 m grid ~= 0.003374 deg), and no global route-quality claims until then.

## M10 - QA reconciliation + IAU nomenclature (2026-11-14)
- Nomenclature: public/data/mars_nomenclature.json, 2055 official named features from the IAU/USGS Gazetteer of Planetary Nomenclature (MARS_nomenclature_center_pts shapefile, https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/MARS_nomenclature_center_pts.zip via https://planetarynames.wr.usgs.gov/GIS_Downloads). Fields: name/lat/lon(+-180)/diameter km/type/link. Globe labels are zoom-tiered (camera distance -> min diameter 600/300/120/50/15 km), front-hemisphere filtered (deterministic dot-product, not drei occlusion - back-side leak fixed), capped at 60. Unnamed ground is never labeled.
- Globe texture honesty: banner now separates source resolution (Viking MDIM21 232 m/px) from displayed texture (~10 km/px at equator, 2048 px). QA verified texture-vs-source alignment independently (NCC 0.9954, flips rejected, landmarks verified).
- Traverse graph correctness (independent QA defects fixed): joins now ONLY between endpoints of DIFFERENT segments within 15 m (stop-pad candidates) - intra-segment shortcut chords eliminated (Dijkstra can no longer cut corners inside recorded geometry); coincident endpoint pairs (d==0) now join (were skipped). Strict recorded mode is the default: any synthetic-connector path is REFUSED with the gap distance (e.g. Rocknest->Drill: "gap of about 90 m... No path drawn in strict recorded mode"); bridging requires the explicitly-labeled opt-in "Experiment" checkbox. Endpoint snap access hops disclosed as not drawn / not part of distance. On refusal no straight-line fallback is drawn or reported for that pair (refusal only). Tests updated (strict-refusal assertions + opt-in pass-through).
- Known remaining (next): graph build O(segments^2) precompute offline; solFirst 57 vs station sol-59 record reconciliation note; snap-too-far copy now reports min and max correctly.
- Snapshot completeness: tar now includes root index.html + vite config; stale src/App.jsx.orig removed.

## M10b - Nomenclature label layout (2026-11-14)
- Gazetteer export: https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/MARS_nomenclature_center_pts.zip (linked from https://planetarynames.wr.usgs.gov/GIS_Downloads). ALL 2055 rows carry approval="Adopted by IAU" - no status filtering applied or needed; completeness claim = "every IAU-adopted named Mars feature in this export", not "all ground has a name".
- Globe labels now use screen-space layout: candidates tier-filtered by camera distance, strong front-facing cull (dot > 0.25, hides limb), projected to screen each ~120 ms, priority = feature diameter, greedy minimum spacing 52 px (44 px mobile), caps 40 (24 mobile), and culling under the banner and entry-button overlays via live DOM rects. Back-side leak fixed (deterministic front filter replaces drei occlusion).
- Banner renders the dual-resolution text live: "source 232 m/px, shown here downsampled to ~10 km/px (2048 px globe texture)" (verified in m10_globe_syrtis.png pixels).
- Mobile: banner collapsed by default under 560 px; entry buttons compact row bottom-left.

## M10c - QA reconciliation round 2 (2026-11-14)
- pathParts off-by-one fixed: nodes tagged by INCOMING edge so drawn run boundaries match recorded/synthetic edge boundaries exactly (QA: join had rendered solid, preceding recorded edge dashed). Known-edge regression test added (3-run path, join exactly the synthetic run, syntheticM within 0.1 m of the known 5 m gap). 84/84 tests.
- Real Gale numbers after endpoint-only joins (QA-verified): Rocknest->Drill = 228.9 m recorded + ~13.5 m join = ~242 m total. Earlier "90 m" figures were inflated by intra-segment chords; corrected here. Strict refusal reports the live gap value.
- Graph build perf: ~216 ms after endpoint-pair candidate pruning (was ~3 s all-pairs) - offline precompute NOT needed; earlier "remaining: precompute" item closed.
- solFirst 57 (MMGIS traverse stop record) vs station sol-59 (waypoint record): different archive records of the same stop, cross-referenced here; no data change.

## M10d - Global coarse elevation panel (shipped path)
- Live browser range-fetch of the full 3.55 GB COG via geotiff.js hung on decode workers in the bundled app (never completed within 60 s). Replaced with a BOUNDED derived product: overview level 6 (~12,804 m/px, 1667x833 int16, 2.8 MB) exported offline from the same USGS HRSC/MOLA Blend DEM v2 COG mirror -> public/data/global_dem_l6.bin + .json meta (bbox, degPerPx, m/px, license, citation). Grid min -8156 m (Hellas) / max +21034 m (Olympus Mons) - matches known Mars extremes.
- chordProfile(): straight-chord sampling of the coarse grid, 96 samples, planar distance approximation. UI discloses actual sample spacing (~12,804 m), method ("NOT terrain-aware pathfinding, NOT a route"), and license (MOLA CC0 + HRSC CC BY-SA 3.0 IGO).
- Validation (verify_dem.mjs, real browser): Jezero->Gale chord 3783.3 km; endpoints vs published: Jezero grid -2626 m vs ~-2573 m (weak citation, within 500 m), Gale grid -4044 m vs -4501 m MOLA (within 600 m; the 12.8 km coarse cell averages the crater floor with the higher rim - resolution artifact, not an error). Time-to-profile ~2 s. No page errors. Screenshot /downloads/m10_dem_browser.png.
- Suites green after change: vitest 84/84, verify_counts ALL PASS, verify_routemodel ALL PASS.

## M10e - QA recheck fixes (global DEM geometry + labeling)
- Independent QA compared all 1,388,611 shipped grid cells against the source COG
  overview via HTTP ranges: PIXEL-EXACT, 0 mismatches, byte order confirmed, 0 nodata
  cells present. Reusable script kept in-repo: scripts/dem_exact_compare.py
  (re-run here with the same result). This replaces any endpoint-tolerance argument;
  value equality is exact, not plausible.
- globalelev.js rewritten per QA findings: (1) sampling path is now the true great
  circle (slerp), dateline-safe - Mars 3 (-158E) -> Spirit (175.48E) regression test
  asserts 2235.7 km (the raw linear-lon bug produced ~19,700 km); (2) distance is
  haversine on R=3389.5 km, replacing the inconsistent planar 59/59.289 constants;
  (3) per-axis pixel indexing (x and y scales differ); (4) nodata -32768 recorded in
  global_dem_l6.json and mapped to null in sampling (no nodata cells exist today).
- UI wording: "great-circle" everywhere (was "chord"); heading states actual
  ~12.8 km/px sampling prominently; banner reconciled - no longer claims elevation
  exists ONLY locally; new "Available here / Only in local workspaces / Not
  available" list. SUPERSEDED 2026-11-14: the geology characterization here was
  wrong - Jezero DOES have spatial USGS SIM 3464 geology polygons (map overlay +
  profile strip, shipped 2026-11-13) and Gale has a spatial CRISM 770 nm overlay
  (shipped 2026-11-13 18:54). Correct inventory in M10f below. THEMIS/CRISM thermal/
  mineral = no real dataset integrated, none shown); source-mosaic polar seam
  disclosure confirmed rendered (was previously reported but had not landed in code).
- Strict-refusal copy: zero-distance record break now says "zero-distance archive
  break" instead of "gap of about 0 m".
- Accidental tool-output artifacts (content/name/structured) removed from repo root;
  excluded from snapshots.
- Suites after all fixes: vitest 84/84, verify_counts PASS, verify_routemodel PASS,
  verify_dem PASS (labels, dateline regression, no page errors, ~0.2 s profile time).

## M10f - Local layer inventory correction + active-route 3D + QA caveats
- Inventory correction (history ascertained from repo build notes 2026-11-13):
  Jezero SIM 3464 geology polygons (map toggle + elevation-profile strip) and Gale
  CRISM 770 nm VNA overlay (JHU/APL 2012 targeted mosaic crop) are EXISTING layers
  shipped 2026-11-13, not new M10 work. My 02:31 report's "geology metadata only /
  no CRISM" was wrong; superseded.
- Focused QA 2026-11-14: Jezero SIM 3464 polygons verified correct CRS/units,
  6/6 stations point-in-polygon; Gale CRISM PNG pixel-exact vs source crop;
  MEDA captions quote source CSV numbers exactly and are labeled not-modelled.
- Registration caveats added to UI: SIM 3464 uses a semi-controlled CTX basemap
  (~100-200 m registration offset vs surface-ops CTX rover waypoints) - toggle
  label now says unit boundaries are approximate at stop scale, not contact-level.
  CRISM label now states source resolution 19-38 m/px (FRT ~19 m, HRL ~38 m)
  instead of a single misleading 19 m figure. Gale SIM-scale geology: phrased
  "not found in a bounded search / not integrated", never "none exists".
- 3D active-route fix: Terrain3D in two-point route mode now renders ONLY the
  active route geometry (recorded-traverse polylines / least-cost path / straight
  pair - same choice as the 2D map) with the two real endpoint names; no Base
  marker, no retained planner legs, no return line. Planner mode unchanged.
  Verified in fin_jezero_3d.png.
- gridAt periodic-boundary clamp + 6 regression tests (90/90 vitest).
- Mobile metrics strip: long route titles ellipsize instead of overlapping.
- Suites: vitest 90/90, verify_counts PASS, verify_routemodel PASS, verify_dem PASS.

## M10h (2026-11-14 03:0x EET) — 3D drape + synthetic distinction closure
- Terrain3D route polyline: resampled to ~10 m segments in projected meters, every sample draped on the local DTM/DEM +1.5 m (was vertex-only +1.5 m). Horizontal geometry and all computed distances/elevations unchanged; display lift only, disclosed as such.
- 3D experiment mode now mirrors the 2D recorded-vs-synthetic distinction: recorded traverse runs render solid #a3e635 green, synthetic connectors render dashed (dashSize 10 / gapSize 7) from traverseResult.pathParts with the same incoming-edge attribution as 2D. Non-traverse route modes stay solid cyan. Strict refusal draws no route in 3D, same as 2D.
- Grazing-angle view: route can be correctly occluded by ridge silhouettes; continuity is shown from a kept-elevation rotated view. This is terrain occlusion, not a missing path.
- Evidence pixels: fin_jezero_3d.png, fin_jezero_3d_rot.png, fin_gale_3d_recorded.png, fin_gale_3d_synth.png (current build).
- Suites after change: vitest 90/90, verify_counts PASS, verify_routemodel PASS, verify_dem PASS (no page errors).
