export default function MissionStatusBar({ plan, windowMin, scenarioLabel }) {
  const total = plan.elapsed + plan.sim.total;
  const buffer = windowMin - total;
  const met = plan.visitedLegs.length + plan.kept.length;
  const lost = plan.dropped.length;
  const doneTrav = plan.visitedLegs.reduce((a, l) => a + (l.walkMin ?? l.metrics.minutes), 0);
  const doneSci = plan.visitedLegs.reduce((a, l) => a + l.dwellUsed, 0);
  const planTrav = plan.sim.legs.reduce((a, l) => a + l.metrics.minutes, 0);
  const planSci = plan.sim.total - planTrav;
  const totalDist = plan.visitedLegs.reduce((a, l) => a + l.metrics.dist, 0) + plan.sim.dist;
  const pct = v => `${Math.max(0, Math.min(100, (v / windowMin) * 100))}%`;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 bg-[#0d1420] border-b border-cyan-900 text-[10px] md:text-xs font-mono">
      <span className="text-cyan-300 font-bold tracking-wide">MARSWalk Planner - {scenarioLabel || 'Jezero Delta Front'}</span>
      <span>Budget <b>{Math.round(windowMin)} min</b></span>
      <span>Planned <b>{Math.round(total)} min</b></span>
      <span className={buffer < 0 ? 'text-red-400' : buffer < 60 ? 'text-amber-400' : 'text-green-400'}>
        Buffer <b>{Math.round(buffer)} min</b>
      </span>
      <span>Route <b>{(totalDist / 1000).toFixed(2)} km</b>{plan.elapsed > 0 && <span className="text-gray-400"> ({(plan.sim.dist / 1000).toFixed(2)} left)</span>}</span>
      <span>Objectives <b>{met} kept{lost ? ` / ${lost} lost` : ''}</b></span>
      <div className="w-full md:w-auto md:flex-1 min-w-[200px]">
        <div className="h-2 bg-gray-800 rounded overflow-hidden flex" title={`done walk ${Math.round(doneTrav)} min, done science ${Math.round(doneSci)} min, planned walk ${Math.round(planTrav)} min, planned science ${Math.round(planSci)} min, buffer ${Math.round(buffer)} min`}>
          <div className="bg-slate-500" style={{ width: pct(doneTrav) }} />
          <div className="bg-emerald-500" style={{ width: pct(doneSci) }} />
          <div className="bg-cyan-700" style={{ width: pct(planTrav) }} />
          <div className="bg-cyan-400" style={{ width: pct(planSci) }} />
          {buffer >= 0
            ? <div className="bg-green-800" style={{ width: pct(buffer) }} />
            : <div className="bg-red-500" style={{ width: pct(-buffer) }} />}
        </div>
        <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-gray-400" style={{ fontSize: '10px' }}>
          <span><span className="inline-block w-2 h-2 bg-slate-500 rounded-sm" /> walked {Math.round(doneTrav)} min</span>
          <span><span className="inline-block w-2 h-2 bg-emerald-500 rounded-sm" /> science done {Math.round(doneSci)} min</span>
          <span><span className="inline-block w-2 h-2 bg-cyan-700 rounded-sm" /> walk left {Math.round(planTrav)} min</span>
          <span><span className="inline-block w-2 h-2 bg-cyan-400 rounded-sm" /> science left {Math.round(planSci)} min</span>
          <span><span className={`inline-block w-2 h-2 rounded-sm ${buffer >= 0 ? 'bg-green-800' : 'bg-red-500'}`} /> {buffer >= 0 ? `buffer ${Math.round(buffer)} min` : `shortfall ${Math.round(-buffer)} min`}</span>
        </div>
      </div>
    </div>
  );
}
