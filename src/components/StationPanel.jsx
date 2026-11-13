import { AlertIcon, CheckIcon, CloseIcon, TargetIcon } from './Icons.jsx';

function statusFor(station, dropped, visited, next) {
  if (dropped) return { key: 'deferred', label: 'Deferred', chip: 'chip--red' };
  if (visited) return { key: 'completed', label: 'Completed', chip: 'chip--green' };
  if (next) return { key: 'next', label: 'Next', chip: 'chip--cyan' };
  return { key: 'planned', label: 'Planned', chip: '' };
}

export default function StationPanel({
  stations,
  priorities,
  setPriority,
  mustHaves,
  toggleMustHave,
  droppedIds,
  visitedLegs,
  nextStopId,
  onClose,
}) {
  const visitedIds = visitedLegs.map((l) => l.to);
  const science = stations.filter((s) => s.id !== 'Depot');
  const kept = science.length - droppedIds.length;
  const lost = droppedIds.length;

  return (
    <section className="panel station-panel" aria-labelledby="objectives-heading">
      <div className="panel-head station-panel-head">
        <div>
          <div className="eyebrow">
            <TargetIcon />
            Science objectives
          </div>
          <h2 id="objectives-heading" className="panel-title">
            Delta front traverse
          </h2>
          <p className="panel-sub">
            Priority 1 is highest. Must-have objectives can never be silently dropped.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="station-count">
            {kept} kept{lost ? ` / ${lost} deferred` : ''}
          </span>
          {onClose && (
            <button
              type="button"
              className="icon-button drawer-close"
              onClick={onClose}
              aria-label="Close science objectives"
            >
              <CloseIcon />
            </button>
          )}
        </div>
      </div>

      <div className="station-list">
        {science.map((s, index) => {
          const dropped = droppedIds.includes(s.id);
          const visited = visitedIds.includes(s.id);
          const next = nextStopId === s.id;
          const status = statusFor(s, dropped, visited, next);
          const isMust = mustHaves.includes(s.id);

          return (
            <article
              key={s.id}
              className={`station-card station-card--${status.key}`}
              aria-label={`${s.name}, ${status.label}`}
            >
              <div className="station-head">
                <span className="station-index" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div className="station-heading">
                  <h3 className="station-name">{s.name}</h3>
                  <span className="station-unit" title={s.unit}>
                    {s.unit}
                  </span>
                </div>
                <span className={`chip ${status.chip}`}>
                  {visited && <CheckIcon size={11} />}
                  {status.label}
                </span>
              </div>

              <p className="station-objective">{s.objective}</p>

              {dropped && (
                <div className="station-deferred-note">
                  <strong>Science deferred this EVA.</strong> Lowest-priority non-must-have
                  objective. Raising its priority may restore it.
                </div>
              )}

              {s.photo && (
                <div className="station-media">
                  <img
                    src={s.photo}
                    alt={s.photoNote || `NASA image near ${s.name}`}
                    loading="lazy"
                    decoding="async"
                  />
                  <span className="station-media-tag">{s.photoId ? 'NASA MASTCAM-Z' : 'NASA IMAGE'}</span>
                </div>
              )}

              <div className="station-controls">
                {visited ? (
                  <span className="chip chip--green">Completed · simulated EVA</span>
                ) : (
                  <>
                    <span className="station-select-wrap">
                      <label htmlFor={`priority-${s.id}`}>Priority</label>
                      <select
                        id={`priority-${s.id}`}
                        className="station-select"
                        value={priorities[s.id]}
                        onChange={(e) => setPriority(s.id, +e.target.value)}
                      >
                        {[1, 2, 3].map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </span>
                    <label className="switch" htmlFor={`must-${s.id}`}>
                      <input
                        id={`must-${s.id}`}
                        type="checkbox"
                        checked={isMust}
                        onChange={() => toggleMustHave(s.id)}
                      />
                      <span className="switch-track" aria-hidden="true" />
                      Must-have
                    </label>
                  </>
                )}
              </div>

              <div className="station-details">
                <details className="disclosure">
                  <summary>Scientific context &amp; caveats</summary>
                  <div className="disclosure-body">
                    <p>{s.unit}</p>
                    {s.flags.map((flag) => (
                      <p className="flag" key={flag}>
                        <AlertIcon size={13} />
                        <span>{flag}</span>
                      </p>
                    ))}
                  </div>
                </details>
                <details className="disclosure">
                  <summary>Image provenance</summary>
                  <div className="disclosure-body">
                    {s.photoNote ? <p>{s.photoNote}</p> : <p>No photograph is available for this station.</p>}
                    {s.src && (
                      <a className="source-link" href={s.src} target="_blank" rel="noreferrer">
                        Open NASA source
                      </a>
                    )}
                  </div>
                </details>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
