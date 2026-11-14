import { describe, it, expect } from 'vitest';
import { gridAt } from './globalelev.js';

// Fake 4x2 grid, bbox like the real one (maxX slightly below 180).
const meta = { width: 4, height: 2, bbox: [-180, -90, 179.9984, 90] };
const data = new Int16Array([1, 2, 3, 4, 5, 6, 7, 8]);

describe('gridAt periodic boundary', () => {
  it('lon exactly 180 is the shared meridian: wraps to -180, not null', () => {
    expect(gridAt(meta, data, 45, 180)).toBe(1);
  });
  it('lon in the maxX..180 strip maps to the last column', () => {
    expect(gridAt(meta, data, 45, 179.9995)).toBe(4);
  });
  it('lon -180 maps to the first column', () => {
    expect(gridAt(meta, data, 45, -180)).toBe(1);
  });
  it('lon 540 wraps to the shared meridian, not null', () => {
    expect(gridAt(meta, data, 45, 540)).toBe(1);
  });
  it('lon 202 (= -158) maps into range, not null', () => {
    const v = gridAt(meta, data, 45, -158);
    expect(v).not.toBeNull();
  });
  it('nodata -32768 returns null', () => {
    const d2 = new Int16Array(data); d2[0] = -32768;
    expect(gridAt(meta, d2, 45, -180)).toBeNull();
  });
});
