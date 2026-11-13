import { useEffect, useState, lazy, Suspense } from 'react';
import MapView from './components/MapView.jsx';

const Terrain3D = lazy(() => import('./components/Terrain3D.jsx'));
import MissionStatusBar from './components/MissionStatusBar.jsx';
import MissionDecision from './components/MissionDecision.jsx';
import StationPanel from './components/StationPanel.jsx';
import TimeControl from './components/TimeControl.jsx';
import PlanSummary from './components/PlanSummary.jsx';
import ElevationProfile from './components/ElevationProfile.jsx';
import MissionBrief from './components/MissionBrief.jsx';
import DemoCoach from './components/DemoCoach.jsx';
import { MapIcon, TerrainIcon, ResetIcon } from './components/Icons.jsx';
import { buildPlan, legMetrics } from './lib/planner.js';
import stations from './data/stations.json';

const SCIENCE = stations.filter((s) => s.id !== 'Depot' && s.lat != null);
const BY_ID = Object.fromEntries(stations.map((s) => [s.id, s]));
const DEFAULT_PRIORITIES = { Wildcat: 1, Skinner: 2 };

export default function App() {
  const [legsData, setLegsData] = useState(null);
  const [geojson, setGeojson] = useState(null);
  const [windowMin, setWindowMin] = useState(300);
  const [dwellMin, setDwellMin] = useState(60);
  const [paceKmh, setPaceKmh] = useState(1.0);
  const [priorities, setPriorities] = useState(DEFAULT_PRIORITIES);
  const [mustHaves, setMustHaves] = useState([]);
  const [visited, setVisited] = useState([]);
  const [showGeology, setShowGeology] = useState(true);
  const [viewMode, setViewMode] = useState('2d');
  // The 3D scene is created on first use, then kept mounted so switching views
  // never tears down Leaflet or the WebGL context (the source of the lost Base
  // label and the React nested-root unmount errors).
  const [terrainMounted, setTerrainMounted] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [briefOpen, setBriefOpen] = useState(false);
  const [demoStep, setDemoStep] = useState(null);
  const [mapResetKey, setMapResetKey] = useState(0);

  useEffect(() => {
    fetch('/data/legs.json').then((r) => r.json()).then(setLegsData);
    fetch('/geology.geojson').then((r) => r.json()).then(setGeojson);
  }, []);

  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  if (!legsData) {
    return (
      <div className="app-shell">
        <div className="loading-screen" role="status">
          Loading mission data…
        </div>
      </div>
    );
  }

  const plan = buildPlan({
    stops: SCIENCE,
    priorities,
    mustHaves,
    windowMin,
    dwellMin,
    paceKmh,
    legsData,
    visited,
  });

  const nextLeg = plan.sim.legs.find((l) => l.to !== 'Depot');
  const nextStopId = nextLeg ? nextLeg.to : null;
  const nextStopName = nextStopId
    ? BY_ID[nextStopId]?.name || nextStopId
    : 'Return to Base';

  const lastVisitedId = visited.length ? visited[visited.length - 1].id : 'Depot';
  const currentStopName =
    lastVisitedId === 'Depot' ? 'Base' : BY_ID[lastVisitedId]?.name || lastVisitedId;

  const phase = plan.infeasible
    ? 'infeasible'
    : plan.dropped.length
      ? 'replanned'
      : visited.length
        ? 'progress'
        : 'nominal';

  const droppedIds = plan.dropped.map((d) => d.id);
  const canUndo = visited.length > 0;

  function recordStop(delayMin) {
    if (!nextStopId) return;
    const prevId = visited.length ? visited[visited.length - 1].id : 'Depot';
    const m = legMetrics(legsData, prevId, nextStopId, paceKmh);
    setVisited((v) => [
      ...v,
      {
        id: nextStopId,
        dwellUsed: dwellMin + delayMin,
        walkMin: m.minutes,
        paceUsed: paceKmh,
        overrun: delayMin > 0,
        overrunMin: delayMin,
      },
    ]);
  }

  function resetScenario() {
    setWindowMin(300);
    setDwellMin(60);
    setPaceKmh(1.0);
    setPriorities(DEFAULT_PRIORITIES);
    setMustHaves([]);
    setVisited([]);
    setDemoStep(null);
  }

  function startDemo() {
    setBriefOpen(false);
    setWindowMin(200);
    setDwellMin(60);
    setPaceKmh(1.0);
    setPriorities(DEFAULT_PRIORITIES);
    setMustHaves([]);
    setVisited([]);
    setDemoStep(0);
  }

  function demoNext() {
    setDemoStep((s) => (s === null || s >= 2 ? null : s + 1));
  }

  function demoOverrun() {
    recordStop(60);
    setDemoStep(2);
  }

  function undoStep() {
    setVisited((v) => v.slice(0, -1));
    setDemoStep((s) => (s === 2 ? 1 : s));
  }

  function resetProgress() {
    setVisited([]);
    setDemoStep((s) => (s === null ? null : 0));
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#workspace">
        Skip to mission map
      </a>

      <MissionStatusBar
        plan={plan}
        windowMin={windowMin}
        phase={phase}
        nextStopName={nextStopName}
        visited={visited}
        onOpenBrief={() => setBriefOpen(true)}
        onOpenObjectives={() => setDrawerOpen(true)}
        onStartDemo={startDemo}
      />

      <MissionDecision
        plan={plan}
        windowMin={windowMin}
        canUndo={canUndo}
        onUndo={undoStep}
        onOpenBrief={() => setBriefOpen(true)}
      />

      {demoStep !== null && (
        <DemoCoach
          step={demoStep}
          nextStopName={nextStopName}
          canOverrun={Boolean(nextStopId)}
          onNext={demoNext}
          onApplyOverrun={demoOverrun}
          onClose={() => setDemoStep(null)}
        />
      )}

      <div id="workspace" className="workspace">
        {drawerOpen && (
          <button
            type="button"
            className="drawer-backdrop"
            aria-label="Close science objectives"
            onClick={() => setDrawerOpen(false)}
          />
        )}

        <aside
          className={`rail rail--objectives rail-scroll${drawerOpen ? ' is-open' : ''}`}
          aria-label="Science objectives"
        >
          <StationPanel
            stations={stations}
            priorities={priorities}
            setPriority={(id, v) => setPriorities((p) => ({ ...p, [id]: v }))}
            mustHaves={mustHaves}
            toggleMustHave={(id) =>
              setMustHaves((m) =>
                m.includes(id) ? m.filter((x) => x !== id) : [...m, id]
              )
            }
            droppedIds={droppedIds}
            visitedLegs={plan.visitedLegs}
            nextStopId={nextStopId}
            onClose={() => setDrawerOpen(false)}
          />
        </aside>

        <main className="map-stage" aria-label="Mission map">
          <div className="map-shell">
            <div
              className={`map-pane${viewMode === '2d' ? ' is-active' : ' is-hidden'}`}
              aria-hidden={viewMode === '2d' ? undefined : true}
              inert={viewMode === '2d' ? undefined : true}
            >
              <MapView
                stations={stations}
                plan={plan}
                showGeology={showGeology}
                setShowGeology={setShowGeology}
                geojson={geojson}
                resetKey={mapResetKey}
                active={viewMode === '2d'}
              />
            </div>

            {terrainMounted && (
              <div
                className={`map-pane${viewMode === '3d' ? ' is-active' : ' is-hidden'}`}
                aria-hidden={viewMode === '3d' ? undefined : true}
                inert={viewMode === '3d' ? undefined : true}
              >
                <Suspense
                  fallback={
                    <div className="terrain-loading">Loading 3D terrain (USGS 20 m DTM)…</div>
                  }
                >
                  <Terrain3D
                    stations={stations}
                    plan={plan}
                    resetKey={mapResetKey}
                    active={viewMode === '3d'}
                  />
                </Suspense>
              </div>
            )}

            <div className="map-vignette" aria-hidden="true" />

            <div className="map-toolbar">
              <div className="segmented" role="group" aria-label="Map view mode">
                <button
                  type="button"
                  className={viewMode === '2d' ? 'is-active' : ''}
                  aria-pressed={viewMode === '2d'}
                  onClick={() => setViewMode('2d')}
                >
                  <MapIcon />
                  <span>2D Map</span>
                </button>
                <button
                  type="button"
                  className={viewMode === '3d' ? 'is-active' : ''}
                  aria-pressed={viewMode === '3d'}
                  onClick={() => {
                    setTerrainMounted(true);
                    setViewMode('3d');
                  }}
                >
                  <TerrainIcon />
                  <span>3D Terrain</span>
                </button>
              </div>

              <button
                type="button"
                className="tool-toggle"
                onClick={() => setMapResetKey((k) => k + 1)}
              >
                <ResetIcon />
                <span>Reset view</span>
              </button>

              {viewMode === '2d' && (
                <label className="tool-toggle">
                  <input
                    type="checkbox"
                    checked={showGeology}
                    onChange={(e) => setShowGeology(e.target.checked)}
                  />
                  Geology
                </label>
              )}
            </div>

            {viewMode === '2d' && (
              <div className="map-legend" aria-label="Map legend">
                <span className="legend-completed">
                  <i className="legend-line" aria-hidden="true" />
                  Completed
                </span>
                <span className="legend-planned">
                  <i className="legend-line" aria-hidden="true" />
                  Planned
                </span>
                <span className="legend-deferred">
                  <i className="legend-dash" aria-hidden="true" />
                  Deferred
                </span>
                <span className="legend-base">
                  <i
                    className="swatch"
                    style={{ background: '#f8fafc', borderRadius: 999 }}
                    aria-hidden="true"
                  />
                  Base
                </span>
                <span className="legend-optional">
                  <i
                    className="swatch"
                    style={{ background: 'rgba(124,196,255,0.7)' }}
                    aria-hidden="true"
                  />
                  USGS geology
                </span>
              </div>
            )}

            {viewMode === '2d' && (
              <div className="map-source">Mars EQC · CTX ortho · USGS SIM 3464</div>
            )}
          </div>
        </main>

        <div className="rail rail--control rail-scroll">
          <TimeControl
            windowMin={windowMin}
            dwellMin={dwellMin}
            paceKmh={paceKmh}
            setWindowMin={setWindowMin}
            setDwellMin={setDwellMin}
            setPaceKmh={setPaceKmh}
            onAdvance={() => recordStop(0)}
            onOverrun={() => recordStop(60)}
            onUndo={undoStep}
            onResetProgress={resetProgress}
            onResetScenario={resetScenario}
            currentStopName={currentStopName}
            nextStopName={nextStopName}
            canUndo={canUndo}
            infeasible={plan.infeasible}
            shortfall={plan.shortfall}
          />
          <PlanSummary
            plan={plan}
            windowMin={windowMin}
            dwellMin={dwellMin}
            paceKmh={paceKmh}
            visited={visited}
          />
          <ElevationProfile plan={plan} stations={stations} />
        </div>
      </div>

      <MissionBrief
        open={briefOpen}
        onClose={() => setBriefOpen(false)}
        onStartDemo={startDemo}
      />
    </div>
  );
}
