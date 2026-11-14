// Known-answer tests for route comparison, profile slope analysis, point
// inspection and geology point-in-polygon - all on synthetic inputs where the
// correct answer is known, independent of the shipped DTMs.
import { describe, it, expect } from 'vitest';
import {
  ascDesc, slopeRangeProfile, slopeSeriesProfile, compareRoutes,
  pointInfo, distanceBearing, geologyAtPoint, geologyAlongPath,
} from './inspect.js';
import { toM, toLatLon } from './terrain.js';

function mkGrid(nx, ny, dx, heightFn) {
  const values = [];
  for (let j = 0; j < ny; j++) {
    const row = [];
    for (let i = 0; i < nx; i++) row.push(heightFn(i, j));
    values.push(row);
  }
  return { nx, ny, dx, x0: 0, y0: 0, values, srcLabel: 'synthetic test grid', bounds: null };
}
function pt(grid, i, j) {
  const [lat, lon] = toLatLon(grid.x0 + i * grid.dx, grid.y0 - j * grid.dx);
  return { lat, lon };
}

describe('ascDesc', () => {
  it('sums positive and negative deltas separately', () => {
    const { asc, desc } = ascDesc([[0, 100], [10, 110], [20, 95], [30, 105]]);
    expect(asc).toBeCloseTo(20, 6);   // +10 then +10
    expect(desc).toBeCloseTo(15, 6);  // -15
  });
});

describe('slopeRangeProfile / slopeSeriesProfile', () => {
  it('constant 10% grade reads 5.7 deg over any baseline', () => {
    const prof = [[0, 0], [50, 5], [100, 10]]; // +10 m per 100 m
    const sr = slopeRangeProfile(prof, 20);
    expect(sr[0]).toBeCloseTo(5.7, 1);
    expect(sr[1]).toBeCloseTo(5.7, 1);
  });
  it('flat profile reads zero slope', () => {
    const sr = slopeRangeProfile([[0, 50], [100, 50]], 20);
    expect(sr).toEqual([0, 0]);
  });
  it('returns null when the profile is shorter than the baseline', () => {
    expect(slopeRangeProfile([[0, 0], [10, 1]], 20)).toBe(null);
  });
  it('series catches the steepest part of a mixed profile', () => {
    // flat then 30% grade: max slope window should approach 16.7 deg
    const prof = [[0, 0], [100, 0], [200, 30]];
    const s = slopeSeriesProfile(prof, 20);
    expect(s.length).toBeGreaterThan(0);
    const max = Math.max(...s.map(p => p[1]));
    expect(max).toBeGreaterThan(15);
    expect(max).toBeLessThanOrEqual(16.7);
  });
});

describe('compareRoutes', () => {
  it('flat plane: both models route, distances within 3%', () => {
    const g = mkGrid(60, 60, 10, () => 100);
    const r = compareRoutes(g, pt(g, 2, 2), pt(g, 57, 57));
    expect(r.straight).not.toBe(null);
    expect(r.leastCost).not.toBe(null);
    expect(r.leastCost.dist).toBeGreaterThanOrEqual(r.straight.dist - 1e-6);
    expect(r.leastCost.dist).toBeLessThan(r.straight.dist * 1.03);
    expect(r.straight.slope).toEqual([0, 0]);
    expect(r.leastCost.slope).toEqual([0, 0]);
  });
  it('steep ridge between endpoints: least-cost detours longer than baseline', () => {
    // a tall wall of cells at i=30 (50 m higher than the plain) forces the
    // slope-penalized path around it; the straight baseline crosses it
    const g = mkGrid(60, 60, 10, (i, j) => (i === 30 && j >= 10 && j <= 50 ? 50 : 0));
    const r = compareRoutes(g, pt(g, 5, 30), pt(g, 55, 30));
    expect(r.straight).not.toBe(null);
    expect(r.leastCost).not.toBe(null);
    expect(r.leastCost.dist).toBeGreaterThan(r.straight.dist * 1.02);
    // straight baseline crosses the wall: its profile climbs ~50 m
    expect(r.straight.asc).toBeGreaterThan(40);
    // least-cost avoids the wall top: much less climbing
    expect(r.leastCost.asc).toBeLessThan(r.straight.asc);
  });
  it('no-data on the straight line: baseline fails, least-cost may still route', () => {
    const g = mkGrid(60, 60, 10, (i, j) => (i === 30 && j !== 55 ? null : 0));
    const r = compareRoutes(g, pt(g, 5, 30), pt(g, 55, 30));
    expect(r.straight).toBe(null);            // gap on the segment: reported, not guessed
    expect(r.leastCost).not.toBe(null);       // A* detours through the open row
  });
  it('endpoint outside the grid: both null', () => {
    const g = mkGrid(20, 20, 10, () => 0);
    const r = compareRoutes(g, pt(g, 2, 2), pt(g, 100, 100));
    expect(r.straight).toBe(null);
    expect(r.leastCost).toBe(null);
  });
});

