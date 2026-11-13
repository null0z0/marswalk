import { BookIcon, PlayIcon, TargetIcon, OrbitIcon } from './Icons.jsx';

const PHASES = {
  nominal: { label: 'Nominal plan', className: 'phase-status--nominal' },
  progress: { label: 'In progress', className: 'phase-status--progress' },
  replanned: { label: 'Replanned', className: 'phase-status--replanned' },
  infeasible: { label: 'Infeasible', className: 'phase-status--infeasible' },
};

export default function MissionStatusBar({
  plan,
  windowMin,
  phase = 'nominal',
  nextStopName,
  visited = [],
  onOpenBrief,
  onOpenObjectives,
  onStartDemo,
}) {
  const total = plan.elapsed + plan.sim.total;
  const buffer = windowMin - total;
  const met = plan.visitedLegs.length + plan.kept.length;
  const lost = plan.dropped.length;
  const doneTrav = plan.visitedLegs.reduce((a, l) => a + (l.walkMin ?? l.metrics.minutes), 0);
  // Time spent at completed stops includes any logged overrun; keep that delay
  // separate from actual science dwell so the bar does not overstate science.
  const doneDelay = visited.reduce((a, v) => a + (v.overrunMin ?? 0), 0);
  const doneSci = Math.max(
    0,
    plan.visitedLegs.reduce((a, l) => a + l.dwellUsed, 0) - doneDelay
  );
  const planTrav = plan.sim.legs.reduce((a, l) => a + l.metrics.minutes, 0);
  const planSci = plan.sim.total - planTrav;
  const totalDist =
    plan.visitedLegs.reduce((a, l) => a + l.metrics.dist, 0) + plan.sim.dist;

  // The bar is scaled to the larger of the window and the plan so that an
  // over-budget plan never collapses or overflows its own scale.
  const scale = Math.max(windowMin, total, 1);
  const pct = (v) => `${Math.max(0, Math.min(100, (v / scale) * 100))}%`;
  const shortfall = Math.max(0, -buffer);
  const windowMark = `${Math.min(100, (windowMin / scale) * 100)}%`;
  const phaseStyle = PHASES[phase] || PHASES.nominal;

  const bufferClass =
    buffer < 0 ? 'metric--bad' : buffer < 60 ? 'metric--warn' : 'metric--good';
  const bufferLabel = buffer < 0 ? 'Shortfall' : 'Buffer';

  return (
    <header className="mission-header">
      <div className="brand-row">
        <div className="brand-lockup">
          <OrbitIcon size={34} />
          <div className="brand-copy">
            <div className="brand-title">MARSWALK</div>
          </div>
        </div>

        <span className={`phase-status ${phaseStyle.className}`} role="status">
          <span className="status-mark" aria-hidden="true" />
          {phaseStyle.label}
        </span>

        <div className="header-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm objectives-toggle"
            onClick={onOpenObjectives}
            aria-label="Open science objectives"
          >
            <TargetIcon />
            <span className="btn-label">Objectives</span>
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onOpenBrief}
            aria-label="Open mission brief"
          >
            <BookIcon />
            <span className="btn-label">Mission brief</span>
          </button>
        </div>
      </div>

      <div className="metrics-strip flex flex-wrap items-center">
        <span className="metric">
          <span className="metric-label">Budget</span>{' '}
          <span className="metric-value">
            {Math.round(windowMin)} <span className="metric-unit">min</span>
          </span>
        </span>
        <span className="metric">
          <span className="metric-label">Planned</span>{' '}
          <span className="metric-value">
            {Math.round(total)} <span className="metric-unit">min</span>
          </span>
        </span>
        <span className={`metric ${bufferClass}`}>
          <span className="metric-label">{bufferLabel}</span>{' '}
          <span className="metric-value">
            {Math.round(Math.abs(buffer))} <span className="metric-unit">min</span>
          </span>
        </span>
        <span className="metric metric--accent">
          <span className="metric-label">Route</span>{' '}
          <span className="metric-value">
            {(totalDist / 1000).toFixed(2)} km
            {plan.elapsed > 0 && (
              <span className="metric-unit"> ({(plan.sim.dist / 1000).toFixed(2)} left)</span>
            )}
          </span>
        </span>
        <span className="metric">
          <span className="metric-label">Objectives</span>{' '}
          <span className="metric-value">
            {met} <span className="metric-unit">kept</span>
            {lost > 0 && <span className="metric-unit"> / {lost} lost</span>}
          </span>
        </span>

        <div className="time-budget">
          <div
            className="timebar-track"
            role="img"
            aria-label={`Time budget: ${Math.round(windowMin)} minutes budget, ${Math.round(
              total
            )} minutes planned, ${buffer >= 0 ? `${Math.round(buffer)} minutes buffer` : `${shortfall} minutes short`}. Walked ${Math.round(
              doneTrav
            )} minutes, science complete ${Math.round(doneSci)} minutes${
              doneDelay > 0 ? `, ${Math.round(doneDelay)} minutes overrun` : ''
            }, walk remaining ${Math.round(planTrav)} minutes, science remaining ${Math.round(
              planSci
            )} minutes.`}
          >
            <div className="timebar-seg timebar-seg--done-walk" style={{ width: pct(doneTrav) }} />
            <div
              className="timebar-seg timebar-seg--done-science"
              style={{ width: pct(doneSci) }}
            />
            {doneDelay > 0 && (
              <div className="timebar-seg timebar-seg--delay" style={{ width: pct(doneDelay) }} />
            )}
            <div className="timebar-seg timebar-seg--plan-walk" style={{ width: pct(planTrav) }} />
            <div
              className="timebar-seg timebar-seg--plan-science"
              style={{ width: pct(planSci) }}
            />
            {buffer >= 0 && (
              <div className="timebar-seg timebar-seg--buffer" style={{ width: pct(buffer) }} />
            )}
            <span
              className="timebar-window-mark"
              style={{ left: windowMark }}
              aria-hidden="true"
            />
            {buffer < 0 && (
              <span
                className="timebar-overrun"
                style={{ left: windowMark, right: 0 }}
                aria-hidden="true"
              />
            )}
          </div>
          <div className="timebar-legend">
            <span>
              <i className="swatch timebar-seg--done-walk" aria-hidden="true" />
              walked {Math.round(doneTrav)} min
            </span>
            <span>
              <i className="swatch timebar-seg--done-science" aria-hidden="true" />
              science done {Math.round(doneSci)} min
            </span>
            {doneDelay > 0 && (
              <span className="timebar-legend--bad">
                <i className="swatch timebar-seg--delay" aria-hidden="true" />
                overrun {Math.round(doneDelay)} min
              </span>
            )}
            <span>
              <i className="swatch timebar-seg--plan-walk" aria-hidden="true" />
              walk left {Math.round(planTrav)} min
            </span>
            <span>
              <i className="swatch timebar-seg--plan-science" aria-hidden="true" />
              science left {Math.round(planSci)} min
            </span>
            <span className={buffer >= 0 ? '' : 'timebar-legend--bad'}>
              <i
                className={`swatch ${buffer >= 0 ? 'timebar-seg--buffer' : 'timebar-seg--shortfall'}`}
                aria-hidden="true"
              />
              {buffer >= 0
                ? `buffer ${Math.round(buffer)} min`
                : `shortfall ${Math.round(shortfall)} min`}
            </span>
          </div>
        </div>
      </div>

      <div className="mission-context">
        <p className="context-copy">
          <span className="context-long">
            <strong>Five-hour science EVA.</strong> Two real Perseverance sample sites at the
            Jezero delta front. When a stop overruns, the planner protects must-have science
            and shows exactly what is deferred — and why.
          </span>
          <span className="context-short">
            <strong>Adaptive science EVA.</strong> Overruns trigger a protected-science
            trade-off.
          </span>
        </p>
        <div className="context-actions">
          <span className="next-stop">
            <span className="next-stop-label">Next</span>
            <b>{nextStopName || 'Return to Base'}</b>
          </span>
          <button type="button" className="btn btn-primary btn-sm" onClick={onStartDemo}>
            <PlayIcon />
            Run 3-step demo
          </button>
        </div>
      </div>
    </header>
  );
}
