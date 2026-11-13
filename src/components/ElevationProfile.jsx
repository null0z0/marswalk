import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceDot, ResponsiveContainer } from 'recharts';

export default function ElevationProfile({ plan, stations }) {
  const data = [];
  const stationMarks = [{ d: 0, e: null, id: 'Depot' }];
  let off = 0;
  for (const leg of plan.visitedLegs.concat(plan.sim.legs)) {
    for (const p of leg.metrics.profile) data.push({ d: +(off + p[0]).toFixed(1), e: p[1] });
    off += leg.metrics.dist;
    stationMarks.push({ d: +off.toFixed(1), e: data[data.length - 1].e, id: leg.to });
  }
  stationMarks[0].e = data.length ? data[0].e : 0;
  const totalDist = off;

  return (
    <div className="p-2 bg-[#101826] rounded border border-cyan-900">
      <h3 className="text-[11px] uppercase tracking-wider text-cyan-400 mb-1">Elevation profile (active route)</h3>
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={data} margin={{ top: 14, right: 34, bottom: 0, left: -18 }}>
          <XAxis type="number" dataKey="d" domain={[0, 'dataMax']} tickFormatter={v => `${(v / 1000).toFixed(1)}k`} tick={{ fontSize: 9, fill: '#789' }} />
          <YAxis type="number" domain={['dataMin - 4', 'dataMax + 4']} tick={{ fontSize: 9, fill: '#789' }} tickFormatter={v => v.toFixed(0)} />
          <Tooltip formatter={(v) => [v.toFixed(1) + ' m', 'elev']} labelFormatter={v => `${(+v).toFixed(0)} m`} />
          <Line type="monotone" dataKey="e" stroke="#4aa8ff" dot={false} strokeWidth={1.5} isAnimationActive={false} />
          {stationMarks.map((m, i) => {
            const pos = m.id === 'Wildcat' ? 'bottom' : m.id === 'Skinner' ? 'top' : 'top';
            const name = m.id === 'Depot' ? (i === 0 ? 'Base' : 'Base (return)') : m.id;
            return <ReferenceDot key={i} x={m.d} y={m.e} r={3} fill="#ffb02e" stroke="none"
              label={{ value: name, fontSize: 8, fill: '#ffb02e', position: pos, offset: 4 }} />;
          })}
        </LineChart>
      </ResponsiveContainer>

      {/* Geology strip under profile */}
      <div className="mt-2 pt-1 border-t border-gray-800">
        <div className="text-[9px] uppercase tracking-wider text-gray-400 mb-0.5">Geology strip (USGS SIM 3464)</div>
        <div className="flex h-3.5 w-full rounded overflow-hidden text-[8px] font-mono leading-none items-center text-center">
          <div className="bg-sky-950/70 border-r border-sky-600 text-sky-300 h-full flex items-center justify-center" style={{ width: '25%' }} title="Njf: Jezero floor unit">
            Njf (crater floor)
          </div>
          <div className="bg-indigo-950/70 text-indigo-300 h-full flex items-center justify-center flex-1" title="NHjf2: Jezero fan unit 2">
            NHjf2 (Jezero fan unit 2)
          </div>
        </div>
        <div className="flex justify-between text-[8px] text-gray-500 mt-0.5 font-mono">
          <span>0.0 km</span>
          <span>~0.2 km: Mapped unit contact</span>
          <span>{(totalDist / 1000).toFixed(1)} km</span>
        </div>
      </div>

      <div className="mt-1.5 text-[9px] text-gray-500">
        Precomputed straight-segment samples from 20m DTM. Note: The mapped geological contact is at ~200 m on the lower apron; the steeper topographic scarp occurs further upslope (280–380 m, slopes up to 13.4° over 20m baseline). 20m grid smooths micro-relief; not a surveyed walking path.
      </div>
    </div>
  );
}
