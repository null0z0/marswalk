// Verify slope table (range) and slope chart (series) use the same windows:
// max of the series must equal the range's hi, min must equal the range's lo.
import { createGrid } from '../src/lib/terrain.js';
import { compareRoutes, slopeRangeProfile, slopeSeriesProfile } from '../src/lib/inspect.js';
import { readFileSync } from 'fs';
import stations from '../src/data/stations.json' with { type: 'json' };

const hm = JSON.parse(readFileSync(new URL('../public/data/heightmap.json', import.meta.url)));
const grid = createGrid(hm, 'test');
const a = stations.find(s => s.id === 'Depot');
const b = stations.find(s => s.id === 'Kukaklek');
const cmp = compareRoutes(grid, a, b);
for (const [name, r] of [['straight', cmp.straight], ['leastCost', cmp.leastCost]]) {
  if (!r) { console.log(name, 'null'); continue; }
  const range = slopeRangeProfile(r.profile, grid.dx);
  const series = slopeSeriesProfile(r.profile, grid.dx);
  const lo = Math.min(...series.map(p => p[1]));
  const hi = Math.max(...series.map(p => p[1]));
  console.log(name, 'range', range, 'series min/max', lo, hi,
    Math.abs(range[0] - lo) < 1e-9 && Math.abs(range[1] - hi) < 1e-9 ? 'MATCH' : 'MISMATCH');
}