describe('pointInfo', () => {
  it('flat grid: elevation, zero slope', () => {
    const g = mkGrid(20, 20, 10, () => 42);
    const info = pointInfo(g, ...(() => { const p = pt(g, 10, 10); return [p.lat, p.lon]; })());
    expect(info.inside).toBe(true);
    expect(info.elev).toBeCloseTo(42, 1);
    expect(info.slopeDeg).toBe(0);
  });
  it('uniform eastward tilt: slope magnitude and downslope bearing east', () => {
    const g = mkGrid(30, 30, 10, (i) => i * 2); // +20 m per 100 m east = 11.3 deg
    const p = pt(g, 15, 15);
    const info = pointInfo(g, p.lat, p.lon);
    expect(info.slopeDeg).toBeCloseTo(11.3, 0);
    expect(info.downslopeBearing).toBe(270); // downhill = west (height rises eastward)
  });
  it('outside coverage returns null', () => {
    const g = mkGrid(10, 10, 10, () => 0);
    const p = pt(g, 500, 500);
    expect(pointInfo(g, p.lat, p.lon)).toBe(null);
  });
});

describe('distanceBearing', () => {
  it('due north is 0 deg, due east 90 deg', () => {
    const a = { lat: 18.45, lon: 77.40 };
    const north = distanceBearing(a, { lat: 18.46, lon: 77.40 });
    expect(north.bearing).toBeCloseTo(0, 0);
    const east = distanceBearing(a, { lat: 18.45, lon: 77.41 });
    expect(east.bearing).toBeCloseTo(90, 0);
    expect(north.dist).toBeGreaterThan(500);
  });
});

const SQUARE = (cx, cy, s) => [[
  [cx - s, cy - s], [cx + s, cy - s], [cx + s, cy + s], [cx - s, cy + s], [cx - s, cy - s],
]];
const GEO = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { symbol: 'Aa', name: 'Unit A' }, geometry: { type: 'Polygon', coordinates: SQUARE(77.400, 18.450, 0.002) } },
    { type: 'Feature', properties: { symbol: 'Bb', name: 'Unit B' }, geometry: { type: 'Polygon', coordinates: SQUARE(77.410, 18.450, 0.002) } },
  ],
};

describe('geologyAtPoint', () => {
  it('finds the containing unit', () => {
    expect(geologyAtPoint(GEO, 77.400, 18.450)).toEqual({ symbol: 'Aa', name: 'Unit A' });
    expect(geologyAtPoint(GEO, 77.410, 18.450)).toEqual({ symbol: 'Bb', name: 'Unit B' });
  });
  it('returns null outside every mapped unit', () => {
    expect(geologyAtPoint(GEO, 77.500, 18.450)).toBe(null);
  });
  it('returns undefined when the layer is not loaded', () => {
    expect(geologyAtPoint(null, 77.4, 18.45)).toBe(undefined);
  });
});

