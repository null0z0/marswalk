import { useEffect, useState, lazy, Suspense } from 'react';
import MapView from './components/MapView.jsx';

const Terrain3D = lazy(() => import('./components/Terrain3D.jsx'));
import MissionStatusBar from './components/MissionStatusBar.jsx';
import StationPanel from './components/StationPanel.jsx';
import TimeControl from './components/TimeControl.jsx';
import PlanSummary from './components/PlanSummary.jsx';
import SolTimeline from './components/SolTimeline.jsx';
import ElevationProfile from './components/ElevationProfile.jsx';
import { buildPlan, legMetrics } from './lib/planner.js';
import stations from './data/stations.json';
import scenarios from './data/scenarios.json';

export default function App() {
  const [legsData, setLegsData] = useState(null);
  const [geojson, setGeojson] = useState(null);
  const [roverTrack, setRoverTrack] = useState(null);
  const [terrainMeta, setTerrainMeta] = useState(null);
  const [contours, setContours] = useState(null);
  const [scenarioId, setScenarioId] = useState('delta');
  const [windowMin, setWindowMin] = useState(300);
  const [dwellMin, setDwellMin] = useState(60);
  const [paceKmh, setPaceKmh] = useState(1.0);
  const [priorities, setPriorities] = useState(scenarios.delta.priorities);
  const [mustHaves, setMustHaves] = useState([]);
  const [visited, setVisited] = useState([]);
  const [planA, setPlanA] = useState(null);
  const [solLimit, setSolLimit] = useState(null);
  const [viewMode, setViewMode] = useState('2d');
  const [layers, setLayers] = useState({
    geology: true, roverRoute: false, roverStops: false,
    elevRamp: false, hillshade: false, slope: false, contours: false, crismVna: false, overlayOpacity: 0.55,
  });

  const scenario = scenarios[scenarioId];
  const SCIENCE = stations.filter(s => scenario.stops.includes(s.id) && s.lat != null);
  const scenarioStations = stations.filter(s => s.id === scenario.base || scenario.stops.includes(s.id));
  const region = (stations.find(s => s.id === scenario.base) || {}).region || 'jezero';

  // Per-region mission data: Jezero files keep their original names; the Gale
  // region uses _gale-suffixed files built from the MSL archives. Missing
  // optional layers (terrain meta, contours) fail soft to null.
  useEffect(() => {
    const sfx = region === 'gale' ? '_gale' : '';
    setLegsData(null);
    setSolLimit(null);
    // tag with region so the planner never runs a new scenario against the
    // previous region's legs for one render (missing leg pairs -> crash)
    fetch(`/data/legs${sfx}.json`).then(r => r.json()).then(d => setLegsData({ region, payload: d }));
    fetch(`/data/rover_track${sfx}.json`).then(r => r.json()).then(setRoverTrack);
    fetch(`/data/terrain_meta${sfx}.json`).then(r => r.ok ? r.json() : null).then(setTerrainMeta).catch(() => setTerrainMeta(null));
    fetch(sfx ? `/layers/gale/contours.geojson` : '/layers/contours.geojson').then(r => r.ok ? r.json() : null).then(setContours).catch(() => setContours(null));
  }, [region]);

  useEffect(() => {
    setGeojson(null);
    if (region === 'jezero') {
      fetch('/geology.geojson').then(r => r.json()).then(setGeojson);
    }
  }, [region]);

  if (!legsData || legsData.region !== region) return <div className="bg-[#0a0e17] text-cyan-200 h-screen flex items-center justify-center font-mono">Loading mission data...</div>;
  const legs = legsData.payload;



  const switchScenario = (id) => {
    setScenarioId(id);
    setPriorities(scenarios[id].priorities);
    setMustHaves([]);
    setVisited([]);
    setPlanA(null);
  };

  const plan = buildPlan({ stops: SCIENCE, priorities, mustHaves, windowMin, dwellMin, paceKmh, legsData: legs, visited, baseId: scenario.base });
  const pinPlanA = () => {
    const legs2 = plan.visitedLegs.concat(plan.sim.legs);
    setPlanA({
      total: plan.elapsed + plan.sim.total,
      km: legs2.reduce((s, l) => s + l.metrics.dist, 0) / 1000,
      asc: legs2.reduce((s, l) => s + l.metrics.asc, 0),
      kept: plan.visitedLegs.length + plan.kept.length,
      dropped: plan.dropped.map(d => d.name),
    });
  };
  const overrunLeft = visited.length < SCIENCE.length;

  return (
    <div className="h-screen flex flex-col bg-[#0a0e17] text-gray-200">
      <MissionStatusBar plan={plan} windowMin={windowMin} scenarioLabel={scenario.label} />
      <div className="flex flex-1 min-h-0 flex-col md:flex-row overflow-y-auto md:overflow-visible">
        <div className="w-full md:w-72 md:overflow-y-auto p-2 space-y-2 border-r border-cyan-900 order-2 md:order-1">
          <div className="text-[11px] uppercase tracking-wider text-cyan-400">Scenario</div>
          <select className="w-full bg-[#0d1420] border border-cyan-900 rounded px-1.5 py-1 text-xs text-gray-200"
            value={scenarioId} onChange={e => switchScenario(e.target.value)}>
            {Object.entries(scenarios).map(([id, sc]) => <option key={id} value={id} disabled={!!sc.disabled}>{sc.label}{sc.disabled ? ' (in build)' : ''}</option>)}
          </select>
          <div className="text-[10px] text-gray-400 leading-snug">{scenario.blurb}</div>
          <SolTimeline stations={scenarioStations} region={region} roverTrack={roverTrack} solLimit={solLimit} setSolLimit={setSolLimit} />
          <div className="text-[11px] uppercase tracking-wider text-cyan-400 pt-1">Science stops</div>
          <StationPanel stations={scenarioStations} baseId={scenario.base} priorities={priorities}
            setPriority={(id, v) => setPriorities(p => ({ ...p, [id]: v }))}
            mustHaves={mustHaves}
            toggleMustHave={id => setMustHaves(m => m.includes(id) ? m.filter(x => x !== id) : [...m, id])}
            droppedIds={plan.dropped.map(d => d.id)} visitedLegs={plan.visitedLegs} />
        </div>
        <div className="relative map-shell order-1 md:order-2">
          {viewMode === '2d' ? (
            <MapView stations={scenarioStations} plan={plan} geojson={geojson}
              roverTrack={roverTrack} terrainMeta={terrainMeta} contours={contours}
              layers={layers} setLayers={setLayers} region={region} baseId={scenario.base} solLimit={solLimit} />
          ) : (
            <Suspense fallback={<div className="h-full w-full flex items-center justify-center text-cyan-200 font-mono text-xs">Loading 3D view...</div>}>
              <Terrain3D stations={scenarioStations} plan={plan} region={region} baseId={scenario.base} />
            </Suspense>
          )}
          <div className="absolute top-2 right-2 z-[1001] flex rounded overflow-hidden border border-cyan-900 text-[10px] font-mono">
            <button onClick={() => setViewMode('2d')}
              className={viewMode === '2d' ? 'px-2 py-1 bg-cyan-700 text-white' : 'px-2 py-1 bg-[#0d1420] text-cyan-300'}>2D Map</button>
            <button onClick={() => setViewMode('3d')}
              className={viewMode === '3d' ? 'px-2 py-1 bg-cyan-700 text-white' : 'px-2 py-1 bg-[#0d1420] text-cyan-300'}>3D Terrain</button>
          </div>
        </div>
        <div className="w-full md:w-80 md:overflow-y-auto p-2 space-y-2 border-l border-cyan-900 order-3">
          <TimeControl windowMin={windowMin} dwellMin={dwellMin} paceKmh={paceKmh}
            setWindowMin={setWindowMin} setDwellMin={setDwellMin} setPaceKmh={setPaceKmh}
            overrunLeft={overrunLeft}
            overrunApplied={visited.length > 0 && !!visited[visited.length - 1].overrun}
            onOverrun={() => {
              const order = SCIENCE.filter(s => !visited.find(v => v.id === s.id)).sort((a, b) => priorities[a.id] - priorities[b.id]);
              if (!order.length) return;
              setVisited(v => {
                const prevId = v.length ? v[v.length - 1].id : scenario.base;
                const m = legMetrics(legs, prevId, order[0].id, paceKmh);
                // freeze history: walk minutes and pace used are recorded now;
                // later pace-slider moves must not rewrite completed legs
                return [...v, { id: order[0].id, dwellUsed: dwellMin + 60, walkMin: m.minutes, paceUsed: paceKmh, overrun: true }];
              });
            }}
            onUndoOverrun={() => setVisited(v => (v.length && v[v.length - 1].overrun) ? v.slice(0, -1) : v)}
            onReset={() => setVisited([])} />
          <PlanSummary plan={plan} windowMin={windowMin} dwellMin={dwellMin} paceKmh={paceKmh} dtmNote={legs.dtm}
                planA={planA} onPinA={pinPlanA} onClearA={() => setPlanA(null)} />
          <ElevationProfile plan={plan} stations={scenarioStations} legsData={legs} />
        </div>
      </div>
    </div>
  );
}
