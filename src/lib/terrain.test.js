// Validates the runtime terrain engine against the shipped, archived
// precomputed legs (public/data/legs.json, built offline by
// scripts/build_legs.py from the same USGS grids). If runtime sampling
// reproduces those numbers, user-drawn routes are computed with the same
// method and data as the preset scenarios - not a new, untested source.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createGrid, createGridFromBin, containsLatLon, nearestH, bilinearH, profileLeg, slopeRange, slopeRangeProfile, legMetricsFromGrid, createRuntimeLegs, toM, toLatLon } from './terrain.js';
import { compareRoutes } from './inspect.js';

const hm = JSON.parse(readFileSync('public/data/heightmap.json', 'utf8'));
const legsJson = JSON.parse(readFileSync('public/data/legs.json', 'utf8'));
const stations = JSON.parse(readFileSync('src/data/stations.json', 'utf8'));
const grid = createGrid(hm, 'USGS Mars 2020 TRN CTX DTM 20m');
const byId = Object.fromEntries(stations.map(s => [s.id, s]));

describe('grid + CRS', () => {
  it('projection matches x = lon*R*pi/180, y = lat*R*pi/180', () => {
    const R = 3396190.0;
    const [mx, my] = toM(77.40784, 18.45253);
    expect(mx).toBeCloseTo(77.40784 * Math.PI / 180 * R, 6);
    expect(my).toBeCloseTo(18.45253 * Math.PI / 180 * R, 6);
  });
  it('all Jezero stations sit inside the grid coverage', () => {
    for (const s of stations.filter(x => x.region === 'jezero' && x.lat != null)) {
      expect(containsLatLon(grid, s.lat, s.lon), s.id).toBe(true);
    }
  });
  it('rejects points outside coverage instead of extrapolating', () => {
    expect(containsLatLon(grid, 18.0, 77.0)).toBe(false);      // far outside
    expect(containsLatLon(grid, 18.486, 77.40784)).toBe(false); // just north of edge
    expect(profileLeg(grid, { lat: 18.0, lon: 77.0 }, byId.Depot)).toBe(null);
  });
  it('nearest-cell at a cell center returns that cell value', () => {
    const mx = hm.x0 + 3 * hm.dx, my = hm.y0 - 4 * hm.dx;
    expect(nearestH(grid, mx, my)).toBe(hm.values[4][3]);
  });
  it('bilinear at a cell center equals the cell value', () => {
    const mx = hm.x0 + 10 * hm.dx, my = hm.y0 - 10 * hm.dx;
    expect(bilinearH(grid, mx, my)).toBeCloseTo(hm.values[10][10], 9);
  });
});

describe('runtime engine reproduces shipped legs.json (same grid, same method)', () => {
  const keys = Object.keys(legsJson.legs);
  it('covers every preset pair', () => { expect(keys.length).toBeGreaterThan(0); });
  for (const key of keys) {
    const [aId, bId] = key.split('|');
    it(`${key}: profile matches within rounding`, () => {
      const shipped = legsJson.legs[key];
      const leg = profileLeg(grid, byId[aId], byId[bId]);
      expect(leg).not.toBe(null);
      expect(leg.profile.length).toBe(shipped.length);
      expect(leg.dist).toBeCloseTo(shipped[shipped.length - 1][0], 1);
      let maxDz = 0, ascShipped = 0, ascRuntime = 0;
      for (let i = 0; i < shipped.length; i++) {
        maxDz = Math.max(maxDz, Math.abs(shipped[i][1] - leg.profile[i][1]));
        if (i > 0) {
          ascShipped += Math.max(0, shipped[i][1] - shipped[i - 1][1]);
          ascRuntime += Math.max(0, leg.profile[i][1] - leg.profile[i - 1][1]);
        }
      }
      expect(maxDz).toBeLessThanOrEqual(0.011); // both sides rounded to 2 dp
      expect(Math.abs(ascRuntime - ascShipped)).toBeLessThanOrEqual(0.05);
    });
    it(`${key}: slope range matches shipped legsMeta`, () => {
      const meta = legsJson.legsMeta[key];
      if (!meta || !meta.slope20_deg) return;
      const sr = slopeRange(grid, byId[aId], byId[bId], legsJson.legs[key].slice(-1)[0][0]);
      expect(sr).not.toBe(null);
      expect(Math.abs(sr[0] - meta.slope20_deg[0])).toBeLessThanOrEqual(0.15);
      expect(Math.abs(sr[1] - meta.slope20_deg[1])).toBeLessThanOrEqual(0.15);
    });
  }
});

