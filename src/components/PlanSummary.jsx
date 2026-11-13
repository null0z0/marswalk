export default function PlanSummary({ plan, windowMin, dwellMin, paceKmh }) {
  const total = plan.elapsed + plan.sim.total;
  const fits = total <= windowMin;
  const nm = id => id === 'Depot' ? 'Base' : id;
  const objTotal = plan.visitedLegs.length + plan.kept.length + plan.dropped.length;
  let clock = 0;
  return (
    <div className="p-3 bg-[#101826] rounded border border-cyan-900 text-xs">
      <h3 className="text-[11px] uppercase tracking-wider text-cyan-400 mb-1">Plan</h3>
      {plan.dropped.length > 0 && (
        <div className="mb-2 p-2 bg-[#0d1420] border border-cyan-400 rounded">
          <div className="font-bold text-cyan-300">MISSION DECISION: {plan.dropped.map(d => d.name).join(', ')} deferred</div>
          <div>{plan.visitedLegs.length + plan.kept.length} of {objTotal} objectives retained</div>
          <div>Lost: {plan.dropped.map(d => d.objective).join('; ')}</div>
          <div className="mt-1">Dropping {plan.dropped.map(d => d.name).join(', ')} saves <b>{Math.max(0, Math.round(plan.full.total - plan.sim.total))} min</b> ({Math.round(plan.elapsed + plan.full.total)} min with every objective vs {Math.round(plan.elapsed + plan.sim.total)} min now).</div>
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
            const dwellPart = l.to === 'Depot' ? 0 : dwellMin;
            clock += l.metrics.minutes + dwellPart;
            return <tr key={'s' + i}><td className="whitespace-nowrap">{nm(l.from)} → {nm(l.to)}</td><td className="text-right px-2">{l.metrics.dist.toFixed(0)}m</td><td className="text-right px-2">+{l.metrics.asc.toFixed(0)}m</td><td className="text-right pl-3 whitespace-nowrap"><div>{(l.metrics.minutes + dwellPart).toFixed(0)} min</div><div className="text-gray-500 text-[9px]">(end {Math.round(clock)})</div></td></tr>;
          })}
        </tbody>
      </table>
      <div className="mt-1 font-mono">Total <b>{Math.round(total)}</b> / {Math.round(windowMin)} min {fits ? <span className="text-green-400 font-bold">FITS</span> : <span className="text-red-400 font-bold">DOES NOT FIT</span>}</div>
      {plan.dropped.length > 0 && (
        <div className="mt-1 text-red-400">
          Deferred ({plan.dropped[0].reason}): <b>{plan.dropped.map(d => d.name).join(', ')}</b> - objective lost this EVA: <i>{plan.dropped.map(d => d.objective).join('; ')}</i>
          <div className="text-gray-400">vs full plan: {Math.max(0, plan.savedDist).toFixed(0)} m and {Math.max(0, plan.savedAsc).toFixed(0)} m ascent not walked; deferred objectives could be a later sol.</div>
        </div>
      )}
      {plan.infeasible && <div className="mt-1 text-red-400 font-bold">INFEASIBLE: must-have stations exceed the remaining window by {Math.round(plan.shortfall)} min. Increase the window or change assumptions - no station was silently dropped.</div>}
      <div className="mt-1 text-[9px] text-gray-500">Times: declared {paceKmh.toFixed(1)} km/h on straight-segment terrain-following distance from the 20m DTM grid (nearest-cell samples every 10m; not a surveyed path; 20m is grid spacing, not a vertical-accuracy guarantee; no human-safety or walkability claim).</div>
    </div>
  );
}
