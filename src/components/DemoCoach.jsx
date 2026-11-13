import { AlertIcon, CheckIcon, CloseIcon, PlayIcon } from './Icons.jsx';

const STEPS = [
  {
    title: 'Read the plan',
    body: 'This is a conservative 200-minute window. Both objectives fit, with a 33-minute buffer. The time bar up top is the whole mission at a glance.',
    cta: 'Next: log an overrun',
  },
  {
    title: 'Trigger a 60-minute overrun',
    body: 'A stop runs long. The walk and dwell time already spent is frozen — the planner now has to work with a much smaller remaining budget.',
    cta: 'Apply +60 min delay',
  },
  {
    title: 'Read the decision',
    body: 'The planner protected the higher-priority objective and deferred the other. The banner shows exactly what was saved and what science was lost.',
    cta: 'Finish demo',
  },
];

export default function DemoCoach({
  step,
  nextStopName,
  canOverrun,
  onNext,
  onApplyOverrun,
  onClose,
}) {
  const current = STEPS[step] ?? STEPS[0];
  const isLast = step >= STEPS.length - 1;
  const isOverrunStep = step === 1;
  const disabled = isOverrunStep && !canOverrun;

  return (
    <aside className="demo-coach" role="dialog" aria-label="Guided demonstration">
      <div className="demo-coach-body">
        <div className="demo-coach-head">
          <div>
            <div className="eyebrow demo-eyebrow">
              Guided demo · step {step + 1} of {STEPS.length}
            </div>
            <h3>{current.title}</h3>
          </div>
          <button
            type="button"
            className="icon-button demo-close"
            onClick={onClose}
            aria-label="Close guided demo"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="demo-steps" aria-hidden="true">
          {STEPS.map((s, i) => (
            <span key={s.title} className={i <= step ? 'is-on' : ''} />
          ))}
        </div>

        <p>
          {current.body}
          {isOverrunStep && canOverrun ? (
            <>
              {' '}
              Next stop: <strong>{nextStopName}</strong>.
            </>
          ) : null}
        </p>

        {isLast && planLostHint()}
      </div>

      <div className="demo-coach-actions">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={isOverrunStep ? onApplyOverrun : onNext}
          disabled={disabled}
        >
          {isOverrunStep ? <AlertIcon /> : isLast ? <CheckIcon /> : <PlayIcon />}
          {current.cta}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={isLast ? onClose : onNext}>
          {isLast ? 'Close' : 'Skip'}
        </button>
      </div>
    </aside>
  );
}

function planLostHint() {
  return (
    <p className="demo-coach-tip">
      Tip: use <strong>Undo step</strong> to try a different call, or{' '}
      <strong>Reset scenario</strong> to return to the default five-hour window.
    </p>
  );
}
