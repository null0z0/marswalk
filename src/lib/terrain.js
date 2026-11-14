// Runtime terrain engine: samples the shipped USGS-derived elevation grids
// (public/data/heightmap*.json) for ARBITRARY user routes at runtime, instead
// of relying only on precomputed station-to-station legs.
//
// Method parity with scripts/build_legs.py (the offline builder of
// public/data/legs.json): same Mars equidistant-cylindrical CRS
// (sphere radius 3396190 m), same nearest-cell sampling at ~10 m steps along
// the straight segment, same slope-range method (bilinear heights over one
// grid-posting baseline). vitest verifies this module reproduces the shipped
// legs.json within rounding tolerance, so runtime numbers and the archived
// precomputed numbers are two runs of the same method on the same grid.
//
// Honesty rules:
// - A point outside the grid is reported as outside coverage; nothing is
//   extrapolated or fabricated.
// - Straight segment between waypoints is geometry, not a surveyed path.
// - Grid spacing (20 m Jezero CTX DTM / 2 m Gale decimated DEM) is stated;
//   it is not a vertical-accuracy or walkability guarantee.

import proj4 from 'proj4';
// Circular by design: routing.js imports toM/toLatLon from here; both are
// function declarations, so the live bindings resolve at call time.
import { leastCostPath } from './routing.js';

// Same CRS string as MapView.jsx / Terrain3D.jsx.
export const EQC = '+proj=eqc +lat_ts=0 +lat_0=0 +lon_0=0 +x_0=0 +y_0=0 +a=3396190 +b=3396190 +units=m +no_defs';
export const MARS_R = 3396190.0;

export function toM(lon, lat) {
  return proj4(EQC, [lon, lat]);
}

export function toLatLon(mx, my) {
  const [lon, lat] = proj4(EQC).inverse([mx, my]);
  return [lat, lon];
}

// Binary grid variant: meta json {nx, ny, dx, x0, y0, bin, srcLabel} plus a
// Float32 little-endian row-major buffer (north-to-south rows, NaN = no-data),
// same pixel-center convention. Rows become Float32Array views - no copy.
// Used for the Jezero 4 m DTM, which is too large to ship as JSON.
export function createGridFromBin(meta, buf) {
  const { nx, ny, dx, x0, y0 } = meta;
  const f = new Float32Array(buf);
  if (f.length !== nx * ny) throw new Error(`4m grid: expected ${nx * ny} cells, got ${f.length}`);
  const rows = [];
  for (let j = 0; j < ny; j++) rows.push(f.subarray(j * nx, (j + 1) * nx));
  const xMin = x0 - dx / 2, xMax = x0 + (nx - 1) * dx + dx / 2;
  const yMax = y0 + dx / 2, yMin = y0 - (ny - 1) * dx - dx / 2;
  const [latS, lonW] = toLatLon(xMin, yMin);
  const [latN, lonE] = toLatLon(xMax, yMax);
  return { nx, ny, dx, x0, y0, values: rows, srcLabel: meta.srcLabel || '', bounds: [[latS, lonW], [latN, lonE]] };
}

// hm: parsed heightmap json {nx, ny, dx, x0, y0, values[ny][nx]}.
// x0/y0 are pixel-CENTER easting/northing of column 0 / top row; rows run
// north to south. Returns a grid with sampling helpers and lat/lon bounds.
export function createGrid(hm, srcLabel = '') {
  const { nx, ny, dx, x0, y0, values } = hm;
  const xMin = x0 - dx / 2, xMax = x0 + (nx - 1) * dx + dx / 2;
  const yMax = y0 + dx / 2, yMin = y0 - (ny - 1) * dx - dx / 2;
  const [latS, lonW] = toLatLon(xMin, yMin);
  const [latN, lonE] = toLatLon(xMax, yMax);
  return {
    nx, ny, dx, x0, y0, values, srcLabel,
    bounds: [[latS, lonW], [latN, lonE]],
  };
}

export function containsLatLon(grid, lat, lon) {
  const [mx, my] = toM(lon, lat);
  const fx = (mx - grid.x0) / grid.dx;
  const fy = (grid.y0 - my) / grid.dx;
  return fx >= -0.5 && fx <= grid.nx - 0.5 && fy >= -0.5 && fy <= grid.ny - 0.5;
}

// Nearest-cell height, exactly like build_legs.py nearest_h. Returns null
// when the cell is outside the grid or holds a no-data value.
export function nearestH(grid, mx, my) {
  const i = Math.round((mx - grid.x0) / grid.dx);
  const j = Math.round((grid.y0 - my) / grid.dx);
  if (i < 0 || i >= grid.nx || j < 0 || j >= grid.ny) return null;
  const v = grid.values[j][i];
  // no-data can arrive as null (builder converts non-finite) or as a raw
  // NaN/Infinity in a future source - both are no-data, never numbers
  return (v == null || !Number.isFinite(v)) ? null : v;
}

