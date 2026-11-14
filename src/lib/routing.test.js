// Known-answer tests for the least-cost engine on SYNTHETIC grids where the
// correct path is known analytically - independent of the shipped DTMs.
import { describe, it, expect } from 'vitest';
import { leastCostPath } from './routing.js';
import { toM } from './terrain.js';

// Build a synthetic grid directly in projected meters by choosing lat/lon
// endpoints through toM's inverse. dx=10 m cells centered on x0/y0.
function mkGrid(nx, ny, dx, heightFn, opts = {}) {
  const x0 = 0, y0 = 0;
  const values = [];
  for (let j = 0; j < ny; j++) {
    const row = [];
    for (let i = 0; i < nx; i++) row.push(heightFn(i, j));
    values.push(row);
  }
  return { nx, ny, dx, x0, y0, values, srcLabel: 'synthetic test grid', bounds: opts.bounds || null };
}
function pt(grid, i, j) {
  // cell center in meters -> lat/lon via the same projection the engine uses
  const mx = grid.x0 + i * grid.dx, my = grid.y0 - j * grid.dx;
  // toLatLon is exported from terrain.js; use proj4 inverse through it
  const [lat, lon] = gridToLatLon(mx, my);
  return { lat, lon };
}
import { toLatLon } from './terrain.js';
function gridToLatLon(mx, my) { return toLatLon(mx, my); }

function everyCellFinite(grid, pathLatLon) {
  return pathLatLon.every(([lat, lon]) => {
    const [mx, my] = toM(lon, lat);
    const i = Math.round((mx - grid.x0) / grid.dx);
    const j = Math.round((grid.y0 - my) / grid.dx);
    const v = grid.values[j] && grid.values[j][i];
    return v != null && Number.isFinite(v);
  });
}

