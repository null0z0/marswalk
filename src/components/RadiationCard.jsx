import radiation from '../data/radiation.json';

export default function RadiationCard({ region }) {
  const isGale = String(region || '').toLowerCase().includes('gale');

  if (!isGale) {
    return (
      <div className="mt-2 p-2 rounded border border-gray-700 text-[10px] text-gray-400">
        <div className="font-bold text-gray-200">Radiation</div>
        <div>
          Not computed for this region. The only radiation measurement in this
          tool is from Gale Crater (Curiosity RAD).
        </div>
      </div>
    );
  }

  const eq = radiation.doseEquivalentRate;
  const ab = radiation.absorbedDoseRate;
  const mission = radiation.missionDoseEquivalent500Days;

  return (
    <div className="mt-2 p-2 rounded border border-gray-700 text-[10px] text-gray-400">
      <div className="font-bold text-gray-200">
        Radiation (measured at {radiation.region})
      </div>
      <div>Dose equivalent: {eq.value} ± {eq.uncertainty} {eq.unit}</div>
      <div>Absorbed dose: {ab.value} ± {ab.uncertainty} {ab.unit}</div>
      <div>500-day surface stay: {mission.value} ± {mission.uncertainty} {mission.unit}</div>
      <div>{radiation.period}</div>
      <div>{radiation.scope}</div>
      <div>Source: {radiation.source.citation}, {radiation.source.table}</div>
    </div>
  );
}