// Bilinear height (used for slope ranges, like build_legs.py bilinear_h).
// Returns null when any corner cell is outside or no-data.
export function bilinearH(grid, mx, my) {
  const fx = (mx - grid.x0) / grid.dx;
  const fy = (grid.y0 - my) / grid.dx;
  const i0 = Math.floor(fx), j0 = Math.floor(fy);
  if (i0 < 0 || i0 + 1 >= grid.nx || j0 < 0 || j0 + 1 >= grid.ny) return null;
  const tx = fx - i0, ty = fy - j0;
  const g = (j, i) => grid.values[j][i];
  const v00 = g(j0, i0), v10 = g(j0, i0 + 1), v01 = g(j0 + 1, i0), v11 = g(j0 + 1, i0 + 1);
  if ([v00, v10, v01, v11].some(v => v == null || !Number.isFinite(v))) return null;
  return v00 * (1 - tx) * (1 - ty) + v10 * tx * (1 - ty) + v01 * (1 - tx) * ty + v11 * tx * ty;
}

// Sample the straight segment a->b every ~10 m with nearest-cell heights.
// a/b: {lat, lon}. Returns {dist, profile:[[d,h],...]} or null when either
// endpoint is outside the grid or any sample hits a no-data cell.
export function profileLeg(grid, a, b) {
  const [ax, ay] = toM(a.lon, a.lat);
  const [bx, by] = toM(b.lon, b.lat);
  const dist = Math.hypot(bx - ax, by - ay);
  const n = Math.max(1, Math.round(dist / 10));
  const profile = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const h = nearestH(grid, ax + (bx - ax) * t, ay + (by - ay) * t);
    if (h == null) return null;
    profile.push([round2(t * dist), round2(h)]);
  }
  return { dist: round2(dist), profile };
}

function round2(v) { return Math.round(v * 100) / 100; }

// Min/max slope (degrees) over one grid-posting baseline along the segment,
// from bilinear heights stepped every 10 m - same method as build_legs.py
// slope_range. Returns null for degenerate legs shorter than the baseline or
// when heights are unavailable anywhere along the leg.
export function slopeRange(grid, a, b, dist) {
  const BASE = grid.dx;
  if (dist < BASE) return null;
  const [ax, ay] = toM(a.lon, a.lat);
  const [bx, by] = toM(b.lon, b.lat);
  const hAt = (x) => {
    const t = x / dist;
    return bilinearH(grid, ax + (bx - ax) * t, ay + (by - ay) * t);
  };
  let lo = null, hi = null;
  for (let x = 0; x + BASE <= dist + 1e-6; x += 10) {
    const h0 = hAt(x), h1 = hAt(x + BASE);
    if (h0 == null || h1 == null) return null;
    const s = Math.atan2(h1 - h0, BASE) * 180 / Math.PI;
    lo = lo == null ? s : Math.min(lo, s);
    hi = hi == null ? s : Math.max(hi, s);
  }
  return lo == null ? null : [round1(lo), round1(hi)];
}

function round1(v) { return Math.round(v * 10) / 10; }

// Resample a lat/lon polyline's elevations on a (typically finer) grid: walk
// the line every ~stepM meters, bilinear heights. Returns null when any
// sample misses - a profile never mixes two sources silently. pts: [[lat,lon],...].
export function profileFromLatLon(g, pts, stepM = 10) {
  if (!g || !pts || pts.length < 2) return null;
  const xy = pts.map(([la, lo]) => toM(lo, la));
  const segLen = [];
  let dist = 0;
  for (let i = 1; i < xy.length; i++) {
    const s = Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]);
    segLen.push(s); dist += s;
  }
  const n = Math.max(1, Math.round(dist / stepM));
  const profile = [];
  let i = 1, acc = 0;
  for (let k = 0; k <= n; k++) {
    const target = (k / n) * dist;
    while (i < xy.length - 1 && acc + segLen[i - 1] < target) { acc += segLen[i - 1]; i++; }
    const seg = segLen[i - 1];
    const u = seg === 0 ? 0 : Math.max(0, Math.min(1, (target - acc) / seg));
    const x = xy[i - 1][0] + (xy[i][0] - xy[i - 1][0]) * u;
    const y = xy[i - 1][1] + (xy[i][1] - xy[i - 1][1]) * u;
    const h = bilinearH(g, x, y);
    if (h == null) return null;
    profile.push([Math.round(target * 100) / 100, h]);
  }
  return { dist: Math.round(dist * 100) / 100, profile };
}