describe('leg metrics + runtime legs provider', () => {
  it('computes dist/asc/desc/minutes for a known leg', () => {
    const m = legMetricsFromGrid(grid, byId.Depot, byId.Wildcat, 1.0);
    expect(m.dist).toBeGreaterThan(0);
    expect(m.asc).toBeGreaterThan(0);
    expect(m.minutes).toBeCloseTo(m.dist / (1000 / 60), 6);
    expect(m.profile[m.profile.length - 1][0]).toBeCloseTo(m.dist, 1);
  });
  it('pace scales walk time', () => {
    const m1 = legMetricsFromGrid(grid, byId.Depot, byId.Wildcat, 1.0);
    const m2 = legMetricsFromGrid(grid, byId.Depot, byId.Wildcat, 2.0);
    expect(m2.minutes).toBeCloseTo(m1.minutes / 2, 6);
  });
  it('createRuntimeLegs serves planner-compatible profiles on demand', () => {
    const rl = createRuntimeLegs(grid, id => byId[id], { shippedMeta: legsJson.legsMeta });
    const prof = rl.legs['Depot|Wildcat'];
    expect(Array.isArray(prof)).toBe(true);
    const shipped = legsJson.legs['Depot|Wildcat'];
    expect(prof.length).toBe(shipped.length);
    // unknown id -> null profile (no fabricated route)
    expect(rl.legs['Depot|Nowhere']).toBe(null);
    // geology passthrough for preset pairs; slope computed at runtime
    const meta = rl.legsMeta['Depot|Wildcat'];
    expect(meta.slope20_deg).not.toBe(null);
    expect(meta.geology).toEqual(legsJson.legsMeta['Depot|Wildcat'].geology);
  });
  it('custom user waypoint inside coverage is computable', () => {
    const pts = { ...byId, P1: { lat: 18.455, lon: 77.410 } };
    const rl = createRuntimeLegs(grid, id => pts[id]);
    const prof = rl.legs['Depot|P1'];
    expect(Array.isArray(prof)).toBe(true);
    expect(prof[prof.length - 1][0]).toBeGreaterThan(0);
    const meta = rl.legsMeta['Depot|P1'];
    expect(meta.geology).toBe(null); // honestly not computed for custom legs
  });
  it('custom user waypoint outside coverage yields null, not numbers', () => {
    const pts = { ...byId, P1: { lat: 19.0, lon: 78.0 } };
    const rl = createRuntimeLegs(grid, id => pts[id]);
    expect(rl.legs['Depot|P1']).toBe(null);
  });
});

