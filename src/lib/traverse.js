// Recorded-traverse following: route a user-chosen pair along the NASA MSL
// MMGIS drive polylines (rover_track_gale.json). This is HISTORICAL recorded
// geometry: evidence that Curiosity once drove this path, in the direction it
// was driven. It is not a surveyed trail, not live tracking, and not a
// walkability or drivability claim - especially not in reverse.
//
// Honesty rules (parent QA):
// - snap tolerance is measured and shown; too far = explicit refusal
// - gaps (no connection through the recorded network) = explicit refusal
// - if the requested A->B runs against the driven direction, say so

import { toM } from './terrain.js';

// segments join where endpoints sit within this many meters (stop pads)
const JOIN_M = 15;
// beyond this snap distance we refuse: the point is off the recorded network
export const SNAP_TOLERANCE_M = 120;

export function buildTraverseGraph(track) {
  const nodes = []; // {lat, lon, seg, sol}  sol: nearest stop sol if known
  const edges = new Map(); // idx -> [{to, distM}]
  // synthetic=true marks stop-pad join edges: NO recorded drive data across
  // them, they are our own connectors bridging small archive gaps
  const addEdge = (a, b, d, synthetic = false) => {
    if (!edges.has(a)) edges.set(a, []);
    edges.get(a).push({ to: b, distM: d, synthetic });
  };
  // intra-segment edges only: consecutive points of one recorded polyline.
  // No same-segment shortcuts - Dijkstra must follow the record point by point.
  const segOf = []; // node idx -> segment idx
  const segEndpts = []; // segment idx -> [firstNode, lastNode]
  track.segments.forEach((seg, si) => {
    let prev = null, first = -1;
    for (const [lat, lon] of seg) {
      const idx = nodes.length;
      nodes.push({ lat, lon });
      segOf.push(si);
      if (first === -1) first = idx;
      if (prev !== null) {
        const [x1, y1] = toM(nodes[prev].lon, nodes[prev].lat);
        const [x2, y2] = toM(lon, lat);
        const d = Math.hypot(x2 - x1, y2 - y1);
        addEdge(prev, idx, d);
        addEdge(idx, prev, d);
      }
      prev = idx;
    }
    segEndpts.push([first, prev]);
  });
  // joins: ONLY between endpoints of DIFFERENT segments (candidate stop pads),
  // within JOIN_M. Coincident endpoints (d == 0) count: same recorded position.
  for (let i = 0; i < segEndpts.length; i++) {
    for (let j = i + 1; j < segEndpts.length; j++) {
      let best = null;
      for (const a of segEndpts[i]) for (const b of segEndpts[j]) {
        const [ax, ay] = toM(nodes[a].lon, nodes[a].lat);
        const [bx, by] = toM(nodes[b].lon, nodes[b].lat);
        const d = Math.hypot(bx - ax, by - ay);
        if (d <= JOIN_M && (best === null || d < best.d)) best = { a, b, d };
      }
      if (best) { addEdge(best.a, best.b, best.d, true); addEdge(best.b, best.a, best.d, true); }
    }
  }
  // attach nearest stop sol to each node (for direction disclosure)
  const stops = track.stops || [];
  for (const n of nodes) {
    let best = null, bd = Infinity;
    const [nx, ny] = toM(n.lon, n.lat);
    for (const st of stops) {
      const [sx, sy] = toM(st.lon, st.lat);
      const d = Math.hypot(sx - nx, sy - ny);
      if (d < bd) { bd = d; best = st; }
    }
    if (best && bd <= 250) n.sol = best.solFirst;
  }
  return { nodes, edges, stops };
}

export function snapToTraverse(graph, lat, lon) {
  const [px, py] = toM(lon, lat);
  let best = -1, bd = Infinity;
  graph.nodes.forEach((n, i) => {
    const [nx, ny] = toM(n.lon, n.lat);
    const d = Math.hypot(nx - px, ny - py);
    if (d < bd) { bd = d; best = i; }
  });
  return { node: best, distM: bd };
}

