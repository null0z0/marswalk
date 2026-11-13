import { describe, it, expect } from 'vitest';
import { buildPlan, legMetrics } from './planner.js';
import legsData from '../../public/data/legs.json' with { type: 'json' };

const STOPS = [
  { id: 'Wildcat' }, { id: 'Skinner' }, { id: 'Kodiak' },
];
const PRIO = { Wildcat: 1, Skinner: 2, Kodiak: 3 };
const BASE = { stops: STOPS, priorities: PRIO, windowMin: 300, dwellMin: 60, paceKmh: 1.0, legsData };

describe('planner decision loop (display rounding 268/32/308/8/208/248)', () => {
  it('a) 5h window: all three stations fit (~268 min, buffer ~32)', () => {
    const r = buildPlan({ ...BASE, visited: [] });
    expect(r.infeasible).toBe(false);
    expect(r.dropped).toHaveLength(0);
    expect(Math.round(r.sim.total)).toBe(268);
    expect(Math.round(r.budget - r.sim.total)).toBe(32);
  });
  it('b) 5h + 40min delay at station 1: one station drops (Kodiak, ends ~208)', () => {
    const r = buildPlan({ ...BASE, visited: [{ id: 'Wildcat', dwellUsed: 100 }] });
    expect(Math.round(r.elapsed + r.sim.total)).toBeGreaterThan(0);
    const fullTotal = r.elapsed + r.full.total;
    expect(Math.round(fullTotal)).toBe(308);
    expect(r.dropped.map(d => d.id)).toEqual(['Kodiak']);
    expect(r.dropped[0].reason).toBe('lowest-priority non-must-have');
    expect(Math.round(r.elapsed + r.sim.total)).toBe(208);
  });
  it('c) 6h window: no drop', () => {
    const r = buildPlan({ ...BASE, windowMin: 360, visited: [{ id: 'Wildcat', dwellUsed: 100 }] });
    expect(r.dropped).toHaveLength(0);
    expect(r.infeasible).toBe(false);
    expect(Math.round(r.elapsed + r.sim.total)).toBe(308);
  });
  it('d) priority change reorders which station drops (Kodiak kept, Skinner drops, ends ~248)', () => {
    const r = buildPlan({ ...BASE, priorities: { Wildcat: 1, Kodiak: 2, Skinner: 3 }, visited: [{ id: 'Wildcat', dwellUsed: 100 }] });
    expect(r.dropped.map(d => d.id)).toEqual(['Skinner']);
    expect(Math.round(r.elapsed + r.sim.total)).toBe(248);
  });
  it('e) all must-have and cannot fit: explicit shortfall, nothing silently dropped', () => {
    const r = buildPlan({ ...BASE, windowMin: 200, mustHaves: ['Wildcat', 'Skinner', 'Kodiak'], visited: [] });
    expect(r.infeasible).toBe(true);
    expect(r.dropped).toHaveLength(0);
    expect(r.shortfall).toBeGreaterThan(0);
    expect(Math.round(r.sim.total - r.budget)).toBe(Math.round(r.shortfall));
  });
  it('g) all must-have at 270: best-order 268 fits, no false infeasible, no drop', () => {
    const r = buildPlan({ ...BASE, windowMin: 270, mustHaves: ['Wildcat', 'Skinner', 'Kodiak'], priorities: { Wildcat: 3, Kodiak: 1, Skinner: 2 } });
    expect(r.infeasible).toBe(false);
    expect(r.dropped).toHaveLength(0);
    expect(r.kept).toHaveLength(3);
    expect(Math.round(r.sim.total)).toBe(268);
    expect(Math.round(r.sim.dist)).toBe(1460); // shortest loop regardless of priority order
  });
  it('f) zero window: graceful infeasible shortfall, no crash, nothing silently dropped', () => {
    const r = buildPlan({ ...BASE, windowMin: 0, mustHaves: ['Wildcat', 'Skinner', 'Kodiak'] });
    expect(r.infeasible).toBe(true);
    expect(r.dropped).toHaveLength(0);
    expect(Number.isFinite(r.shortfall)).toBe(true);
    const r2 = buildPlan({ ...BASE, windowMin: 0 });
    expect(r2.dropped).toHaveLength(3);
    expect(r2.kept).toHaveLength(0);
    expect(r2.infeasible).toBe(false);
  });
  it('h) completed legs keep their recorded walk time when pace changes later', () => {
    // Leg Depot->Wildcat finished at pace 1.0; the slider then moves to 0.5.
    // History must not be recomputed: elapsed stays walkMin(1.0)+dwell, and the
    // new pace applies only to legs not yet walked.
    const w = legMetrics(legsData, 'Depot', 'Wildcat', 1.0).minutes;
    const visited = [{ id: 'Wildcat', dwellUsed: 100, walkMin: w, paceUsed: 1.0 }];
    const slow = buildPlan({ ...BASE, paceKmh: 0.5, visited });
    expect(slow.visitedLegs[0].walkMin).toBe(w);
    expect(slow.visitedLegs[0].paceUsed).toBe(1.0);
    expect(slow.elapsed).toBeCloseTo(w + 100, 6);
    const fast = buildPlan({ ...BASE, paceKmh: 1.0, visited });
    expect(fast.elapsed).toBeCloseTo(slow.elapsed, 6);
  });
});

describe('distance invariant: leg table sum == header total == profile end', () => {
  const tableSum = p => p.visitedLegs.concat(p.sim.legs).reduce((a, l) => a + l.metrics.dist, 0);
  const headerTotal = p => p.visitedLegs.reduce((a, l) => a + l.metrics.dist, 0) + p.sim.dist;
  const profileEnd = p => p.visitedLegs.concat(p.sim.legs).reduce((a, l) => a + l.metrics.dist, 0);
  it('default plan: legs, header and profile agree', () => {
    const r = buildPlan({ ...BASE, visited: [] });
    expect(tableSum(r)).toBeCloseTo(headerTotal(r), 6);
    expect(profileEnd(r)).toBeCloseTo(headerTotal(r), 6);
  });
  it('overrun LOST scenario (Kodiak dropped): 381.4 + 20.7 + 390.5 = 792.6 m, header shows 0.79 km', () => {
    const w = legMetrics(legsData, 'Depot', 'Wildcat', 1.0).minutes;
    const r = buildPlan({ ...BASE, visited: [{ id: 'Wildcat', dwellUsed: 100, walkMin: w, paceUsed: 1.0 }] });
    expect(r.dropped.map(d => d.id)).toEqual(['Kodiak']);
    expect(tableSum(r)).toBeCloseTo(headerTotal(r), 6);
    expect(headerTotal(r)).toBeCloseTo(792.6, 1);
    expect((headerTotal(r) / 1000).toFixed(2)).toBe('0.79');
  });
});
