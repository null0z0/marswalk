import { AlertIcon, TargetIcon } from './Icons.jsx';

export default function PlanSummary({ plan, windowMin, dwellMin, paceKmh, visited = [] }) {
  const total = plan.elapsed + plan.sim.total;
  const fits = total <= windowMin;
  const nm = (id) => (id === 'Depot' ? 'Base' : id);
  const objTotal = plan.visitedLegs.length + plan.kept.length + plan.dropped.length;
  const savedMin = Math.max(0, Math.round(plan.full.total - plan.sim.total));
  let clock = 0;

  return (
    <section className="panel plan-panel" aria-labelledby="plan-heading">
      <div className="panel-head">
        <div>
          <div className="eyebrow">
            <TargetIcon />
            Mission plan
          </div>
          <h2 id="plan-heading" className="panel-title">
            Traverse manifest
          </h2>
          <p className="panel-sub">
            {plan.visitedLegs.length + plan.kept.length} of {objTotal} objectives retained ·
            shortest-time ordering
          </p>
        </div>
        <span className={`status-tag ${fits ? 'status-tag--ok' : 'status-tag--bad'}`}>
          {fits ? 'Fits' : 'Over budget'}
        </span>
      </div>

      <div className="panel-body">
        <div className="plan-table-wrap">
          <table className="plan-table">
            <caption className="sr-only">
              Planned traverse legs with distance, ascent and elapsed time
            </caption>
            <thead>
              <tr>
                <th scope="col">Leg</th>
                <th scope="col">Dist</th>
                <th scope="col">Asc</th>
                <th scope="col">Time</th>
              </tr>
            </thead>
            <tbody>
              {plan.visitedLegs.map((l, i) => {
                const overrunMin = visited[i]?.overrunMin ?? 0;
                clock += l.walkMin + l.dwellUsed;
                return (
                  <tr key={`v${i}`}>
                    <td>
                      <span className="leg-status leg-status--done" aria-hidden="true" />
                      {nm(l.from)} → {nm(l.to)}
                    </td>
                    <td className="num">{l.metrics.dist.toFixed(0)}m</td>
                    <td className="num">+{l.metrics.asc.toFixed(0)}m</td>
                    <td className="num">
                      {(l.walkMin + l.dwellUsed).toFixed(0)} min
                      <span className="row-sub">
                        done @ {l.paceUsed.toFixed(1)} km/h
                        {overrunMin > 0 ? ` · +${Math.round(overrunMin)} min overrun` : ''}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {plan.sim.legs.map((l, i) => {
                const dwellPart = l.to === 'Depot' ? 0 : dwellMin;
                clock += l.metrics.minutes + dwellPart;
                const isReturn = l.to === 'Depot';
                return (
                  <tr key={`s${i}`}>
                    <td>
                      <span
                        className={`leg-status ${isReturn ? 'leg-status--return' : 'leg-status--planned'}`}
                        aria-hidden="true"
                      />
                      {nm(l.from)} → {nm(l.to)}
                    </td>
                    <td className="num">{l.metrics.dist.toFixed(0)}m</td>
                    <td className="num">+{l.metrics.asc.toFixed(0)}m</td>
                    <td className="num">
                      {(l.metrics.minutes + dwellPart).toFixed(0)} min
                      <span className="row-sub">end {Math.round(clock)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="plan-total">
          <span>
            Total <b>{Math.round(total)}</b> / {Math.round(windowMin)} min
          </span>
          <span className={`plan-fits ${fits ? 'plan-fits--yes' : 'plan-fits--no'}`}>
            {fits ? 'FITS' : 'DOES NOT FIT'}
          </span>
        </div>

        {plan.dropped.length > 0 && (
          <p className="plan-footnote">
            <strong>Deferred:</strong> {plan.dropped.map((d) => d.name).join(', ')} —{' '}
            {plan.dropped[0].reason}. Recovers <strong>{savedMin} min</strong> and avoids{' '}
            <strong>{Math.max(0, plan.savedDist).toFixed(0)} m</strong> /{' '}
            <strong>{Math.max(0, plan.savedAsc).toFixed(0)} m</strong> ascent. The objective can
            be revisited on a later sol.
          </p>
        )}

        {plan.infeasible && (
          <div className="control-alert" role="alert">
            <AlertIcon />
            <span>
              <b>Infeasible:</b> must-have stations exceed the remaining window by{' '}
              {Math.round(plan.shortfall)} min. No station was silently dropped. Increase the
              window or change assumptions.
            </span>
          </div>
        )}

        <details className="disclosure mt-2">
          <summary>Geometry &amp; assumptions</summary>
          <div className="disclosure-body">
            <p>
              Times use the declared {paceKmh.toFixed(1)} km/h pace on horizontal straight-line
              distance between waypoints (geometric, waypoint-derived). Heights and ascent come
              from the 20 m DTM (nearest-cell samples every 10 m along each straight segment;
              not a surveyed path; 20 m is grid spacing, not a vertical-accuracy guarantee).
            </p>
            <p>
              Geometry only — this is not a human-safety or walkability assessment. Dwell of{' '}
              {dwellMin} min per kept stop is a declared scenario assumption.
            </p>
          </div>
        </details>
      </div>
    </section>
  );
}
