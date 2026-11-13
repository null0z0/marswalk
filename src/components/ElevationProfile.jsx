import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceDot, ResponsiveContainer } from 'recharts';
import stationsData from '../data/stations.json';
const SHORT = Object.fromEntries(stationsData.map(x => [x.id, x.short || (x.id === 'Depot' ? 'Base' : x.name.split(' ')[0])]));

export default function ElevationProfile({ plan, stations, legsData }) {
  const data = [];
  const baseId = plan.baseId || 'Depot';
  const stationMarks = [{ d: 0, e: null, id: baseId }];
  const routeLegs = plan.visitedLegs.concat(plan.sim.legs);
  let off = 0;
  for (const leg of routeLegs) {
    for (const p of leg.metrics.profile) data.push({ d: +(off + p[0]).toFixed(1), e: p[1] });
    off += leg.metrics.dist;
    stationMarks.push({ d: +off.toFixed(1), e: data[data.length - 1].e, id: leg.to });
  }
  stationMarks[0].e = data.length ? data[0].e : 0;
  const totalDist = off;

  // Data-driven geology strip + slope ranges from legs.json legsMeta (SIM 3464 polygons, 20 m DTM).
  const meta = legsData && legsData.legsMeta ? legsData.legsMeta : {};
  const UNIT_STYLE = {
    Njf: { cls: 'bg-sky-950/70 text-sky-300', label: 'Njf (Jezero floor unit)' },
    NHjf2: { cls: 'bg-indigo-950/70 text-indigo-300', label: 'NHjf2 (Jezero fan unit 2)' },
  };
  const nm = id => (id === baseId ? 'Base' : (SHORT[id] || id));
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
      legSlopeNotes.push(`${nm(leg.from)} → ${nm(leg.to)}: ${sr[0].toFixed(1)}° to ${sr[1].toFixed(1)}° (${base} m baseline, bilinear)`);
    }
    if (m && m.geology) {
      const g = rev
        ? m.geology.map(s => [dist - s[1], dist - s[0], s[2], s[3]]).reverse()
        : m.geology;
      for (const s of g) segs.push({ start: goff + s[0], end: goff + s[1], symbol: s[2], name: s[3] });
    }
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
    <div className="p-2 bg-[#101826] rounded border border-cyan-900">
      <h3 className="text-[11px] uppercase tracking-wider text-cyan-400 mb-1">Elevation profile (active route)</h3>
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={data} margin={{ top: 14, right: 34, bottom: 0, left: -18 }}>
          <XAxis type="number" dataKey="d" domain={[0, 'dataMax']} tickFormatter={xTick} tick={{ fontSize: 9, fill: '#789' }} />
          <YAxis type="number" domain={['dataMin - 4', 'dataMax + 4']} tick={{ fontSize: 9, fill: '#789' }} tickFormatter={v => v.toFixed(0)} />
          <Tooltip formatter={(v) => [v.toFixed(1) + ' m', 'elev']} labelFormatter={v => `${(+v).toFixed(0)} m`} />
          <Line type="monotone" dataKey="e" stroke="#4aa8ff" dot={false} strokeWidth={1.5} isAnimationActive={false} />
          {stationMarks.map((m, i) => {
            const pos = m.id === 'Wildcat' || m.id === 'Departure' || m.id === 'Rocknest' ? 'bottom' : 'top';
            const name = m.id === baseId ? (i === 0 ? 'Base' : 'Base (return)') : (SHORT[m.id] || m.id);
            return <ReferenceDot key={i} x={m.d} y={m.e} r={3} fill="#ffb02e" stroke="none"
              label={{ value: name, fontSize: 8, fill: '#ffb02e', position: pos, offset: 4 }} />;
          })}
        </LineChart>
      </ResponsiveContainer>

      {/* Geology strip under profile (Jezero only - no polygon-scale geology map found for the Gale window) */}
      {merged.length > 0 && (
      <div className="mt-2 pt-1 border-t border-gray-800">
        <div className="text-[9px] uppercase tracking-wider text-gray-400 mb-0.5">Geology strip along route (USGS SIM 3464)</div>
        <div className="flex h-3.5 w-full rounded overflow-hidden" role="img" aria-label="geology strip along route">
          {merged.map((s, i) => {
            const st = UNIT_STYLE[s.symbol] || { cls: 'bg-gray-800 text-gray-300', label: s.symbol };
            const w = totalDist > 0 ? ((s.end - s.start) / totalDist) * 100 : 0;
            return (
              <div key={i} className={`${st.cls} h-full`} style={{ width: `${w}%` }} title={`${st.label}${s.name ? ' - ' + s.name : ''} (${(s.start / 1000).toFixed(2)}-${(s.end / 1000).toFixed(2)} km)`} />
            );
          })}
        </div>
        {/* Wrapped legend so unit names are never truncated inside narrow segments */}
        <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[8px] font-mono leading-tight">
          {merged.map((s, i) => {
            const st = UNIT_STYLE[s.symbol] || { cls: 'bg-gray-800 text-gray-300', label: s.symbol };
            return (
              <span key={i} className="inline-flex items-center gap-1 whitespace-normal">
                <span className={`${st.cls} inline-block w-2.5 h-2 rounded-sm shrink-0`}></span>
                <span className="text-gray-400">{st.label} {(s.start / 1000).toFixed(2)}-{(s.end / 1000).toFixed(2)} km</span>
              </span>
            );
          })}
        </div>
        {legSlopeNotes.length > 0 && (
          <div className="text-[9px] text-gray-500 mt-1">
            Slope per leg (grid baseline): {legSlopeNotes.join('; ')}
          </div>
        )}
      </div>
      )}
      {merged.length === 0 && legSlopeNotes.length > 0 && (
        <div className="mt-2 pt-1 border-t border-gray-800 text-[9px] text-gray-500">
          Slope per leg (grid baseline): {legSlopeNotes.join('; ')}
        </div>
      )}

      <div className="mt-1.5 text-[9px] text-gray-500 break-all">
        Precomputed straight-segment samples from the {legsData && legsData.dtm ? legsData.dtm : 'elevation grid'}; slopes are grid-baseline bilinear estimates and the grid smooths micro-relief.{merged.length > 0 ? ' Mapped unit contacts are regional-map boundaries (SIM 3464), not scarp markers.' : ''} Not a surveyed walking path.
      </div>
    </div>
  );
}