describe('synthetic known grids (independent accuracy, not just regression)', () => {
  // Plane surface z = 0.01*mx + 0.02*my over a 5x5, 10 m grid centered at
  // x0=y0=0 (pixel centers at multiples of 10). Every expected value below
  // is analytic, independent of the shipped DTM.
  const mkPlane = () => {
    // 7x7 so slope baselines ending near the walk segment end stay in-grid
    const nx = 7, ny = 7, dx = 10, x0 = -30, y0 = 30;
    const values = [];
    for (let j = 0; j < ny; j++) {
      const row = [];
      for (let i = 0; i < nx; i++) {
        const mx = x0 + i * dx, my = y0 - j * dx;
        row.push(0.01 * mx + 0.02 * my);
      }
      values.push(row);
    }
    return createGrid({ nx, ny, dx, x0, y0, values }, 'synthetic plane');
  };
  it('exact heights, ascent and slope on an analytic plane', () => {
    const g = mkPlane();
    // y axis runs north->south: row j samples my = y0 - j*dx
    expect(g.values[0][0]).toBeCloseTo(0.01 * -30 + 0.02 * 30, 9);  // NW corner cell
    expect(g.values[6][6]).toBeCloseTo(0.01 * 30 + 0.02 * -30, 9);  // SE corner cell
    // walk due east along my = 0 (between cell rows): nearest-cell rows 2/3,
    // dz per 10 m step = 0.1 exactly on the plane
    const [latW, lonW] = [null, null];
    void latW; void lonW;
    const a = { lon: -20 / (Math.PI / 180) / 3396190 * 1, lat: 0 };
    // build endpoints in CRS degrees directly from meters for precision
    const deg = (m) => m * 180 / (Math.PI * 3396190);
    const leg = profileLeg(g, { lat: 0, lon: deg(-20) }, { lat: 0, lon: deg(20) });
    expect(leg).not.toBe(null);
    expect(leg.dist).toBeCloseTo(40, 1);
    // ascent along eastward walk = 0.01 m/m * 40 m = 0.4 m
    let asc = 0;
    for (let i = 1; i < leg.profile.length; i++) asc += Math.max(0, leg.profile[i][1] - leg.profile[i - 1][1]);
    expect(asc).toBeCloseTo(0.4, 1);
    // eastward slope over the 10 m grid baseline: atan2(0.1, 10)
    const sr = slopeRange(g, { lat: 0, lon: deg(-20) }, { lat: 0, lon: deg(20) }, 40);
    expect(sr[0]).toBeCloseTo(Math.atan2(0.1, 10) * 180 / Math.PI, 0);
    expect(sr[1]).toBeCloseTo(Math.atan2(0.1, 10) * 180 / Math.PI, 0);
  });
  it('bounds: corners inside, one step outside rejected', () => {
    const g = mkPlane();
    const deg = (m) => m * 180 / (Math.PI * 3396190);
    // cell-center extent: mx,my in [-35, +35]
    expect(containsLatLon(g, deg(30), deg(30))).toBe(true);    // NE corner cell center
    expect(containsLatLon(g, deg(-30), deg(-30))).toBe(true);  // SW
    expect(containsLatLon(g, deg(0), deg(34))).toBe(true);     // just inside east edge
    expect(containsLatLon(g, deg(0), deg(35.1))).toBe(false);  // just outside
    expect(containsLatLon(g, deg(-35.1), deg(0))).toBe(false); // south outside
  });
  it('NaN / null / Infinity cells are no-data: leg fails honestly', () => {
    const g = mkPlane();
    const deg = (m) => m * 180 / (Math.PI * 3396190);
    // mx=0,my=0 is cell i=3 (x0+3*dx=0), j=3 (y0-3*dx=0) on the 7x7 grid
    g.values[3][3] = NaN;
    expect(nearestH(g, 0, 0)).toBe(null);
    g.values[3][3] = null;
    expect(nearestH(g, 0, 0)).toBe(null);
    g.values[3][3] = Infinity;
    expect(nearestH(g, 0, 0)).toBe(null);
    expect(profileLeg(g, { lat: 0, lon: deg(-20) }, { lat: 0, lon: deg(20) })).toBe(null);
    expect(bilinearH(g, 1, 1)).toBe(null); // corner cell no-data -> no bilinear
  });
});

describe('QA regressions 2026-11-14', () => {
  it('reverse preset pair reuses shipped geology mirrored (never silently lost)', () => {
    const rl = createRuntimeLegs(grid, id => byId[id], { shippedMeta: legsJson.legsMeta });
    const fwd = legsJson.legsMeta['Depot|Wildcat'].geology;
    // only add the reverse test if the shipped table is one-directional here
    const revMeta = rl.legsMeta['Wildcat|Depot'];
    const fwdLeg = legsJson.legs['Depot|Wildcat'];
    const dist = fwdLeg[fwdLeg.length - 1][0];
    const round1 = (x) => Math.round(x * 10) / 10;
    const expected = fwd.map(s => [round1(dist - s[1]), round1(dist - s[0]), s[2], s[3]]).reverse();
    expect(revMeta.geology).toEqual(expected);
    // forward direction unchanged
    expect(rl.legsMeta['Depot|Wildcat'].geology).toEqual(fwd);
  });
});

describe('runtime legs with route models', () => {
  // synthetic wall: impassable (NaN) column except a gap at j=2, in createGrid meter space
  const mkGrid = () => {
    const [bx, by] = toM(77.0, 18.0);
    const values = [];
    for (let j = 0; j < 5; j++) {
      const row = [];
      for (let i = 0; i < 5; i++) row.push(i === 2 && j !== 2 ? null : -2500);
      values.push(row);
    }
    return createGrid({ nx: 5, ny: 5, dx: 10, x0: bx, y0: by, values }, 'synthetic');
  };
  const mkPts = () => {
    const [bx, by] = toM(77.0, 18.0);
    const [latA, lonA] = toLatLon(bx, by);
    const [latB, lonB] = toLatLon(bx + 40, by);
    return { A: { lat: latA, lon: lonA }, B: { lat: latB, lon: lonB } };
  };
  const ptsOf = (id) => mkPts()[id];

  it('straight baseline samples the segment; NaN cells make the leg unsamplable', () => {
    const legs = createRuntimeLegs(mkGrid(), ptsOf);
    expect(legs.legs['A|B']).toBeNull(); // straight line crosses the NaN wall
  });
  it('leastcost model routes around no-data and labels the model honestly', () => {
    const legs = createRuntimeLegs(mkGrid(), ptsOf, { routeModel: 'leastcost', srcLabel: 'synthetic' });
    const prof = legs.legs['A|B'];
    expect(prof).not.toBeNull();
    expect(prof[prof.length - 1][0]).toBeGreaterThan(40); // detour is longer than the 40 m straight line
    const meta = legs.legsMeta['A|B'];
    expect(meta.routeModel).toBe('leastcost');
    expect(Array.isArray(meta.pathLatLon) && meta.pathLatLon.length > 2).toBe(true);
  });
});

