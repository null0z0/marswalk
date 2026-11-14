// 3D drape guard: drei Line2 crashes on < 2 points (RangeError: invalid typed
// array length). A zero-length route (identical endpoints, e.g. GaleBase and
// Rocknest share coordinates -> 1-cell A* path) must drape to < 2 points so
// the consumer skips the line instead of crashing.
import { describe, it, expect } from 'vitest';
import { pathPoints } from './Terrain3D.jsx';

function mkHm(nx = 8, ny = 8, dx = 10) {
  const values = [];
  for (let j = 0; j < ny; j++) values.push(new Array(nx).fill(-4500));
  return { nx, ny, dx, x0: 0, y0: 0, min: -4600, values };
}

describe('pathPoints drape guard', () => {
  it('a single lat/lon (1-cell path) yields < 2 points - the line is skipped', () => {
    const hm = mkHm();
    expect(pathPoints(hm, [[18.44, 77.45]]).length).toBeLessThan(2);
    expect(pathPoints(hm, []).length).toBeLessThan(2);
  });
  it('a two-point segment drapes to >= 2 points', () => {
    const hm = mkHm();
    expect(pathPoints(hm, [[18.44, 77.45], [18.4401, 77.4501]]).length).toBeGreaterThanOrEqual(2);
  });
  it('identical endpoints still produce a renderable (degenerate, zero-length) pair', () => {
    const hm = mkHm();
    const pts = pathPoints(hm, [[18.44, 77.45], [18.44, 77.45]]);
    expect(pts.length).toBeGreaterThanOrEqual(2);
    expect(pts.every(p => p[0] === pts[0][0] && p[2] === pts[0][2])).toBe(true);
  });
});
