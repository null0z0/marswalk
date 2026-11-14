// Pure planning logic for the Jezero Marswalk adaptive re-planning demo.
// No side effects, no DOM, no map references.
// Inputs: stations, priorities, must-haves, time budget, delays.
// Output: which stations fit, which drop (and why), distances, time breakdown.
// All time/speed values are declared scenario assumptions, not NASA standards.
// Drop rule: when time forces a drop, drop the lowest-priority NON-must-have
// station first. If all remaining stations are must-have and cannot fit,
// report the shortfall explicitly and drop nothing.
//
// Two stop kinds: science stops (droppable by priority, get science dwell,
// counted as objectives) and via waypoints (s.via === true: user-placed
// navigation points - always kept, never silently dropped, NO science dwell,
// never counted as science objectives or "lost science").

export function legProfile(legsData, a, b) {
  const key1 = a + '|' + b;
  if (legsData.legs[key1]) return legsData.legs[key1];
  const rev = legsData.legs[b + '|' + a];
  if (!rev) return null; // unsamplable leg (outside coverage / no-data): report, never fabricate
  const total = rev[rev.length - 1][0];
  return rev.map(p => [total - p[0], p[1]]).reverse();
}

export function legMetrics(legsData, a, b, paceKmh) {
  const prof = legProfile(legsData, a, b);
  if (!prof) return null;
  let asc = 0, desc = 0;
  for (let i = 1; i < prof.length; i++) {
    const dz = prof[i][1] - prof[i - 1][1];
    if (dz > 0) asc += dz; else desc -= dz;
  }
  const dist = prof[prof.length - 1][0];
  return { dist, asc, desc, minutes: dist / (paceKmh * 1000 / 60), profile: prof };
}

