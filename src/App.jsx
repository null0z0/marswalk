import { useEffect, useMemo, useState, lazy, Suspense } from 'react';
import MapView from './components/MapView.jsx';

const Terrain3D = lazy(() => import('./components/Terrain3D.jsx'));
import MissionStatusBar from './components/MissionStatusBar.jsx';
import MissionDecision from './components/MissionDecision.jsx';
import StationPanel from './components/StationPanel.jsx';
import TimeControl from './components/TimeControl.jsx';
import PlanSummary from './components/PlanSummary.jsx';
import SolTimeline from './components/SolTimeline.jsx';
import ElevationProfile from './components/ElevationProfile.jsx';
import MissionBrief from './components/MissionBrief.jsx';
import GlobalView from './components/GlobalView.jsx';
import DemoCoach from './components/DemoCoach.jsx';
import RadiationCard from './components/RadiationCard.jsx';
import HistoricalEvents from './components/HistoricalEvents.jsx';
import RoutePointDetails from './components/RoutePointDetails.jsx';
import PointInspector from './components/PointInspector.jsx';
import BottomSheet from './components/BottomSheet.jsx';
import { MapIcon, TerrainIcon, ResetIcon, OrbitSmallIcon, SwapIcon } from './components/Icons.jsx';
import { buildPlan, legMetrics } from './lib/planner.js';
import { buildTraverseGraph, traversePath, SNAP_TOLERANCE_M } from './lib/traverse.js';
import { createGrid, createRuntimeLegs, containsLatLon } from './lib/terrain.js';
import stations from './data/stations.json';
import scenarios from './data/scenarios.json';

const GRID_SRC = {
  jezero: 'USGS Mars 2020 TRN CTX DTM 20 m',
  gale: 'USGS MSL Gale merged DEM 1 m, decimated to 2 m',
};
const STORE_KEY = 'marswalk-plan-v1';

function loadStored() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || typeof d !== 'object') return null;
    return d;
  } catch { return null; }
}