describe('shipped Jezero 4 m DTM binary grid', () => {
  const meta = JSON.parse(readFileSync('public/data/heightmap_jezero_4m.json', 'utf8'));
  const buf = readFileSync('public/data/heightmap_jezero_4m.bin');
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const hi = createGridFromBin(meta, ab);

  it('loads with the declared shape, fully populated inside the app window', () => {
    expect(hi.nx).toBe(meta.nx);
    expect(hi.ny).toBe(meta.ny);
    expect(hi.dx).toBe(4);
    let bad = 0;
    for (let j = 0; j < hi.ny; j++) for (let i = 0; i < hi.nx; i++) if (!Number.isFinite(hi.values[j][i])) bad++;
    expect(bad).toBe(0);
  });

  it('reproduces the source DTM at the six stations and stays near the 20 m grid', () => {
    // nearest-pixel values read from the source GeoTIFF at build time (rasterio)
    const expected = {
      Depot: -2546.23, Wildcat: -2524.36, Skinner: -2522.37,
      Kukaklek: -2524.07, Shuyak: -2526.63, Mageik: -2517.67,
    };
    for (const s of stations) {
      if (!(s.id in expected)) continue;
      const [mx, my] = toM(s.lon, s.lat);
      const h = bilinearH(hi, mx, my);
      expect(h).not.toBe(null);
      expect(Math.abs(h - expected[s.id])).toBeLessThan(2.0);   // bilinear vs nearest-pixel slack
      const hc = bilinearH(grid, mx, my);
      expect(Math.abs(h - hc)).toBeLessThan(10);                 // same datum: differences are resolution, not offset
    }
  });
});

describe('planner/comparison slope consistency (QA alignment)', () => {
  const pts = id => byId[id];
  it('legsMeta slope equals the shared profile sampler on the same leg', () => {
    const rl = createRuntimeLegs(grid, pts, { shippedMeta: legsJson.legsMeta });
    const prof = rl.legs['Kukaklek|Wildcat'];
    const meta = rl.legsMeta['Kukaklek|Wildcat'];
    expect(meta.slope20_deg).toEqual(slopeRangeProfile(prof, 20));
  });
  it('least-cost legsMeta slope is computed along the A* path, not the straight segment', () => {
    const rl = createRuntimeLegs(grid, pts, { routeModel: 'leastcost' });
    const meta = rl.legsMeta['Kukaklek|Wildcat'];
    expect(meta.pathLatLon).toBeTruthy();
    const prof = rl.legs['Kukaklek|Wildcat'];
    expect(meta.slope20_deg).toEqual(slopeRangeProfile(prof, 20));
    // and it differs from the straight-segment statistic it used to report
    const [ax, ay] = [byId.Kukaklek, byId.Wildcat];
    const straight = slopeRange(grid, ax, ay, Math.hypot(...(() => { const a = toM(ax.lon, ax.lat), b = toM(ay.lon, ay.lat); return [b[0] - a[0], b[1] - a[1]]; })()));
    expect(meta.slope20_deg).not.toEqual(straight);
  });
  it('comparison and planner report identical slope for the same endpoints and model', () => {
    const r = compareRoutes(grid, byId.Kukaklek, byId.Wildcat);
    const rl = createRuntimeLegs(grid, pts, { routeModel: 'leastcost' });
    expect(rl.legsMeta['Kukaklek|Wildcat'].slope20_deg).toEqual(r.leastCost.slope);
    const rs = createRuntimeLegs(grid, pts, {});
    expect(rs.legsMeta['Kukaklek|Wildcat'].slope20_deg).toEqual(r.straight.slope);
  });
});