export function buildPlan(cfg) {
  const { stops, priorities, mustHaves = [], windowMin, dwellMin, paceKmh, legsData, visited = [], baseId = 'Depot', roundTrip = true } = cfg;
  const depot = baseId;
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
    const walkMin = v.walkMin ?? (m ? m.minutes : 0);
    elapsed += walkMin + v.dwellUsed;
    visitedLegs.push({ from: prev, to: v.id, metrics: m, dwellUsed: v.dwellUsed, walkMin, paceUsed: v.paceUsed ?? paceKmh });
    prev = v.id;
  }
  // Base/start probe (runtime grids only): if the start point itself is
  // outside the elevation grid, no honest route exists - report infeasible
  // immediately instead of producing a valid-looking empty or shortened plan.
  if (legsData.runtime && legProfile(legsData, depot, depot) === null) {
    return {
      elapsed: 0, budget: windowMin, visitedLegs: [], kept: [], dropped: [], coverageDrops: [],
      sim: { total: Infinity, dist: 0, asc: 0, legs: [], unsamplable: [{ from: depot, to: depot }] },
      full: { total: Infinity, dist: 0, asc: 0, legs: [] }, baseId: depot,
      infeasible: true, shortfall: 0, roundTrip, baseUnsamplable: true,
      viaIds: stops.filter(s => s.via).map(s => s.id), scienceKept: 0,
      unsamplable: [{ from: depot, to: depot }],
      savedDist: 0, savedAsc: 0,
    };
  }
  const remaining = stops.filter(s => !visited.find(v => v.id === s.id));
  const budget = windowMin - elapsed;
  const order = remaining.slice().sort((a, b) => priorities[a.id] - priorities[b.id]);

  function simulate(list) {
    let t = 0, dist = 0, asc = 0;
    const legs = [];
    const unsamplable = [];
    let p = prev;
    for (const s of list) {
      const m = legMetrics(legsData, p, s.id, paceKmh);
      if (!m) {
        // Leg cannot be sampled on the elevation grid (e.g. waypoint outside
        // coverage). Surface it; the plan is infeasible with an explicit
        // reason, never a silently shortened or invented route.
        unsamplable.push({ from: p, to: s.id });
        return { total: Infinity, dist, asc, legs, unsamplable };
      }
      t += m.minutes + (s.via ? 0 : dwellMin); dist += m.dist; asc += m.asc;
      legs.push({ from: p, to: s.id, metrics: m, via: !!s.via });
      p = s.id;
    }
    if (roundTrip && p !== depot) {
      const back = legMetrics(legsData, p, depot, paceKmh);
      if (!back) {
        unsamplable.push({ from: p, to: depot });
        return { total: Infinity, dist, asc, legs, unsamplable };
      }
      t += back.minutes; dist += back.dist; asc += back.asc;
      legs.push({ from: p, to: depot, metrics: back });
    }
    return { total: t, dist, asc, legs, unsamplable };
  }

  // Visit order is optimized (all permutations, n is small): the plan walks the
  // shortest-time ordering of the kept stops. Priority governs WHICH stop is
  // dropped, never the route geometry, so a feasible shorter order is never
  // reported as infeasible.
  // CAP: permutations are n!, and every simulated leg is a real grid sampling.
  // Beyond 8 stops a full enumeration can freeze the browser, so larger plans
  // switch to a greedy nearest-neighbor order (seeded from the priority-sorted
  // list for determinism) - a heuristic, labeled here as such.
  const ORDER_CAP = 8;
  function greedyOrder(list, start) {
    const remaining = list.slice();
    const out = [];
    let p = start;
    while (remaining.length) {
      let bi = 0, bm = null;
      for (let k = 0; k < remaining.length; k++) {
        const m = legMetrics(legsData, p, remaining[k].id, paceKmh);
        // unreachable candidates sort last but stay in the plan so the
        // unsamplable reporting still names them
        if (m && (bm === null || m.minutes < bm)) { bm = m.minutes; bi = k; }
      }
      out.push(remaining[bi]);
      p = remaining[bi].id;
      remaining.splice(bi, 1);
    }
    return out;
  }
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
    if (list.length > ORDER_CAP) {
      // heuristic order, not a proven optimum (see ORDER_CAP note)
      return simulate(greedyOrder(list, prev));
    }
    let best = null;
    for (const perm of permutations(list)) {
      const s = simulate(perm);
      if (!best || s.total < best.total) best = s;
    }
    return best || simulate([]);
  }

  let kept = order.slice();
  const dropped = [];
  // Coverage exclusions come FIRST and are not time drops: a stop whose legs
  // cannot be sampled on the grid is removed with its own explicit reason,
  // independent of priority, before any time-budget dropping runs.
  const coverageDrops = [];
  let sim = simulateBest(kept);
  while (sim.unsamplable && sim.unsamplable.length) {
    const badTo = sim.unsamplable[0].to;
    const stop = kept.find(x => x.id === badTo);
    if (!stop) break; // unsamplable return-to-base leg: leave sim.unsamplable set
    // A must-have stop outside coverage is NOT excluded: the request itself
    // is infeasible and the sim keeps the named unsamplable leg.
    if (mustHaves.includes(stop.id)) break;
    kept = kept.filter(x => x.id !== stop.id);
    coverageDrops.push({ ...stop, reason: 'outside elevation coverage - route cannot be computed' });
    sim = simulateBest(kept);
  }
  // When an unremovable unsamplable leg remains (must-have/via outside
  // coverage, or an unsamplable return-to-base), sim.total is Infinity and no
  // time drop can ever fix that: infeasibility is about coverage, not time.
  // Skipping the drop loop keeps the other stops visible instead of
  // pointlessly "deferring" them under a broken plan.
  while (!(sim.unsamplable && sim.unsamplable.length) && sim.total > budget) {
    // Deterministic drop order: sort by priority descending; Array.sort is
    // stable, so equal-priority candidates drop in priority-sorted list order.
    // Via waypoints are never droppable: the user placed them deliberately,
    // so dropping one by science priority would silently change their route.
    const droppable = kept.filter(s => !s.via && !mustHaves.includes(s.id))
      .sort((a, b) => priorities[b.id] - priorities[a.id]);
    if (droppable.length === 0) break; // only must-haves/vias left: report shortfall, drop nothing
    const drop = droppable[0];
    kept = kept.filter(s => s.id !== drop.id);
    dropped.push({ ...drop, reason: 'lowest-priority non-must-have' });
    sim = simulateBest(kept);
  }
  const infeasible = sim.total > budget;
  const shortfall = infeasible && isFinite(sim.total) ? sim.total - budget : 0;
  const full = simulateBest(order);
  return {
    elapsed, budget, visitedLegs, kept, dropped, sim, full, baseId: depot,
    infeasible, shortfall, roundTrip, coverageDrops,
    viaIds: stops.filter(s => s.via).map(s => s.id),
    scienceKept: kept.filter(s => !s.via).length,
    unsamplable: sim.unsamplable || [],
    savedDist: Math.max(0, full.dist - sim.dist),
    savedAsc: Math.max(0, full.asc - sim.asc),
  };
}
