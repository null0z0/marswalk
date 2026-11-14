# MARSWalk — Mars Mission Planner (NASA Space Apps 2026, Giza)

One layered Mars map: real rover waypoints, the path each rover walked, distances between stations, 3D terrain, and a dated archive of natural events — built to help humans plan and execute any kind of Mars mission.

## The idea

Gather data from the rovers that went to Mars (Perseverance, Curiosity, …) and place it on **one map** with layers tied to each location and the path each rover walked. The goal is to help any human plan - and later execute - any kind of Mars mission.

- **One map, all rovers:** clickable stations - Three Forks depot (sol 654), Wildcat Ridge (sol 502), Skinner Ridge (sol 477), Kukaklek, Shuyak, Mageik in Jezero; Rocknest, Shaler, drill sites, Departure in Gale. Each station carries its recorded position, sol, photo, and source.
- **The path each rover walked:** recorded traverses; dashed synthetic connectors appear only where the archive has gaps, and are labeled as such - never passed off as driven ground.
- **3D Mars:** rotatable globe (Viking MDIM 2.1 imagery) plus local 3D terrain (Jezero 20 m DTM, Gale 2 m DEM) with elevation, slope, hillshade, and contours.
- **Distance between any two points:** two-point From → To mode - straight baseline vs. slope-aware least-cost route - reporting km, walk minutes, and ascent; the globe also measures great-circle distance.
- **Natural events by date / Martian sol:** dust storms (regional and planet-encircling), dust devils, marsquakes (InSight M5), meteoroid impacts, polar avalanches - each with UTC date, rover sol, location, instruments, source, and estimates marked. A historical archive, not a forecast.
- **Layers you control:** geology (USGS SIM 3464 Jezero), rover route, rover stops, elevation ramp, hillshade, slope, contours, CRISM 770 nm (Gale) - each independently toggleable.
- **Views:** 2D map (Leaflet), 3D terrain (Three.js), Global globe.

## Run

```bash
npm install
npm run dev      # dev server
npm run build    # production build in dist/
npm run preview  # serve the build
npx vitest run   # planner unit tests
```

## Data integrity

Every number, coordinate, elevation, image, caption, and label shown as DATA traces to a downloaded source; anything that cannot be sourced is shown as unavailable, never estimated. Scenario assumptions (pace, dwell, EVA window) are labeled as assumptions, not data. Exact sample-collection spots are unavailable from opened sources — the archived record supports the rover's last recorded position near a site, not proof of the exact spot. The globe is orientation only: no planet-wide routing or fine terrain is claimed.

Full traceability — exact values, source URLs, retrieval dates, checksums, and verification suites — is in `src/data/PROVENANCE.md` and `scripts/`.

## Radiation card (Gale Crater)

The region panel shows a Radiation card (`src/components/RadiationCard.jsx`) that reads `src/data/radiation.json`.

- Gale Crater: shows the surface dose rates measured by the RAD instrument on the Curiosity rover - dose equivalent 0.64 ± 0.12 mSv/day, absorbed dose 0.21 ± 0.04 mGy/day, and 320 ± 50 mSv for a 500-day surface stay - with the measurement period (7 August 2012 to 1 June 2013, ~300 sols, near solar maximum).
- Scope: galactic cosmic rays (GCR) only. Solar energetic particle events are not included in these values.
- Jezero: shows "Not computed for this region", because the measurement is from Gale Crater, not Jezero. Nothing is estimated or transferred between regions.
- Source: Hassler et al., Science 343, 1244797 (2014), Table 1 (surface column). Row added to `src/data/PROVENANCE.md`.
- Any dose for a given stay time (for example, hours on the surface) would be our own constant-rate arithmetic and is not in the paper, so it must be labeled as such.

## Verification

```bash
sh scripts/fetch_sources.sh          # re-download raw sources + sha256 verify
python3 scripts/test_provenance.py   # source/data checks against the raw files
node scripts/check_ui_outputs.mjs    # rendered-DOM checks vs served data
npx vitest run                       # planner arithmetic
```

## Roadmap (coming next)

These are planned, not yet shipped:

- **Live data:** live updates to stations and events as new rover data arrives.
- **UI polish:** improved visuals and interaction across all views.
- **More rovers and landing sites** added to the map.
- **Martian calendar** improvements for event dates.

## Limitations (not a safety assessment)

Not a human-safety or walkability assessment. Synthetic connectors are not recorded ground; the depot is an area, not a surveyed point; context-only events carry no exact pins; coarse global elevation (~12.8 km/px) is not terrain-aware pathfinding.

## Tech stack

React 19 + Vite, Three.js / @react-three-fiber / drei (3D), Leaflet / react-leaflet / proj4 (2D map), geotiff, vitest.
