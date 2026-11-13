export default function StationPanel({ stations, priorities, setPriority, mustHaves, toggleMustHave, droppedIds, visitedLegs }) {
  const visitedIds = visitedLegs.map(l => l.to);
  const base = stations.find(s => s.id === 'Depot');
  const science = stations.filter(s => s.id !== 'Depot');

  return (
    <div className="space-y-2">
      {base && (
        <div key={base.id} className="p-2 rounded border border-gray-700 bg-[#0d1420]/50 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-bold text-gray-200">{base.name}</span>
            <span className="text-gray-400 font-mono text-[9px]">BASE HABITAT</span>
          </div>
          <div className="text-gray-400">{base.unit}</div>
          {base.unitDescription && (
            <div className="text-gray-400 text-[10px] mt-0.5">
              {base.unitDescription} <a href="https://pubs.usgs.gov/sim/3464/sim3464.pdf" target="_blank" rel="noreferrer" className="underline text-cyan-400">map sheet</a>
            </div>
          )}
          <details className="mt-1">
            <summary className="cursor-pointer text-gray-500 text-[10px] select-none">objective, caveats, photo</summary>
            <div className="mt-1 text-gray-300">{base.objective}</div>
            {base.flags.map(f => <div key={f} className="text-amber-400 text-[10px]">⚠ {f}</div>)}
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
        const visited = visitedIds.includes(s.id);
        const unroutable = s.lat == null;
        return (
          <div key={s.id} className={`p-2 rounded border text-xs transition-all duration-500 ${dropped ? 'border-red-500 bg-red-950/30' : 'border-cyan-900'}`}>
            <div className="flex items-center justify-between">
              <span className={`font-bold ${dropped ? 'line-through text-red-400' : ''}`}>{s.name}</span>
              {dropped && <span className="px-1 rounded bg-red-600 text-white text-[9px] font-bold">LOST</span>}
              {unroutable && <span className="px-1 rounded bg-amber-700 text-white text-[9px] font-bold">POSITION UNAVAILABLE - NOT ROUTABLE</span>}
              {!unroutable && (visited
                ? <span className="text-green-400 font-mono text-[9px]">COMPLETED - SIMULATED EVA</span>
                : <span className="flex items-center gap-1">
                    <label>Prio
                      <select className="bg-black border border-gray-700 rounded ml-1" value={priorities[s.id] || 3} onChange={e => setPriority(s.id, +e.target.value)}>
                        {[1, 2, 3].map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </label>
                    <label className="flex items-center gap-1"><input type="checkbox" checked={mustHaves.includes(s.id)} onChange={() => toggleMustHave(s.id)} />must</label>
                  </span>)}
            </div>
            <div className="text-gray-400">{s.unit}</div>
            {s.unitDescription && (
              <div className="text-gray-400 text-[10px] mt-0.5">
                {s.unitDescription} <a href="https://pubs.usgs.gov/sim/3464/sim3464.pdf" target="_blank" rel="noreferrer" className="underline text-cyan-400">map sheet</a>
              </div>
            )}
            <details key={dropped ? 'd' : 'k'} open className="mt-1">
              <summary className="cursor-pointer text-gray-500 text-[10px] select-none">objective, caveats, photo</summary>
              <div className={`mt-1 transition-all duration-500 ${dropped ? 'line-through' : ''}`}>
                {(() => { const [first, ...rest] = s.objective.split(/(?<=\.)\s+/); return <><b className="text-gray-200">{first}</b>{rest.length ? ' ' + rest.join(' ') : ''}</>; })()}
              </div>
              {s.flags.map(f => <div key={f} className="text-amber-400 text-[10px]">⚠ {f}</div>)}
              {dropped && <div className="text-red-400 font-bold mt-1">LOST this EVA - lowest-priority non-must-have. You will not see this:</div>}
              {s.photo && (
                <>
                  <img src={s.photo} alt={s.name} className={`mt-1 rounded w-full transition-all duration-700 ${dropped ? 'grayscale opacity-50' : ''}`} />
                  <div className="text-[9px] text-gray-500 mt-1">{s.photoNote}{s.src && <> <a href={s.src} target="_blank" rel="noreferrer" className="text-gray-500 underline break-all">source</a></>}</div>
                </>
              )}
            </details>
          </div>
        );
      })}
    </div>
  );
}
