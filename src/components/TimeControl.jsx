import { AlertIcon, CheckIcon, ClockIcon, ResetIcon, UndoIcon } from './Icons.jsx';

export default function TimeControl({
  windowMin,
  dwellMin,
  paceKmh,
  setWindowMin,
  setDwellMin,
  setPaceKmh,
  onAdvance,
  onOverrun,
  onUndo,
  onResetProgress,
  onResetScenario,
  currentStopName,
  nextStopName,
  canUndo,
  infeasible,
  shortfall,
}) {
  const hasNext = Boolean(nextStopName);

  return (
    <section className="panel control-panel" aria-labelledby="controls-heading">
      <div className="panel-head">
        <div>
          <div className="eyebrow">
            <ClockIcon />
            Mission control
          </div>
          <h2 id="controls-heading" className="panel-title">
            Execution
          </h2>
          <p className="panel-sub">Advance the EVA or introduce a delay at the next station.</p>
        </div>
        <span className={`status-tag ${hasNext ? 'status-tag--info' : 'status-tag--ok'}`}>
          {hasNext ? 'Active' : 'Complete'}
        </span>
      </div>

      <div className="panel-body">
        <div className="control-state">
          <div className="state-cell">
            <span className="eyebrow">At</span>
            <b title={currentStopName}>{currentStopName}</b>
          </div>
          <div className="state-cell">
            <span className="eyebrow">Next</span>
            <b title={nextStopName || 'Return to Base'}>{nextStopName || 'Return to Base'}</b>
          </div>
        </div>

        <div className="action-grid">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onAdvance}
            disabled={!hasNext}
          >
            <CheckIcon />
            Complete stop
          </button>
          <button
            type="button"
            className="btn btn-delay"
            onClick={onOverrun}
            disabled={!hasNext}
          >
            <AlertIcon />
            +60 min delay
          </button>
        </div>

        <div className="action-row">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onUndo}
            disabled={!canUndo}
          >
            <UndoIcon />
            Undo step
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onResetProgress}
            disabled={!canUndo}
          >
            <ResetIcon />
            Reset progress
          </button>
        </div>

        {infeasible && (
          <div className="control-alert" role="alert">
            <AlertIcon />
            <span>
              Must-have objectives exceed the remaining window by{' '}
              <b>{Math.round(shortfall)} min</b>. Increase the window or change assumptions.
            </span>
          </div>
        )}

        <details className="disclosure assumption-list">
          <summary>Scenario assumptions</summary>
          <div className="disclosure-body">
            <div className="assumption-row">
              <label htmlFor="window-range">Window</label>
              <input
                id="window-range"
                type="range"
                min="0"
                max="480"
                step="10"
                value={windowMin}
                onChange={(e) => setWindowMin(+e.target.value)}
                aria-label="EVA window in minutes"
              />
              <output htmlFor="window-range">{windowMin} min</output>
            </div>
            <div className="assumption-row">
              <label htmlFor="dwell-range">Dwell</label>
              <input
                id="dwell-range"
                type="range"
                min="15"
                max="120"
                step="5"
                value={dwellMin}
                onChange={(e) => setDwellMin(+e.target.value)}
                aria-label="Dwell time per stop in minutes"
              />
              <output htmlFor="dwell-range">{dwellMin} min</output>
            </div>
            <div className="assumption-row">
              <label htmlFor="pace-range">Pace</label>
              <input
                id="pace-range"
                type="range"
                min="0.5"
                max="2"
                step="0.1"
                value={paceKmh}
                onChange={(e) => setPaceKmh(+e.target.value)}
                aria-label="Walking pace in kilometres per hour"
              />
              <output htmlFor="pace-range">{paceKmh.toFixed(1)} km/h</output>
            </div>
            <div className="mt-2 flex justify-end">
              <button type="button" className="btn btn-ghost btn-sm" onClick={onResetScenario}>
                <ResetIcon />
                Reset scenario
              </button>
            </div>
          </div>
        </details>

        <p className="note">
          <AlertIcon size={13} />
          Environmental conditions (MEDA dust, temperature, wind) are not modelled in this
          planner. Timings are declared assumptions, not NASA standards.
        </p>
      </div>
    </section>
  );
}
