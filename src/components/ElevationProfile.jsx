import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceDot, ResponsiveContainer } from 'recharts';

export default function ElevationProfile({ plan, stations }) {
  const byId = Object.fromEntries(stations.map(s => [s.id, s]));
  const data = [];
  const stationMarks = [{ d: 0, e: null, id: 'Depot' }];
  let off = 0;
  for (const leg of plan.visitedLegs.concat(plan.sim.legs)) {
    for (const p of leg.metrics.profile) data.push({ d: +(off + p[0]).toFixed(1), e: p[1] });
    off += leg.metrics.dist;
    stationMarks.push({ d: +off.toFixed(1), e: data[data.length - 1].e, id: leg.to });
  }
  stationMarks[0].e = data.length ? data[0].e : 0;
  return (
    <div className="p-2 bg-[#101826] rounded border border-cyan-900">
      <h3 className="text-[11px] uppercase tracking-wider text-cyan-400 mb-1">Elevation profile (active route)</h3>
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={data} margin={{ top: 14, right: 34, bottom: 0, left: -18 }}>
          <XAxis type="number" dataKey="d" domain={[0, 'dataMax']} tickFormatter={v => `${(v / 1000).toFixed(1)}k`} tick={{ fontSize: 9, fill: '#789' }} />
          <YAxis type="number" domain={['dataMin - 4', 'dataMax + 4']} tick={{ fontSize: 9, fill: '#789' }} tickFormatter={v => v.toFixed(0)} />
          <Tooltip formatter={(v, n) => [v.toFixed(1) + ' m', 'elev']} labelFormatter={v => `${(+v).toFixed(0)} m`} />
          <Line type="monotone" dataKey="e" stroke="#4aa8ff" dot={false} strokeWidth={1.5} isAnimationActive={false} />
          {stationMarks.map((m, i) => {
            const pos = m.id === 'Skinner' ? 'right' : 'top';
            const name = m.id === 'Depot' ? (i === 0 ? 'Base' : 'Base (return)') : m.id;
            return <ReferenceDot key={i} x={m.d} y={m.e} r={3} fill="#ffb02e" stroke="none"
              label={{ value: name, fontSize: 8, fill: '#ffb02e', position: pos, offset: 4 }} />;
          })}
        </LineChart>
      </ResponsiveContainer>
      <div className="text-[9px] text-gray-500">Precomputed straight-segment samples from the 20m DTM grid; not a surveyed path.</div>
    </div>
  );
}
