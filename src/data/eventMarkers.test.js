// Event-marker integrity: every globe marker must trace to a real archive
// record and a verified anchor. Region rings sit at official IAU/USGS
// Gazetteer crater centers and are never event positions; point markers must
// match their cited coordinates exactly.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import eventsData from './historicalEvents.json';

const markers = JSON.parse(readFileSync(new URL('../../public/data/event_markers.json', import.meta.url), 'utf8')).markers;
const sites = JSON.parse(readFileSync(new URL('../../public/data/mission_sites.json', import.meta.url), 'utf8')).sites;
const nomenclature = JSON.parse(readFileSync(new URL('../../public/data/mars_nomenclature.json', import.meta.url), 'utf8')).features;

const meda = JSON.parse(readFileSync(new URL('./meda.json', import.meta.url), 'utf8'));
const roverTrack = JSON.parse(readFileSync(new URL('../../public/data/rover_track.json', import.meta.url), 'utf8'));

const byId = new Map(eventsData.events.map(e => [e.id, e]));

describe('event_markers.json', () => {
  it('every marker references existing archive events', () => {
    for (const m of markers) {
      expect(m.eventIds.length).toBeGreaterThan(0);
      for (const id of m.eventIds) expect(byId.has(id), `${m.id} -> ${id}`).toBe(true);
    }
  });

  it('every archive event appears on exactly one marker', () => {
    const covered = markers.flatMap(m => m.eventIds).sort();
    expect(covered).toEqual(eventsData.events.map(e => e.id).sort());
  });

  it('kinds and coordinates are sane', () => {
    for (const m of markers) {
      expect(['point', 'region']).toContain(m.kind);
      expect(m.lat).toBeGreaterThanOrEqual(-90);
      expect(m.lat).toBeLessThanOrEqual(90);
      expect(m.lon).toBeGreaterThanOrEqual(-180);
      expect(m.lon).toBeLessThanOrEqual(180);
      expect(typeof m.anchorNote).toBe('string');
      expect(m.anchorNote.length).toBeGreaterThan(20);
    }
  });

  it('region markers sit at the Gazetteer crater centers, not event positions', () => {
    const jezero = nomenclature.find(f => f.n === 'Jezero');
    const gale = nomenclature.find(f => f.n === 'Gale');
    const rj = markers.find(m => m.id === 'evm-jezero-region');
    const rg = markers.find(m => m.id === 'evm-gale-region');
    expect(rj.kind).toBe('region');
    expect(rg.kind).toBe('region');
    expect([rj.lat, rj.lon]).toEqual([jezero.la, jezero.lo]);
    expect([rg.lat, rg.lon]).toEqual([gale.la, gale.lo]);
    // every jezero/gale workspace event is region-level on the globe
    expect(rj.eventIds.sort()).toEqual(eventsData.events.filter(e => e.workspace === 'jezero').map(e => e.id).sort());
    expect(rg.eventIds.sort()).toEqual(eventsData.events.filter(e => e.workspace === 'gale').map(e => e.id).sort());
  });

  it('point markers match their cited verified anchors', () => {
    const insight = sites.find(s => s.id === 'insight');
    const evInsight = markers.find(m => m.id === 'evm-insight');
    expect([evInsight.lat, evInsight.lon]).toEqual([insight.lat, insight.lon]);
    const amazonis = markers.find(m => m.id === 'evm-amazonis-impact');
    expect(amazonis.lat).toBeCloseTo(35.1, 6);
    expect(amazonis.lon).toBeCloseTo(-170.18, 6);
    const avalanches = markers.find(m => m.id === 'evm-polar-avalanches');
    expect(avalanches.lat).toBeCloseTo(83.7, 6);
    expect(avalanches.lon).toBeCloseTo(-124.2, 6);
  });

  it('every recorded MEDA weather sol has a verified rover position in the archived waypoints', () => {
    const trackSols = new Set(roverTrack.route.map(r => r[2]));
    for (const sol of Object.keys(meda).map(Number)) {
      expect(trackSols.has(sol), `MEDA sol ${sol} has no recorded rover position - a local pin would be a guess`).toBe(true);
    }
  });

  it('no point marker claims a jezero/gale workspace event (those are region-level)', () => {
    for (const m of markers.filter(m => m.kind === 'point')) {
      for (const id of m.eventIds) {
        expect(['jezero', 'gale']).not.toContain(byId.get(id).workspace);
      }
    }
  });
});