describe('leastCostPath known-answer synthetic grids', () => {
  it('flat plane: found path is within 3% of the straight-line distance', () => {
    const g = mkGrid(60, 60, 10, () => 100);
    const r = leastCostPath(g, pt(g, 2, 2), pt(g, 57, 57));
    expect(r).not.toBe(null);
    const straight = Math.hypot(55 * 10, 55 * 10);
    expect(r.distM).toBeGreaterThanOrEqual(straight);
    expect(r.distM).toBeLessThan(straight * 1.03);
  });

  it('no-data wall with one gap: path goes through the gap, never through no-data', () => {
    // vertical wall at i=30 except a gap at j=20..24
    const g = mkGrid(60, 60, 10, (i, j) => (i === 30 && (j < 20 || j > 24) ? null : 0));
    const r = leastCostPath(g, pt(g, 5, 40), pt(g, 55, 40));
    expect(r).not.toBe(null);
    expect(everyCellFinite(g, r.pathLatLon)).toBe(true);
    // path must pass the wall within the gap rows: find cells with i=30
    const crossing = r.pathLatLon.filter(([lat, lon]) => {
      const [mx] = toM(lon, lat);
      return Math.round((mx - g.x0) / g.dx) === 30;
    });
    expect(crossing.length).toBeGreaterThan(0);
    for (const [lat, lon] of crossing) {
      const [, my] = toM(lon, lat);
      const j = Math.round((g.y0 - my) / g.dx);
      expect(j).toBeGreaterThanOrEqual(20);
      expect(j).toBeLessThanOrEqual(24);
    }
  });

  it('diagonal no-data wall: no corner cutting through the diagonal', () => {
    // cells (k,k) for k=10..49 are no-data; plus extend to block simple detour:
    // a pure diagonal barrier is ONLY crossable by cutting a corner, so the
    // guard must force the path around its end.
    const g = mkGrid(60, 60, 10, (i, j) => (i === j && i >= 5 && i <= 54 ? null : 0));
    const r = leastCostPath(g, pt(g, 10, 30), pt(g, 30, 10));
    expect(r).not.toBe(null);
    expect(everyCellFinite(g, r.pathLatLon)).toBe(true);
    // every step of the path must be a legal move: for diagonal steps both
    // orthogonal neighbors passable (re-verify from the path itself)
    for (let k = 1; k < r.pathLatLon.length; k++) {
      const [mx0, my0] = toM(r.pathLatLon[k - 1][1], r.pathLatLon[k - 1][0]);
      const [mx1, my1] = toM(r.pathLatLon[k][1], r.pathLatLon[k][0]);
      const i0 = Math.round((mx0 - g.x0) / g.dx), j0 = Math.round((g.y0 - my0) / g.dx);
      const i1 = Math.round((mx1 - g.x0) / g.dx), j1 = Math.round((g.y0 - my1) / g.dx);
      const di = i1 - i0, dj = j1 - j0;
      expect(Math.abs(di)).toBeLessThanOrEqual(1);
      expect(Math.abs(dj)).toBeLessThanOrEqual(1);
      if (di !== 0 && dj !== 0) {
        const o1 = g.values[j0][i0 + di], o2 = g.values[j0 + dj][i0];
        expect(o1 != null && Number.isFinite(o1)).toBe(true);
        expect(o2 != null && Number.isFinite(o2)).toBe(true);
      }
    }
  });

  it('slope penalty steers around a steep bump when the penalty is high, through it at zero', () => {
    // ridge at i=28..32 spanning j=10..49 (ends leave a flat way around),
    // rising 40 m over one 10 m cell (slope 4 - far beyond any walkable range)
    const g = mkGrid(60, 60, 10, (i, j) => (i >= 28 && i <= 32 && j >= 10 && j <= 49 ? 40 : 0));
    const a = pt(g, 10, 30), b = pt(g, 50, 30);
    const steep = leastCostPath(g, a, b, { slopePenalty: 40 });
    const flat = leastCostPath(g, a, b, { slopePenalty: 0 });
    expect(steep).not.toBe(null);
    expect(flat).not.toBe(null);
    // zero penalty: straight through, ~400 m
    expect(flat.distM).toBeLessThan(440);
    // high penalty: visibly longer detour around the ridge
    expect(steep.distM).toBeGreaterThan(flat.distM * 1.2);
    expect(everyCellFinite(g, steep.pathLatLon)).toBe(true);
  });

  it('unreachable target (ringed by no-data) returns null, never a fabricated path', () => {
    const g = mkGrid(40, 40, 10, (i, j) => {
      // ring target (20,20) with no-data at Chebyshev distance 1
      if (Math.max(Math.abs(i - 20), Math.abs(j - 20)) === 1) return null;
      return 0;
    });
    // target cell itself passable but fully enclosed
    const r = leastCostPath(g, pt(g, 2, 2), pt(g, 20, 20));
    expect(r).toBe(null);
  });

  it('endpoint on no-data or outside the grid returns null', () => {
    const g = mkGrid(40, 40, 10, (i, j) => (i === 5 && j === 5 ? null : 0));
    expect(leastCostPath(g, pt(g, 5, 5), pt(g, 20, 20))).toBe(null);
    expect(leastCostPath(g, pt(g, 1, 1), { lat: 85, lon: 179 })).toBe(null);
  });

  it('reports its cost model honestly', () => {
    const g = mkGrid(30, 30, 10, () => 0);
    const r = leastCostPath(g, pt(g, 2, 2), pt(g, 27, 27));
    expect(r.model.type).toBe('least-cost');
    expect(r.model.slopePenalty).toBe(6);
    expect(r.model.gridM).toBe(10);
  });
});

describe('zero-length route (identical endpoints)', () => {
  it('returns a 1-cell path with distM 0 - zero-length semantics, no invented geometry', () => {
    const g = mkGrid(30, 30, 10, () => 0);
    const p = pt(g, 7, 7);
    const r = leastCostPath(g, p, { ...p });
    expect(r).not.toBe(null);
    expect(r.pathLatLon.length).toBe(1);
    expect(r.pathGrid.length).toBe(1);
    expect(r.distM).toBe(0);
    expect(r.costM).toBe(0);
  });
});
