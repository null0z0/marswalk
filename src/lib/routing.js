// Least-cost path over the elevation grid (feature B).
//
// This is NOT a "shortest route" in the geometric sense and must never be
// labeled as one: it is the least-cost path under a DECLARED cost model -
// cost = horizontal distance x (1 + slopePenalty x |slope|) - on the shipped
// USGS-derived grid, with no-data cells treated as impassable. The straight
// line stays on screen as the labeled geometric baseline for comparison.
// Grid spacing limits apply (20 m Jezero / 2 m Gale); the result is model
// output, not a surveyed or safety-checked path.
//
// Method: A* over grid cells, 8-connected. Corner cutting is prevented: a
// diagonal step is allowed only when BOTH orthogonal neighbors it passes
// between are passable, so the path can never slip through a diagonal gap in
// a no-data barrier. The search runs on the FULL grid (no windowing - a
// windowed search can return a successful but globally suboptimal detour);
// an explored-node cap bounds runtime, and exceeding it or exhausting the
// frontier returns null - an explicit "no path under this model", never a
// guess.

import { toM, toLatLon } from './terrain.js';

// Minimal binary min-heap of [cost, index] pairs.
function heapPush(h, item) {
  h.push(item);
  let i = h.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (h[p][0] <= h[i][0]) break;
    [h[p], h[i]] = [h[i], h[p]];
    i = p;
  }
}
function heapPop(h) {
  const top = h[0];
  const last = h.pop();
  if (h.length) {
    h[0] = last;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1, r = l + 1;
      let m = i;
      if (l < h.length && h[l][0] < h[m][0]) m = l;
      if (r < h.length && h[r][0] < h[m][0]) m = r;
      if (m === i) break;
      [h[m], h[i]] = [h[i], h[m]];
      i = m;
    }
  }
  return top;
}

function cellOf(grid, mx, my) {
  return [Math.round((mx - grid.x0) / grid.dx), Math.round((grid.y0 - my) / grid.dx)];
}
function passable(grid, i, j) {
  if (i < 0 || i >= grid.nx || j < 0 || j >= grid.ny) return false;
  const v = grid.values[j][i];
  return v != null && Number.isFinite(v);
}

// opts: { slopePenalty=6, maxNodes=1500000 }
// slopePenalty 6 means walking a 20% slope costs 2.2x its horizontal length.
export function leastCostPath(grid, from, to, opts = {}) {
  const slopePenalty = opts.slopePenalty ?? 6;
  const maxNodes = opts.maxNodes ?? 1500000;
  if (!grid || !from || !to) return null;

  const [amx, amy] = toM(from.lon, from.lat);
  const [bmx, bmy] = toM(to.lon, to.lat);
  const [ai, aj] = cellOf(grid, amx, amy);
  const [bi, bj] = cellOf(grid, bmx, bmy);
  if (!passable(grid, ai, aj) || !passable(grid, bi, bj)) return null;

  // Full-grid search: no windowing, so a returned path is the global optimum
  // under the declared cost model on this grid.
  const i0 = 0, i1 = grid.nx - 1, j0 = 0, j1 = grid.ny - 1;
  const w = i1 - i0 + 1, h = j1 - j0 + 1;
  const idx = (i, j) => (j - j0) * w + (i - i0);

  const dist = new Float64Array(w * h).fill(Infinity);
  const came = new Int32Array(w * h).fill(-1);
  const closed = new Uint8Array(w * h);
  const hGoal = (i, j) => Math.hypot(i - bi, j - bj) * grid.dx; // admissible: straight line at zero slope

  const heap = [];
  dist[idx(ai, aj)] = 0;
  heapPush(heap, [hGoal(ai, aj), ai, aj]);
  let explored = 0;

  const DIRS = [
    [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
    [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
  ];

  while (heap.length) {
    const [, ci, cj] = heapPop(heap);
    const cIdx = idx(ci, cj);
    if (closed[cIdx]) continue;
    closed[cIdx] = 1;
    if (++explored > maxNodes) return null; // explicit failure, never a guess
    if (ci === bi && cj === bj) break;

    const hv = grid.values[cj][ci];
    for (const [di, dj, step] of DIRS) {
      const ni = ci + di, nj = cj + dj;
      if (ni < i0 || ni > i1 || nj < j0 || nj > j1) continue;
      if (!passable(grid, ni, nj)) continue;
      if (di !== 0 && dj !== 0) {
        // corner-cutting guard: both orthogonal cells must be passable
        if (!passable(grid, ci + di, cj) || !passable(grid, ci, cj + dj)) continue;
      }
      const stepM = step * grid.dx;
      const slope = Math.abs(grid.values[nj][ni] - hv) / stepM;
      const cost = stepM * (1 + slopePenalty * slope);
      const nIdx = idx(ni, nj);
      const nd = dist[cIdx] + cost;
      if (nd < dist[nIdx]) {
        dist[nIdx] = nd;
        came[nIdx] = cIdx;
        heapPush(heap, [nd + hGoal(ni, nj), ni, nj]);
      }
    }
  }

  const gIdx = idx(bi, bj);
  if (!isFinite(dist[gIdx])) return null; // unreachable under this model/window

  // Reconstruct cells goal -> start, then reverse.
  const cells = [];
  for (let c = gIdx; c !== -1; c = came[c]) cells.push(c);
  cells.reverse();

  let distM = 0;
  const pathLatLon = cells.map((c, k) => {
    const i = (c % w) + i0, j = Math.floor(c / w) + j0;
    if (k > 0) {
      const pi = (cells[k - 1] % w) + i0, pj = Math.floor(cells[k - 1] / w) + j0;
      distM += Math.hypot(i - pi, j - pj) * grid.dx;
    }
    const [lat, lon] = toLatLon(grid.x0 + i * grid.dx, grid.y0 - j * grid.dx);
    return [lat, lon];
  });
  // same path with grid-cell elevations, for profile sampling by callers
  const pathGrid = cells.map((c) => {
    const i = (c % w) + i0, j = Math.floor(c / w) + j0;
    const [lat, lon] = toLatLon(grid.x0 + i * grid.dx, grid.y0 - j * grid.dx);
    return { lat, lon, elev: grid.values[j][i] };
  });

  return {
    pathLatLon,
    pathGrid,
    distM,
    costM: dist[gIdx],
    explored,
    model: { type: 'least-cost', slopePenalty, gridM: grid.dx, srcLabel: grid.srcLabel },
  };
}
