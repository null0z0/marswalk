// Global coarse elevation from a BOUNDED preprocessed grid:
// overview level 6 (~12.8 km/px, 1667x833 int16) of the USGS HRSC/MOLA blended
// global DEM v2, exported offline from the COG to public/data/global_dem_l6.bin.
// Source: https://planetarymaps.usgs.gov/mosaic/Mars/HRSC_MOLA_Blend/Mars_HRSC_MOLA_BlendDEM_Global_200mp_v2.tif
// License: MOLA (CC0) + HRSC (CC BY-SA 3.0 IGO) - attribution + share-alike.
// Citation: Fergason, Hare & Laura (2018), HRSC and MOLA Blended DEM 200m v2, USGS Astrogeology PDS Annex.
// Independent QA (2026-11-14): all 1,388,611 shipped cells are PIXEL-EXACT vs the
// source overview via HTTP ranges; byte order confirmed little-endian int16.
// (Live browser range-fetch of the COG via geotiff.js was attempted and hangs on
// decode workers in the bundled app; the bounded grid is the shipped path.)
// A great-circle elevation profile from this grid is NOT terrain-aware
// pathfinding and NOT a route.
const MARS_R_KM = 3389.5;
let gridP = null;

async function getGrid() {
  if (!gridP) {
    gridP = Promise.all([
      fetch('/data/global_dem_l6.json').then(r => r.json()),
      fetch('/data/global_dem_l6.bin').then(r => r.arrayBuffer()).then(b => new Int16Array(b)),
    ]).then(([meta, data]) => ({ meta, data }));
  }
  return gridP;
}

// Per-axis indexing (x and y pixel sizes differ slightly); nodata -> null.
export function gridAt(meta, data, lat, lon) {
  const [minX, minY, maxX, maxY] = meta.bbox;
  if (lat < minY || lat > maxY) return null;
  // Periodic longitude: wrap into [-180, 180], then clamp into the grid's
  // [minX, maxX] so the ~92 m strip between maxX and 180 maps to the last
  // column instead of wrapping below minX and nulling out.
  let l = ((lon + 180) % 360 + 360) % 360 - 180;
  l = Math.min(maxX, Math.max(minX, l));
  const x = Math.min(meta.width - 1, Math.max(0, Math.floor((l - minX) / ((maxX - minX) / meta.width))));
  const y = Math.min(meta.height - 1, Math.max(0, Math.floor((maxY - lat) / ((maxY - minY) / meta.height))));
  const v = data[y * meta.width + x];
  return v === -32768 ? null : v;
}

export async function sampleGlobalElevation(lat, lon) {
  const { meta, data } = await getGrid();
  const elevM = gridAt(meta, data, lat, lon);
  if (elevM === null) return null;
  return { elevM, lat, lon, spacingM: meta.mPerPxEquator };
}

const toVec = (lat, lon) => {
  const la = lat * Math.PI / 180, lo = lon * Math.PI / 180;
  return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
};
const toLatLon = ([x, y, z]) => [
  Math.asin(Math.max(-1, Math.min(1, z))) * 180 / Math.PI,
  Math.atan2(y, x) * 180 / Math.PI,
];

// Elevation profile along the great circle between two global points.
// Sampling path and reported distance use the SAME spherical geometry
// (surface great circle, R = 3389.5 km) - dateline-safe.
export async function greatCircleProfile(latA, lonA, latB, lonB, samples = 96) {
  const { meta, data } = await getGrid();
  const va = toVec(latA, lonA), vb = toVec(latB, lonB);
  const dot = Math.max(-1, Math.min(1, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]));
  const omega = Math.acos(dot);
  if (omega < 1e-9) return { ok: false, error: 'points are identical' };
  const so = Math.sin(omega);
  const pts = [];
  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1);
    const ka = Math.sin((1 - t) * omega) / so, kb = Math.sin(t * omega) / so;
    const [lat, lon] = toLatLon([ka * va[0] + kb * vb[0], ka * va[1] + kb * vb[1], ka * va[2] + kb * vb[2]]);
    pts.push({ t, lat: +lat.toFixed(4), lon: +lon.toFixed(4), elevM: gridAt(meta, data, lat, lon) });
  }
  const valid = pts.filter(p => p.elevM !== null);
  if (!valid.length) return { ok: false, error: 'no data along path' };
  let asc = 0, desc = 0, mn = Infinity, mx = -Infinity;
  for (let i = 0; i < valid.length; i++) {
    const v = valid[i].elevM;
    if (v < mn) mn = v;
    if (v > mx) mx = v;
    if (i > 0) { const d = v - valid[i - 1].elevM; if (d > 0) asc += d; else desc -= d; }
  }
  return {
    ok: true, pts, samples: pts.length,
    minM: mn, maxM: mx, ascentM: Math.round(asc), descentM: Math.round(desc),
    distKm: +(omega * MARS_R_KM).toFixed(1),
    actualSpacingM: meta.mPerPxEquator,
    method: 'great-circle sampling of the ~12.8 km/px coarse global grid - NOT terrain-aware pathfinding, NOT a route',
  };
}
