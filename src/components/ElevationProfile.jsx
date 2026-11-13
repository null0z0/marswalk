import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { TerrainIcon } from './Icons.jsx';

export default function ElevationProfile({ plan, stations }) {
  const data = [];
  const stationMarks = [{ d: 0, e: null, id: 'Depot' }];
  let off = 0;
  let completedDist = 0;

  for (const leg of plan.visitedLegs.concat(plan.sim.legs)) {
    for (const p of leg.metrics.profile) data.push({ d: +(off + p[0]).toFixed(1), e: p[1] });
    off += leg.metrics.dist;
    stationMarks.push({ d: +off.toFixed(1), e: data[data.length - 1].e, id: leg.to });
  }
  for (const leg of plan.visitedLegs) completedDist += leg.metrics.dist;
  stationMarks[0].e = data.length ? data[0].e : 0;

  const elevations = data.map((p) => p.e);
  const minElev = elevations.length ? Math.min(...elevations) : 0;
  const maxElev = elevations.length ? Math.max(...elevations) : 0;
  const totalAsc =
    plan.visitedLegs.reduce((a, l) => a + l.metrics.asc, 0) + plan.sim.asc;

  return (
    <section className="panel elevation-panel" aria-labelledby="elevation-heading">
      <div className="panel-head">
        <div>
          <div className="eyebrow">
            <TerrainIcon />
            Terrain profile
          </div>
          <h2 id="elevation-heading" className="panel-title">
            Active route elevation
          </h2>
        </div>
        <span className="chip chip--mars">20 m DTM</span>
      </div>

      <div className="panel-body">
        <div className="chart-stats">
          <span>
            Range <b>{minElev.toFixed(0)}</b> to <b>{maxElev.toFixed(0)} m</b>
          </span>
          <span>
            Ascent <b>+{totalAsc.toFixed(0)} m</b>
          </span>
          <span>
            Distance <b>{(off / 1000).toFixed(2)} km</b>
          </span>
        </div>

        {data.length === 0 ? (
          <p className="plan-footnote">
            No active traverse for this window. Increase the EVA window or change the route
            assumptions.
          </p>
        ) : (
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 16, right: 38, bottom: 0, left: -14 }}
              aria-label="Elevation profile of the active traverse"
            >
              <CartesianGrid strokeDasharray="3 4" vertical={false} />
              <XAxis
                type="number"
                dataKey="d"
                domain={[0, 'dataMax']}
                tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`}
                tick={{ fontSize: 10, fill: '#7a8da5' }}
                tickMargin={6}
                stroke="rgba(148,197,255,0.18)"
              />
              <YAxis
                type="number"
                domain={['dataMin - 4', 'dataMax + 4']}
                tick={{ fontSize: 10, fill: '#7a8da5' }}
                tickFormatter={(v) => v.toFixed(0)}
                width={46}
                stroke="rgba(148,197,255,0.18)"
              />
              <Tooltip
                contentStyle={{
                  background: 'rgba(5,10,18,0.95)',
                  border: '1px solid rgba(148,197,255,0.24)',
                  borderRadius: 7,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: '#c1cfe0',
                }}
                labelStyle={{ color: '#93a7bf' }}
                formatter={(v) => [`${v.toFixed(1)} m`, 'elevation']}
                labelFormatter={(v) => `${(+v).toFixed(0)} m along route`}
              />
              <Line
                type="monotone"
                dataKey="e"
                stroke="#22d3ee"
                dot={false}
                strokeWidth={2}
                isAnimationActive={false}
              />
              {completedDist > 0 && (
                <ReferenceLine
                  x={completedDist}
                  stroke="rgba(52,211,153,0.55)"
                  strokeDasharray="3 4"
                  label={{
                    value: 'now',
                    position: 'insideTopRight',
                    fontSize: 9,
                    fill: '#6ee7b7',
                  }}
                />
              )}
              {stationMarks.map((m, i) => {
                const pos = m.id === 'Wildcat' ? 'bottom' : 'top';
                const name = m.id === 'Depot' ? (i === 0 ? 'Base' : 'Base (return)') : m.id;
                return (
                  <ReferenceDot
                    key={`${m.id}-${i}`}
                    x={m.d}
                    y={m.e}
                    r={3.5}
                    fill="#fbbf24"
                    stroke="#05080f"
                    strokeWidth={1.5}
                    label={{ value: name, fontSize: 10, fill: '#fcd34d', position: pos, offset: 5 }}
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
          </div>
        )}

        <p className="plan-footnote">
          Precomputed straight-segment samples from the 20 m DTM grid; not a surveyed path.
        </p>
      </div>
    </section>
  );
}
