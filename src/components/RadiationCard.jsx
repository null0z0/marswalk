import radiation from '../data/radiation.json';

export default function RadiationCard({ region }) {
  const isGale = String(region || '').toLowerCase().includes('gale');

  if (!isGale) {
    return (
      <div className="panel text-xs">
        <div className="panel-head">
          <div className="eyebrow">Radiation</div>
        </div>
        <div className="panel-body space-y-1">
          <div className="text-[10px] text-gray-400 leading-relaxed">
            Not computed for this region. The only radiation measurement in this
            tool is from Gale Crater (Curiosity RAD).
          </div>
        </div>
      </div>
    );
  }

  const eq = radiation.doseEquivalentRate;
  const ab = radiation.absorbedDoseRate;
  const mission = radiation.missionDoseEquivalent500Days;

  return (
    <div className="panel text-xs">
      <div className="panel-head">
        <div className="eyebrow">Radiation (measured at Gale Crater)</div>
      </div>
      <div className="panel-body space-y-1">
        <div className="flex items-baseline gap-1">
          <span className="radiation-label">Dose equivalent</span>
          <span className="radiation-value">{eq.value}</span><span className="radiation-value"> ± {eq.uncertainty}</span>
          <span className="text-xs text-gray-500">{eq.unit}</span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="radiation-label">Absorbed dose</span>
          <span className="radiation-value">{ab.value}</span><span className="radiation-value"> ± {ab.uncertainty}</span>
          <span className="text-xs text-gray-500">{ab.unit}</span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="radiation-label">500-day surface stay</span>
          <span className="radiation-value">{mission.value}</span><span className="radiation-value"> ± {mission.uncertainty}</span>
          <span className="text-xs text-gray-500">{mission.unit}</span>
        </div>
        <div className="radiation-note">{radiation.period}</div>
        <div className="radiation-note">{radiation.appliesTo}</div>
        <div className="radiation-note">{radiation.scope}</div>
        <div className="mt-1 pt-1 border-t border-cyan-900/30">
          <div className="text-[9px] text-gray-500 leading-relaxed">Source: {radiation.source.citation}, {radiation.source.table}</div>
        </div>
      </div>
    </div>
  );
}