// ---- shared profile slope statistics (single sampler for planner and the
// two-point comparison, QA-aligned): linear interpolation of height at
// distance x along a [[d, h], ...] profile, then a sliding one-baseline
// window along the distance axis. The comparison in inspect.js re-exports
// these; build_legs.py's archived slope_range is the separate straight-line
// bilinear method above, kept for the archived-legs validation tests.
export function interpProfile(profile, x) {
  if (x <= 0) return profile[0][1];
  const last = profile[profile.length - 1];
  if (x >= last[0]) return last[1];
  let lo = 0, hi = profile.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (profile[mid][0] <= x) lo = mid; else hi = mid;
  }
  const [d0, h0] = profile[lo], [d1, h1] = profile[hi];
  return d1 === d0 ? h0 : h0 + (h1 - h0) * ((x - d0) / (d1 - d0));
}

// Min/max slope (degrees) over one baseM window walked along the sampled
// profile in stepM increments. Same method whatever produced the profile
// (straight segment or least-cost polyline), so numbers stay comparable.
export function slopeRangeProfile(profile, baseM, stepM = 10) {
  if (!profile || profile.length < 2) return null;
  const dist = profile[profile.length - 1][0];
  if (dist < baseM) return null;
  let lo = null, hi = null;
  for (let x = 0; x + baseM <= dist + 1e-6; x += stepM) {
    const s = Math.atan2(interpProfile(profile, x + baseM) - interpProfile(profile, x), baseM) * 180 / Math.PI;
    lo = lo == null ? s : Math.min(lo, s);
    hi = hi == null ? s : Math.max(hi, s);
  }
  return lo == null ? null : [round1(lo), round1(hi)];
}

// Same sliding window, returned as a series [[midDistance, slopeDeg], ...]
// for slope charts.
export function slopeSeriesProfile(profile, baseM, stepM = 10) {
  if (!profile || profile.length < 2) return [];
  const dist = profile[profile.length - 1][0];
  if (dist < baseM) return [];
  const out = [];
  for (let x = 0; x + baseM <= dist + 1e-6; x += stepM) {
    const s = Math.atan2(interpProfile(profile, x + baseM) - interpProfile(profile, x), baseM) * 180 / Math.PI;
    out.push([Math.round((x + baseM / 2) * 10) / 10, round1(s)]);
  }
  return out;
}

// Full metrics for one leg from the grid: distance (horizontal straight
// segment), ascent/descent from the sampled profile, walk minutes at the
// declared pace, and the slope range. Returns null when the leg cannot be
// sampled (endpoint outside coverage or no-data cells on the segment).
export function legMetricsFromGrid(grid, a, b, paceKmh) {
  const leg = profileLeg(grid, a, b);
  if (!leg) return null;
  let asc = 0, desc = 0;
  const prof = leg.profile;
  for (let i = 1; i < prof.length; i++) {
    const dz = prof[i][1] - prof[i - 1][1];
    if (dz > 0) asc += dz; else desc -= dz;
  }
  return {
    dist: leg.dist,
    asc, desc,
    minutes: leg.dist / (paceKmh * 1000 / 60),
    profile: prof,
    slope: slopeRange(grid, a, b, leg.dist),
  };
}

