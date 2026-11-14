// Recorded history: observed natural events and recorded rover weather,
// presented as a HISTORICAL ARCHIVE - each entry carries its date/sol,
// place (crater-level, no exact pins) and source. Never current weather,
// never a forecast, never a hazard model. Events detected elsewhere on Mars
// are context-only and say so.

import eventsData from '../data/historicalEvents.json';
import meda from '../data/meda.json';

const TYPE_LABEL = {
  dust_storm_regional: 'Regional dust storm',
  dust_storm_global: 'Planet-encircling dust event',
  dust_devil: 'Dust devil',
  marsquake: 'Marsquake',
  meteoroid_impact: 'Meteoroid impact',
  avalanche: 'Polar avalanche (CO2/dust fall)',
};

function fmtDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[m - 1]} ${d}, ${y}`;
}

const srcDomain = (url) => {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
};

function EventCard({ ev }) {
  return (
    <details className="border border-gray-800 rounded bg-[#0d1420]/60 px-1.5 py-1">
      <summary className="cursor-pointer select-none text-[10px] text-gray-200">
        <span className="text-cyan-400">{TYPE_LABEL[ev.type] || ev.type}</span>
        {' - '}{fmtDate(ev.date_utc)}{ev.sol != null ? ` (sol ${ev.sol}, ${ev.sol_mission})` : ` (${ev.sol_mission})`}
      </summary>
      <div className="mt-1 space-y-1 text-[10px] text-gray-300 leading-snug">
        {ev.date_note && <div className="text-gray-500">{ev.date_note}</div>}
        <div>{ev.summary}</div>
        <div className="text-gray-500">Where: {ev.location}</div>
        <div className="text-gray-500">How we know: {ev.instruments.join(', ')} - {ev.status}.</div>
        {ev.estimated_fields && ev.estimated_fields.length > 0 && (
          <div className="text-amber-300/80">Estimated (marked ~, not measured): {ev.estimated_fields.join('; ')}.</div>
        )}
        <div>
          <a href={ev.source_url} target="_blank" rel="noreferrer" className="text-cyan-400 underline break-all">{srcDomain(ev.source_url)}</a>
          {ev.secondary_source_url && <> · <a href={ev.secondary_source_url} target="_blank" rel="noreferrer" className="text-cyan-400 underline break-all">{srcDomain(ev.secondary_source_url)}</a></>}
          <span className="text-gray-600"> · {ev.credit}</span>
        </div>
      </div>
    </details>
  );
}

// Recorded rover weather (Jezero only): the verified MEDA sols already shipped
// as station captions, surfaced here as dated archive entries.
function MedaCard({ sol }) {
  const d = meda[String(sol)];
  if (!d) return null;
  const tMin = Math.min(...Object.values(d.ats).map(s => s.minK));
  const tMax = Math.max(...Object.values(d.ats).map(s => s.maxK));
  const pMin = Math.min(...Object.values(d.ps).map(s => s.minPa));
  const pMax = Math.max(...Object.values(d.ps).map(s => s.maxPa));
  const c = (k) => (k - 273.15).toFixed(1);
  return (
    <details className="border border-gray-800 rounded bg-[#0d1420]/60 px-1.5 py-1">
      <summary className="cursor-pointer select-none text-[10px] text-gray-200">
        <span className="text-cyan-400">Recorded weather (MEDA)</span>{' - '}sol {sol}, Mars 2020
      </summary>
      <div className="mt-1 space-y-1 text-[10px] text-gray-300 leading-snug">
        <div>Air temperature {c(tMin)} to {c(tMax)} C across the 5 ATS sensors; surface pressure {pMin.toFixed(1)}-{pMax.toFixed(1)} Pa across BAROCAP1-3.</div>
        <div className="text-gray-500">Where: at the rover (Perseverance) on that sol - a point record at that place and time, not conditions anywhere else or any other time.</div>
        <div className="text-gray-500">How we know: MEDA PDS calibrated products, {d.atsRows.toLocaleString()} temperature + {d.psRows.toLocaleString()} pressure rows parsed, no quality filtering beyond parsing.</div>
        <div><a href="https://atmos.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/" target="_blank" rel="noreferrer" className="text-cyan-400 underline break-all">PDS MEDA archive (NMSU)</a></div>
      </div>
    </details>
  );
}

export default function HistoricalEvents({ region }) {
  const local = eventsData.events.filter(e => e.workspace === region);
  const context = eventsData.events.filter(e => e.workspace === 'context_only');
  const medaSols = region === 'jezero' ? Object.keys(meda).map(Number).sort() : [];
  return (
    <section className="panel text-xs">
      <details>
        <summary className="cursor-pointer select-none">
          <span className="eyebrow">Recorded natural events</span>
          <span className="text-[10px] text-gray-500"> {local.length} in this crater + {context.length} elsewhere on Mars{medaSols.length ? ` + ${medaSols.length} recorded-weather sols` : ''}</span>
        </summary>
        <div className="mt-1.5 space-y-1.5">
          <div className="text-[9px] text-gray-500 leading-snug border border-gray-800 rounded p-1.5 bg-[#0d1420]/60">
            Historical archive: what was observed, when, where (crater-level context, no exact map pins) and by which instrument. This is not current weather, not a forecast and not a hazard model; estimated values are marked. Nothing here changes routes or plans.
          </div>
          {medaSols.map(s => <MedaCard key={s} sol={s} />)}
          {local.map(ev => <EventCard key={ev.id} ev={ev} />)}
          <div className="text-[9px] uppercase tracking-wider text-gray-500 pt-1 border-t border-gray-800">Elsewhere on Mars - context only, NOT at {region === 'gale' ? 'Gale' : 'Jezero'}</div>
          {context.map(ev => <EventCard key={ev.id} ev={ev} />)}
          <div className="text-[9px] text-gray-600 leading-snug pt-1 border-t border-gray-800 space-y-0.5">
            {eventsData.bounded_absences.map((a, i) => <div key={i}>- {a}</div>)}
          </div>
        </div>
      </details>
    </section>
  );
}