describe('geologyAlongPath', () => {
  it('segments a path crossing two units', () => {
    // walk east from inside A across the gap? A spans lon 77.398-77.402,
    // B spans 77.408-77.412; the path crosses A, a gap, then B
    const { segments } = geologyAlongPath(GEO, [[18.450, 77.399], [18.450, 77.411]], 10);
    const symbols = segments.map(s => s[2]);
    expect(symbols[0]).toBe('Aa');
    expect(symbols).toContain(null);   // unmapped gap between the squares
    expect(symbols[symbols.length - 1]).toBe('Bb');
    // segments are contiguous and ordered
    for (let i = 1; i < segments.length; i++) {
      expect(segments[i][0]).toBeCloseTo(segments[i - 1][1], 6);
    }
  });
  it('path fully outside mapped units is one null segment', () => {
    const { segments } = geologyAlongPath(GEO, [[18.460, 77.499], [18.460, 77.501]], 10);
    expect(segments.length).toBe(1);
    expect(segments[0][2]).toBe(null);
  });
});

describe('hi-res profile / inspector grid (4 m DTM path)', () => {
  const coarse = mkGrid(60, 60, 10, () => 0);
  // finer grid with a 20 m-tall bump the coarse grid cannot see
  const fine = mkGrid(120, 120, 5, (i, j) => (i >= 55 && i <= 65 && j >= 55 && j <= 65) ? 20 : 0);
  fine.srcLabel = 'synthetic 5 m grid';

  it('compareRoutes with hiGrid: straight profile climbs the bump, source labeled', () => {
    const r = compareRoutes(coarse, pt(fine, 20, 60), pt(fine, 110, 60), { hiGrid: fine });
    expect(r.straight).not.toBe(null);
    expect(r.straight.asc).toBeGreaterThan(15);          // bump visible only on the fine grid
    expect(r.straight.profileSrc).toBe('synthetic 5 m grid');
    expect(r.profileSrc).toBe('synthetic 5 m grid');
    expect(r.profileM).toBe(5);
  });
  it('compareRoutes without hiGrid: same geometry, bump invisible on coarse grid', () => {
    const r = compareRoutes(coarse, pt(fine, 20, 60), pt(fine, 110, 60));
    expect(r.straight.asc).toBe(0);
    expect(r.profileSrc).toBe(null);
  });
  it('hiGrid with a no-data hole on the line: profile stays coarse, never mixed', () => {
    const holed = mkGrid(120, 120, 5, (i, j) => (i === 60 && j >= 55 && j <= 65) ? null : 0);
    holed.srcLabel = 'holed 5 m grid';
    const r = compareRoutes(coarse, pt(fine, 20, 60), pt(fine, 110, 60), { hiGrid: holed });
    expect(r.straight).not.toBe(null);
    expect(r.straight.profileSrc).toBe(null);            // upgrade refused, coarse kept
  });
  it('pointInfo prefers hiGrid elevation and labels the source', () => {
    const flat = mkGrid(60, 60, 10, () => 100);
    const hi = mkGrid(120, 120, 5, () => 55);
    hi.srcLabel = 'synthetic 5 m grid';
    const p = pt(flat, 30, 30);
    const info = pointInfo(flat, p.lat, p.lon, hi);
    expect(info.elev).toBeCloseTo(55, 1);
    expect(info.elevSrc).toBe('synthetic 5 m grid');
  });
  it('pointInfo falls back to the coarse grid outside hiGrid coverage', () => {
    const flat = mkGrid(60, 60, 10, () => 100);
    const tiny = mkGrid(4, 4, 5, () => 55); // tiny patch around the origin
    tiny.srcLabel = 'tiny';
    const p = pt(flat, 50, 50);
    const info = pointInfo(flat, p.lat, p.lon, tiny);
    expect(info.elev).toBeCloseTo(100, 1);
    expect(info.elevSrc).toBe('synthetic test grid');
  });
});