// Drop-in runtime replacement for the shipped legs.json: planner.js reads
// legsData.legs['A|B'] and ElevationProfile reads legsData.legsMeta['A|B'];
// both are Proxies that compute from the grid on first access and cache.
// ptsOf(id) must return {lat, lon} for a known id. Optional shippedMeta (from
// legs.json) contributes geology segments for preset pairs (Jezero SIM 3464
// polygons); custom legs report geology: null ("not computed for this leg").
export function createRuntimeLegs(grid, ptsOf, opts = {}) {
  const profileCache = new Map();
  const metaCache = new Map();
  const slopeKey = `slope${Math.round(grid.dx)}_deg`;
  const shippedMeta = opts.shippedMeta || null;
  // Route model: 'straight' samples the straight segment (geometric baseline);
  // 'leastcost' routes an A* least-cost path over the slope grid (no-data is
  // impassable) and samples elevations along that polyline. The model is a
  // declared analysis choice, not a promise the ground is walkable.
  const routeModel = opts.routeModel === 'leastcost' ? 'leastcost' : 'straight';
  const pathCache = new Map(); // leg key -> A* path or null (unreachable)
  const getPath = (key) => {
    if (pathCache.has(key)) return pathCache.get(key);
    const [aId, bId] = key.split('|');
    const a = ptsOf(aId), b = ptsOf(bId);
    const r = (a && b) ? leastCostPath(grid, a, b, { srcLabel: opts.srcLabel || 'grid' }) : null;
    const path = r && r.pathLatLon ? r : null;
    pathCache.set(key, path);
    return path;
  };

  // Optional finer grid (Jezero 4 m DTM): the leg GEOMETRY still comes from
  // the routing grid (straight segment / A* on the 20 m grid, both models
  // comparable); only the elevation sampling upgrades, never silently mixed -
  // a missed sample keeps the whole leg on the routing grid.
  const hi = opts.hiGrid || null;
  const getProfile = (key) => {
    if (profileCache.has(key)) return profileCache.get(key);
    const [aId, bId] = key.split('|');
    const a = ptsOf(aId), b = ptsOf(bId);
    let prof = null;
    if (a && b) {
      let geom = null; // [[lat, lon], ...] actually walked
      if (routeModel === 'leastcost') {
        const r = getPath(key);
        if (r) {
          geom = r.pathLatLon;
          // elevations along the A* polyline (its own node spacing)
          prof = [[0, r.pathGrid[0].elev]];
          let d = 0;
          for (let k = 1; k < r.pathGrid.length; k++) {
            const p0 = r.pathGrid[k - 1], p1 = r.pathGrid[k];
            const [x0, y0] = toM(p0.lon, p0.lat);
            const [x1, y1] = toM(p1.lon, p1.lat);
            d += Math.hypot(x1 - x0, y1 - y0);
            prof.push([d, p1.elev]);
          }
        }
      } else {
        const leg = profileLeg(grid, a, b);
        if (leg) { prof = leg.profile; geom = [[a.lat, a.lon], [b.lat, b.lon]]; }
      }
      if (hi && geom) {
        const up = profileFromLatLon(hi, geom);
        if (up) prof = up.profile;
      }
    }
    // Cache nulls too: an unsamplable leg stays unsamplable for this grid.
    profileCache.set(key, prof);
    return prof;
  };

  const getMeta = (key) => {
    if (metaCache.has(key)) return metaCache.get(key);
    const [aId, bId] = key.split('|');
    const a = ptsOf(aId), b = ptsOf(bId);
    let meta = null;
    if (a && b) {
      const [ax, ay] = toM(a.lon, a.lat);
      const [bx, by] = toM(b.lon, b.lat);
      const dist = Math.hypot(bx - ax, by - ay);
      // Geology is direction-independent ground truth (SIM 3464 polygons along
      // the segment). The shipped table keys one direction only, so a preset
      // pair walked in reverse must reuse the shipped segments reversed -
      // otherwise the geology strip silently vanishes on return legs.
      let geology = shippedMeta && shippedMeta[key] ? shippedMeta[key].geology ?? null : null;
      if (!geology && shippedMeta) {
        const rev = shippedMeta[bId + '|' + aId];
        if (rev && rev.geology) {
          geology = rev.geology.map(s => [round1(dist - s[1]), round1(dist - s[0]), s[2], s[3]]).reverse();
        }
      }
      // Slope range comes from the SAME profile the planner charts (straight
      // segment or least-cost polyline), with the shared sliding-window
      // sampler - identical statistics to the two-point comparison.
      const prof = getProfile(key);
      meta = {
        [slopeKey]: prof ? slopeRangeProfile(prof, grid.dx) : null,
        geology,
        routeModel,
        // actual walked polyline for the map when the least-cost model is on
        ...(routeModel === 'leastcost' && getPath(key) ? { pathLatLon: getPath(key).pathLatLon } : {}),
      };
    }
    metaCache.set(key, meta);
    return meta;
  };

  const legsProxy = new Proxy({}, {
    get: (_t, prop) => (typeof prop === 'string' ? getProfile(prop) : undefined),
    has: (_t, prop) => (typeof prop === 'string' ? getProfile(prop) !== null : false),
    ownKeys: () => [...profileCache.keys()],
  });
  const metaProxy = new Proxy({}, {
    get: (_t, prop) => (typeof prop === 'string' ? getMeta(prop) : undefined),
  });

  return {
    step_m: 10,
    runtime: true,
    dtm: (routeModel === 'leastcost'
      ? `${grid.srcLabel || 'elevation grid'} - computed at runtime in your browser along the least-cost path (A* slope-penalty model; no-data impassable)`
      : `${grid.srcLabel || 'elevation grid'} - computed at runtime in your browser along the straight segment between waypoints`)
      + (hi ? `; elevation profiles sampled on the ${hi.srcLabel || '4 m DTM'}` : ''),
    legs: legsProxy,
    legsMeta: metaProxy,
    _grid: grid,
  };
}
