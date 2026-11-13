import { AlertIcon, BookIcon, UndoIcon } from './Icons.jsx';

function totalDistance(plan) {
  return plan.visitedLegs.reduce((a, l) => a + l.metrics.dist, 0) + plan.sim.dist;
}

export default function MissionDecision({
  plan,
  windowMin,
  canUndo,
  onUndo,
  onOpenBrief,
}) {
  const dropped = plan.dropped;
  const infeasible = plan.infeasible;
  if (!infeasible && dropped.length === 0) return null;

  const lostNames = dropped.map((d) => d.name).join(', ');
  const savedMin = Math.max(0, Math.round(plan.full.total - plan.sim.total));
  const kept = plan.visitedLegs.length + plan.kept.length;
  const objectives = kept + dropped.length;
  const total = plan.elapsed + plan.sim.total;

  return (
    <section
      className={`decision-banner${infeasible ? ' decision-banner--infeasible' : ''}`}
      aria-live="polite"
      aria-label={infeasible ? 'Plan infeasible' : 'Automatic replanning decision'}
    >
      <span className="decision-icon" aria-hidden="true">
        <AlertIcon size={19} />
      </span>

      <div className="decision-copy">
        {infeasible ? (
          <>
            <div className="eyebrow">Decision required</div>
            <h2 className="decision-title">
              Must-have science cannot fit
              <em>no station silently dropped</em>
            </h2>
            <p className="decision-reason">
              The must-have objectives exceed the remaining window by{' '}
              <strong>{Math.round(plan.shortfall)} min</strong>. Increase the window or change
              the assumptions — the planner will not trade away protected science.
            </p>
          </>
        ) : (
          <>
            <div className="eyebrow">Automatic replanning · decision applied</div>
            <h2 className="decision-title">
              {lostNames} deferred
              <em>lowest-priority non-must-have</em>
            </h2>
            <p className="decision-reason">
              Dropping this objective brings the remaining traverse back inside the{' '}
              {Math.round(windowMin)} min window. Completed work is frozen; the rest of the
              route is re-ordered around what can still be reached.
            </p>
            <p className="decision-lost">
              <strong>Science lost this EVA:</strong> {lostNames}. It can be revisited on a
              later sol.
            </p>
          </>
        )}
      </div>

      <div className="decision-metrics">
        {infeasible ? (
          <>
            <div className="decision-metric">
              <span className="eyebrow">Shortfall</span>
              <b>{Math.round(plan.shortfall)} min</b>
            </div>
            <div className="decision-metric">
              <span className="eyebrow">Window</span>
              <b>{Math.round(windowMin)} min</b>
            </div>
            <div className="decision-metric">
              <span className="eyebrow">Plan</span>
              <b>{Math.round(total)} min</b>
            </div>
          </>
        ) : (
          <>
            <div className="decision-metric">
              <span className="eyebrow">Time recovered</span>
              <b>{savedMin} min</b>
            </div>
            <div className="decision-metric">
              <span className="eyebrow">Distance cut</span>
              <b>{Math.round(plan.savedDist)} m</b>
            </div>
            <div className="decision-metric">
              <span className="eyebrow">Ascent avoided</span>
              <b>{Math.round(plan.savedAsc)} m</b>
            </div>
            <div className="decision-metric">
              <span className="eyebrow">Kept</span>
              <b>
                {kept} / {objectives}
              </b>
            </div>
          </>
        )}
      </div>

      <div className="decision-actions">
        {canUndo && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={onUndo}>
            <UndoIcon />
            Undo step
          </button>
        )}
        <button type="button" className="btn btn-ghost btn-sm" onClick={onOpenBrief}>
          <BookIcon />
          Brief
        </button>
      </div>
    </section>
  );
}
