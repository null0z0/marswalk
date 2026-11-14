export default function StationPanel({ stations, baseId = 'Depot', priorities, setPriority, mustHaves, toggleMustHave, droppedIds, coverageDropIds = [], visitedLegs, onRemoveWaypoint = null, onClose = null, appMode = 'planner' }) {
  const visitedIds = visitedLegs.map(l => l.to);
  const base = stations.find(s => s.id === baseId);
  const science = stations.filter(s => s.id !== baseId);

  const statusFor = (s) => {
    if (visitedIds.includes(s.id)) return { kind: 'completed', label: 'COMPLETED' };
    if (droppedIds.includes(s.id)) return { kind: 'dropped', label: 'LOST' };
    if (coverageDropIds.includes(s.id)) return { kind: 'coverage', label: 'OUTSIDE COVERAGE' };
    if (s.lat == null) return { kind: 'unroutable', label: 'POSITION UNAVAILABLE' };
    return { kind: 'available', label: 'AVAILABLE' };
  };

  return (
    <div className="space-y-2">
      {onClose && (
        <div className="flex items-center justify-between">
          <span className="eyebrow">{appMode === 'route' ? 'Real places in this area' : 'Stops & priorities'}</span>
          <button type="button" className="icon-button drawer-close" onClick={onClose} aria-label="Close objectives panel">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="m18 6 6 12M6 6l12 12"/></svg>
          </button>
        </div>
      )}
      {base && (
        <div key={base.id} className="place-card place-card--base">
          <div className="place-head">
            <div className="place-name-wrap">
              <div className={`place-name ${base.id === 'Depot' || base.id === 'GaleBase' ? 'place-name--selected' : ''}`}>{base.name}</div>
              {appMode === 'planner' && <span className="place-status place-status--available" title="Scenario start / base marker">{base.id === 'Depot' || base.id === 'GaleBase' ? 'BASE' : 'BASE'}</span>}
            </div>
            <div className="place-actions">
              <button type="button" className="place-locate" title="Locate on map" aria-label={`Locate ${base.name} on map`}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2l0.01 0.01L12 22M22 12l0.01 0.01L2 12"/></svg>
                Locate
              </button>
            </div>
          </div>
          {base.unit && <div className="place-unit">{base.unit} <a href="https://pubs.usgs.gov/sim/3464/sim3464.pdf" target="_blank" rel="noreferrer" className="underline text-cyan-400">map sheet</a></div>}
          <div className="place-body">{base.objective}</div>
          <div className="place-tags">
            {base.sol != null && <span className="place-tag place-tag--sol">sol {base.sol}</span>}
            {base.region && <span className="place-tag place-tag--geo">{base.region}</span>}
          </div>
          {(base.flags || []).length > 0 && (
            <details className="place-disclosure" open>
              <summary>Scientific caveats &amp; source</summary>
              <div className="place-disclosure-body">
                {(base.flags || []).map((f, i) => (
                  <div key={i} className="flag" aria-label="flag">⚠ {f}</div>
                ))}
                {base.src && <div className="mt-2 source-link" aria-label="source">Source: <a href={base.src} target="_blank" rel="noreferrer" className="underline text-cyan-400">open record</a></div>}
                {base.meda && <div className="mt-2 text-[9px] text-gray-500">{base.meda}</div>}
              </div>
            </details>
          )}
          {base.photo && (
            <div className="place-media" role="img" aria-label={base.name}>
              <img src={base.photo} alt={base.name} />
              <div className="place-media-tag" style={{ position: 'absolute' }}>{base.photoId ? base.photoId : 'NASA raw image'}</div>
            </div>
          )}
        </div>
      )}

      {science.map(s => {
        const status = statusFor(s);
        const selected = status.kind === 'available';
        const isCustom = s.custom;
        return (
          <div key={s.id} className={`place-card ${status.kind === 'dropped' ? 'place-card--deferred' : ''} ${selected ? 'place-card--selected' : ''}`}>
            <div className="place-head">
              <div className="place-name-wrap">
                <div className={`place-name ${status.kind === 'dropped' ? '' : 'place-name--selected'}`}>{s.name}</div>
                <span className={`place-status place-status--${status.kind}`} title={status.kind === 'available' ? 'Not yet visited on this EVA' : status.label}>{status.label}</span>
              </div>
              <div className="place-actions">
                {isCustom && onRemoveWaypoint && <button type="button" onClick={() => onRemoveWaypoint(s.id)} className="place-locate" title="Delete waypoint" aria-label={`Delete waypoint ${s.name}`} style={{ padding: 0, minWidth: 'unset' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 6l18 18M21 6l-18 18"/></svg>
                </button>}
              </div>
            </div>
            {isCustom && (
              <div className="place-unit">Your waypoint: coordinates only. No science objective, geology unit, photo or science dwell time is attached - none exists for an arbitrary point.</div>
            )}
            {!isCustom && s.unit && (
              <div className="place-unit">{s.unit} <a href="https://pubs.usgs.gov/sim/3464/sim3464.pdf" target="_blank" rel="noreferrer" className="underline text-cyan-400">map sheet</a></div>
            )}
            {!isCustom && (
              <div className={`place-body ${status.kind === 'dropped' ? 'place-body--collapsed' : ''}`}>
                {(() => { const [first, ...rest] = (s.objective || '').split(/(?<=\.)\s+/); return <><b className="text-gray-200">{first}</b>{rest.length ? ' ' + rest.join(' ') : ''}</>; })()}
              </div>
            )}
            <div className="place-tags">
              {!isCustom && s.sol != null && <span className="place-tag place-tag--sol">sol {s.sol}</span>}
              {!isCustom && s.region && <span className="place-tag place-tag--geo">{s.region}</span>}
              {isCustom && <span className="place-tag place-tag--geo">route via</span>}
              {!isCustom && status.kind === 'dropped' && <span className="place-tag place-tag--geo" style={{ color: '#fca5a5', borderColor: 'rgba(248, 113, 113, 0.3)', background: 'rgba(248, 113, 113, 0.04)' }}>deferred</span>}
            </div>
            {!isCustom && (
              <>
                <details className="place-disclosure">
                  <summary>Objective, caveats &amp; source{s.photo ? ', photo' : ''}{s.meda ? ', measured conditions' : ''}</summary>
                  <div className="place-disclosure-body">
                    <div className="mt-1">{(() => { const [first, ...rest] = (s.objective || '').split(/(?<=\.)\s+/); return <><b className="text-gray-200">{first}</b>{rest.length ? ' ' + rest.join(' ') : ''}</>; })()}</div>
                    {(s.flags || []).map((f, i) => (
                      <div key={i} className="flag" aria-label="flag">⚠ {f}</div>
                    ))}
                    {status.kind === 'dropped' && <div className="mt-1 text-red-400 font-bold">LOST this EVA - lowest-priority non-must-have.</div>}
                    {s.src && <div className="mt-2 source-link" aria-label="source">Source: <a href={s.src} target="_blank" rel="noreferrer" className="underline text-cyan-400">open record</a></div>}
                    {s.meda && <div className="mt-2 text-[9px] text-gray-500">{s.meda} <a href="https://atmos.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/data_calibrated_env/" target="_blank" rel="noreferrer" className="text-gray-500 underline break-all">PDS MEDA archive</a></div>}
                  </div>
                </details>
                {s.photo && (
                  <>
                    <div className="place-media" role="img" aria-label={s.name}>
                      <img src={s.photo} alt={s.name} className={status.kind === 'dropped' ? 'grayscale opacity-60' : ''} />
                      <div className="place-media-tag">{s.photoId ? s.photoId : 'NASA raw image'}</div>
                    </div>
                    <div className="text-[9px] text-gray-500 mt-1">{s.photoNote}</div>
                    {s.src && <div className="text-[9px] text-gray-500 mt-1 source-link" aria-label="source"><a href={s.src} target="_blank" rel="noreferrer" className="underline text-cyan-400">source</a></div>}
                  </>
                )}
              </>
            )}
            <div className="place-actions-bar">
              <button type="button" className="place-locate" title="Locate on map" aria-label={`Locate ${s.name} on map`} disabled={status.kind !== 'available'}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2l0.01 0.01L12 22M22 12l0.01 0.01L2 12"/></svg>
                {status.kind === 'available' ? 'Locate on map' : 'Cannot locate'}
              </button>
              {!isCustom && appMode === 'planner' && (
                <div className="flex items-center gap-1">
                  <label className="flex items-center gap-1 text-[9px] text-gray-500">Prio
                    <select className="bg-[#0a0e17] border border-gray-700 rounded px-1 py-0.5 text-[9px] font-mono" value={priorities[s.id] || 3} onChange={e => setPriority(s.id, +e.target.value)}>
                      {Array.from({ length: Math.max(3, science.filter(x => !x.custom).length) }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                  <label className="flex items-center gap-1 text-[9px] text-gray-500">
                    <input type="checkbox" checked={mustHaves.includes(s.id)} onChange={() => toggleMustHave(s.id)} className="mt-0.5" /> must
                  </label>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
