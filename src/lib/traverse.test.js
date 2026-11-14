import { describe, it, expect } from 'vitest';
import { buildTraverseGraph, traversePath, SNAP_TOLERANCE_M } from './traverse.js';
import { readFileSync } from 'node:fs';

// synthetic: two segments joined at a stop pad, plus one disconnected segment
const mkTrack = () => ({
  segments: [
    [[18.0, 77.0], [18.0, 77.001], [18.0, 77.002]],        // seg A westward
    [[18.0001, 77.002], [18.0002, 77.003]],                // seg B, ~15m from A end -> joined
    [[18.01, 77.01], [18.0101, 77.011]],                   // seg C: disconnected
  ],
  stops: [
    { site: 1, lat: 18.0, lon: 77.0, solFirst: 10 },
    { site: 2, lat: 18.0002, lon: 77.003, solFirst: 20 },
  ],
});

describe('recorded-traverse following', () => {
  it('tags synthetic runs by incoming edge: join is dashed, recorded edges solid', () => {
    // A = two recorded points, B = two recorded points, endpoints 5 m apart
    const track = {
      segments: [
        [[18.0, 77.0], [18.0, 77.001]],
        [[18.0, 77.001 + 5 / 59289], [18.0, 77.003]],
      ],
      stops: [
        { site: 1, lat: 18.0, lon: 77.0, solFirst: 10 },
        { site: 2, lat: 18.0, lon: 77.003, solFirst: 20 },
      ],
    };
    const g = buildTraverseGraph(track);
    const r = traversePath(g, { lat: 18.0, lon: 77.0 }, { lat: 18.0, lon: 77.003 }, { allowSynthetic: true });
    expect(r.ok).toBe(true);
    expect(r.pathParts.length).toBe(3);
    expect(r.pathParts[0].synthetic).toBe(false); // recorded A run
    expect(r.pathParts[1].synthetic).toBe(true);  // exactly the join edge
    expect(r.pathParts[1].latlons.length).toBe(2);
    expect(r.pathParts[2].synthetic).toBe(false); // recorded B run
    expect(r.syntheticM).toBeGreaterThan(4.9);
    expect(r.syntheticM).toBeLessThan(5.1);
  });

  it('follows joined segments, reports distance and snap distances', () => {
    const g = buildTraverseGraph(mkTrack());
    // joining across stop pads = synthetic connectors: strict mode refuses,
    // the opt-in experiment bridges them
    const strict = traversePath(g, { lat: 18.0, lon: 77.0 }, { lat: 18.0002, lon: 77.003 });
    expect(strict.ok).toBe(false);
    expect(strict.reason).toBe('gap-in-record');
    expect(strict.gapM).toBeGreaterThan(0);
    const r = traversePath(g, { lat: 18.0, lon: 77.0 }, { lat: 18.0002, lon: 77.003 }, { allowSynthetic: true });
    expect(r.ok).toBe(true);
    expect(r.syntheticM).toBeGreaterThan(0);
    expect(r.distM).toBeGreaterThan(150); // ~184m along A+join+B at Mars 59.3 km/deg lon
    expect(r.snapFromM).toBeLessThan(1);
    expect(r.snapToM).toBeLessThan(1);
    expect(r.pathLatLon.length).toBe(5);
    expect(r.reversed).toBe(false); // sol 10 -> 20 is the driven direction
  });
  it('discloses reversed direction against the driven record', () => {
    const g = buildTraverseGraph(mkTrack());
    const r = traversePath(g, { lat: 18.0002, lon: 77.003 }, { lat: 18.0, lon: 77.0 }, { allowSynthetic: true });
    expect(r.ok).toBe(true);
    expect(r.reversed).toBe(true);
  });
  it('refuses when the point is beyond snap tolerance, with the distance', () => {
    const g = buildTraverseGraph(mkTrack());
    const r = traversePath(g, { lat: 18.0, lon: 77.0 }, { lat: 18.5, lon: 77.5 });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('snap-too-far');
    expect(r.toleranceM).toBe(SNAP_TOLERANCE_M);
    expect(r.snapToM).toBeGreaterThan(10000);
  });
  it('refuses on network gaps (no-connection), never invents a link', () => {
    const g = buildTraverseGraph(mkTrack());
    const r = traversePath(g, { lat: 18.0, lon: 77.0 }, { lat: 18.01, lon: 77.01 });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no-connection');
  });
  it('real Gale archive: builds, connects Rocknest to Drill sites along the record', () => {
    const track = JSON.parse(readFileSync('public/data/rover_track_gale.json', 'utf8'));
    const g = buildTraverseGraph(track);
    expect(g.nodes.length).toBeGreaterThan(500);
    const strict = traversePath(g, { lat: -4.589508, lon: 137.441506 }, { lat: -4.5955379, lon: 137.4425796 });
    expect(strict.ok).toBe(false); // strict mode refuses: stop-pad joins are archive gaps
    expect(strict.reason).toBe('gap-in-record');
    const r = traversePath(g, { lat: -4.589508, lon: 137.441506 }, { lat: -4.5955379, lon: 137.4425796 }, { allowSynthetic: true });
    expect(r.ok).toBe(true);
    expect(r.syntheticM).toBeGreaterThan(0);
    expect(r.distM).toBeGreaterThan(500);
    expect(r.snapFromM).toBeLessThan(SNAP_TOLERANCE_M);
    expect(r.snapToM).toBeLessThan(SNAP_TOLERANCE_M);
    expect(r.reversed).toBe(false); // Rocknest (sol ~59) -> drill sites (sol ~166+) is driven order
  });
  it('real Gale archive: Departure -> Rocknest is disclosed as reversed', () => {
    const track = JSON.parse(readFileSync('public/data/rover_track_gale.json', 'utf8'));
    const g = buildTraverseGraph(track);
    const r = traversePath(g, { lat: -4.6123, lon: 137.4241 }, { lat: -4.589508, lon: 137.441506 }, { allowSynthetic: true });
    expect(r.ok).toBe(true);
    expect(r.reversed).toBe(true);
  });
});
