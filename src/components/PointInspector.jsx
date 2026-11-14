import { useMemo } from 'react';
import { pointInfo, distanceBearing, geologyAtPoint } from '../lib/inspect.js';
import geologyUnits from '../data/geologyUnits.json';

// Arbitrary-point inspector: what the shipped data can actually say about one
// clicked point. Missing layers are reported as unavailable, never filled in.

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const compass = (deg) => COMPASS[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
const fmtDist = (m) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(2)} km`);

// distance from the point to the nearest RECORDED rover evidence available
// for the region (Gale: MMGIS drive polylines; Jezero: sparse recorded
// positions snapshot - explicitly not the measured driven path)
function nearestTrack(region, roverTrack, pt) {
  if (!roverTrack) return null;
  let best = null;
  const consider = (lat, lon, label) => {
    const { dist } = distanceBearing(pt, { lat, lon });
    if (best === null || dist < best.dist) best = { dist, label };
  };
  if (region === 'gale' && roverTrack.segments) {
    for (const seg of roverTrack.segments) for (const [lat, lon] of seg) consider(lat, lon);
    return best && { ...best, kind: 'recorded drive line (NASA MSL MMGIS)' };
  }
  if (roverTrack.route) {
    for (const [lat, lon] of roverTrack.route) consider(lat, lon);
    return best && { ...best, kind: 'recorded rover position (NASA snapshot 2022-12-23; sparse points, not the measured driven path)' };
  }
  return null;
}

export default function PointInspector({ pt, grid, hiGrid, geojson, region, stations, roverTrack, onClear }) {
  const info = useMemo(() => (pt && grid ? pointInfo(grid, pt.lat, pt.lon, hiGrid) : null), [pt, grid, hiGrid]);
  const geology = useMemo(
    () => (region === 'jezero' && pt ? geologyAtPoint(geojson, pt.lon, pt.lat) : undefined),
    [region, pt, geojson]);
  const nearest = useMemo(() => {
    if (!pt) return [];
    return stations
      .filter(s => s.lat != null)
      .map(s => ({ s, ...distanceBearing(pt, { lat: s.lat, lon: s.lon }) }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 3);
  }, [pt, stations]);
  const track = useMemo(() => (pt ? nearestTrack(region, roverTrack, pt) : null), [pt, region, roverTrack]);

  if (!pt) return null;

  const unit = geology && geology.symbol ? geologyUnits[geology.symbol] : null;
  // Plain-language ground line, from the verified SIM 3464 unit description
  // already shipped in-app; the raw unit code stays under Details.
  const groundSummary = region !== 'jezero'
    ? 'Ground: unavailable - no unit map here'
    : geology === undefined || geology === null
      ? null // still loading, or outside mapped units: nothing plain to claim
      : unit
        ? `Ground: ${unit.plain}`
        : `Ground: ${geology.name || 'mapped unit'}`;

  const gridM = info && info.elevSrc && hiGrid && info.elevSrc === hiGrid.srcLabel ? hiGrid.dx : grid ? grid.dx : null;

  return (
    <section className="panel text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="eyebrow">Point inspector</div>
        <button onClick={onClear} className="text-xs text-slate-400 hover:text-white px-1 underline">clear</button>
      </div>
      <div className="font-mono text-xs text-cyan-200">{pt.lat.toFixed(5)}, {pt.lon.toFixed(5)}</div>

      {!info && (
        <div className="text-xs text-amber-300 bg-amber-950/30 border border-amber-500/40 rounded-lg p-2">Outside the elevation coverage ({grid ? grid.srcLabel : 'grid'}). Nothing is extrapolated here.</div>
      )}
      {info && (
        <div className="text-xs text-slate-100 leading-normal">
          {info.elev != null ? `${info.elev.toFixed(1)} m` : 'no elevation'}
          {info.slopeDeg != null && <> &middot; {info.slopeDeg.toFixed(1)}&deg; downhill toward {compass(info.downslopeBearing)}</>}
        </div>
      )}
      {groundSummary && <div className="text-xs text-slate-200 leading-normal break-words">{groundSummary}</div>}
      {region === 'jezero' && geology === null && (
        <div className="text-xs text-slate-400">Ground: outside mapped SIM 3464 units</div>
      )}

      {nearest.length > 0 && (
        <div>
          <div className="text-slate-400 text-xs mb-1 font-medium">Nearest places</div>
          {nearest.map(({ s, dist, bearing }) => (
            <div key={s.id} className="flex justify-between text-xs text-slate-300 py-0.5">
              <span className="truncate pr-1">{s.short || s.name}</span>
              <span className="whitespace-nowrap text-slate-400 font-mono">{fmtDist(dist)} {compass(bearing)}</span>
            </div>
          ))}
        </div>
      )}

      {track && (
        <div className="flex justify-between border-t border-cyan-900/40 pt-1 text-xs">
          <span className="text-slate-400 max-w-[55%]">Nearest {region === 'gale' ? 'recorded drive' : 'recorded rover position'}</span>
          <span className="text-slate-200 font-mono">{fmtDist(track.dist)}</span>
        </div>
      )}

      <details className="disclosure mt-1">
        <summary className="text-xs">Details &amp; sources</summary>
        <div className="disclosure-body text-xs text-slate-300 space-y-1.5 leading-normal">
          {info && (
            <div>
              Elevation/slope from the {info.elevSrc || grid.srcLabel}; slope over one {gridM} m posting, not micro-relief.{hiGrid ? ' Routing still runs on the 20 m grid.' : ''} Not a walkability or safety rating - there is no obstacle dataset.
            </div>
          )}
          {region === 'jezero' && geology && geology.symbol && (
            <div>
              Unit code {geology.symbol}{unit ? ` - ${unit.description}` : ' (USGS SIM 3464)'} SIM 3464 point-in-polygon; unit boundaries carry ~100-200 m registration vs rover records. Rock type does not rate how hard the walking is.
            </div>
          )}
          {region !== 'jezero' && (
            <div>No polygon geology layer exists for Gale in this app; CRISM 770 nm is brightness, not a unit map.</div>
          )}
          {track && <div>{track.kind}.</div>}
          <div>
            {region === 'jezero'
              ? 'Weather: recorded MEDA measurements exist only where the rover sat (Wildcat Ridge sol 502, Skinner Ridge sol 477 - see their station cards). They are historic point records, not conditions at this point.'
              : 'Weather: no weather layer is integrated for Gale. Archival REMS measurements exist at the rover but are not in this app.'}
          </div>
        </div>
      </details>
    </section>
  );
}