export default function App() {
  const stored = useMemo(loadStored, []);
  const [legsData, setLegsData] = useState(null);       // shipped legs.json (geology meta + fallback)
  const [hmData, setHmData] = useState(null);           // elevation grid for the runtime engine
  const [geojson, setGeojson] = useState(null);
  const [roverTrack, setRoverTrack] = useState(null);
  const [terrainMeta, setTerrainMeta] = useState(null);
  const [contours, setContours] = useState(null);
  const [scenarioId, setScenarioId] = useState(stored?.scenarioId && scenarios[stored.scenarioId] ? stored.scenarioId : 'delta');
  const [windowMin, setWindowMin] = useState(stored?.windowMin ?? 300);
  const [dwellMin, setDwellMin] = useState(stored?.dwellMin ?? 60);
  const [paceKmh, setPaceKmh] = useState(stored?.paceKmh ?? 1.0);
  const [priorities, setPriorities] = useState(stored?.priorities || scenarios[stored?.scenarioId]?.priorities || scenarios.delta.priorities);
  const [mustHaves, setMustHaves] = useState(stored?.mustHaves || []);
  const [visited, setVisited] = useState([]);
  const [planA, setPlanA] = useState(null);
  const [solLimit, setSolLimit] = useState(null);
  const [viewMode, setViewMode] = useState('2d');
  const [roundTrip, setRoundTrip] = useState(stored?.roundTrip ?? false); // user 2026-11-14: no assumed start/return premise
  const [baseOverride, setBaseOverride] = useState(stored?.baseOverride || null);
  // User waypoints per region: {id, name, short, lat, lon, custom:true, region}
  const [customPts, setCustomPts] = useState(stored?.customPts && typeof stored.customPts === 'object' ? stored.customPts : { jezero: [], gale: [] });
  const [addMode, setAddMode] = useState(false);
  // Route model for planned legs: 'straight' = geometric baseline segment,
  // 'leastcost' = A* least-cost path over the slope grid (declared model,
  // no-data impassable). Both computed at runtime from the same grid.
  const [routeModel, setRouteModel] = useState(stored?.routeModel === 'leastcost' ? 'leastcost' : 'straight');
  // Two-point route: the user's primary ask - real places only, pick any two,
  // see the route between them. No assumed base, no automatic return.
  const [abFrom, setAbFrom] = useState(null);
  const [abTo, setAbTo] = useState(null);
  const [routeVisible, setRouteVisible] = useState(true);
  // Gale: optionally follow Curiosity's recorded drive path between the pair
  const [followTraverse, setFollowTraverse] = useState(false);
  const [allowTraverseConnectors, setAllowTraverseConnectors] = useState(false);
  // Primary experience = two-point routing between real places. The multi-stop
  // mission planner is preserved as a secondary mode the user opens explicitly.
  const [appMode, setAppMode] = useState('route');
  const [waypointError, setWaypointError] = useState(null);
  const [layers, setLayers] = useState({
    geology: true, roverRoute: false, roverStops: false,
    elevRamp: false, hillshade: false, slope: false, contours: false, crismVna: false, overlayOpacity: 0.55,
    radiation: false,
    // Per feature-type visibility (user request: each type independent, shapes not color alone)
    plannedRoute: true, droppedLegs: true, objectives: true, baseMarker: true, userWps: true,
  });

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [briefOpen, setBriefOpen] = useState(false);
  const [demoStep, setDemoStep] = useState(null);
  const [mapResetKey, setMapResetKey] = useState(0);
  const [inspectedPoint, setInspectedPoint] = useState(null);
  const [bottomSheetOpen, setBottomSheetOpen] = useState(false);
  const [bottomSheetContent, setBottomSheetContent] = useState(null);
  // The 3D scene is created on first use, then kept mounted so switching views
  // never tears down Leaflet or the WebGL context.
  const [terrainMounted, setTerrainMounted] = useState(false);

  const scenario = scenarios[scenarioId];
  const regionStations = useMemo(
    () => stations.filter(s => (s.region || 'jezero') === ((stations.find(x => x.id === scenario.base) || {}).region || 'jezero')),
    [scenario]);
  const region = (stations.find(s => s.id === scenario.base) || {}).region || 'jezero';
  const regionCustom = customPts[region] || [];
  const scenarioStations = useMemo(
    () => regionStations.filter(s => s.id === scenario.base || scenario.stops.includes(s.id)).concat(regionCustom),
    [regionStations, scenario, regionCustom]);
  // Science stops = scenario preset stops + the user's own waypoints. A user
  // waypoint carries coordinates only - never an invented science objective.
  const SCIENCE = scenarioStations.filter(s => scenario.stops.includes(s.id) || s.custom).filter(s => s.lat != null);
  const baseId = (baseOverride && scenarioStations.some(s => s.id === baseOverride)) ? baseOverride : scenario.base;

  // Per-region mission data: Jezero files keep their original names; the Gale
  // region uses _gale-suffixed files built from the MSL archives. Missing
  // optional layers (terrain meta, contours) fail soft to null.
  useEffect(() => {
    const sfx = region === 'gale' ? '_gale' : '';
    setLegsData(null);
    setHmData(null);
    setSolLimit(null);
    // tag with region so the planner never runs a new scenario against the
    // previous region's data for one render
    fetch(`/data/legs${sfx}.json`).then(r => r.json()).then(d => setLegsData({ region, payload: d }));
    fetch(`/data/heightmap${sfx}.json`).then(r => r.json()).then(d => setHmData({ region, payload: d }));
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

  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  // Runtime terrain engine: one grid object + one planner-compatible legs
  // provider per region. Every leg in the plan is computed from the grid at
  // runtime; the shipped legs.json only contributes geology metadata for
  // unchanged preset pairs.
  const grid = useMemo(
    () => (hmData && hmData.region === region) ? createGrid(hmData.payload, GRID_SRC[region]) : null,
    [hmData, region]);
  const ptsOf = useMemo(() => {
    const map = Object.fromEntries(scenarioStations.filter(s => s.lat != null).map(s => [s.id, { lat: s.lat, lon: s.lon }]));
    return (id) => map[id] || null;
  }, [scenarioStations]);
  const activeLegs = useMemo(
    () => (grid && legsData && legsData.region === region)
      ? createRuntimeLegs(grid, ptsOf, { shippedMeta: legsData.payload.legsMeta, routeModel, srcLabel: GRID_SRC[region] })
      : null,
    [grid, legsData, region, ptsOf, routeModel]);

  // Route mode lists REAL places only: declared scenario conveniences
  // (e.g. GaleBase, a hypothetical start at a recorded position) stay in the
  // planner, never in the real-place catalog or From/To selectors.
  const realPlaces = useMemo(() => scenarioStations.filter(s => !s.scenarioOnly), [scenarioStations]);

  // The two endpoints resolved to coordinates + labels for the Global View
  // distance visualization. Real places only - no scenario-only or custom
  // waypoints are fabricated as globe endpoints.
  const globeEndpoints = useMemo(() => {
    if (!abFrom || !abTo || abFrom === abTo) return null;
    const a = ptsOf(abFrom), b = ptsOf(abTo);
    if (!a || !b) return null;
    const sa = realPlaces.find(x => x.id === abFrom) || {};
    const sb = realPlaces.find(x => x.id === abTo) || {};
    return [
      { lat: a.lat, lon: a.lon, label: sa.short || sa.name || abFrom },
      { lat: b.lat, lon: b.lon, label: sb.short || sb.name || abTo },
    ];
  }, [abFrom, abTo, ptsOf, realPlaces]);

  const abMetrics = useMemo(() => {
    if (!activeLegs || !abFrom || !abTo || abFrom === abTo) return null;
    // null = unroutable (outside coverage / no-data): surfaced as such, never invented
    return legMetrics(activeLegs, abFrom, abTo, paceKmh);
  }, [activeLegs, abFrom, abTo, paceKmh]);

  const traverseGraph = useMemo(
    () => (region === 'gale' && roverTrack && roverTrack.segments) ? buildTraverseGraph(roverTrack) : null,
    [region, roverTrack]);
  const traverseResult = useMemo(() => {
    if (!followTraverse || !traverseGraph || !abFrom || !abTo || abFrom === abTo) return null;
    const a = ptsOf(abFrom), b = ptsOf(abTo);
    if (!a || !b) return null;
    return traversePath(traverseGraph, a, b, { allowSynthetic: allowTraverseConnectors });
  }, [followTraverse, allowTraverseConnectors, traverseGraph, abFrom, abTo, ptsOf]);

  // Active two-point route geometry for the 3D view - mirrors MapView's AB
  // polyline choice exactly (recorded traverse > least-cost path > straight
  // pair), so 3D never shows retained planner legs in route mode.
  const abPath3D = useMemo(() => {
    if (appMode !== 'route' || !abFrom || !abTo || abFrom === abTo) return null;
    if (followTraverse && traverseResult && !traverseResult.ok) return null; // strict refusal: draw nothing
    if (traverseResult && traverseResult.ok) return traverseResult.pathLatLon;
    const meta = activeLegs && activeLegs.legsMeta && activeLegs.legsMeta[abFrom + '|' + abTo];
    if (routeModel === 'leastcost' && meta && meta.pathLatLon) return meta.pathLatLon;
    const a = realPlaces.find(x => x.id === abFrom), b = realPlaces.find(x => x.id === abTo);
    return a && b && a.lat != null && b.lat != null ? [[a.lat, a.lon], [b.lat, b.lon]] : null;
  }, [appMode, abFrom, abTo, followTraverse, traverseResult, routeModel, activeLegs, realPlaces]);
  const abParts3D = useMemo(
    () => (appMode === 'route' && traverseResult && traverseResult.ok) ? traverseResult.pathParts : null,
    [appMode, traverseResult]);


  // Persist the user's own plan locally (never leaves the browser).
  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        scenarioId, priorities, mustHaves, windowMin, dwellMin, paceKmh, roundTrip, baseOverride, customPts,
      }));
    } catch { /* storage full/blocked: plan still works for the session */ }
  }, [scenarioId, priorities, mustHaves, windowMin, dwellMin, paceKmh, roundTrip, baseOverride, customPts]);

  if (!legsData || legsData.region !== region || !hmData || hmData.region !== region || !activeLegs) {
    return (
      <div className="app-shell">
        <div className="loading-screen" role="status">Loading mission data…</div>
      </div>
    );
  }
  const legs = activeLegs;

  const switchScenario = (id) => {
    setScenarioId(id);
    setPriorities(scenarios[id].priorities);
    setMustHaves([]);
    setVisited([]);
    setPlanA(null);
    setBaseOverride(null);
    setWaypointError(null);
    setAddMode(false);
    // Route selections name places in the old region - never carry them over.
    setAbFrom(null);
    setAbTo(null);
  };

  // ---- user waypoints ----------------------------------------------------
  const nextCustomId = () => {
    let n = 1;
    const all = (customPts[region] || []).map(p => p.id);
    while (all.includes('P' + n)) n++;
    return 'P' + n;
  };
  const addWaypoint = (lat, lon) => {
    if (!grid) return;
    if (!containsLatLon(grid, lat, lon)) {
      setWaypointError(`That point is outside the elevation coverage (${GRID_SRC[region]}). No route can be computed there - pick a point inside the dashed coverage frame.`);
      return;
    }
    const id = nextCustomId();
    const pt = { id, name: `Waypoint ${id}`, short: id, lat, lon, custom: true, via: true, region, objective: 'User waypoint - coordinates only. No science objective is attached to this point.' };
    setCustomPts(cp => ({ ...cp, [region]: [...(cp[region] || []), pt] }));
    setPriorities(p => ({ ...p, [id]: 3 }));
    setWaypointError(null);
    setAddMode(false);
  };
  const moveWaypoint = (id, lat, lon) => {
    if (!grid || !containsLatLon(grid, lat, lon)) {
      setWaypointError(`Waypoint ${id} cannot move outside the elevation coverage - position unchanged.`);
      return;
    }
    setWaypointError(null);
    setCustomPts(cp => ({ ...cp, [region]: (cp[region] || []).map(p => p.id === id ? { ...p, lat, lon } : p) }));
    // Moving an endpoint invalidates any frozen visited leg through it.
    setVisited(v => v.some(x => x.id === id) ? [] : v);
  };
  const removeWaypoint = (id) => {
    setCustomPts(cp => ({ ...cp, [region]: (cp[region] || []).filter(p => p.id !== id) }));
    setPriorities(p => { const q = { ...p }; delete q[id]; return q; });
    setMustHaves(m => m.filter(x => x !== id));
    setVisited(v => v.some(x => x.id === id) ? [] : v);
  };

  const plan = buildPlan({
    stops: SCIENCE, priorities, mustHaves, windowMin, dwellMin, paceKmh,
    legsData: legs, visited, baseId, roundTrip,
  });
  const pinPlanA = () => {
    const legs2 = plan.visitedLegs.concat(plan.sim.legs);
    setPlanA({
      total: plan.elapsed + plan.sim.total,
      km: legs2.reduce((s, l) => s + l.metrics.dist, 0) / 1000,
      asc: legs2.reduce((s, l) => s + l.metrics.asc, 0),
      // science objectives only - via waypoints are not objectives
      kept: plan.visitedLegs.filter(l => !(plan.viaIds || []).includes(l.to)).length + (plan.scienceKept ?? plan.kept.length),
      dropped: plan.dropped.map(d => d.name),
    });
  };

  // ---- mission-progress helpers (overrun / undo / demo) -------------------
  const nextLeg = plan.sim.legs.find((l) => l.to !== baseId);
  const nextStopId = nextLeg ? nextLeg.to : null;
  const nextStopName = nextStopId
    ? (scenarioStations.find(s => s.id === nextStopId) || {}).name || nextStopId
    : null;
  const phase = plan.infeasible
    ? 'infeasible'
    : plan.dropped.length || (plan.coverageDrops || []).length
      ? 'replanned'
      : visited.length
        ? 'progress'
        : 'nominal';
  const overrunLeft = SCIENCE.some(s => !s.via && !visited.find(v => v.id === s.id));
  const canUndo = visited.length > 0;

  function recordStop(delayMin) {
    // Overruns/advances happen at SCIENCE stops only. Via waypoints get no
    // dwell, so they can never be the target of a frozen dwell record.
    const order = SCIENCE.filter(s => !s.via && !visited.find(v => v.id === s.id)).sort((a, b) => priorities[a.id] - priorities[b.id]);
    if (!order.length) return;
    setVisited(v => {
      const prevId = v.length ? v[v.length - 1].id : baseId;
      const m = legMetrics(legs, prevId, order[0].id, paceKmh);
      if (!m) return v; // unreachable stop: nothing to freeze
      // freeze history: walk minutes and pace used are recorded now; later
      // pace-slider moves must not rewrite completed legs
      return [...v, { id: order[0].id, dwellUsed: dwellMin + delayMin, walkMin: m.minutes, paceUsed: paceKmh, overrun: delayMin > 0, overrunMin: delayMin }];
    });
  }
  function undoStep() {
    setVisited(v => v.slice(0, -1));
    setDemoStep((s) => (s === 2 ? 1 : s));
  }
  function startDemo() {
    setBriefOpen(false);
    setWindowMin(200);
    setDwellMin(60);
    setPaceKmh(1.0);
    setPriorities(scenarios[scenarioId].priorities);
    setMustHaves([]);
    setVisited([]);
    setDemoStep(0);
  }
  function demoNext() { setDemoStep((s) => (s === null || s >= 2 ? null : s + 1)); }
  function demoOverrun() { recordStop(60); setDemoStep(2); }

  return (
    <div className={`app-shell${viewMode === 'global' ? ' is-global' : ''}`}>
      <a className="skip-link" href="#workspace">Skip to mission map</a>

      <MissionStatusBar
        appMode={appMode}
        setAppMode={setAppMode}
        abFrom={abFrom} abTo={abTo}
        traverseGapM={traverseResult && traverseResult.ok ? traverseResult.syntheticM : 0}
        traverseRefused={!!(followTraverse && traverseResult && !traverseResult.ok)}
        abMetrics={traverseResult && traverseResult.ok ? { dist: traverseResult.distM, minutes: null, asc: null }
          : (followTraverse && traverseResult && !traverseResult.ok) ? null : abMetrics}
        routeModel={traverseResult && traverseResult.ok ? 'traverse' : routeModel}
        stations={scenarioStations}
        plan={plan}
        windowMin={windowMin}
        phase={phase}
        nextStopName={nextStopName}
        visited={visited}
        scenarioLabel={scenario.label}
        onOpenBrief={() => setBriefOpen(true)}
        onOpenObjectives={() => setDrawerOpen(true)}
      />

      {appMode === 'planner' && <MissionDecision
        plan={plan}
        windowMin={windowMin}
        canUndo={canUndo}
        onUndo={undoStep}
        onOpenBrief={() => setBriefOpen(true)}
      />}

      {demoStep !== null && (
        <DemoCoach
          step={demoStep}
          nextStopName={nextStopName}
          canOverrun={overrunLeft}
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
            aria-label="Close objectives panel"
            onClick={() => setDrawerOpen(false)}
          />
        )}

        <aside
          className={`rail rail--objectives rail-scroll${drawerOpen ? ' is-open' : ''}`}
          aria-label="Mission and objectives"
        >
          <button type="button" className="icon-button drawer-close drawer-close--top" onClick={() => setDrawerOpen(false)} aria-label="Close panel">
            ✕
          </button>
          <section className="panel">
            <div className="panel-head">
              <div className="eyebrow">Region & mission</div>
            </div>
            <div className="panel-body space-y-2">
              <select className="w-full bg-[#0d1420] border border-cyan-900 rounded px-1.5 py-1 text-xs text-gray-200"
                value={scenarioId} onChange={e => switchScenario(e.target.value)}>
                {Object.entries(scenarios).map(([id, sc]) => <option key={id} value={id} disabled={!!sc.disabled}>{sc.label}{sc.disabled ? ' (in build)' : ''}</option>)}
              </select>
              <div className="text-[10px] text-gray-400 leading-snug">{scenario.blurb}</div>
              <div className="text-[9px] text-gray-500 leading-snug border border-gray-800 rounded p-2 bg-[#0d1420]/60 mt-1">
                Supported coverage: the dashed frame on the map ({GRID_SRC[region]}). Routes compute only inside it; outside points are rejected, never guessed.
              </div>
            </div>
          </section>

          <SolTimeline stations={scenarioStations} region={region} roverTrack={roverTrack} solLimit={solLimit} setSolLimit={setSolLimit} />

          <StationPanel appMode={appMode} stations={appMode === 'route' ? realPlaces : scenarioStations} baseId={baseId} priorities={priorities}
            setPriority={(id, v) => setPriorities(p => ({ ...p, [id]: v }))}
            mustHaves={mustHaves}
            toggleMustHave={id => setMustHaves(m => m.includes(id) ? m.filter(x => x !== id) : [...m, id])}
            droppedIds={plan.dropped.map(d => d.id)}
            coverageDropIds={(plan.coverageDrops || []).map(d => d.id)}
            visitedLegs={plan.visitedLegs}
            onRemoveWaypoint={removeWaypoint}
            onClose={() => setDrawerOpen(false)} />

          <section className="panel">
            <div className="eyebrow">Your waypoints</div>
            <div className="text-[10px] text-gray-400 mb-1">Coordinates only - no science objective is invented for them. They are navigation points: always kept on the route.</div>
            <button onClick={() => { setAddMode(a => !a); setWaypointError(null); }}
              className={`w-full px-2 py-1 rounded text-[11px] font-bold ${addMode ? 'bg-cyan-700 text-white' : 'bg-[#101826] border border-cyan-900 text-cyan-300'}`}>
              {addMode ? 'Click the map to place it… (cancel)' : '+ Add waypoint on map'}
            </button>
            <CoordinateEntry onAdd={addWaypoint} />
            {waypointError && <div className="mt-1 text-[10px] text-amber-400">{waypointError}</div>}
          </section>
        </aside>

        <main className="map-stage" aria-label="Mission map">
          <div className="map-shell">
            <div
              className={`map-pane${viewMode === '2d' ? ' is-active' : ' is-hidden'}`}
              aria-hidden={viewMode === '2d' ? undefined : true}
              inert={viewMode === '2d' ? undefined : true}
            >
              <MapView stations={appMode === 'route' ? realPlaces : scenarioStations} plan={plan} geojson={geojson}
                roverTrack={roverTrack} terrainMeta={terrainMeta} contours={contours}
                layers={layers} setLayers={setLayers} region={region} baseId={baseId} solLimit={solLimit}
                addMode={addMode} onMapClick={(lat, lon) => addWaypoint(lat, lon)}
                onMoveWaypoint={moveWaypoint}
                legsProvider={activeLegs} routeModel={routeModel} setRouteModel={setRouteModel} abLeg={abFrom && abTo && !(followTraverse && traverseResult && !traverseResult.ok) ? [abFrom, abTo] : null}
                abGeometry={traverseResult && traverseResult.ok ? traverseResult.pathLatLon : null}
                abGeometryParts={traverseResult && traverseResult.ok ? traverseResult.pathParts : null}
                showPlan={appMode === 'planner'}
                mapResetKey={viewMode !== 'global' ? mapResetKey : undefined}
                onInspectPoint={(lat, lon) => { setInspectedPoint({ lat, lon }); setBottomSheetOpen(true); setBottomSheetContent('inspector'); }} />
            </div>

            {terrainMounted && (
              <div
                className={`map-pane${viewMode === '3d' ? ' is-active' : ' is-hidden'}`}
                aria-hidden={viewMode === '3d' ? undefined : true}
                inert={viewMode === '3d' ? undefined : true}
              >
                <Suspense fallback={<div className="terrain-loading">Loading 3D terrain…</div>}>
                  <Terrain3D
                    stations={appMode === 'route'
                      ? (realPlaces.filter(x => x.id === abFrom || x.id === abTo).length ? realPlaces.filter(x => x.id === abFrom || x.id === abTo) : realPlaces)
                      : scenarioStations}
                    plan={plan} region={region} baseId={baseId}
                    mode={appMode === 'route' ? 'route' : 'planner'} abPath={abPath3D} abParts={abParts3D} />
                </Suspense>
              </div>
            )}

            <div
              className={`map-pane${viewMode === 'global' ? ' is-active' : ' is-hidden'}`}
              aria-hidden={viewMode === 'global' ? undefined : true}
              inert={viewMode === 'global' ? undefined : true }
            >
              {viewMode === 'global' && (
                <GlobalView
                  onOpenRegion={(r) => { switchScenario(r === 'gale' ? 'gale' : 'delta'); setViewMode('2d'); }}
                  endpoints={globeEndpoints}
                  routeModel={routeModel}
                  routeVisible={routeVisible}
                  onToggleRoute={() => setRouteVisible(v => !v)}
                />
              )}
            </div>

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
                <button
                  type="button"
                  className={viewMode === 'global' ? 'is-active' : ''}
                  aria-pressed={viewMode === 'global'}
                  onClick={() => setViewMode('global')}
                >
                  <OrbitSmallIcon size={14} />
                  <span>Global</span>
                </button>
              </div>

              {viewMode !== 'global' && (
                <button
                  type="button"
                  className="tool-toggle"
                  onClick={() => setMapResetKey((k) => k + 1)}
                >
                  <ResetIcon />
                  <span>Reset view</span>
                </button>
              )}
            </div>

            <div className="map-source">
              {viewMode === 'global'
                ? 'Viking MDIM 2.1 color 232 m/px · NASA/JPL Mars Trek'
                : `Mars EQC · ${region === 'gale' ? 'MSL Gale ortho · USGS DEM 2 m' : 'CTX ortho · USGS SIM 3464'}`}
            </div>
          </div>
        </main>

        <div className="rail rail--control rail-scroll">
          {appMode === 'planner' && <TimeControl windowMin={windowMin} dwellMin={dwellMin} paceKmh={paceKmh}
            setWindowMin={setWindowMin} setDwellMin={setDwellMin} setPaceKmh={setPaceKmh}
            overrunLeft={overrunLeft}
            overrunApplied={visited.length > 0 && !!visited[visited.length - 1].overrun}
            onOverrun={() => recordStop(60)}
            onUndoOverrun={() => setVisited(v => (v.length && v[v.length - 1].overrun) ? v.slice(0, -1) : v)}
            onReset={() => setVisited([])} />}

          <section className="panel text-xs">
            <div className="panel-head">
              <div className="eyebrow">Route between two points</div>
            </div>
            <div className="panel-body space-y-3">
              <div className="text-[10px] text-gray-400 leading-relaxed">
                Pick any two real places (or your own waypoints) - no assumed base, no automatic return. Geometry follows the route model chosen in the map Layers panel.
              </div>
              <div className="route-pair">
                <span className="route-label">From</span>
                <div className="relative flex-1 min-w-0">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 w-[6px] h-[6px] rounded-full bg-[#22d3ee]/60"></span>
                  <select aria-label="Route from" className="route-select"
                    value={abFrom || ''} onChange={e => setAbFrom(e.target.value || null)}>
                    <option value="">From...</option>
                    {realPlaces.filter(s => s.lat != null).map(s => <option key={s.id} value={s.id}>{s.short || s.name}</option>)}
                  </select>
                </div>
                <button
                  type="button"
                  title="Swap from/to"
                  aria-label="Swap route endpoints"
                  className="swap-btn"
                  onClick={() => { const t = abTo; setAbTo(abFrom); setAbFrom(t); }}
                >
                  <SwapIcon size={13} />
                </button>
                <span className="route-label">To</span>
                <div className="relative flex-1 min-w-0">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 w-[6px] h-[6px] rounded-full bg-[#f87171]/50"></span>
                  <select aria-label="Route to" className="route-select"
                    value={abTo || ''} onChange={e => setAbTo(e.target.value || null)}>
                    <option value="">To...</option>
                    {realPlaces.filter(s => s.lat != null && s.id !== abFrom).map(s => <option key={s.id} value={s.id}>{s.short || s.name}</option>)}
                  </select>
                </div>
              </div>
              {region === 'gale' && traverseGraph && (
                <label className={`layer-check flex items-start gap-2 text-[10px] ${followTraverse ? 'layer-check--on' : ''}`}>
                  <input type="checkbox" checked={followTraverse} onChange={e => setFollowTraverse(e.target.checked)} />
                  <span className="layer-check-box"></span>
                  <span>Follow Curiosity's recorded drive path (NASA MSL MMGIS traverse). Historical record, not a surveyed or walkable route. Refuses when the record has a gap.</span>
                </label>)}
              {region === 'gale' && traverseGraph && followTraverse && (
                <label className={`layer-check flex items-start gap-2 text-[10px] ${allowTraverseConnectors ? 'layer-check--on' : ''}`}>
                  <input type="checkbox" checked={allowTraverseConnectors} onChange={e => setAllowTraverseConnectors(e.target.checked)} />
                  <span className="layer-check-box"></span>
                  <span className="text-amber-300/90">Experiment: bridge small archive gaps with synthetic connectors (dashed; NOT recorded drive ground - a routing convenience, not history).</span>
                </label>)}
              {region === 'gale' && followTraverse && abFrom && abTo && traverseResult && (
                traverseResult.ok ? (
                  <div className="text-[11px] text-gray-300">
                    {(traverseResult.distM / 1000).toFixed(2)} km along the recorded drives{traverseResult.syntheticM > 0 ? `, incl. ${Math.round(traverseResult.syntheticM)} m of dashed synthetic gap connectors (not recorded drive ground)` : ''}
                    <span className="text-gray-500"> (endpoints snap {Math.round(traverseResult.snapFromM)} m / {Math.round(traverseResult.snapToM)} m to the record, limit {SNAP_TOLERANCE_M} m - those straight access hops are not drawn and not part of the distance)</span>
                    {traverseResult.reversed === true && (
                      <div className="text-amber-400 text-[10px]">Against the driven record: Curiosity drove this the other way{traverseResult.solFrom != null && traverseResult.solTo != null ? ` (sol ${traverseResult.solTo} -> ${traverseResult.solFrom})` : ''}. Shown reversed as geometry, not evidence it is drivable in reverse.</div>)}
                  </div>
                ) : traverseResult.reason === 'snap-too-far' ? (
                  <div className="text-[11px] text-amber-400">Off the recorded path: nearest recorded drives to the two points are {Math.round(Math.min(traverseResult.snapFromM, traverseResult.snapToM))} m and {Math.round(Math.max(traverseResult.snapFromM, traverseResult.snapToM))} m away (limit {traverseResult.toleranceM} m). No path drawn.</div>
                ) : traverseResult.reason === 'gap-in-record' ? (
                  <div className="text-[11px] text-amber-400">The recorded drives do not connect these two points - {traverseResult.gapM > 0 ? `the archive has a gap of about ${Math.round(traverseResult.gapM)} m here.` : 'the records end at the same spot but do not join (zero-distance archive break).'} No path drawn in strict recorded mode. Opt into the synthetic-connector experiment above to bridge it (dashed, not recorded ground).</div>
                ) : (
                  <div className="text-[11px] text-amber-400">The recorded drives do not connect these two points - the archive has a gap here. No path drawn.</div>
                ))}
              {abFrom && abTo && !(followTraverse && traverseResult && !traverseResult.ok) && !traverseResult?.ok && (
                abMetrics
                  ? <div className="text-[11px] text-gray-300">
                      {(abMetrics.dist / 1000).toFixed(2)} km - {Math.round(abMetrics.minutes)} min walk{Math.round(abMetrics.asc) > 0 ? ` - +${Math.round(abMetrics.asc)} m up` : ''}
                      <span className="text-gray-500"> ({routeModel === 'leastcost' ? 'least-cost terrain model' : 'straight-line baseline'}, one-way)</span>
                    </div>
                  : <div className="text-[11px] text-amber-400">No route: one of these points is outside the elevation data coverage, or the ground in between has no data. We do not guess a path.</div>
              )}
            </div>
          </section>

          {abFrom && abTo && (
            <RoutePointDetails
              fromStation={scenarioStations.find(s => s.id === abFrom)}
              toStation={scenarioStations.find(s => s.id === abTo)} />
          )}

          <RadiationCard region={region} />

          <HistoricalEvents region={region} />

          {appMode === 'planner' && <section className="panel text-xs space-y-1.5">
            <div className="eyebrow">Route options</div>
            <label className="flex items-center gap-2">
              <span className="text-gray-400">Start at</span>
              <select className="flex-1 bg-[#0d1420] border border-cyan-900 rounded px-1.5 py-0.5 text-xs text-gray-200"
                value={baseId} onChange={e => setBaseOverride(e.target.value === scenario.base ? null : e.target.value)}>
                {scenarioStations.filter(s => s.lat != null).map(s => (
                  <option key={s.id} value={s.id}>{s.id === scenario.base ? `${s.short || s.name} (recorded site position)` : (s.short || s.name)}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-gray-400">
              <input type="checkbox" checked={roundTrip} onChange={e => setRoundTrip(e.target.checked)} />
              Return to start{!roundTrip ? <span className="text-amber-400 text-[10px]">- one-way: plan ends at the last stop, no return leg is counted</span> : null}
            </label>
          </section>}

          {appMode === 'planner' && <PlanSummary plan={plan} windowMin={windowMin} dwellMin={dwellMin} paceKmh={paceKmh} dtmNote={legs.dtm} routeModel={routeModel}
                planA={planA} onPinA={pinPlanA} onClearA={() => setPlanA(null)} />}
          {appMode === 'planner' && <ElevationProfile plan={plan} stations={scenarioStations} legsData={legs} />}
        </div>
      </div>

      {bottomSheetOpen && bottomSheetContent === 'inspector' && inspectedPoint && (
        <BottomSheet
          open={bottomSheetOpen}
          onClose={() => { setBottomSheetOpen(false); setInspectedPoint(null); }}
          title="Point inspector"
          ariaLabel="Point inspector details">
          <PointInspector
            pt={inspectedPoint}
            grid={activeLegs && activeLegs._grid}
            geojson={geojson}
            region={region}
            stations={scenarioStations}
            roverTrack={roverTrack}
            onClear={() => { setBottomSheetOpen(false); setInspectedPoint(null); }} />
        </BottomSheet>
      )}

      <MissionBrief
        open={briefOpen}
        onClose={() => setBriefOpen(false)}
      />
    </div>
  );
}

// Manual coordinate entry for a user waypoint (same coverage check as map clicks).
function CoordinateEntry({ onAdd }) {
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const la = parseFloat(lat), lo = parseFloat(lon);
  const valid = Number.isFinite(la) && Number.isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 360;
  return (
    <form className="mt-1 flex gap-1 items-center" onSubmit={e => { e.preventDefault(); if (valid) { onAdd(la, lo); setLat(''); setLon(''); } }}>
      <input value={lat} onChange={e => setLat(e.target.value)} placeholder="lat" inputMode="decimal"
        className="flex-1 bg-[#0a0e17] border-[var(--line-strong)] rounded px-1.5 py-1 text-xs text-gray-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500" />
      <input value={lon} onChange={e => setLon(e.target.value)} placeholder="lon" inputMode="decimal"
        className="flex-1 bg-[#0a0e17] border-[var(--line-strong)] rounded px-1.5 py-1 text-xs text-gray-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500" />
      <button type="submit" disabled={!valid}
        className="flex-shrink-0 px-2 py-1 rounded border border-cyan-500/60 bg-cyan-900/10 text-cyan-400 font-semibold text-[10px] hover:bg-cyan-900/30 disabled:opacity-40 disabled:border-cyan-900 disabled:text-cyan-600">add</button>
    </form>
  );
          }
