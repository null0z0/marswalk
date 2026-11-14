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
  const X = sol => 34 + (sol - range.lo) / Math.max(1, range.hi - range.lo) * 168;
  return (
    <section className="panel text-xs space-y-2">
      <div className="eyebrow">Rover record timeline</div>
      <div className="flex items-center gap-2">
        <input type="range" min={range.lo} max={range.hi} value={N}
          onChange={e => setSolLimit(+e.target.value >= range.hi ? null : +e.target.value)}
          className="flex-1 accent-cyan-400 cursor-pointer" />
        <span className="chip chip--cyan mono">sol {N}</span>
      </div>
      <svg viewBox="0 0 220 56" className="w-full mt-1">
        <line x1="30" y1="30" x2="206" y2="30" stroke="#164e63" strokeWidth="1.5" />
        <text x="30" y="52" fontSize="7" fill="#94a3b8">sol {range.lo}</text>
        <text x="206" y="52" fontSize="7" fill="#94a3b8" textAnchor="end">sol {range.hi}</text>
        <line x1={X(N)} y1="12" x2={X(N)} y2="44" stroke="#22d3ee" strokeWidth="1" />
        {(() => {
          // lane assignment: labels sorted by sol take the first of 4 lanes
          // (up-near, down-near, up-far, down-far) whose last label ended far
          // enough left to avoid overlap at ~7px font.
          const lanes = [-999, -999, -999, -999];
          const laneY = [14, 44, 6, 52];
          return [...pts].sort((a, b) => a.sol - b.sol).map((s) => {
            const x = X(s.sol);
            const on = s.sol <= N;
            const name = s.short || (s.id === 'Depot' || s.id === 'GaleBase' ? 'Base' : s.name.split(' ')[0]);
            const w = (name.length + String(s.sol).length + 1) * 4.2;
            let lane = lanes.findIndex(lastX => x - lastX > w + 6);
            if (lane === -1) lane = lanes.indexOf(Math.min(...lanes));
            lanes[lane] = x + w / 2;
            const y = laneY[lane];
            return (
              <g key={s.id} opacity={on ? 1 : 0.3}>
                <circle cx={x} cy="30" r="3" fill={on ? '#ffb02e' : '#64748b'} />
                {(lane >= 2) && <line x1={x} y1={y + (lane === 2 ? 3 : -8)} x2={x} y2="30" stroke="#475569" strokeWidth="0.5" />}
                <text x={x} y={y} fontSize="7" fill={on ? '#cbd5e1' : '#64748b'} textAnchor="middle">{name} {s.sol}</text>
              </g>
            );
          });
        })()}
      </svg>
      {solLimit != null && (
        <div className="text-xs pt-1">
          <button type="button" onClick={() => setSolLimit(null)} className="text-cyan-400 hover:text-cyan-300 underline">Reset (full archive)</button>
        </div>
      )}
      <details className="disclosure mt-1">
        <summary className="text-xs">What this filters</summary>
        <div className="disclosure-body text-xs text-slate-300 leading-normal">
          {range.kind === 'positions'
            ? `Archive sols ${range.lo}-${range.hi}: map shows recorded rover positions up to sol ${N} (${roverTrack.route.filter(p => p[2] <= N).length} of ${roverTrack.route.length} records). Sparse records connected by straight lines — the driven path between records is not in this dataset.`
            : `Archive sols ${range.lo}-${range.hi}: map shows recorded site stops reached by sol ${N}. Drive polylines in this archive carry no per-segment sol record; between stop records exact whereabouts are not in this dataset.`}
          {' '}Stop dots are waypoint-record sols. This filters the recorded archive only — walk plan is unchanged.
        </div>
      </details>
    </section>
  );
}
