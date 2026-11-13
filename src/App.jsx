import { useEffect, useState, lazy, Suspense } from 'react';
import MapView from './components/MapView.jsx';

const Terrain3D = lazy(() => import('./components/Terrain3D.jsx'));
import MissionStatusBar from './components/MissionStatusBar.jsx';
import StationPanel from './components/StationPanel.jsx';
import TimeControl from './components/TimeControl.jsx';
import PlanSummary from './components/PlanSummary.jsx';
import ElevationProfile from './components/ElevationProfile.jsx';
import { buildPlan, legMetrics } from './lib/planner.js';
import stations from './data/stations.json';

const SCIENCE = stations.filter(s => s.id !== 'Depot' && s.lat != null);

export default function App() {
  const [legsData, setLegsData] = useState(null);
  const [geojson, setGeojson] = useState(null);
  const [windowMin, setWindowMin] = useState(300);
  const [dwellMin, setDwellMin] = useState(60);
  const [paceKmh, setPaceKmh] = useState(1.0);
  const [priorities, setPriorities] = useState({ Wildcat: 1, Skinner: 2 });
  const [mustHaves, setMustHaves] = useState([]);
  const [visited, setVisited] = useState([]);
  const [showGeology, setShowGeology] = useState(true);
  const [viewMode, setViewMode] = useState('2d');

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
          {viewMode === '2d' ? (
            <MapView stations={stations} plan={plan} showGeology={showGeology} setShowGeology={setShowGeology} geojson={geojson} />
          ) : (
            <Suspense fallback={<div className="h-full w-full flex items-center justify-center text-cyan-200 font-mono text-xs">Loading 3D view...</div>}>
              <Terrain3D stations={stations} plan={plan} />
            </Suspense>
          )}
          <div className="absolute top-2 right-2 z-[1001] flex rounded overflow-hidden border border-cyan-900 text-[10px] font-mono">
            <button onClick={() => setViewMode('2d')}
              className={viewMode === '2d' ? 'px-2 py-1 bg-cyan-700 text-white' : 'px-2 py-1 bg-[#0d1420] text-cyan-300'}>2D Map</button>
            <button onClick={() => setViewMode('3d')}
              className={viewMode === '3d' ? 'px-2 py-1 bg-cyan-700 text-white' : 'px-2 py-1 bg-[#0d1420] text-cyan-300'}>3D Terrain</button>
          </div>
          {viewMode === '2d' && (
            <label className="absolute top-11 right-2 z-[1000] bg-[#0d1420] border border-cyan-900 rounded px-2 py-1 text-[10px]">
              <input type="checkbox" checked={showGeology} onChange={e => setShowGeology(e.target.checked)} /> USGS geology (SIM 3464)
            </label>
          )}
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
                const prevId = v.length ? v[v.length - 1].id : 'Depot';
                const m = legMetrics(legsData, prevId, order[0].id, paceKmh);
                // freeze history: walk minutes and pace used are recorded now;
                // later pace-slider moves must not rewrite completed legs
                return [...v, { id: order[0].id, dwellUsed: dwellMin + 60, walkMin: m.minutes, paceUsed: paceKmh, overrun: true }];
              });
            }}
            onUndoOverrun={() => setVisited(v => (v.length && v[v.length - 1].overrun) ? v.slice(0, -1) : v)}
            onReset={() => setVisited([])} />
          <PlanSummary plan={plan} windowMin={windowMin} dwellMin={dwellMin} paceKmh={paceKmh} />
          <ElevationProfile plan={plan} stations={stations} />
        </div>
      </div>
    </div>
  );
}
