export default function TimeControl({ windowMin, dwellMin, paceKmh, setWindowMin, setDwellMin, setPaceKmh, onOverrun, onReset, overrunLeft }) {
  return (
    <div className="p-3 bg-[#101826] rounded border border-cyan-900">
      <h3 className="text-[11px] uppercase tracking-wider text-cyan-400 mb-2">Mission assumptions (editable, declared - not NASA standards)</h3>
      <div className="space-y-2 text-xs">
        <label className="flex items-center gap-2">EVA window
          <input type="range" min="0" max="480" step="10" value={windowMin} onChange={e => setWindowMin(+e.target.value)} className="flex-1 accent-cyan-400" />
          <span className="font-mono w-14 text-right">{windowMin} min</span>
        </label>
        <label className="flex items-center gap-2">Dwell/stop
          <input type="range" min="15" max="120" step="5" value={dwellMin} onChange={e => setDwellMin(+e.target.value)} className="flex-1 accent-cyan-400" />
          <span className="font-mono w-14 text-right">{dwellMin} min</span>
        </label>
        <label className="flex items-center gap-2">Pace
          <input type="range" min="0.5" max="2" step="0.1" value={paceKmh} onChange={e => setPaceKmh(+e.target.value)} className="flex-1 accent-cyan-400" />
          <span className="font-mono w-14 text-right">{paceKmh.toFixed(1)} km/h</span>
        </label>
      </div>
      <div className="mt-2 flex gap-2">
        <button onClick={onOverrun} disabled={!overrunLeft} className="px-3 py-1 bg-amber-600 hover:bg-amber-500 disabled:bg-gray-700 rounded text-xs font-bold">+60 min overrun at current stop</button>
        <button onClick={onReset} className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs">Reset plan</button>
      </div>
    </div>
  );
}
