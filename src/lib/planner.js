// Pure planning logic for the Jezero Marswalk adaptive re-planning demo.
// No side effects, no DOM, no map references.
// Inputs: stations, priorities, must-haves, time budget, delays.
// Output: which stations fit, which drop (and why), distances, time breakdown.
// All time/speed values are declared scenario assumptions, not NASA standards.
// Drop rule: when time forces a drop, drop the lowest-priority NON-must-have
// station first. If all remaining stations are must-have and cannot fit,
// report the shortfall explicitly and drop nothing.

export function legProfile(legsData, a, b) {
  const key1 = a + '|' + b;
  if (legsData.legs[key1]) return legsData.legs[key1];
  const rev = legsData.legs[b + '|' + a];
  const total = rev[rev.length - 1][0];
  return rev.map(p => [total - p[0], p[1]]).reverse();
}

export function legMetrics(legsData, a, b, paceKmh) {
  const prof = legProfile(legsData, a, b);
  let asc = 0, desc = 0;
  for (let i = 1; i < prof.length; i++) {
    const dz = prof[i][1] - prof[i - 1][1];
    if (dz > 0) asc += dz; else desc -= dz;
  }
  const dist = prof[prof.length - 1][0];
  return { dist, asc, desc, minutes: dist / (paceKmh * 1000 / 60), profile: prof };
}

export function buildPlan(cfg) {
  const { stops, priorities, mustHaves = [], windowMin, dwellMin, paceKmh, legsData, visited = [] } = cfg;
  const depot = 'Depot';
  let elapsed = 0;
  const visitedLegs = [];
  let prev = depot;
  // Completed legs are frozen history: the UI records walkMin and paceUsed at
  // the moment the leg finished, and a later pace change only affects legs not
  // yet walked. v.walkMin/v.paceUsed win over the current slider value.
  // Fallback: a visited entry without recorded walkMin (e.g. hand-written or
  // pre-freeze test fixtures) is timed at the current pace, as before.
  for (const v of visited) {
    const m = legMetrics(legsData, prev, v.id, paceKmh);
    const walkMin = v.walkMin ?? m.minutes;
    elapsed += walkMin + v.dwellUsed;
    visitedLegs.push({ from: prev, to: v.id, metrics: m, dwellUsed: v.dwellUsed, walkMin, paceUsed: v.paceUsed ?? paceKmh });
    prev = v.id;
  }
  const remaining = stops.filter(s => !visited.find(v => v.id === s.id));
  const budget = windowMin - elapsed;
  const order = remaining.slice().sort((a, b) => priorities[a.id] - priorities[b.id]);

  function simulate(list) {
    let t = 0, dist = 0, asc = 0;
    const legs = [];
    let p = prev;
    for (const s of list) {
      const m = legMetrics(legsData, p, s.id, paceKmh);
      t += m.minutes + dwellMin; dist += m.dist; asc += m.asc;
      legs.push({ from: p, to: s.id, metrics: m });
      p = s.id;
    }
    if (p !== depot) {
      const back = legMetrics(legsData, p, depot, paceKmh);
      t += back.minutes; dist += back.dist; asc += back.asc;
      legs.push({ from: p, to: depot, metrics: back });
    }
    return { total: t, dist, asc, legs };
  }

  // Visit order is optimized (all permutations, n is small): the plan walks the
  // shortest-time ordering of the kept stops. Priority governs WHICH stop is
  // dropped, never the route geometry, so a feasible shorter order is never
  // reported as infeasible.
  function permutations(arr) {
    if (arr.length <= 1) return [arr];
    const out = [];
    for (let i = 0; i < arr.length; i++) {
      const rest = arr.slice(0, i).concat(arr.slice(i + 1));
      for (const p of permutations(rest)) out.push([arr[i]].concat(p));
    }
    return out;
  }
  // Deterministic tie-break: permutations are enumerated from the
  // priority-sorted list and the comparison is strictly less-than, so among
  // equal-time orders the first one in priority-sorted order always wins.
  function simulateBest(list) {
    let best = null;
    for (const perm of permutations(list)) {
      const s = simulate(perm);
      if (!best || s.total < best.total) best = s;
    }
    return best;
  }

  let kept = order.slice();
  const dropped = [];
  let sim = simulateBest(kept);
  while (sim.total > budget) {
    // Deterministic drop order: sort by priority descending; Array.sort is
    // stable, so equal-priority candidates drop in priority-sorted list order.
    const droppable = kept.filter(s => !mustHaves.includes(s.id))
      .sort((a, b) => priorities[b.id] - priorities[a.id]);
    if (droppable.length === 0) break; // only must-haves left: report shortfall, drop nothing
    const drop = droppable[0];
    kept = kept.filter(s => s.id !== drop.id);
    dropped.push({ ...drop, reason: 'lowest-priority non-must-have' });
    sim = simulateBest(kept);
  }
  const infeasible = sim.total > budget;
  const shortfall = infeasible ? sim.total - budget : 0;
  const full = simulateBest(order);
  return {
    elapsed, budget, visitedLegs, kept, dropped, sim, full,
    infeasible, shortfall,
    savedDist: Math.max(0, full.dist - sim.dist),
    savedAsc: Math.max(0, full.asc - sim.asc),
  };
}
