import { useEffect, useRef } from 'react';
import { PlayIcon, CloseIcon, OrbitSmallIcon } from './Icons.jsx';

const STEPS = [
  {
    n: '01',
    title: 'Initial plan',
    body: 'Two real Perseverance sample sites are ordered into the shortest traverse that fits the EVA window.',
  },
  {
    n: '02',
    title: 'Time overrun',
    body: 'A stop runs long. The crew has already spent the walk and dwell time — it cannot be undone.',
  },
  {
    n: '03',
    title: 'Automatic replan',
    body: 'The planner re-solves the remaining route and defers the lowest-priority, non-must-have objective.',
  },
];

export default function MissionBrief({ open, onClose, onStartDemo }) {
  const ref = useRef(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="brief-dialog"
      aria-labelledby="brief-title"
      onClose={onClose}
      onClick={(e) => {
        // Backdrop clicks: the dialog element itself is the backdrop target.
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="brief-hero">
        <div className="brief-kicker">
          <OrbitSmallIcon size={15} />
          Mission brief
        </div>
        <h2 id="brief-title" className="brief-title">
          Walk Jezero. Watch the plan make a science call.
        </h2>
        <p className="brief-lede">
          MARSWalk simulates a five-hour crewed science EVA at the Jezero delta front.
          The traverse is short — about <strong>0.79 km</strong> — but the clock is the
          real constraint. When a station overruns, the planner must protect must-have
          science and decide what gets deferred.
        </p>
      </div>

      <div className="brief-section">
        <div className="eyebrow">The demonstration</div>
        <div className="brief-steps">
          {STEPS.map((s) => (
            <div className="brief-step" key={s.n}>
              <span className="step-num">STEP {s.n}</span>
              <b>{s.title}</b>
              <p>{s.body}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="brief-section">
        <div className="eyebrow">What the evidence is</div>
        <div className="brief-data">
          <span className="chip chip--mars">NASA M20 waypoints</span>
          <span className="chip chip--cyan">USGS SIM 3464 geology</span>
          <span className="chip chip--cyan">20 m DTM</span>
          <span className="chip">Mastcam-Z photos</span>
          <span className="chip chip--amber">MEDA not modelled</span>
        </div>
        <p className="brief-lede" style={{ marginTop: 10, fontSize: '0.8125rem' }}>
          Station coordinates come from archived NASA rover drive records. Times and pace
          are declared scenario assumptions, not NASA standards. The habitat at Base is
          hypothetical; the depot location is real.
        </p>
      </div>

      <div className="brief-foot">
        <span className="brief-foot-note">
          You can reset the scenario at any time. Nothing here is a human-safety or
          walkability assessment.
        </span>
        <div className="brief-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            <CloseIcon />
            Close
          </button>
          <button type="button" className="btn btn-primary" onClick={onStartDemo}>
            <PlayIcon />
            Run 3-step demo
          </button>
        </div>
      </div>
    </dialog>
  );
}
