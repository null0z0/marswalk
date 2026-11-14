import { useEffect, useRef, useState } from 'react';
import { ArrowRightIcon, OrbitSmallIcon } from './Icons.jsx';

const STEPS = [
  {
    n: '01',
    title: 'Pick region, stops and clock',
    body: 'Choose a mission area, set priorities and must-haves, add your own waypoints by map click or coordinates, and set the time window.',
    short: 'Choose area, set priorities, add waypoints, and set the time window.',
  },
  {
    n: '02',
    title: 'Every route is computed at runtime',
    body: 'Distances, climbs and walk times are computed at runtime from the real elevation grid for the exact route you built - not from a fixed script.',
    short: 'Distances and climbs computed at runtime from the real elevation grid.',
  },
  {
    n: '03',
    title: 'Overruns force an explained trade-off',
    body: 'When a stop runs long or the window is too small, the planner defers the lowest-priority non-must-have science and shows what was lost, what was saved, and why. Your waypoints are navigation: they are never silently dropped and never invent science.',
    short: 'Overruns defer lowest-priority non-must-haves with clear rationale.',
  },
];

export default function MissionBrief({ open, onClose }) {
  const ref = useRef(null);
  const [dontShowAgain, setDontShowAgain] = useState(
    typeof window !== 'undefined' && localStorage.getItem('marswalk-dont-show-brief') === 'true'
  );

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const handleDontShowChange = (checked) => {
    setDontShowAgain(checked);
    if (checked) {
      try { localStorage.setItem('marswalk-dont-show-brief', 'true'); } catch {}
    } else {
      try { localStorage.removeItem('marswalk-dont-show-brief'); } catch {}
    }
  };

  return (
    <dialog
      ref={ref}
      className="brief-dialog"
      aria-labelledby="brief-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="brief-content-scroll">
        <div className="brief-hero">
          <div className="brief-kicker">
            <OrbitSmallIcon size={15} />
            Mission brief
          </div>
          <h2 id="brief-title" className="brief-title">
            Real Mars places. Compare a computed route between any two of them.
          </h2>
          <p className="brief-lede">
            Every point in MARSWalk is a real, sourced place at the Jezero delta front
            or Gale crater's Yellowknife Bay. <strong>Pick any two and compare the
            computed route between them</strong> - as a straight-line baseline or a slope-aware
            least-cost path, both computed at runtime from the actual elevation grid.
            Then go further: plan a full science day against the clock, compare plan A
            against plan B, log a delay, and watch the planner re-solve the day with the
            reason for every decision on screen.
          </p>
        </div>

        <div className="brief-section">
          <div className="eyebrow">How it works</div>
          <div className="brief-steps">
            {STEPS.map((s) => (
              <div className="brief-step" key={s.n}>
                <span className="step-num">STEP {s.n}</span>
                <b>{s.title}</b>
                <p className="brief-step-full">{s.body}</p>
                <p className="brief-step-short">{s.short}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="brief-section">
          <div className="eyebrow">What the evidence is</div>
          <div className="brief-data">
            <span className="chip chip--mars">NASA M20 / MSL waypoint records</span>
            <span className="chip chip--cyan">USGS SIM 3464 geology</span>
            <span className="chip chip--cyan">USGS elevation grids (20 m / 2 m)</span>
            <span className="chip">Mastcam-Z / Mastcam photos</span>
            <span className="chip chip--amber">Environment (dust, wind) not modelled</span>
          </div>
          <p className="brief-lede" style={{ marginTop: 10, fontSize: '0.8125rem' }}>
            Station coordinates come from archived NASA rover drive records; routes stay
            inside the published elevation coverage and outside points are rejected, never
            guessed. Times and pace are declared scenario assumptions, not NASA standards.
            Recorded rover tracks are history, not a road and not a safety rating.
          </p>
        </div>
      </div>

      <div className="brief-foot">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full">
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer min-h-[44px]">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => handleDontShowChange(e.target.checked)}
              className="accent-cyan-400 w-4 h-4 cursor-pointer"
            />
            <span>Don't show this brief again</span>
          </label>
          <div className="brief-actions">
            <button type="button" className="btn btn-primary min-h-[44px] px-5" onClick={onClose}>
              <span>Start planning</span>
              <ArrowRightIcon size={16} />
            </button>
          </div>
        </div>
        <div className="brief-foot-note text-xs text-slate-400 mt-2">
          Reset the plan at any time. Nothing here is a human-safety or walkability assessment.
        </div>
      </div>
    </dialog>
  );
}
