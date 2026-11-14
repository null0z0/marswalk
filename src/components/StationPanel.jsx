export default function StationPanel({ stations, baseId = 'Depot', priorities, setPriority, mustHaves, toggleMustHave, droppedIds, coverageDropIds = [], visitedLegs, onRemoveWaypoint = null, onClose = null, appMode = 'planner' }) {
  const visitedIds = visitedLegs.map(l => l.to);
  const base = stations.find(s => s.id === baseId);
  const science = stations.filter(s => s.id !== baseId);

  return (
    <div className="space-y-3">
      {onClose && (
        <div className="flex items-center justify-between">
          <span className="eyebrow">{appMode === 'route' ? 'Real places in this area' : 'Stops & priorities'}</span>
          <button type="button" className="icon-button drawer-close" onClick={onClose} aria-label="Close objectives panel">✕</button>
        </div>
      )}

      {appMode === 'planner' && (
        <div className="p-2.5 rounded-lg bg-[#070d18]/70 border border-cyan-900/40 text-xs text-slate-300 space-y-1">
          <div><strong className="text-cyan-400">Scenario assumption:</strong> 60 min dwell per science stop.</div>
          <div className="text-slate-400"><strong>Order = shortest route.</strong> Priority only decides what gets dropped if time runs short.</div>
        </div>
      )}

      {base && (
        <div key={base.id} className="station-card">
          <div className="station-head">
            <span className="station-index">0</span>
            <div className="station-heading">
              <div className="flex items-center justify-between gap-2">
                <span className="station-name">{base.name}</span>
                {appMode === 'planner' && <span className="chip chip--cyan">Scenario start</span>}
              </div>
              {base.unit && <div className="station-unit">{base.unit}</div>}
              {base.lat != null && base.lon != null && (
                <div className="font-mono text-xs text-slate-400 mt-0.5">
                  lat {base.lat.toFixed(5)}, lon {base.lon.toFixed(5)}
                </div>
              )}
            </div>
          </div>

          {(base.flagsShort || base.flags || []).filter(Boolean).map(f => (
            <div key={f} className="flag mx-3 my-1">
              <span>⚠</span>
              <span>{f}</span>
            </div>
          ))}

          <div className="station-details">
            <details className="disclosure mt-2">
              <summary className="text-xs">Objective, caveats{base.photo ? ', photo' : ''}</summary>
              <div className="disclosure-body space-y-2">
                {base.objective && (
                  <div className="text-slate-200 text-xs leading-relaxed">{base.objective}</div>
                )}
                {base.unitDescription && (
                  <div className="text-slate-400 text-xs">
                    {base.unitDescription}{' '}
                    <a href="https://pubs.usgs.gov/sim/3464/sim3464.pdf" target="_blank" rel="noreferrer" className="underline text-cyan-400">USGS SIM 3464 map sheet</a>
                  </div>
                )}
                {(base.flags || []).map(f => (
                  <div key={f} className="flag">
                    <span>⚠</span>
                    <span>{f}</span>
                  </div>
                ))}
                {base.photo && (
                  <div>
                    <div className="station-media rounded-lg mt-1">
                      <img src={base.photo} alt={base.name} />
                      {base.sol != null && <span className="station-media-tag">Sol {base.sol}</span>}
                    </div>
                    {base.photoNote && <div className="text-xs text-slate-400 mt-1">{base.photoNote}</div>}
                  </div>
                )}
              </div>
            </details>
          </div>
        </div>
      )}

      {science.map((s, idx) => {
        const dropped = droppedIds.includes(s.id);
        const covDropped = coverageDropIds.includes(s.id);
        const visited = visitedIds.includes(s.id);
        const unroutable = s.lat == null;

        if (s.custom) {
          // User waypoint card: coordinates only, no invented science content.
          return (
            <div key={s.id} className={`station-card p-3 ${covDropped ? 'border-amber-500 bg-amber-950/20' : 'border-cyan-500/40 border-dashed'}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="station-name text-cyan-200">{s.name}</span>
                {!visited && (
                  <div className="flex items-center gap-2">
                    <span className="chip chip--cyan" title="Navigation point: the route always goes through it.">Route via · Always kept</span>
                    {onRemoveWaypoint && (
                      <button type="button" onClick={() => onRemoveWaypoint(s.id)} className="text-red-400 hover:text-red-300 underline text-xs">
                        delete
                      </button>
                    )}
                  </div>
                )}
                {visited && <span className="chip chip--green">Completed</span>}
              </div>
              <div className="text-slate-400 font-mono text-xs mt-1">
                lat {s.lat.toFixed(5)}, lon {s.lon.toFixed(5)} — drag on map to adjust
              </div>
              <div className="text-slate-400 text-xs mt-1 leading-relaxed">
                Navigation waypoint: coordinates only. No science objective or dwell time attached. Stays on route if time runs short.
              </div>
              {covDropped && (
                <div className="text-amber-400 text-xs mt-1 font-semibold">
                  Outside elevation coverage — no route can be computed.
                </div>
              )}
            </div>
          );
        }

        const cardCls = dropped
          ? 'station-card station-card--deferred'
          : visited
          ? 'station-card station-card--completed'
          : 'station-card';

        return (
          <div key={s.id} className={cardCls}>
            <div className="station-head">
              <span className="station-index">{idx + 1}</span>
              <div className="station-heading">
                <div className="flex items-center justify-between gap-2">
                  <span className={`station-name ${dropped ? 'line-through text-red-300' : ''}`}>{s.name}</span>
                  {dropped && <span className="chip chip--red">Deferred</span>}
                  {unroutable && <span className="chip chip--amber">Position unavailable</span>}
                  {!unroutable && (visited
                    ? <span className="chip chip--green">Completed</span>
                    : (
                      <div className="flex items-center gap-2">
                        {appMode === 'planner' && (
                          <label className="flex items-center gap-1 text-slate-300 text-xs">
                            Prio
                            <select
                              aria-label={`Priority for ${s.name}`}
                              className="station-select text-xs ml-1"
                              value={priorities[s.id] || 3}
                              onChange={e => setPriority(s.id, +e.target.value)}
                            >
                              {Array.from({ length: Math.max(3, science.filter(x => !x.custom).length) }, (_, i) => i + 1).map(n => (
                                <option key={n} value={n}>{n}</option>
                              ))}
                            </select>
                          </label>
                        )}
                        {appMode === 'planner' && (
                          <label className="flex items-center gap-1.5 cursor-pointer text-slate-300 text-xs">
                            <input
                              type="checkbox"
                              checked={mustHaves.includes(s.id)}
                              onChange={() => toggleMustHave(s.id)}
                              className="accent-cyan-400"
                            />
                            must
                          </label>
                        )}
                      </div>
                    )
                  )}
                </div>
                {s.unit && <div className="station-unit">{s.unit}</div>}
              </div>
            </div>

            {dropped && (
              <div className="station-deferred-note px-3 py-1">
                Deferred this EVA (lowest-priority non-must-have to meet time window).
              </div>
            )}

            <div className="station-details">
              <details key={dropped ? 'd' : 'k'} className="disclosure mt-1.5">
                <summary className="text-xs cursor-pointer py-1.5">
                  Details, caveats{s.photo ? ', photo' : ''}
                </summary>
                <div className="disclosure-body space-y-2 pt-2">
                  {s.objective && (
                    <div className={`station-objective ${dropped ? 'line-through' : ''}`}>
                      {s.objective}
                    </div>
                  )}
                  {(s.flagsShort || s.flags || []).filter(Boolean).map(f => (
                    <div key={f} className="flag my-0.5">
                      <span>⚠</span>
                      <span>{f}</span>
                    </div>
                  ))}
                  {s.unitDescription && (
                    <div className="text-slate-400 text-xs">
                      {s.unitDescription}{' '}
                      <a href="https://pubs.usgs.gov/sim/3464/sim3464.pdf" target="_blank" rel="noreferrer" className="underline text-cyan-400">USGS SIM 3464 map sheet</a>
                    </div>
                  )}
                  {s.photo && (
                    <div>
                      <div className="station-media rounded-lg mt-1">
                        <img src={s.photo} alt={s.name} className={dropped ? 'grayscale opacity-60' : ''} />
                        {s.sol != null && <span className="station-media-tag">Sol {s.sol}</span>}
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        {s.photoNote}
                        {s.src && (
                          <> <a href={s.src} target="_blank" rel="noreferrer" className="text-cyan-400 underline break-all">source</a></>
                        )}
                      </div>
                    </div>
                  )}
                  {s.meda && (
                    <div className="text-xs text-slate-400 pt-1 border-t border-slate-800">
                      {s.meda}{' '}
                      <a href="https://atmos.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/data_calibrated_env/" target="_blank" rel="noreferrer" className="text-cyan-400 underline break-all">PDS MEDA archive</a>
                    </div>
                  )}
                </div>
              </details>
            </div>
          </div>
        );
      })}
    </div>
  );
}
