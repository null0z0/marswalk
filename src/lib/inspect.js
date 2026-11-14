// Two-point route comparison and arbitrary-point inspection.
//
// Everything here is computed from the shipped elevation grid and (Jezero
// only) the SIM 3464 geology polygons, with the method stated next to each
// number. Honesty rules, same as terrain.js / routing.js:
// - outside coverage / no-data = reported, never extrapolated or guessed
// - the comparison shows a straight geometric BASELINE and a least-cost path
//   under a declared slope-penalty cost model. Neither is a "shortest",
//   "easiest" or "safe" route; grid spacing smooths micro-relief and there
//   is no obstacle dataset in the app.
// - geology at a point or along a route is point-in-polygon on the SIM 3464
//   regional map (source registration ~100-200 m vs rover waypoint records):
//   mapped-unit context, not contact-level truth and NOT a walkability or
//   surface-hardness rating.

import { toM, nearestH, bilinearH, profileLeg, containsLatLon, slopeRangeProfile, slopeSeriesProfile, profileFromLatLon } from './terrain.js';
import { leastCostPath } from './routing.js';

// The profile slope statistics and polyline resampler live in terrain.js so
// the planner legs and this comparison share ONE sampler; re-exported here.
export { slopeRangeProfile, slopeSeriesProfile, profileFromLatLon };

const R1 = (v) => Math.round(v * 10) / 10;

// ---------------------------------------------------------------- profiles
export function ascDesc(profile) {
  let asc = 0, desc = 0;
  for (let i = 1; i < profile.length; i++) {
    const dz = profile[i][1] - profile[i - 1][1];
    if (dz > 0) asc += dz; else desc -= dz;
  }
  return { asc, desc };
}

// Profile [[d, h], ...] along a leastCostPath() result's pathGrid.
export function pathProfile(pathGrid) {
  if (!pathGrid || !pathGrid.length) return null;
  const prof = [[0, pathGrid[0].elev]];
  let d = 0;
  for (let k = 1; k < pathGrid.length; k++) {
    const [x0, y0] = toM(pathGrid[k - 1].lon, pathGrid[k - 1].lat);
    const [x1, y1] = toM(pathGrid[k].lon, pathGrid[k].lat);
    d += Math.hypot(x1 - x0, y1 - y0);
    prof.push([Math.round(d * 100) / 100, pathGrid[k].elev]);
  }
  return prof;
}

function routeResult(dist, profile, grid, profileSrc = null, profileM = null) {
  const { asc, desc } = ascDesc(profile);
  return {
    dist: Math.round(dist * 100) / 100,
    asc, desc,
    profile,
    profileSrc,
    profileM,
    slope: slopeRangeProfile(profile, grid.dx),
    slopeSeries: slopeSeriesProfile(profile, grid.dx),
  };
}


// Both route models for the same endpoints, one call:
//   straight:  the geometric baseline segment (nearest-cell sampling, ~10 m)
//   leastCost: A* least-cost path under the declared slope-penalty model
// Each is null (with the others still returned) when it cannot be computed:
// outside coverage or no-data for straight; no path under the model for
// leastCost. Callers render the failure, never a substitute.
export function compareRoutes(grid, a, b, opts = {}) {
  const out = { straight: null, leastCost: null, gridM: grid.dx, srcLabel: opts.srcLabel || grid.srcLabel || '', profileSrc: null, profileM: null };
  const hi = opts.hiGrid || null;
  const leg = profileLeg(grid, a, b);
  if (leg) {
    const up = hi ? profileFromLatLon(hi, [[a.lat, a.lon], [b.lat, b.lon]]) : null;
    out.straight = up
      ? routeResult(up.dist, up.profile, grid, hi.srcLabel, hi.dx)
      : routeResult(leg.dist, leg.profile, grid);
  }
  const r = leastCostPath(grid, a, b, opts);
  if (r && r.pathGrid && r.pathGrid.length > 1) {
    const up = hi ? profileFromLatLon(hi, r.pathLatLon) : null;
    const base = up
      ? routeResult(up.dist, up.profile, grid, hi.srcLabel, hi.dx)
      : routeResult(r.distM, pathProfile(r.pathGrid), grid);
    out.leastCost = {
      ...base,
      pathLatLon: r.pathLatLon,
      explored: r.explored,
      model: r.model,
    };
  }
  // Profile-source label for the comparison. Today both routes upgrade to
  // the hi grid together (it covers the whole app window), so the first
  // upgraded route's label applies to both. If a mixed fallback ever became
  // reachable (one route hi, the other base grid), this single label would
  // mislabel the other route and would need to become per-route.
  const withSrc = [out.straight, out.leastCost].find(v => v && v.profileSrc);
  if (withSrc) { out.profileSrc = withSrc.profileSrc; out.profileM = withSrc.profileM; }
  return out;
}

