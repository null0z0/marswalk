import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

// Two-point route comparison: the straight geometric baseline vs the
// slope-aware least-cost path between the SAME two endpoints. Every number
// comes from the elevation grid with the method stated; neither route is
// presented as shortest, easiest or safe (no obstacle data exists).

const fmtDist = (m) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(2)} km`);
const fmtMin = (m) => (m < 90 ? `${Math.round(m)} min` : `${(m / 60).toFixed(1)} h`);

// Deterministic per-unit colors for geology strips (SIM 3464 has 17 units;
// only 2 have named styles in the planner's strip). Fallback = gray.
const UNIT_COLORS = ['#38bdf8', '#a78bfa', '#f472b6', '#4ade80', '#facc15', '#fb923c', '#2dd4bf', '#f87171', '#93c5fd', '#bef264'];
function unitColor(symbol) {
  if (symbol === 'Njf') return '#0c4a6e';
  if (symbol === 'NHjf2') return '#312e81';
  let h = 0;
  for (const c of String(symbol)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return UNIT_COLORS[h % UNIT_COLORS.length];
}

function GeoStrip({ title, segments, totalM }) {
  if (!segments || !segments.length) return null;
  const legend = [];
  for (const s of segments) {
    if (!legend.find(l => l.symbol === s[2])) legend.push({ symbol: s[2], name: s[3] });
  }
  return (
    <div className="mt-2">
      <div className="text-xs text-slate-300 font-medium mb-1">{title}</div>
      <div className="flex h-3.5 w-full rounded overflow-hidden" role="img" aria-label={`geology along ${title}`}>
        {segments.map((s, i) => {
          const w = totalM > 0 ? ((s[1] - s[0]) / totalM) * 100 : 0;
          if (w <= 0) return null;
          const unmapped = s[2] == null;
          return (
            <div key={i} className="h-full" title={`${unmapped ? 'outside mapped SIM 3464 units' : `${s[2]} - ${s[3] || ''}`} (${fmtDist(s[0])}-${fmtDist(s[1])})`}
              style={{
                width: `${w}%`,
                background: unmapped ? 'repeating-linear-gradient(45deg,#1f2937,#1f2937 3px,#0a0e17 3px,#0a0e17 6px)' : unitColor(s[2]),
              }} />
          );
        })}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs font-mono leading-tight">
        {legend.map((l, i) => (
          <span key={i} className="inline-flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2 rounded-sm shrink-0" style={{ background: l.symbol == null ? '#1f2937' : unitColor(l.symbol), border: l.symbol == null ? '1px dashed #4b5563' : 'none' }}></span>
            <span className="text-slate-300">{l.symbol == null ? 'outside mapped units' : `${l.symbol}${l.name ? ` (${l.name})` : ''}`}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function DualChart({ title, a, b, yLabel, yPad = 2, yFmt = (v) => v.toFixed(0) }) {
  const toPts = (arr) => (arr || []).map(p => ({ d: +p[0].toFixed(1), v: p[1] }));
  const da = toPts(a), db = toPts(b);
  if (!da.length && !db.length) return null;
  const all = da.concat(db).map(p => p.v);
  const lo = Math.min(...all), hi = Math.max(...all);
  const maxD = Math.max(...da.map(p => p.d), ...db.map(p => p.d));
  const xTick = maxD < 1000 ? (v) => `${Math.round(v)} m` : (v) => `${(v / 1000).toFixed(1)}k`;
  return (
    <div className="mt-2">
      <div className="text-xs text-slate-300 font-medium mb-1">{title} <span className="text-slate-400 font-mono">({yLabel})</span></div>
      <ResponsiveContainer width="100%" height={110}>
        <LineChart margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
          <XAxis type="number" dataKey="d" domain={[0, 'dataMax']} tickFormatter={xTick} tick={{ fontSize: 10, fill: '#94a3b8' }} />
          <YAxis type="number" domain={[Math.floor(lo - yPad), Math.ceil(hi + yPad)]} tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={yFmt} />
          <Tooltip formatter={(v, name) => [yFmt(v), name]} labelFormatter={(v) => fmtDist(+v)} />
          {da.length > 0 && <Line data={da} type="monotone" dataKey="v" name="straight baseline" stroke="#9ca3af" strokeDasharray="5 4" dot={false} strokeWidth={1.5} isAnimationActive={false} />}
          {db.length > 0 && <Line data={db} type="monotone" dataKey="v" name="least-cost" stroke="#a3e635" dot={false} strokeWidth={1.5} isAnimationActive={false} />}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function RouteCompare({ compare, geology, region, paceKmh, fromName, toName }) {
  if (!compare) return null;
  const { straight, leastCost, gridM, srcLabel } = compare;
  if (!straight && !leastCost) {
    return (
      <section className="panel text-xs space-y-2">
        <div className="eyebrow">Route comparison</div>
        <div className="text-xs text-amber-300 bg-amber-950/30 border border-amber-500/40 rounded-lg p-2">
          No route under either model: endpoint outside elevation coverage or ground between has no data.
        </div>
      </section>
    );
  }
  const rows = [
    { label: 'Distance', s: straight && fmtDist(straight.dist), l: leastCost && fmtDist(leastCost.dist) },
    { label: 'Ascent', s: straight && `+${Math.round(straight.asc)} m`, l: leastCost && `+${Math.round(leastCost.asc)} m` },
    { label: 'Descent', s: straight && `-${Math.round(straight.desc)} m`, l: leastCost && `-${Math.round(leastCost.desc)} m` },
    {
      label: `Slope range (${gridM} m baseline)`,
      s: straight && (straight.slope ? `${straight.slope[0].toFixed(1)}° to ${straight.slope[1].toFixed(1)}°` : `leg shorter than ${gridM} m`),
      l: leastCost && (leastCost.slope ? `${leastCost.slope[0].toFixed(1)}° to ${leastCost.slope[1].toFixed(1)}°` : `leg shorter than ${gridM} m`),
    },
    {
      label: `Walk time at ${paceKmh} km/h`,
      s: straight && fmtMin(straight.dist / (paceKmh * 1000 / 60)),
      l: leastCost && fmtMin(leastCost.dist / (paceKmh * 1000 / 60)),
    },
  ];
  const na = (v) => (v === null || v === undefined || v === false
    ? <span className="text-amber-400/90">no data</span>
    : v);

  return (
    <section className="panel text-xs space-y-2">
      <div className="eyebrow">Route comparison{fromName && toName ? `: ${fromName} → ${toName}` : ''}</div>
      <div className="text-xs text-slate-400 leading-normal">
        Same two endpoints, two declared models on {srcLabel}. Neither is shortest, easiest or safest way — grid smooths features smaller than {gridM} m.
        {compare.profileSrc && (
          <div className="mt-0.5">Profiles sampled on {compare.profileSrc}; routing computed on {gridM} m grid so both models stay comparable.</div>
        )}
      </div>
      <div className="plan-table-wrap">
        <table className="plan-table">
          <thead>
            <tr>
              <th></th>
              <th><span className="inline-block w-2.5 border-t border-dashed border-[#9ca3af] mr-1 align-middle"></span>Straight baseline</th>
              <th><span className="inline-block w-2.5 h-0.5 bg-[#a3e635] mr-1 align-middle"></span>Least-cost</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td className="text-slate-400 font-mono text-xs">{r.label}</td>
                <td className="num text-xs">{na(r.s)}</td>
                <td className="num text-xs">{na(r.l)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <DualChart title="Elevation along each route" yLabel="m" a={straight && straight.profile} b={leastCost && leastCost.profile} yPad={3} />
      <DualChart title={`Slope along each route (${gridM} m window)`} yLabel="deg" a={straight && straight.slopeSeries} b={leastCost && leastCost.slopeSeries} yPad={1} yFmt={(v) => `${v.toFixed(0)}°`} />
      {region === 'jezero' && geology && (geology.straight || geology.leastCost) && (
        <div className="pt-2 border-t border-cyan-900/40">
          <div className="eyebrow text-cyan-400">Mapped geology along each route (USGS SIM 3464)</div>
          {geology.straight && <GeoStrip title="Straight baseline" segments={geology.straight.segments} totalM={geology.straight.totalM} />}
          {geology.leastCost && <GeoStrip title="Least-cost path" segments={geology.leastCost.segments} totalM={geology.leastCost.totalM} />}
          <div className="text-xs text-slate-400 mt-1 leading-normal">Regional unit boundaries (~100-200 m registration vs rover records). Rock type does not rate walking difficulty.</div>
        </div>
      )}
      {region === 'gale' && (
        <div className="pt-2 border-t border-cyan-900/40 text-xs text-slate-400">
          No polygon geology map is integrated for the Gale window. The CRISM 770 nm layer is brightness, not a mineral or unit map.
        </div>
      )}
      <div className="text-xs text-slate-400 leading-normal border-t border-cyan-900/40 pt-1.5">
        Straight baseline: geometric segment. Least-cost: A* on {gridM} m grid, cost = distance &times; (1 + slope penalty &times; |slope|), no-data impassable{leastCost && leastCost.explored ? ` (${leastCost.explored.toLocaleString()} cells explored)` : ''}. Not surveyed paths.
      </div>
    </section>
  );
}
