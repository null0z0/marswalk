import { memo } from 'react';

function StationDetailCard({ station, role }) {
  if (!station) return null;
  const flags = (station.flagsShort || station.flags || []).filter(Boolean);

  return (
    <div className="station-card">
      <div className="station-head">
        <div className="station-heading">
          <div className="flex items-center justify-between gap-2">
            <span className="station-name">{station.name}</span>
            <span className="chip chip--cyan">
              {role}
            </span>
          </div>
          {station.unit && <div className="station-unit">{station.unit}</div>}
          {station.lat != null && station.lon != null && (
            <div className="font-mono text-xs text-slate-400 mt-0.5">
              lat {station.lat.toFixed(5)}, lon {station.lon.toFixed(5)}
            </div>
          )}
        </div>
      </div>

      {station.objective && (
        <div className="station-objective">
          {station.objective}
        </div>
      )}

      {station.photo && (
        <div className="station-media">
          <img src={station.photo} alt={station.name} />
          {station.sol != null && (
            <span className="station-media-tag">Sol {station.sol}</span>
          )}
        </div>
      )}

      <div className="station-details">
        {station.photoNote && (
          <div className="text-xs text-slate-400 mt-1 mb-2">
            {station.photoNote}
            {station.src && (
              <> <a href={station.src} target="_blank" rel="noreferrer" className="text-cyan-400 underline break-all">source</a></>
            )}
          </div>
        )}

        {flags.length > 0 && (
          <div className="space-y-1 mb-2">
            {flags.map((f, i) => (
              <div key={i} className="flag">
                <span>⚠</span>
                <span>{f}</span>
              </div>
            ))}
          </div>
        )}

        {(station.unitDescription || station.meda) && (
          <details className="disclosure">
            <summary>Geology details & environment</summary>
            <div className="disclosure-body">
              {station.unitDescription && (
                <div className="mb-2">
                  <div className="font-semibold text-slate-300 mb-0.5">Map Unit</div>
                  <div>
                    {station.unitDescription}
                    {station.region === 'jezero' && (
                      <> <a href="https://pubs.usgs.gov/sim/3464/sim3464.pdf" target="_blank" rel="noreferrer" className="underline text-cyan-400">USGS SIM 3464 sheet</a></>
                    )}
                  </div>
                </div>
              )}
              {station.meda && (
                <div>
                  <div className="font-semibold text-slate-300 mb-0.5">MEDA Weather Station Record</div>
                  <div className="text-xs text-slate-400">{station.meda}</div>
                </div>
              )}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

function RoutePointDetails({ fromStation, toStation }) {
  if (!fromStation && !toStation) return null;

  return (
    <section className="panel space-y-2">
      <div className="eyebrow">Endpoint details</div>
      <div className="space-y-3">
        {fromStation && <StationDetailCard station={fromStation} role="From" />}
        {toStation && <StationDetailCard station={toStation} role="To" />}
      </div>
    </section>
  );
}

export default memo(RoutePointDetails);