// ------------------------------------------------------------ point inspect
// Distance (m) and compass bearing (deg clockwise from north) a -> b.
export function distanceBearing(a, b) {
  const [ax, ay] = toM(a.lon, a.lat);
  const [bx, by] = toM(b.lon, b.lat);
  const dist = Math.hypot(bx - ax, by - ay);
  const brg = (Math.atan2(bx - ax, by - ay) * 180 / Math.PI + 360) % 360;
  return { dist, bearing: brg };
}

// Everything the grid can say about one arbitrary point, or null when the
// point is outside coverage. Slope/aspect come from the bilinear surface
// gradient over one grid posting - a grid-baseline estimate, not micro-relief.
export function pointInfo(grid, lat, lon, hiGrid = null) {
  const g = (hiGrid && containsLatLon(hiGrid, lat, lon)) ? hiGrid : grid;
  if (!containsLatLon(g, lat, lon)) return null;
  const [mx, my] = toM(lon, lat);
  const elev = bilinearH(g, mx, my) ?? nearestH(g, mx, my);
  if (elev == null) return { inside: true, elev: null, elevSrc: null, slopeDeg: null, downslopeBearing: null };
  const h = g.dx;
  const hE = bilinearH(g, mx + h / 2, my), hW = bilinearH(g, mx - h / 2, my);
  const hN = bilinearH(g, mx, my + h / 2), hS = bilinearH(g, mx, my - h / 2);
  if (hE == null || hW == null || hN == null || hS == null) {
    return { inside: true, elev: Math.round(elev * 10) / 10, elevSrc: g.srcLabel || null, slopeDeg: null, downslopeBearing: null };
  }
  const gz = (hE - hW) / h;   // rise per meter east
  const gn = (hN - hS) / h;   // rise per meter north
  const slopeDeg = Math.atan(Math.hypot(gz, gn)) * 180 / Math.PI;
  // downslope = negative gradient; bearing measured clockwise from north
  const downslopeBearing = (Math.atan2(-gz, -gn) * 180 / Math.PI + 360) % 360;
  return {
    inside: true,
    elev: Math.round(elev * 10) / 10,
    elevSrc: g.srcLabel || null,
    slopeDeg: R1(slopeDeg),
    downslopeBearing: Math.round(downslopeBearing),
  };
}

// ------------------------------------------------- geology (SIM 3464 PIP)
// Point-in-polygon over the shipped geology GeoJSON (17 SIM 3464 unit
// polygons, [lon, lat] rings). lon/lat plane ray casting is adequate at this
// map window's scale; the polygons themselves carry ~100-200 m registration
// uncertainty, so sub-degree projection error is not the limiting factor.
function ringContains(ring, lon, lat) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function geologyAtPoint(geojson, lon, lat) {
  if (!geojson || !geojson.features) return undefined; // layer not loaded
  for (const f of geojson.features) {
    const g = f.geometry;
    if (!g || g.type !== 'Polygon') continue;
    if (!ringContains(g.coordinates[0], lon, lat)) continue;
    const hole = g.coordinates.slice(1).some(r => ringContains(r, lon, lat));
    if (hole) continue;
    return { symbol: f.properties.symbol, name: f.properties.name };
  }
  return null; // inside the map window but no mapped unit here
}

// Mapped units along an arbitrary lat/lon path, sampled every stepM meters.
// Returns { segments: [[startM, endM, symbol|null, name|null], ...] };
// symbol null marks stretches outside every mapped polygon ("unmapped"),
// which are drawn as gaps, never filled with a neighboring unit.
export function geologyAlongPath(geojson, latlons, stepM = 20) {
  if (!geojson || !latlons || latlons.length < 2) return { segments: [] };
  // resample the whole polyline at stepM spacing
  const samples = []; // {d, lon, lat}
  let d = 0;
  for (let i = 0; i < latlons.length - 1; i++) {
    const [ax, ay] = toM(latlons[i][1], latlons[i][0]);
    const [bx, by] = toM(latlons[i + 1][1], latlons[i + 1][0]);
    const segLen = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.round(segLen / stepM));
    for (let k = i === 0 ? 0 : 1; k <= n; k++) {
      const t = k / n;
      samples.push({ d: d + t * segLen, lon: latlons[i][1] + (latlons[i + 1][1] - latlons[i][1]) * t, lat: latlons[i][0] + (latlons[i + 1][0] - latlons[i][0]) * t });
    }
    d += segLen;
  }
  const segments = [];
  for (let i = 0; i < samples.length; i++) {
    const g = geologyAtPoint(geojson, samples[i].lon, samples[i].lat);
    const symbol = g === undefined || g === null ? null : g.symbol;
    const name = g && g.name ? g.name : null;
    const dEnd = i + 1 < samples.length ? samples[i + 1].d : d;
    const last = segments[segments.length - 1];
    if (last && last[2] === symbol) last[1] = dEnd;
    else segments.push([samples[i].d, dEnd, symbol, name]);
  }
  return { segments, totalM: d };
}
