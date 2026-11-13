# MARSWalk Planner - Jezero Delta Front (NASA Space Apps 2026, Giza)

Interactive demo: **adaptive science-driven re-planning for a Jezero Marswalk.**
A crewed EVA (hypothetical) visits three science stops near the Three Forks sample depot.
When a stop overruns its planned dwell time, the planner re-plans the remaining traverse
against the EVA time window and defers the lowest-priority non-must-have objective -
showing exactly what science is lost and why.

## Run

```bash
npm install
npm run dev      # dev server
npm run build    # production build in dist/
npm run preview  # serve the build
npx vitest run   # planner unit tests (8)
```

## The decision loop (the demo)

1. Base plan: Depot -> Wildcat Ridge -> Skinner Ridge -> Kodiak candidate viewpoint -> Depot.
   At the declared assumptions (1 km/h pace, 60 min dwell per stop, 300 min window)
   the plan totals **268 min** (buffer **32**).
2. A +40 min overrun at Wildcat makes the full plan **308 min > 300**, so the planner
   drops **Kodiak** (lowest-priority non-must-have) -> **208 min**, and the lost
   objective is shown with reason "lowest-priority non-must-have".
3. Raising Kodiak's priority instead drops **Skinner** -> **248 min**.
4. Raising the window to 6h restores every stop.

Displayed numbers are always the rounded set **268 / 32 / 308 / 8 / 208 / 248**;
internal arithmetic keeps full precision (267.6, 32.4, 307.6, 7.6, 207.6, 247.6).

## Planner rules (src/lib/planner.js, pure functions, unit-tested)

- Traverse time = straight-segment terrain-following distance / declared pace.
- Each kept stop costs its declared dwell time.
- A visited stop is done: it is never dropped; only remaining stops are re-planned.
  Its walk minutes and the pace used are frozen when the leg completes - moving
  the pace slider later changes only legs not yet walked (covered by a Vitest case).
  A visited entry without a recorded walk time falls back to the current pace.
- If the plan exceeds the remaining window, drop the **lowest-priority
  non-must-have** stop first, then re-check; the UI names the dropped station and
  the reason ("lowest-priority non-must-have").
- If only must-have stops remain and they still cannot fit, report the shortfall
  explicitly and drop nothing silently (covered by a Vitest case).
- Zero-window edge case degrades gracefully (covered by a Vitest case).
- Visit order is the shortest-time permutation of the kept stops; ties break
  deterministically toward the priority-sorted order. Drops are deterministic
  too: among equal-priority droppable stops, the earlier one in the
  priority-sorted list drops first (stable sort).

## Data sources (3 labeled types + rover imagery as context)

1. **CTX optical basemap** (public/layers/ortho_crop.jpg) - crop of the 6 m/px
   Jezero CTX orthomosaic served by the ASU/ArcGIS OnMars CTX service:
   https://astro.arcgis.com/arcgis/rest/services/OnMars/CTX/MapServer
   displayed in an equidistant cylindrical Mars CRS.
2. **DTM topography** (public/data/legs.json) - the USGS Mars 2020 TRN CTX DTM,
   20 m posting (JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0):
   https://planetarymaps.usgs.gov/mosaic/mars2020_trn/CTX/JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0.tif
   (product page: https://astrogeology.usgs.gov/search/map/Mars/Mars2020/JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0)
   sampled nearest-cell every 10 m along straight segments between stops
   (precomputed; the app does not read the DTM live). Drives distances, ascent,
   and the elevation profile.
3. **USGS geology** (public/geology.geojson) - unit boundaries from USGS SIM 3464
   (Geologic Map of Jezero Crater and the Nili Planum Region):
   https://pubs.usgs.gov/sim/3464/
   toggleable overlay.
4. **Perseverance Mastcam-Z imagery** (context only, historical - not current
   conditions), from the Mars 2020 raw images archive
   (https://mars.nasa.gov/mars2020/multimedia/raw-images/):
   Wildcat sol 502 (ZL0_0502_0711509044_013EBY_N0261222ZCAM07101_1100LMJ),
   Skinner sol 477 (ZL0_0477_0709275045_285EBY_N0260850ZCAM08498_1100LMJ),
   Kodiak butte area sol 275 (ZL0_0275_0691341248_678EBY_N0080000ZCAM08292_1100LMJ,
   imaged from ~2 km away; the outcrop was studied remotely, never visited).

Science context: NASA release on Wildcat/Skinner (organics correlated with
sulfates; layered sandstone)
https://www.nasa.gov/news-release/nasas-perseverance-rover-investigates-geologically-rich-mars-terrain/
and Science abl4051 (Kodiak strata record lake-level change)
https://www.science.org/doi/10.1126/science.abl4051

## What this tool does NOT claim

- All times/pace/dwell are **declared scenario assumptions, not NASA standards**,
  and are editable in the UI.
- Straight-segment distances from a **20 m DTM grid** (nearest-cell 10 m samples)
  are **not surveyed paths**; 20 m is grid spacing, not a vertical-accuracy
  guarantee. **No human-safety or walkability claim.**
- Kodiak is a **candidate viewpoint - not verified**; access, line of sight, and
  diagnostic value are unverified, and the stop position is approximate.
- Wildcat and Skinner stops sit at **approximate rover parked coordinates**
  (~20 m apart on the same outcrop complex), not surveyed stations.
- NHjf2 unit labels are **map-overlay attribution, not verified rock IDs**.
- The crewed habitat at the real Three Forks depot site is **hypothetical**.
- The Brac outcrop is excluded by the declared 5 h scenario arithmetic
  (full 3-station loop ~8.8 h), not by any verified human EVA limit.
- Rover imagery is **historical**, not current ground truth.

## Architecture

- React + Vite, Tailwind, react-leaflet (proj4leaflet Mars CRS), Recharts.
- `src/lib/planner.js` - pure planning logic (no DOM), unit-tested in
  `src/lib/planner.test.js` (Vitest, 8 cases incl. must-have shortfall, zero window,
  and frozen completed-leg history).
- `src/components/` - MapView, MissionStatusBar, StationPanel, TimeControl,
  PlanSummary, ElevationProfile.
- `public/data/legs.json` - precomputed leg profiles from the DTM.
- `src/data/stations.json` - stop metadata, objectives, caveats, photo credits.

## Live-demo script (60-90 s)

1. Show the base plan: 268/300, buffer 32, three stops, elevation profile.
2. "+40 min overrun" -> plan 308 > 300 -> Kodiak deferred with LOST state -> 208.
3. Point at the lost science card and the reason line.
4. Raise Kodiak priority -> Skinner drops instead -> 248.
5. Raise the window to 6 h -> everything fits again.
6. Close on the caveat strip: assumptions are declared, not NASA standards.
