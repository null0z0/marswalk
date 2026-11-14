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
  const objTotal = plan.visitedLegs.filter(l => !via.has(l.to)).length + (plan.scienceKept ?? plan.kept.length) + plan.dropped.length;
  let clock = 0;
  return (
    <div className="p-3 bg-[#101826] rounded border border-cyan-900 text-xs">
      <h3 className="text-[11px] uppercase tracking-wider text-cyan-400 mb-1">Plan</h3>
      {plan.baseUnsamplable && (
        <div className="mb-2 p-2 bg-red-950/40 border border-red-500 rounded text-red-300">
          <b>Start point is outside the elevation coverage.</b> No route can be computed from it - pick a start inside the coverage frame. Nothing was planned or shortened silently.
        </div>
      )}
      {(plan.coverageDrops || []).length > 0 && (
        <div className="mb-2 p-2 bg-amber-950/40 border border-amber-500 rounded text-amber-300">
          <b>Cannot compute a route to: {plan.coverageDrops.map(d => d.name).join(', ')}</b> - outside the elevation coverage. Removed from this plan with this explicit reason (not a time/priority drop). Move or delete the waypoint to re-plan.
        </div>
      )}
      {(plan.unsamplable || []).length > 0 && !plan.baseUnsamplable && !(plan.coverageDrops || []).length && (
        <div className="mb-2 p-2 bg-red-950/40 border border-red-500 rounded text-red-300">
          <b>Route cannot be computed</b> - leg(s) {plan.unsamplable.map(u => `${nm(u.from)} → ${nm(u.to)}`).join(', ')} leave the elevation coverage or cross missing data. The plan is infeasible; no shortened route was substituted.
        </div>
      )}
      <table className="w-full font-mono text-[10px]">
        <thead><tr className="text-gray-500"><th className="text-left pr-2">Leg</th><th className="px-2">Dist</th><th className="px-2">Asc</th><th className="pl-3">Time</th></tr></thead>
        <tbody>
          {plan.visitedLegs.map((l, i) => {
            clock += l.walkMin + l.dwellUsed;
            return <tr key={'v' + i}><td className="whitespace-nowrap">{nm(l.from)} → {nm(l.to)}</td><td className="text-right px-2">{l.metrics.dist.toFixed(0)}m</td><td className="text-right px-2">+{l.metrics.asc.toFixed(0)}m</td><td className="text-right pl-3 whitespace-nowrap"><div>{(l.walkMin + l.dwellUsed).toFixed(0)} min</div><div className="text-gray-500 text-[9px]">(done @ {l.paceUsed.toFixed(1)})</div></td></tr>;
          })}
          {plan.sim.legs.map((l, i) => {
            const dwellPart = (l.to === (plan.baseId || 'Depot') || l.via || via.has(l.to)) ? 0 : dwellMin;
            clock += l.metrics.minutes + dwellPart;
            return <tr key={'s' + i}><td className="whitespace-nowrap">{nm(l.from)} → {nm(l.to)}{(l.via || via.has(l.to)) ? <span className="text-gray-500"> (via)</span> : null}</td><td className="text-right px-2">{l.metrics.dist.toFixed(0)}m</td><td className="text-right px-2">+{l.metrics.asc.toFixed(0)}m</td><td className="text-right pl-3 whitespace-nowrap"><div>{(l.metrics.minutes + dwellPart).toFixed(0)} min</div><div className="text-gray-500 text-[9px]">(end {Math.round(clock)})</div></td></tr>;
          })}
        </tbody>
      </table>
      <div className="mt-1 font-mono">Total <b>{isFinite(total) ? Math.round(total) : '—'}</b> / {Math.round(windowMin)} min {fits ? <span className="text-green-400 font-bold">FITS</span> : <span className="text-red-400 font-bold">DOES NOT FIT</span>}</div>
      {plan.roundTrip === false && <div className="mt-0.5 text-[10px] text-amber-300 font-mono">One-way plan: ends at the last stop; no return leg counted.</div>}
      {plan.dropped.length > 0 && (
        <div className="mt-1 text-red-400">
          Deferred ({plan.dropped[0].reason}): <b>{plan.dropped.map(d => d.name).join(', ')}</b> - objective lost this EVA: <i>{plan.dropped.map(d => d.objective).join('; ')}</i>
          <div className="text-gray-400">vs full plan: {Math.max(0, plan.savedDist).toFixed(0)} m and {Math.max(0, plan.savedAsc).toFixed(0)} m ascent not walked; deferred objectives could be a later sol.</div>
        </div>
      )}
      {plan.infeasible && isFinite(plan.sim.total) && <div className="mt-1 text-red-400 font-bold">INFEASIBLE: must-have stations exceed the remaining window by {Math.round(plan.shortfall)} min. Increase the window or change assumptions - no station was silently dropped.</div>}
      {onPinA && (
        <div className="mt-2 pt-1 border-t border-cyan-900">
          {!planA ? (
            <button onClick={onPinA} className="px-2 py-0.5 bg-[#0d1420] border border-cyan-900 rounded text-cyan-300 text-[10px]">Pin as Plan A (compare)</button>
          ) : (
            <div className="text-[10px] font-mono">
              <div className="flex items-center justify-between">
                <span className="text-cyan-400 font-bold">A/B compare</span>
                <button onClick={onClearA} className="text-gray-500 underline">clear A</button>
              </div>
              <div>A: {Math.round(planA.total)} min, {planA.km.toFixed(2)} km, +{Math.round(planA.asc)} m ascent, {planA.kept} objectives kept{planA.dropped.length ? ` (${planA.dropped.join(', ')} deferred)` : ''}</div>
              <div>B (current): {Math.round(total)} min, {routeKm.toFixed(2)} km, +{Math.round(routeAsc)} m ascent, {plan.visitedLegs.filter(l => !via.has(l.to)).length + (plan.scienceKept ?? plan.kept.length)} objectives kept{plan.dropped.length ? ` (${plan.dropped.map(d => SHORT[d.id] || d.name).join(', ')} deferred)` : ''}</div>
              <div className={total <= planA.total ? 'text-green-400' : 'text-amber-400'}>
                {total === planA.total ? 'Same total time' : `B is ${Math.abs(Math.round(total - planA.total))} min ${total < planA.total ? 'faster' : 'slower'} than A`}
              </div>
            </div>
          )}
        </div>
      )}
      <div className="mt-1 text-[9px] text-gray-500">Times: declared {paceKmh.toFixed(1)} km/h on {routeModel === 'leastcost' ? 'the least-cost path geometry (slope-aware model over the elevation grid)' : 'horizontal straight-line distance between waypoints (geometric, waypoint-derived)'}; heights and ascent from the {dtmNote}; grid spacing is not a vertical-accuracy guarantee; geometry only - no human-safety or walkability claim.</div>
    </div>
  );
}
