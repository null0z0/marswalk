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
    <details className="disclosure">
      <summary className="text-xs text-slate-200">
        <span className="text-cyan-400">{TYPE_LABEL[ev.type] || ev.type}</span>
        {' — '}{fmtDate(ev.date_utc)}{ev.sol != null ? ` (sol ${ev.sol}, ${ev.sol_mission})` : ` (${ev.sol_mission})`}
      </summary>
      <div className="disclosure-body text-xs text-slate-300 space-y-1.5 leading-normal">
        {ev.date_note && <div className="text-slate-400">{ev.date_note}</div>}
        <div>{ev.summary}</div>
        <div className="text-slate-400">Where: {ev.location}</div>
        <div className="text-slate-400">How we know: {ev.instruments.join(', ')} — {ev.status}.</div>
        {ev.estimated_fields && ev.estimated_fields.length > 0 && (
          <div className="text-amber-300">Estimated (marked ~, not measured): {ev.estimated_fields.join('; ')}.</div>
        )}
        <div className="pt-1">
          <a href={ev.source_url} target="_blank" rel="noreferrer" className="text-cyan-400 underline break-all">{srcDomain(ev.source_url)}</a>
          {ev.secondary_source_url && <> · <a href={ev.secondary_source_url} target="_blank" rel="noreferrer" className="text-cyan-400 underline break-all">{srcDomain(ev.secondary_source_url)}</a></>}
          <span className="text-slate-500"> · {ev.credit}</span>
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
    <details className="disclosure">
      <summary className="text-xs text-slate-200">
        <span className="text-cyan-400">Recorded weather (MEDA)</span>{' — '}sol {sol}, Mars 2020
      </summary>
      <div className="disclosure-body text-xs text-slate-300 space-y-1.5 leading-normal">
        <div>Air temperature {c(tMin)} to {c(tMax)} &deg;C across 5 ATS sensors; surface pressure {pMin.toFixed(1)}–{pMax.toFixed(1)} Pa across BAROCAP1-3.</div>
        <div className="text-slate-400">Where: at the rover (Perseverance) on that sol — a point record at that place and time.</div>
        <div className="text-slate-400">How we know: MEDA PDS calibrated products, {d.atsRows.toLocaleString()} temperature + {d.psRows.toLocaleString()} pressure rows parsed.</div>
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
      <details className="disclosure">
        <summary className="text-xs">
          <span className="eyebrow">Recorded natural events</span>
          <span className="text-xs text-slate-400 font-mono"> ({local.length} crater + {context.length} Mars)</span>
        </summary>
        <div className="disclosure-body space-y-2 mt-1">
          <div className="text-xs text-slate-300 leading-normal border border-cyan-900/40 rounded-lg p-2 bg-[#070d18]/60">
            Historical archive: what was observed, when, where (crater-level context, no exact pins) and by which instrument. This is not current weather and not a forecast; estimated values are marked.
          </div>
          {medaSols.map(s => <MedaCard key={s} sol={s} />)}
          {local.map(ev => <EventCard key={ev.id} ev={ev} />)}
          <div className="eyebrow pt-1.5 border-t border-cyan-900/40">Elsewhere on Mars — context only</div>
          {context.map(ev => <EventCard key={ev.id} ev={ev} />)}
          <div className="text-xs text-slate-400 leading-normal pt-1.5 border-t border-cyan-900/40 space-y-0.5">
            {eventsData.bounded_absences.map((a, i) => <div key={i}>— {a}</div>)}
          </div>
        </div>
      </details>
    </section>
  );
}
