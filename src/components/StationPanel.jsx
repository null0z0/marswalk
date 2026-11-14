export default function StationPanel({ stations, baseId = 'Depot', priorities, setPriority, mustHaves, toggleMustHave, droppedIds, coverageDropIds = [], visitedLegs, onRemoveWaypoint = null, onClose = null, appMode = 'planner' }) {
  const visitedIds = visitedLegs.map(l => l.to);
  const base = stations.find(s => s.id === baseId);
  const science = stations.filter(s => s.id !== baseId);

  return (
    <div className="space-y-2">
      {onClose && (
        <div className="flex items-center justify-between">
          <span className="eyebrow">{appMode === 'route' ? 'Real places in this area' : 'Stops & priorities'}</span>
          <button type="button" className="icon-button drawer-close" onClick={onClose} aria-label="Close objectives panel">✕</button>
        </div>
      )}
      {base && (
        <div key={base.id} className="p-2 rounded border border-gray-700 bg-[#0d1420]/50 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-bold text-gray-200">{base.name}</span>
            {appMode === 'planner' && <span className="text-gray-400 font-mono text-[9px]">'SCENARIO START'</span>}
          </div>
          <div className="text-gray-400">{base.unit}</div>
          {base.unitDescription && (
            <div className="text-gray-400 text-[10px] mt-0.5">
              {base.unitDescription} <a href="https://pubs.usgs.gov/sim/3464/sim3464.pdf" target="_blank" rel="noreferrer" className="underline text-cyan-400">map sheet</a>
            </div>
          )}
          <details className="mt-1">
            <summary className="cursor-pointer text-gray-500 text-[10px] select-none">objective, caveats{base.photo ? ', photo' : ''}</summary>
            <div className="mt-1 text-gray-300">{base.objective}</div>
            {(base.flags || []).map(f => <div key={f} className="text-amber-400 text-[10px]">⚠ {f}</div>)}
            {base.photo && (
              <>
                <img src={base.photo} alt={base.name} className="mt-1 rounded w-full" />
                <div className="text-[9px] text-gray-500 mt-1">{base.photoNote}</div>
              </>
            )}
          </details>
        </div>
      )}

      {science.map(s => {
        const dropped = droppedIds.includes(s.id);
        const covDropped = coverageDropIds.includes(s.id);
        const visited = visitedIds.includes(s.id);
        const unroutable = s.lat == null;
        if (s.custom) {
          // User waypoint card: coordinates only, no invented science content.
          return (
            <div key={s.id} className={`p-2 rounded border text-xs ${covDropped ? 'border-amber-500 bg-amber-950/20' : 'border-cyan-700 border-dashed'}`}>
              <div className="flex items-center justify-between">
                <span className="font-bold text-cyan-200">{s.name}</span>
                {!visited && (
                  <span className="flex items-center gap-1.5">
                    <span className="px-1 rounded bg-cyan-800 text-cyan-100 text-[9px] font-bold" title="Navigation point you placed: the route always goes through it, it never gets a science stop's dwell time, and it is never dropped by science priority. If the plan cannot fit it, the plan says so instead of dropping it.">ROUTE VIA - ALWAYS KEPT</span>
                    {onRemoveWaypoint && <button onClick={() => onRemoveWaypoint(s.id)} className="text-red-400 underline text-[10px]">delete</button>}
                  </span>)}
                {visited && <span className="text-green-400 font-mono text-[9px]">COMPLETED - SIMULATED EVA</span>}
              </div>
              <div className="text-gray-400 font-mono text-[10px]">lat {s.lat.toFixed(5)}, lon {s.lon.toFixed(5)} - drag on map to move</div>
              <div className="text-gray-500 text-[10px] mt-0.5">Your waypoint: coordinates only. No science objective, geology unit, photo or science dwell time is attached - none exists for an arbitrary point. If time runs short, science stops are deferred first; this point stays on the route.</div>
              {covDropped && <div className="text-amber-400 text-[10px] mt-0.5">Outside elevation coverage - no route can be computed to it.</div>}
            </div>
          );
        }
        return (
          <div key={s.id} className={`p-2 rounded border text-xs transition-all duration-500 ${dropped ? 'border-red-500 bg-red-950/30' : 'border-cyan-900'}`}>
            <div className="flex items-center justify-between">
              <span className={`font-bold ${dropped ? 'line-through text-red-400' : ''}`}>{s.name}</span>
              {dropped && <span className="px-1 rounded bg-red-600 text-white text-[9px] font-bold">LOST</span>}
              {unroutable && <span className="px-1 rounded bg-amber-700 text-white text-[9px] font-bold">POSITION UNAVAILABLE - NOT ROUTABLE</span>}
              {!unroutable && (visited
                ? <span className="text-green-400 font-mono text-[9px]">COMPLETED - SIMULATED EVA</span>
                : <span className="flex items-center gap-1">
                    {appMode === 'planner' && <label>Prio
                      <select className="bg-black border border-gray-700 rounded ml-1" value={priorities[s.id] || 3} onChange={e => setPriority(s.id, +e.target.value)}>
                        {Array.from({ length: Math.max(3, science.filter(x => !x.custom).length) }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </label>}
                    {appMode === 'planner' && <label className="flex items-center gap-1"><input type="checkbox" checked={mustHaves.includes(s.id)} onChange={() => toggleMustHave(s.id)} />must</label>}
                  </span>)}
            </div>
            <div className="text-gray-400">{s.unit}</div>
            {s.unitDescription && (
              <div className="text-gray-400 text-[10px] mt-0.5">
                {s.unitDescription} <a href="https://pubs.usgs.gov/sim/3464/sim3464.pdf" target="_blank" rel="noreferrer" className="underline text-cyan-400">map sheet</a>
              </div>
            )}
            <details key={dropped ? 'd' : 'k'} open className="mt-1">
              <summary className="cursor-pointer text-gray-500 text-[10px] select-none">objective, caveats{s.photo ? ', photo' : ''}{s.meda ? ', measured conditions' : ''}</summary>
              <div className={`mt-1 transition-all duration-500 ${dropped ? 'line-through' : ''}`}>
                {(() => { const [first, ...rest] = (s.objective || '').split(/(?<=\.)\s+/); return <><b className="text-gray-200">{first}</b>{rest.length ? ' ' + rest.join(' ') : ''}</>; })()}
              </div>
              {(s.flags || []).map(f => <div key={f} className="text-amber-400 text-[10px]">⚠ {f}</div>)}
              {dropped && <div className="text-red-400 font-bold mt-1">LOST this EVA - lowest-priority non-must-have. You will not see this:</div>}
              {s.photo && (
                <>
                  <img src={s.photo} alt={s.name} className={`mt-1 rounded w-full transition-all duration-700 ${dropped ? 'grayscale opacity-50' : ''}`} />
                  <div className="text-[9px] text-gray-500 mt-1">{s.photoNote}{s.src && <> <a href={s.src} target="_blank" rel="noreferrer" className="text-gray-500 underline break-all">source</a></>}</div>
                </>
              )}
              {s.meda && (
                <div className="text-[9px] text-gray-500 mt-1 border-t border-gray-800 pt-1">{s.meda} <a href="https://atmos.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/data_calibrated_env/" target="_blank" rel="noreferrer" className="text-gray-500 underline break-all">PDS MEDA archive</a></div>
              )}
            </details>
          </div>
        );
      })}
    </div>
  );
}
