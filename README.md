# MARSWalk Planner - Jezero Delta Front (NASA Space Apps 2026, Giza)

Interactive demo: **adaptive science-driven re-planning for a Jezero Marswalk.**
A crewed EVA (hypothetical) starts at the real Three Forks sample depot site and
visits two real Perseverance delta-front stops near the Wildcat Ridge and
Skinner Ridge sample locations. When a stop overruns its planned dwell time, the
planner re-plans the remaining traverse against the EVA time window and defers
the lowest-priority non-must-have objective - showing exactly what science is
lost and why.

## Run

```bash
npm install
npm run dev      # dev server
npm run build    # production build in dist/
npm run preview  # serve the build
npx vitest run   # planner unit tests (11)
```

## The decision loop (the demo)

1. Base plan: Base -> Wildcat Ridge -> Skinner Ridge -> Base.
   At the declared assumptions (1.0 km/h pace, 60 min dwell per stop, 300 min
   window) the plan totals **167 min** (buffer **133**). With only two stops
   20.96 m apart (about one 20 m DTM cell), dropping one saves little distance
   (a 21 m leg) though it still saves that stop's 60 min dwell - a farther
   third stop (shortlist under review, not chosen yet) restores a real
   distance-vs-science tradeoff.
2. A +60 min overrun at the current stop makes the plan **227 min** - still
   **FITS** the 300 min window (buffer 73), and the status bar shows walked /
   science done / walk left / science left.
3. Tightening the window or raising stop costs forces a drop; the UI names the
   deferred station and the reason ("lowest-priority non-must-have"), and shows
   the meters and ascent not walked.

## Planner rules (src/lib/planner.js, pure functions, unit-tested)

- Traverse time = horizontal straight-line distance between waypoints /
  declared pace. Distances are geometric (waypoint-derived), not
  terrain-following 3D surface lengths and not a surveyed or driven path.
- Each kept stop costs its declared dwell time.
- A visited stop is done: it is never dropped; only remaining stops are
  re-planned. Its walk minutes and the pace used are frozen when the leg
  completes - moving the pace slider later changes only legs not yet walked
  (covered by a Vitest case). A visited entry without a recorded walk time
  falls back to the current pace.
- If the plan exceeds the remaining window, drop the **lowest-priority
  non-must-have** stop first, then re-check; the UI names the dropped station
  and the reason.
- If only must-have stops remain and they still cannot fit, report the
  shortfall explicitly and drop nothing silently (covered by a Vitest case).
- Zero-window edge case degrades gracefully (covered by a Vitest case).
- Visit order is the shortest-time permutation of the kept stops; ties break
  deterministically toward the priority-sorted order. Drops are deterministic
  too: among equal-priority droppable stops, the earlier one in the
  priority-sorted list drops first (stable sort).

## Data integrity (audit 2026-11-13)

Every number, coordinate, elevation, image, caption and label shown as DATA
traces to a downloaded source; anything that cannot be sourced is shown as
unavailable, never estimated. Full details, exact values, source URLs,
retrieval dates, checksums and the verification suites are in
`src/data/PROVENANCE.md`.

- Terrain heights, ascents, 3D mesh: USGS Mars 2020 TRN CTX DTM (20 m grid).
- Map/3D textures: USGS CTX orthomosaic (6 m).
- Geology units and overlay: USGS SIM 3464 geodatabase (point-in-polygon).
- Stop coordinates: rover drive records in archived NASA M20 waypoints
  snapshots (sols 654 / 502 / 477) - the rover's **last recorded position
  near** the Three Forks depot / Hazeltop-Bearwallow / Swift Run-Skyland
  sample locations. Exact sample-collection spots are **unavailable** from
  opened sources: the archived feed shows no intervening drive records, which
  is evidence for the last recorded position, not proof of the exact spot.
- Photos: NASA Mars 2020 raw-image archive (sols 502 / 477, Mastcam-Z left
  110 mm per the ASU filename decoder); NASA metadata confirms sol and camera,
  it does not identify the feature shown.
- Kodiak candidate viewpoint: **removed** (2026-11-13). No numeric coordinate
  exists in any opened source; the earlier approximate coordinate contradicted
  published descriptions. All Kodiak data, imagery and UI were removed rather
  than kept as an estimate.

Scenario assumptions (EVA window, pace, dwell, stop costs, priorities) are
declared in the UI and labeled as assumptions, not data. None of the geometry
is a human-safety or walkability assessment.

## Verification

```bash
sh scripts/fetch_sources.sh          # re-download raw sources + sha256 verify
python3 scripts/test_provenance.py   # source/data checks against the raw files
node scripts/check_ui_outputs.mjs    # rendered-DOM checks vs served data
npx vitest run                       # planner arithmetic
```
