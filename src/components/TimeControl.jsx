export default function TimeControl({ windowMin, dwellMin, paceKmh, setWindowMin, setDwellMin, setPaceKmh, onOverrun, onUndoOverrun, onReset, overrunLeft, overrunApplied }) {
  return (
    <div className="p-3 bg-[#101826] rounded border border-cyan-900">
      <div className="flex gap-2">
        <button onClick={overrunApplied ? onUndoOverrun : onOverrun} disabled={!overrunApplied && !overrunLeft}
          className={`w-[215px] px-2 py-1 rounded text-[11px] font-bold whitespace-nowrap ${overrunApplied ? 'bg-green-700 hover:bg-green-600' : 'bg-amber-600 hover:bg-amber-500'} disabled:bg-gray-700`}>
          {overrunApplied ? '+60 applied - undo' : '+60 min overrun at current stop'}
        </button>
        <button onClick={onReset} className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs">Reset plan</button>
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer text-gray-500 text-[10px] select-none">Assumptions (window, dwell, pace)</summary>
        <div className="mt-1 space-y-1">
          <label className="flex items-center gap-2">Window
            <input type="range" min="0" max="480" step="10" value={windowMin} onChange={e => setWindowMin(+e.target.value)} className="flex-1 accent-cyan-400" />
            <span className="font-mono w-14 text-right">{windowMin} min</span>
          </label>
          <label className="flex items-center gap-2">Dwell/stop
            <input type="range" min="60" max="120" step="5" value={dwellMin} onChange={e => setDwellMin(Math.max(60, +e.target.value))} className="flex-1 accent-cyan-400" />
            <span className="font-mono w-14 text-right">{dwellMin} min</span>
          </label>
          <div className="text-[9px] text-gray-500">60 min is the declared scenario minimum dwell; cannot be shortened (scenario assumption, not a NASA standard).</div>
          <label className="flex items-center gap-2">Pace
            <input type="range" min="0.5" max="2" step="0.1" value={paceKmh} onChange={e => setPaceKmh(+e.target.value)} className="flex-1 accent-cyan-400" />
            <span className="font-mono w-14 text-right">{paceKmh.toFixed(1)} km/h</span>
          </label>
        </div>
      </details>
      <div className="mt-2 text-[9px] text-gray-500">Environmental conditions (MEDA dust, temperature, wind) are not modelled in this planner.</div>
    </div>
  );
}
