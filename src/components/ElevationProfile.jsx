import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceDot, ResponsiveContainer } from 'recharts';
import { geologyAlongPath } from '../lib/inspect.js';
import stationsData from '../data/stations.json';
const SHORT = Object.fromEntries(stationsData.map(x => [x.id, x.short || (x.id === 'Depot' ? 'Base' : x.name.split(' ')[0])]));

export default function ElevationProfile({ plan, stations, legsData, geojson = null }) {
  if (!plan || !plan.sim || !plan.sim.legs || !plan.sim.legs.length) return null;
  const isTwoPoint = !!plan.isTwoPoint;
  const data = [];
  const baseId = plan.baseId || 'Depot';
  const stationMarks = [{ d: 0, e: null, id: baseId }];
  const routeLegs = (plan.visitedLegs || []).concat(plan.sim.legs || []);
  let off = 0;
  for (const leg of routeLegs) {
    if (leg.metrics && leg.metrics.profile) {
      for (const p of leg.metrics.profile) data.push({ d: +(off + p[0]).toFixed(1), e: p[1] });
      off += leg.metrics.dist;
      stationMarks.push({ d: +off.toFixed(1), e: data[data.length - 1]?.e, id: leg.to });
    }
  }
  stationMarks[0].e = data.length ? data[0].e : 0;
  const totalDist = off;

  // Data-driven geology strip + slope ranges from the runtime legs provider.
  // When the least-cost model routed a leg, its meta carries pathLatLon and
  // the strip is computed along that actual polyline at runtime (SIM 3464
  // point-in-polygon) - never the straight segment the chart is not showing.
  const meta = legsData && legsData.legsMeta ? legsData.legsMeta : {};
  const UNIT_STYLE = {
    Njf: { cls: 'bg-sky-950/70 text-sky-300', label: 'Njf (Jezero floor unit)' },
    NHjf2: { cls: 'bg-indigo-950/70 text-indigo-300', label: 'NHjf2 (Jezero fan unit 2)' },
  };
  const nm = id => (!isTwoPoint && id === baseId ? 'Base' : (SHORT[id] || id));
  const segs = [];
  const legSlopeNotes = [];
  let goff = 0;
  for (const leg of routeLegs) {
    const fwd = meta[leg.from + '|' + leg.to];
    const rev = !fwd ? meta[leg.to + '|' + leg.from] : null;
    const m = fwd || rev;
    const dist = leg.metrics.dist;
    const slopeKey = m ? Object.keys(m).find(k => /^slope\d+_deg$/.test(k)) : null;
    const base = slopeKey ? parseInt(slopeKey.slice(5, slopeKey.indexOf('_')), 10) : 20;
    if (m && slopeKey && m[slopeKey] && dist >= base) {
      // slopes are stored for the stored leg direction; negate+swap when traversed in reverse
      const sr = rev ? [-m[slopeKey][1], -m[slopeKey][0]] : m[slopeKey];
      legSlopeNotes.push(`${nm(leg.from)} → ${nm(leg.to)}: ${sr[0].toFixed(1)}° to ${sr[1].toFixed(1)}° (${base} m window along the profile)`);
    }
    if (!rev && m && m.pathLatLon && geojson) {
      // least-cost geometry: runtime point-in-polygon along the actual path
      const g = geologyAlongPath(geojson, m.pathLatLon);
      // symbol null = outside every mapped polygon: leave a gap, never fill
      if (g) for (const s of g.segments) if (s[2] != null) segs.push({ start: goff + s[0], end: goff + s[1], symbol: s[2], name: s[3] });
    } else if (m && m.geology && !m.pathLatLon) {
      const g = rev
        ? m.geology.map(s => [dist - s[1], dist - s[0], s[2], s[3]]).reverse()
        : m.geology;
      for (const s of g) segs.push({ start: goff + s[0], end: goff + s[1], symbol: s[2], name: s[3] });
    }
    // when pathLatLon exists but geojson is unavailable the leg contributes
    // no strip segment - an honest gap, not the wrong geometry
    goff += dist;
  }
  const merged = [];
  for (const s of segs) {
    const last = merged[merged.length - 1];
    if (last && last.symbol === s.symbol && Math.abs(last.end - s.start) < 1) last.end = s.end;
    else merged.push({ ...s });
  }

  const maxD = data.length ? data[data.length - 1].d : 0;
  // Sub-km routes (Gale is ~160 m) read in meters; km ticks would collapse to duplicates.
  const xTick = maxD < 1000 ? (v => `${Math.round(v)} m`) : (v => `${(v / 1000).toFixed(1)}k`);

  return (
    <section className="panel">
      <div className="eyebrow">{isTwoPoint ? 'Elevation profile (two-point route)' : 'Elevation profile (active route)'}</div>
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 16, right: 34, bottom: 4, left: -14 }}>
          <XAxis type="number" dataKey="d" domain={[0, 'dataMax']} tickFormatter={xTick} tick={{ fontSize: 12, fill: '#94a3b8' }} />
          <YAxis type="number" domain={['dataMin - 4', 'dataMax + 4']} tick={{ fontSize: 12, fill: '#94a3b8' }} tickFormatter={v => v.toFixed(0)} />
          <Tooltip formatter={(v) => [v.toFixed(1) + ' m', 'elev']} labelFormatter={v => `${(+v).toFixed(0)} m`} />
          <Line type="monotone" dataKey="e" stroke="#38bdf8" dot={false} strokeWidth={2.5} isAnimationActive={false} />
          {stationMarks.map((m, i) => {
            const pos = m.id === 'Wildcat' || m.id === 'Departure' || m.id === 'Rocknest' ? 'bottom' : 'top';
            const name = isTwoPoint
              ? (SHORT[m.id] || m.id)
              : (m.id === baseId ? (i === 0 ? 'Base' : 'Base (return)') : (SHORT[m.id] || m.id));
            return <ReferenceDot key={i} x={m.d} y={m.e} r={4} fill="#ffb02e" stroke="#0f172a" strokeWidth={1.5}
              label={{ value: name, fontSize: 12, fill: '#ffb02e', position: pos, offset: 6 }} />;
          })}
        </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Chart line pattern indicator */}
      <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-5 h-0.5 bg-[#38bdf8] inline-block" />
          <span className="text-slate-300">─── Solid cyan: Surface elevation</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#ffb02e] inline-block" />
          <span className="text-slate-300">● Amber: Station position</span>
        </span>
      </div>

      {/* Geology strip under profile (Jezero only - no polygon-scale geology map found for the Gale window) */}
      {merged.length > 0 && (
      <div className="mt-2.5 pt-2 border-t border-cyan-900/40">
        <div className="text-xs font-semibold text-slate-300 mb-1.5">Geology strip along route (USGS SIM 3464)</div>
        <div className="flex h-5 w-full rounded overflow-hidden" role="img" aria-label="geology strip along route">
          {merged.map((s, i) => {
            const st = UNIT_STYLE[s.symbol] || { cls: 'bg-gray-800 text-gray-300', label: s.symbol };
            const w = totalDist > 0 ? ((s.end - s.start) / totalDist) * 100 : 0;
            return (
              <div key={i} className={`${st.cls} h-full flex items-center justify-center text-[10px] font-mono px-1 overflow-hidden whitespace-nowrap`} style={{ width: `${w}%` }} title={`${st.label}${s.name ? ' - ' + s.name : ''} (${(s.start / 1000).toFixed(2)}-${(s.end / 1000).toFixed(2)} km)`}>
                {w > 15 ? s.symbol : ''}
              </div>
            );
          })}
        </div>
        {/* Wrapped legend so unit names are never truncated inside narrow segments */}
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5 text-xs font-mono leading-tight">
          {merged.map((s, i) => {
            const st = UNIT_STYLE[s.symbol] || { cls: 'bg-gray-800 text-gray-300', label: s.symbol };
            return (
              <span key={i} className="inline-flex items-center gap-1.5 whitespace-normal">
                <span className={`${st.cls} inline-block w-3 h-2.5 rounded-sm shrink-0 border border-slate-700`}></span>
                <span className="text-slate-200">{st.label} {(s.start / 1000).toFixed(2)}–{(s.end / 1000).toFixed(2)} km</span>
              </span>
            );
          })}
        </div>
        {legSlopeNotes.length > 0 && (
          <div className="text-xs text-slate-400 mt-2">
            Slope per leg (grid baseline): {legSlopeNotes.join('; ')}
          </div>
        )}
      </div>
      )}
      {merged.length === 0 && legSlopeNotes.length > 0 && (
        <div className="mt-2 pt-1.5 border-t border-cyan-900/40 text-xs text-slate-400">
          Slope per leg (grid baseline): {legSlopeNotes.join('; ')}
        </div>
      )}

      <div className="mt-2 text-xs text-slate-400 break-words leading-relaxed">
        {legsData && legsData.dtm ? legsData.dtm : 'elevation grid'}; slopes use a sliding one-posting window along each leg's sampled profile and the grid smooths micro-relief.{merged.length > 0 ? ' Mapped unit contacts are regional-map boundaries (SIM 3464), not scarp markers.' : ''} Not a surveyed walking path.
      </div>
    </section>
  );
}
