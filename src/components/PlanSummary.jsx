import stations from '../data/stations.json';
const SHORT = Object.fromEntries(stations.map(x => [x.id, x.short || (x.id === 'Depot' ? 'Base' : x.name.split(' ')[0])]));
const nm = id => id === undefined ? '' : (SHORT[id] || id);

export default function PlanSummary({ plan, windowMin, dwellMin, paceKmh, dtmNote = 'elevation grid', planA = null, onPinA = null, onClearA = null, routeModel = 'straight' }) {
  const via = new Set(plan.viaIds || []);
  const routeLegs = plan.visitedLegs.concat(plan.sim.legs);
  const routeKm = routeLegs.reduce((a, l) => a + l.metrics.dist, 0) / 1000;
  const routeAsc = routeLegs.reduce((a, l) => a + l.metrics.asc, 0);
  const total = plan.elapsed + plan.sim.total;
  const fits = total <= windowMin;
  let clock = 0;

  return (
    <section className="panel text-xs space-y-2.5">
      <div className="eyebrow">Mission plan summary</div>

      {plan.baseUnsamplable && (
        <div className="p-2.5 bg-red-950/40 border border-red-500/50 rounded-lg text-red-200 text-xs">
          <b>Start point is outside elevation coverage.</b> No route can be computed — select a start point inside the coverage frame. Nothing was silently altered.
        </div>
      )}
      {(plan.coverageDrops || []).length > 0 && (
        <div className="p-2.5 bg-amber-950/40 border border-amber-500/50 rounded-lg text-amber-200 text-xs">
          <b>Cannot compute route to: {plan.coverageDrops.map(d => d.name).join(', ')}</b> — outside elevation coverage. Removed with explicit rationale.
        </div>
      )}
      {(plan.unsamplable || []).length > 0 && !plan.baseUnsamplable && !(plan.coverageDrops || []).length && (
        <div className="p-2.5 bg-red-950/40 border border-red-500/50 rounded-lg text-red-200 text-xs">
          <b>Route cannot be computed</b> — leg(s) {plan.unsamplable.map(u => `${nm(u.from)} → ${nm(u.to)}`).join(', ')} leave elevation coverage or cross missing data.
        </div>
      )}

      <div className={`p-2.5 rounded-lg font-mono text-xs flex items-center justify-between border ${fits ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300' : 'bg-rose-950/40 border-rose-500/50 text-rose-300'}`}>
        <span>Total: <b>{isFinite(total) ? Math.round(total) : '—'}</b> / {Math.round(windowMin)} min</span>
        <span className="font-bold uppercase tracking-wider">{fits ? 'FITS BUDGET' : 'EXCEEDS BUDGET'}</span>
      </div>

      <div className="plan-table-wrap overflow-x-auto">
        <table className="plan-table min-w-[320px]">
          <thead>
            <tr>
              <th>Leg</th>
              <th className="num">Dist</th>
              <th className="num">Walk</th>
              <th className="num">Dwell</th>
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {plan.visitedLegs.map((l, i) => {
              clock += l.walkMin + l.dwellUsed;
              return (
                <tr key={'v' + i}>
                  <td>
                    <span className="leg-status">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 inline-block" />
                      <span>{nm(l.from)} → {nm(l.to)}</span>
                    </span>
                  </td>
                  <td className="num">{l.metrics.dist.toFixed(0)} m</td>
                  <td className="num">{l.walkMin.toFixed(0)}m</td>
                  <td className="num">{l.dwellUsed.toFixed(0)}m</td>
                  <td className="num font-semibold">{(l.walkMin + l.dwellUsed).toFixed(0)}m</td>
                </tr>
              );
            })}
            {plan.sim.legs.map((l, i) => {
              const dwellPart = (l.to === (plan.baseId || 'Depot') || l.via || via.has(l.to)) ? 0 : dwellMin;
              clock += l.metrics.minutes + dwellPart;
              return (
                <tr key={'s' + i}>
                  <td>
                    <span className="leg-status">
                      <span className="w-2 h-2 rounded-full bg-cyan-400 shrink-0 inline-block" />
                      <span>{nm(l.from)} → {nm(l.to)}{(l.via || via.has(l.to)) ? <span className="text-slate-400"> (via)</span> : null}</span>
                    </span>
                  </td>
                  <td className="num">{l.metrics.dist.toFixed(0)} m</td>
                  <td className="num">{l.metrics.minutes.toFixed(0)}m</td>
                  <td className="num">{dwellPart}m</td>
                  <td className="num font-semibold">{(l.metrics.minutes + dwellPart).toFixed(0)}m</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between pt-1 font-mono text-xs">
        <span className="text-slate-300">Total: <b>{isFinite(total) ? Math.round(total) : '—'}</b> / {Math.round(windowMin)} min</span>
        <span className={`status-tag ${fits ? 'status-tag--nominal' : 'status-tag--bad'}`}>
          {fits ? 'Fits budget' : 'Exceeds budget'}
        </span>
      </div>

      {plan.roundTrip === false && (
        <div className="text-xs text-amber-300 font-mono">
          One-way plan: ends at last stop; no return leg counted.
        </div>
      )}

      {plan.dropped.length > 0 && (
        <div className="text-rose-400 text-xs space-y-1">
          <div>Deferred ({plan.dropped[0].reason}): <b>{plan.dropped.map(d => d.name).join(', ')}</b></div>
          <div className="text-slate-400 text-xs">
            vs full plan: {Math.max(0, plan.savedDist).toFixed(0)} m and {Math.max(0, plan.savedAsc).toFixed(0)} m ascent saved.
          </div>
        </div>
      )}

      {plan.infeasible && isFinite(plan.sim.total) && (
        <div className="text-rose-400 font-bold text-xs">
          Infeasible: must-have stations exceed the remaining window by {Math.round(plan.shortfall)} min. Increase the window or change assumptions.
        </div>
      )}

      {onPinA && (
        <div className="pt-2 border-t border-cyan-900/40">
          {!planA ? (
            <button type="button" onClick={onPinA} className="btn btn-primary min-h-[44px] w-full font-bold">
              Pin as Plan A (compare)
            </button>
          ) : (
            <div className="text-xs font-mono space-y-1 bg-[#070d18]/60 p-2 rounded-lg border border-cyan-900/50">
              <div className="flex items-center justify-between">
                <span className="text-cyan-400 font-bold uppercase tracking-wider">A/B Compare</span>
                <button type="button" onClick={onClearA} className="text-slate-400 hover:text-white underline text-xs">clear A</button>
              </div>
              <div>A: {Math.round(planA.total)} min, {planA.km.toFixed(2)} km, +{Math.round(planA.asc)} m ascent, {planA.kept} objectives kept{planA.dropped.length ? ` (${planA.dropped.join(', ')} deferred)` : ''}</div>
              <div>B (current): {Math.round(total)} min, {routeKm.toFixed(2)} km, +{Math.round(routeAsc)} m ascent, {plan.visitedLegs.filter(l => !via.has(l.to)).length + (plan.scienceKept ?? plan.kept.length)} objectives kept{plan.dropped.length ? ` (${plan.dropped.map(d => SHORT[d.id] || d.name).join(', ')} deferred)` : ''}</div>
              <div className={total <= planA.total ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                {total === planA.total ? 'Same total duration' : `Plan B is ${Math.abs(Math.round(total - planA.total))} min ${total < planA.total ? 'faster' : 'slower'} than A`}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="text-xs text-slate-400 leading-normal">
        Times: declared {paceKmh.toFixed(1)} km/h on {routeModel === 'leastcost' ? 'least-cost path geometry (slope-aware model over elevation grid)' : 'horizontal straight-line distance'}; heights from {dtmNote}. Not a human-safety claim.
      </div>
    </section>
  );
}
