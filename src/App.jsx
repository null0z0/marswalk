import { useEffect, useState } from 'react';
import MapView from './components/MapView.jsx';
import MissionStatusBar from './components/MissionStatusBar.jsx';
import StationPanel from './components/StationPanel.jsx';
import TimeControl from './components/TimeControl.jsx';
import PlanSummary from './components/PlanSummary.jsx';
import ElevationProfile from './components/ElevationProfile.jsx';
import { buildPlan, legMetrics } from './lib/planner.js';
import stations from './data/stations.json';

const SCIENCE = stations.filter(s => s.id !== 'Depot');

export default function App() {
  const [legsData, setLegsData] = useState(null);
  const [geojson, setGeojson] = useState(null);
  const [windowMin, setWindowMin] = useState(300);
  const [dwellMin, setDwellMin] = useState(60);
  const [paceKmh, setPaceKmh] = useState(1.0);
  const [priorities, setPriorities] = useState({ Wildcat: 1, Skinner: 2, Kodiak: 3 });
  const [mustHaves, setMustHaves] = useState([]);
  const [visited, setVisited] = useState([]);
  const [showGeology, setShowGeology] = useState(true);

  useEffect(() => {
    fetch('/data/legs.json').then(r => r.json()).then(setLegsData);
    fetch('/geology.geojson').then(r => r.json()).then(setGeojson);
  }, []);

  if (!legsData) return <div className="bg-[#0a0e17] text-cyan-200 h-screen flex items-center justify-center font-mono">Loading mission data...</div>;

  const plan = buildPlan({ stops: SCIENCE, priorities, mustHaves, windowMin, dwellMin, paceKmh, legsData, visited });
  const overrunLeft = visited.length < SCIENCE.length;

  return (
    <div className="h-screen flex flex-col bg-[#0a0e17] text-gray-200">
      <MissionStatusBar plan={plan} windowMin={windowMin} />
      <div className="flex flex-1 min-h-0 flex-col md:flex-row overflow-y-auto md:overflow-visible">
        <div className="w-full md:w-72 md:overflow-y-auto p-2 space-y-2 border-r border-cyan-900 order-2 md:order-1">
          <div className="text-[11px] uppercase tracking-wider text-cyan-400">Science stops</div>
          <StationPanel stations={stations} priorities={priorities}
            setPriority={(id, v) => setPriorities(p => ({ ...p, [id]: v }))}
            mustHaves={mustHaves}
            toggleMustHave={id => setMustHaves(m => m.includes(id) ? m.filter(x => x !== id) : [...m, id])}
            droppedIds={plan.dropped.map(d => d.id)} visitedLegs={plan.visitedLegs} />
        </div>
        <div className="relative map-shell order-1 md:order-2">
          <MapView stations={stations} plan={plan} showGeology={showGeology} setShowGeology={setShowGeology} geojson={geojson} />
          <label className="absolute top-2 right-2 z-[1000] bg-[#0d1420] border border-cyan-900 rounded px-2 py-1 text-[10px]">
            <input type="checkbox" checked={showGeology} onChange={e => setShowGeology(e.target.checked)} /> USGS geology (SIM 3464)
          </label>
        </div>
        <div className="w-full md:w-80 md:overflow-y-auto p-2 space-y-2 border-l border-cyan-900 order-3">
          <TimeControl windowMin={windowMin} dwellMin={dwellMin} paceKmh={paceKmh}
            setWindowMin={setWindowMin} setDwellMin={setDwellMin} setPaceKmh={setPaceKmh}
            overrunLeft={overrunLeft}
            onOverrun={() => {
              const order = SCIENCE.filter(s => !visited.find(v => v.id === s.id)).sort((a, b) => priorities[a.id] - priorities[b.id]);
              if (!order.length) return;
              setVisited(v => {
                const prevId = v.length ? v[v.length - 1].id : 'Depot';
                const m = legMetrics(legsData, prevId, order[0].id, paceKmh);
                // freeze history: walk minutes and pace used are recorded now;
                // later pace-slider moves must not rewrite completed legs
                return [...v, { id: order[0].id, dwellUsed: dwellMin + 60, walkMin: m.minutes, paceUsed: paceKmh }];
              });
            }}
            onReset={() => setVisited([])} />
          <PlanSummary plan={plan} windowMin={windowMin} dwellMin={dwellMin} paceKmh={paceKmh} />
          <ElevationProfile plan={plan} stations={stations} />
        </div>
      </div>
    </div>
  );
}
