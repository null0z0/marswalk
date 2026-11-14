import { useMemo } from 'react';

// Interactive rover-record timeline: a sol slider that filters the archived
// route/stop layers by their metadata sol. Jezero archive = per-position sol
// records (sparse positions connected by straight lines); Gale archive = site
// stops with solFirst/solLast records (drive polylines carry no per-segment
// sol record in the MSL archive, so they are not filtered). Filters the
// recorded archive only - never the walk plan.
export default function SolTimeline({ stations, region, roverTrack, solLimit, setSolLimit }) {
  const range = useMemo(() => {
    if (!roverTrack) return null;
    if (roverTrack.route) {
      const sols = roverTrack.route.map(p => p[2]);
      return { lo: Math.min(...sols), hi: Math.max(...sols), kind: 'positions' };
    }
    if (roverTrack.stops && roverTrack.stops.length) {
      return {
        lo: Math.min(...roverTrack.stops.map(s => s.solFirst)),
        hi: Math.max(...roverTrack.stops.map(s => s.solLast)),
        kind: 'stops',
      };
    }
    return null;
  }, [roverTrack]);
  if (!range) return null;
  const N = solLimit == null ? range.hi : solLimit;
  const pts = stations.filter(s => s.sol != null);
  const reached = pts.filter(s => s.sol <= N);
  const X = (sol) => 34 + (sol - range.lo) / Math.max(1, range.hi - range.lo) * 168;

  // lane assignment: labels sorted by sol take the first of 4 lanes whose last
  // label ended far enough left to avoid overlap at ~7px font.
  const lanes = [-999, -999, -999, -999];
  const laneY = [14, 44, 6, 52];
  const labelEls = [...pts].sort((a, b) => a.sol - b.sol).map((s) => {
    const x = X(s.sol);
    const on = s.sol <= N;
    const name = s.short || (s.id === 'Depot' || s.id === 'GaleBase' ? 'Base' : s.name.split(' ')[0]);
    const w = (name.length + String(s.sol).length + 1) * 4.2;
    let lane = lanes.findIndex(lastX => x - lastX > w + 6);
    if (lane === -1) lane = lanes.indexOf(Math.min(...lanes));
    lanes[lane] = x + w / 2;
    const y = laneY[lane];
    return { s, on, name, y };
  });

  return (
    <div className="p-2 bg-[#101826] rounded border border-cyan-900 tl-wrap">
      <div className="tl-head">
        <div className="tl-title">Rover record timeline</div>
        <span className="tl-sol">sol {N}</span>
      </div>
      <input type="range" min={range.lo} max={range.hi} value={N}
        onChange={e => setSolLimit(+e.target.value >= range.hi ? null : +e.target.value)}
        className="tl-slider" aria-label="Filter rover record by sol" />
      <div className="tl-range">
        {range.kind === 'positions'
          ? `Archive sols ${range.lo}-${range.hi}: map shows recorded rover positions up to sol ${N} (${roverTrack.route.filter(p => p[2] <= N).length} of ${roverTrack.route.length} records).`
          : `Archive sols ${range.lo}-${range.hi}: map shows recorded site stops reached by sol ${N} (${reached.length} of ${pts.length} stops).`}
        Sparse records connected by straight lines - the driven path between records is not in this dataset.
        {' '}This filters the recorded archive only - the walk plan is unchanged.
        {solLimit != null && <button onClick={() => setSolLimit(null)} className="ml-1 text-cyan-400 underline text-[9px]">reset (full archive)</button>}
      </div>
      <div className="tl-canvas">
        <svg viewBox="0 0 220 56" className="w-full h-full block" aria-label="Rover record positions by sol" role="img">
          <line x1="30" y1="30" x2="206" y2="30" stroke="#164e63" strokeWidth="1.5" />
          <line x1="30" y1="30" x2={X(N)} y2="30" stroke="#22d3ee" strokeWidth="1.5" className="tl-progress" />
          <text x="30" y="52" fontSize="7" fill="#789">sol {range.lo}</text>
          <text x="206" y="52" fontSize="7" fill="#789" textAnchor="end">sol {range.hi}</text>
          {labelEls.map(({ s, on, name, y }) => {
            const cx = X(s.sol);
            const markerCls = on ? 'tl-marker tl-marker--reached' : s.sol === N ? 'tl-marker tl-marker--current' : 'tl-marker tl-marker--ahead';
            const labelCls = on ? 'tl-label tl-label--reached' : 'tl-label tl-label--ahead';
            const leaderY1 = y < 30 ? y + 6 : y - 6;
            return (
              <g key={s.id} opacity={on ? 1 : 0.35}>
                <line x1={cx} y1={leaderY1} x2={cx} y2="30" stroke="#475569" strokeWidth="0.5" opacity={0.6} />
                <circle cx={cx} cy="30" r="3" fill={on ? '#ffb02e' : '#64748b'} />
                {s.sol === N && <circle cx={cx} cy="30" r="6" fill="none" stroke="#22d3ee" strokeWidth="1.2" strokeDasharray="4 4" />}
                <text x={cx} y={y} fontSize="7" fill={on ? '#cbd5e1' : '#64748b'} textAnchor="middle" className={labelCls}>{name} {s.sol}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="tl-note">
        Stop dots are waypoint-record sols. This filters the recorded archive only - the walk plan is unchanged.
      </div>
    </div>
  );
}
