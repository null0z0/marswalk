export default function TimeControl({ windowMin, dwellMin, paceKmh, setWindowMin, setDwellMin, setPaceKmh, onOverrun, onUndoOverrun, onReset, overrunLeft, overrunApplied }) {
  return (
    <section className="panel text-xs space-y-2.5">
      <div className="eyebrow">Mission time control</div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={overrunApplied ? onUndoOverrun : onOverrun}
          disabled={!overrunApplied && !overrunLeft}
          className={`btn flex-1 min-w-[150px] btn-sm font-bold ${overrunApplied ? 'btn-primary' : 'btn-delay'}`}
        >
          {overrunApplied ? '↶ Undo +60 min overrun' : '⏱ +60 min overrun at stop'}
        </button>
        <button
          type="button"
          onClick={onReset}
          className="btn btn-secondary btn-sm"
        >
          Reset plan
        </button>
      </div>

      <details className="disclosure mt-2" defaultOpen>
        <summary className="text-xs">Assumptions (window, dwell, pace)</summary>
        <div className="disclosure-body space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-slate-300 font-medium">Window limit</span>
              <span className="chip chip--cyan mono">{windowMin} min</span>
            </div>
            <input
              type="range"
              min="0"
              max="480"
              step="10"
              value={windowMin}
              onChange={e => setWindowMin(+e.target.value)}
              className="w-full accent-cyan-400 cursor-pointer"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-slate-300 font-medium">Dwell / stop</span>
              <span className="chip chip--amber mono">{dwellMin} min</span>
            </div>
            <input
              type="range"
              min="60"
              max="120"
              step="5"
              value={dwellMin}
              onChange={e => setDwellMin(Math.max(60, +e.target.value))}
              className="w-full accent-cyan-400 cursor-pointer"
            />
            <p className="text-slate-400 text-xs mt-1 leading-normal">
              60 min is the declared scenario minimum dwell; cannot be shortened (scenario assumption, not a NASA standard).
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-slate-300 font-medium">Walking pace</span>
              <span className="chip chip--green mono">{paceKmh.toFixed(1)} km/h</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              value={paceKmh}
              onChange={e => setPaceKmh(+e.target.value)}
              className="w-full accent-cyan-400 cursor-pointer"
            />
          </div>
        </div>
      </details>

      <div className="text-slate-400 text-xs leading-normal">
        Environmental conditions (MEDA dust, temperature, wind) are not modelled in this planner.
      </div>
    </section>
  );
}
