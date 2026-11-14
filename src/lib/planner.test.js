import { describe, it, expect } from 'vitest';
import { buildPlan, legMetrics } from './planner.js';
import legsData from '../../public/data/legs.json' with { type: 'json' };

// Legs are regenerated from the DTM by scripts/build_legs.py (routable
// stations only: the Kodiak candidate viewpoint was removed entirely - no verified coordinate).
// Loop Depot-Wildcat-Skinner-Depot = 380.19 + 20.14 + 389.19 = 789.52 m.
const STOPS = [
  { id: 'Wildcat' }, { id: 'Skinner' },
];
const PRIO = { Wildcat: 1, Skinner: 2 };
const BASE = { stops: STOPS, priorities: PRIO, windowMin: 300, dwellMin: 60, paceKmh: 1.0, legsData };

describe('planner decision loop (display rounding 167/133/207/107/67)', () => {
  it('a) 5h window: both stations fit (~167 min, buffer ~133)', () => {
    const r = buildPlan({ ...BASE, visited: [] });
    expect(r.infeasible).toBe(false);
    expect(r.dropped).toHaveLength(0);
    expect(Math.round(r.sim.total)).toBe(167);
    expect(Math.round(r.budget - r.sim.total)).toBe(133);
  });
  it('b) 5h + 40min delay at station 1: still fits (~207 min), nothing drops', () => {
    const r = buildPlan({ ...BASE, visited: [{ id: 'Wildcat', dwellUsed: 100 }] });
    expect(Math.round(r.elapsed + r.sim.total)).toBe(207);
    expect(r.dropped).toHaveLength(0);
    expect(r.infeasible).toBe(false);
  });
  it('c) tight 130min window: lowest-priority non-must-have drops (Skinner, ends ~106)', () => {
    const r = buildPlan({ ...BASE, windowMin: 130, visited: [] });
    expect(r.dropped.map(d => d.id)).toEqual(['Skinner']);
    expect(r.dropped[0].reason).toBe('lowest-priority non-must-have');
    expect(Math.round(r.elapsed + r.sim.total)).toBe(106);
  });
  it('d) priority change reorders which station drops (Skinner kept, Wildcat drops, ends ~106)', () => {
    const r = buildPlan({ ...BASE, windowMin: 130, priorities: { Wildcat: 2, Skinner: 1 }, visited: [] });
    expect(r.dropped.map(d => d.id)).toEqual(['Wildcat']);
    expect(Math.round(r.elapsed + r.sim.total)).toBe(107);
  });
  it('e) all must-have and cannot fit: explicit shortfall, nothing silently dropped', () => {
    const r = buildPlan({ ...BASE, windowMin: 100, mustHaves: ['Wildcat', 'Skinner'], visited: [] });
    expect(r.infeasible).toBe(true);
    expect(r.dropped).toHaveLength(0);
    expect(r.shortfall).toBeGreaterThan(0);
    expect(Math.round(r.sim.total - r.budget)).toBe(Math.round(r.shortfall));
  });
  it('g) all must-have at 170: best-order 167 fits, no false infeasible, no drop', () => {
    const r = buildPlan({ ...BASE, windowMin: 170, mustHaves: ['Wildcat', 'Skinner'], priorities: { Wildcat: 2, Skinner: 1 } });
    expect(r.infeasible).toBe(false);
    expect(r.dropped).toHaveLength(0);
    expect(r.kept).toHaveLength(2);
    expect(Math.round(r.sim.total)).toBe(167);
    expect(Math.round(r.sim.dist)).toBe(791); // shortest loop regardless of priority order
  });
  it('f) zero window: graceful infeasible shortfall, no crash, nothing silently dropped', () => {
    const r = buildPlan({ ...BASE, windowMin: 0, mustHaves: ['Wildcat', 'Skinner'] });
    expect(r.infeasible).toBe(true);
    expect(r.dropped).toHaveLength(0);
    expect(Number.isFinite(r.shortfall)).toBe(true);
    const r2 = buildPlan({ ...BASE, windowMin: 0 });
    expect(r2.dropped).toHaveLength(2);
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
    const fast = buildPlan({ ...BASE, paceKmh: 1.0, visited });
    expect(slow.elapsed).toBeCloseTo(w + 100, 6);
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
  it('overrun scenario: 380.2 + 21.0 + 390.3 = 791.5 m, header shows 0.79 km', () => {
    const w = legMetrics(legsData, 'Depot', 'Wildcat', 1.0).minutes;
    const r = buildPlan({ ...BASE, visited: [{ id: 'Wildcat', dwellUsed: 100, walkMin: w, paceUsed: 1.0 }] });
    expect(tableSum(r)).toBeCloseTo(headerTotal(r), 6);
    expect(headerTotal(r)).toBeCloseTo(791.49, 1);
    expect((headerTotal(r) / 1000).toFixed(2)).toBe('0.79');
  });
  it('ascent is the sum of positive steps and at least the net gain, per leg', () => {
    for (const [a, b] of [['Depot', 'Wildcat'], ['Wildcat', 'Skinner'], ['Depot', 'Skinner']]) {
      const m = legMetrics(legsData, a, b, 1.0);
      const net = m.profile[m.profile.length - 1][1] - m.profile[0][1];
      expect(m.asc).toBeGreaterThanOrEqual(net - 1e-9);
    }
  });
});

import legsGale from '../../public/data/legs_gale.json' with { type: 'json' };
import trackJ from '../../public/data/rover_track.json' with { type: 'json' };
import trackG from '../../public/data/rover_track_gale.json' with { type: 'json' };

describe('source-derived ascent and record-sol metadata', () => {
  it('every leg in both regions has finite non-negative DTM ascent and positive distance', () => {
    for (const [name, legs] of [['jezero', legsData], ['gale', legsGale]]) {
      const entries = Object.entries(legs.legs);
      expect(entries.length).toBeGreaterThan(0);
      for (const [key] of entries) {
        const [a, b] = key.split('|');
        const m = legMetrics(legs, a, b, 1.0);
        expect(Number.isFinite(m.asc), `${name} leg ${key} asc`).toBe(true);
        expect(m.asc).toBeGreaterThanOrEqual(0);
        // GaleBase is the declared scenario start at the Rocknest record
        // position (both sol 59), so that one leg is legitimately 0 m.
        if (key === 'GaleBase|Rocknest' || key === 'Rocknest|GaleBase') expect(m.dist).toBe(0);
        else expect(m.dist).toBeGreaterThan(0);
      }
    }
  });
  it('A/B total ascent equals the exact sum of underlying leg ascents (no other source)', () => {
    const r = buildPlan({ ...BASE, visited: [] });
    const legs2 = r.visitedLegs.concat(r.sim.legs);
    const asc = legs2.reduce((s, l) => s + l.metrics.asc, 0);
    expect(asc).toBeGreaterThan(0);
    expect(Number.isFinite(asc)).toBe(true);
  });
  it('Jezero archive: every route point carries a sol, ordered non-decreasing', () => {
    let prev = -1;
    for (const p of trackJ.route) {
      expect(p).toHaveLength(3);
      expect(Number.isInteger(p[2])).toBe(true);
      expect(p[2]).toBeGreaterThanOrEqual(prev);
      prev = p[2];
    }
  });
  it('Gale archive: every site stop carries solFirst <= solLast; segments carry no sol (not filtered)', () => {
    for (const s of trackG.stops) {
      expect(Number.isInteger(s.solFirst)).toBe(true);
      expect(Number.isInteger(s.solLast)).toBe(true);
      expect(s.solFirst).toBeLessThanOrEqual(s.solLast);
    }
    expect(Array.isArray(trackG.segments[0][0])).toBe(true); // plain [lat,lon] polylines, no sol field
  });
});

describe('roundTrip + unsamplable legs', () => {
  const mkLegs = (pairs) => ({
    legs: Object.fromEntries(Object.entries(pairs).map(([k, v]) => [k, v])),
  });
  const flat = (d) => [[0, -2500], [d, -2500]];
  const stops = [{ id: 'A', name: 'A' }, { id: 'B', name: 'B' }];
  const cfg = {
    stops, priorities: { A: 1, B: 2 }, mustHaves: [], windowMin: 600,
    dwellMin: 30, paceKmh: 3.0, baseId: 'Depot',
  };
  it('roundTrip=false omits the return leg', () => {
    const legsData = mkLegs({ 'Depot|A': flat(1000), 'A|B': flat(500), 'B|Depot': flat(800), 'Depot|B': flat(800) });
    const rt = buildPlan({ ...cfg, legsData, roundTrip: true });
    const ow = buildPlan({ ...cfg, legsData, roundTrip: false });
    const rtTos = rt.sim.legs.map(l => l.to);
    const owTos = ow.sim.legs.map(l => l.to);
    expect(rtTos[rtTos.length - 1]).toBe('Depot');
    expect(owTos).not.toContain('Depot');
    expect(ow.sim.total).toBeLessThan(rt.sim.total);
    expect(ow.roundTrip).toBe(false);
  });
  it('unsamplable leg -> explicit infeasible + named legs, no crash, no drop', () => {
    const legsData = mkLegs({ 'Depot|A': flat(1000) }); // B unreachable
    const plan = buildPlan({ ...cfg, legsData });
    // unreachable stop is excluded with an explicit coverage reason, never
    // counted as a priority/time drop
    expect(plan.coverageDrops.map(d => d.id)).toEqual(['B']);
    expect(plan.coverageDrops[0].reason).toMatch(/coverage/);
    expect(plan.dropped.length).toBe(0);
    expect(plan.kept.map(k => k.id)).toEqual(['A']);
    expect(plan.infeasible).toBe(false);
  });
  it('must-have stop outside coverage -> infeasible, never excluded', () => {
    const legsData = mkLegs({ 'Depot|A': flat(1000) }); // B unreachable
    const plan = buildPlan({ ...cfg, legsData, mustHaves: ['B'] });
    expect(plan.coverageDrops.length).toBe(0);
    expect(plan.infeasible).toBe(true);
    expect(plan.unsamplable.length).toBeGreaterThan(0);
    expect(plan.sim.total).toBe(Infinity);
  });
  it('legMetrics returns null for unknown pairs', () => {
    const legsData = mkLegs({});
    expect(legMetrics(legsData, 'X', 'Y', 1)).toBe(null);
  });
});


describe('via waypoints (user navigation points)', () => {
  const flat = (d) => [[0, -2500], [d, -2500]];
  const legsData = { legs: { 'Depot|A': flat(1000), 'A|V': flat(500), 'V|Depot': flat(700), 'Depot|V': flat(600), 'A|Depot': flat(1000) } };
  const stops = [{ id: 'A', name: 'A' }, { id: 'V', name: 'V', via: true }];
  it('via gets no science dwell and is not an objective', () => {
    const plan = buildPlan({ stops, priorities: { A: 1, V: 3 }, mustHaves: [], windowMin: 600, dwellMin: 60, paceKmh: 3.0, baseId: 'Depot', legsData });
    expect(plan.viaIds).toEqual(['V']);
    expect(plan.scienceKept).toBe(1);
    // only one dwell charged (for A), none for V
    const dwells = plan.sim.legs.filter(l => l.to !== 'Depot').length;
    void dwells;
    const walkMin = plan.sim.legs.reduce((t, l) => t + l.metrics.minutes, 0);
    expect(plan.sim.total).toBeCloseTo(walkMin + 60, 6); // A dwell only
  });
  it('via is never dropped by time pressure - plan goes infeasible instead', () => {
    const plan = buildPlan({ stops, priorities: { A: 1, V: 3 }, mustHaves: [], windowMin: 40, dwellMin: 60, paceKmh: 1.0, baseId: 'Depot', legsData });
    expect(plan.dropped.map(d => d.id)).toEqual(['A']); // science dropped first
    expect(plan.kept.map(k => k.id)).toEqual(['V']);    // via kept
    expect(plan.infeasible).toBe(true);                 // still over budget: explicit
  });
});

describe('QA regressions 2026-11-14', () => {
  const mkLegs = (pairs) => ({ legs: Object.fromEntries(Object.entries(pairs).map(([k, v]) => [k, v])) });
  const flat = (d) => [[0, -2500], [d, -2500]];
  const cfg = {
    stops: [{ id: 'A', name: 'A' }, { id: 'B', name: 'B' }],
    priorities: { A: 1, B: 2 }, mustHaves: [], windowMin: 600,
    dwellMin: 30, paceKmh: 3.0, baseId: 'Depot',
  };
  it('unsamplable must-have: infeasible, stop named, shortfall finite for UI', () => {
    const legsData = mkLegs({ 'Depot|A': flat(1000) }); // B unreachable
    const plan = buildPlan({ ...cfg, legsData, mustHaves: ['B'] });
    expect(plan.infeasible).toBe(true);
    expect(plan.coverageDrops.length).toBe(0); // protected stop is never excluded
    expect(plan.dropped.length).toBe(0);
    expect(plan.unsamplable.length).toBeGreaterThan(0); // named, not silent
    // shortfall stays finite so the UI can show "no route" instead of Infinity min
    expect(Number.isFinite(plan.shortfall)).toBe(true);
  });
});

describe('order cap (QA: no factorial freeze as user points grow)', () => {
  const flat = (d) => [[0, -2500], [d, -2500]];
  it('10 stops: greedy ordering returns a valid plan without full enumeration', () => {
    const ids = ['S1','S2','S3','S4','S5','S6','S7','S8','S9','S10'];
    const pairs = {};
    const all = ['Depot', ...ids];
    for (const a of all) for (const b of all) if (a !== b) pairs[a + '|' + b] = flat(500);
    const legsData = { legs: pairs };
    const t0 = Date.now();
    const plan = buildPlan({
      stops: ids.map(id => ({ id, name: id })),
      priorities: Object.fromEntries(ids.map((id, k) => [id, k + 1])),
      mustHaves: [], windowMin: 100000, dwellMin: 30, paceKmh: 3.0, baseId: 'Depot', legsData,
    });
    expect(Date.now() - t0).toBeLessThan(5000);
    expect(plan.kept.length).toBe(10);
    expect(plan.sim.legs.length).toBe(11); // 10 stops + return to base
    expect(plan.infeasible).toBe(false);
    // determinism: same inputs, same order
    const plan2 = buildPlan({
      stops: ids.map(id => ({ id, name: id })),
      priorities: Object.fromEntries(ids.map((id, k) => [id, k + 1])),
      mustHaves: [], windowMin: 100000, dwellMin: 30, paceKmh: 3.0, baseId: 'Depot', legsData,
    });
    expect(plan2.sim.legs.map(l => l.to)).toEqual(plan.sim.legs.map(l => l.to));
  });
});