// Dijkstra over the traverse graph (small network: O(n^2) is fine and simple)
export function traversePath(graph, fromLL, toLL, opts = {}) {
  const tol = opts.snapToleranceM || SNAP_TOLERANCE_M;
  const allowSynthetic = !!opts.allowSynthetic;
  const sFrom = snapToTraverse(graph, fromLL.lat, fromLL.lon);
  const sTo = snapToTraverse(graph, toLL.lat, toLL.lon);
  if (sFrom.distM > tol || sTo.distM > tol) {
    return { ok: false, reason: 'snap-too-far', snapFromM: sFrom.distM, snapToM: sTo.distM, toleranceM: tol };
  }
  const n = graph.nodes.length;
  const dist = new Array(n).fill(Infinity);
  const prev = new Array(n).fill(-1);
  const done = new Array(n).fill(false);
  dist[sFrom.node] = 0;
  for (let it = 0; it < n; it++) {
    let u = -1, du = Infinity;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < du) { du = dist[i]; u = i; }
    if (u === -1) break;
    done[u] = true;
    if (u === sTo.node) break;
    for (const e of (graph.edges.get(u) || [])) {
      if (dist[u] + e.distM < dist[e.to]) { dist[e.to] = dist[u] + e.distM; prev[e.to] = u; }
    }
  }
  if (!isFinite(dist[sTo.node])) {
    return { ok: false, reason: 'no-connection', snapFromM: sFrom.distM, snapToM: sTo.distM };
  }
  const cells = [];
  for (let c = sTo.node; c !== -1; c = prev[c]) cells.push(c);
  cells.reverse();
  const pathLatLon = cells.map(i => [graph.nodes[i].lat, graph.nodes[i].lon]);
  // split the path into recorded runs and synthetic gap-connector runs so the
  // map can draw connectors dashed and never claims them as driven geometry
  const edgeSynth = (a, b) => {
    const es = graph.edges.get(a) || [];
    const e = es.find(x => x.to === b);
    return e ? !!e.synthetic : false;
  };
  const pathParts = [];
  let syntheticM = 0;
  for (let i = 0; i < cells.length; i++) {
    // each node is tagged by its INCOMING edge, so the drawn polyline run
    // boundaries coincide exactly with the recorded/synthetic edge boundaries
    const syn = i > 0 ? edgeSynth(cells[i - 1], cells[i]) : false;
    if (i > 0 && syn) {
      const [x1, y1] = toM(graph.nodes[cells[i - 1]].lon, graph.nodes[cells[i - 1]].lat);
      const [x2, y2] = toM(graph.nodes[cells[i]].lon, graph.nodes[cells[i]].lat);
      syntheticM += Math.hypot(x2 - x1, y2 - y1);
    }
    const last = pathParts[pathParts.length - 1];
    if (last && last.synthetic === syn) last.latlons.push(pathLatLon[i]);
    else pathParts.push({ synthetic: syn, latlons: i > 0 && last ? [last.latlons[last.latlons.length - 1], pathLatLon[i]] : [pathLatLon[i]] });
  }
  const hasSynthetic = pathParts.some(p => p.synthetic);
  if (hasSynthetic && !allowSynthetic) {
    // strict recorded mode: the archive has a gap here; we do NOT bridge it and
    // call it a recorded route, even dashed. Explicit refusal.
    return { ok: false, reason: 'gap-in-record', gapM: syntheticM, snapFromM: sFrom.distM, snapToM: sTo.distM };
  }
  // direction: driven order rises with sol; if the user walks sol-descending,
  // the path is shown reversed against the recorded drive direction
  const solA = graph.nodes[sFrom.node].sol;
  const solB = graph.nodes[sTo.node].sol;
  const reversed = (solA != null && solB != null) ? solB < solA : null;
  return {
    ok: true, pathLatLon, pathParts, syntheticM, distM: dist[sTo.node],
    snapFromM: sFrom.distM, snapToM: sTo.distM,
    reversed, solFrom: solA ?? null, solTo: solB ?? null,
    model: { type: 'recorded-traverse', srcLabel: 'NASA MSL MMGIS traverse layer', joinM: JOIN_M },
  };
}
