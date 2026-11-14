import { useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import MapView from './components/MapView.jsx';

const Terrain3D = lazy(() => import('./components/Terrain3D.jsx'));
import MissionStatusBar from './components/MissionStatusBar.jsx';
import MissionDecision from './components/MissionDecision.jsx';
import StationPanel from './components/StationPanel.jsx';
import TimeControl from './components/TimeControl.jsx';
import PlanSummary from './components/PlanSummary.jsx';
import SolTimeline from './components/SolTimeline.jsx';
import HistoricalEvents from './components/HistoricalEvents.jsx';
import ElevationProfile from './components/ElevationProfile.jsx';
import RoutePointDetails from './components/RoutePointDetails.jsx';
import MissionBrief from './components/MissionBrief.jsx';
import GlobalView from './components/GlobalView.jsx';
import RouteCompare from './components/RouteCompare.jsx';
import PointInspector from './components/PointInspector.jsx';
import DemoCoach from './components/DemoCoach.jsx';
import { MapIcon, TerrainIcon, ResetIcon, OrbitSmallIcon } from './components/Icons.jsx';
import { buildPlan, legMetrics } from './lib/planner.js';
import { buildTraverseGraph, traversePath, SNAP_TOLERANCE_M } from './lib/traverse.js';
import { createGrid, createGridFromBin, createRuntimeLegs, containsLatLon } from './lib/terrain.js';
import { compareRoutes, geologyAlongPath } from './lib/inspect.js';
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
  const [hiHm, setHiHm] = useState(null);               // Jezero-only 4 m DTM (binary) for profiles/inspector
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
  // Gale: optionally follow Curiosity's recorded drive path between the pair
  const [followTraverse, setFollowTraverse] = useState(false);
  const [allowTraverseConnectors, setAllowTraverseConnectors] = useState(false);
  // Primary experience = two-point routing between real places. The multi-stop
  // mission planner is preserved as a secondary mode the user opens explicitly.
  const [appMode, setAppMode] = useState('route');
  const [waypointError, setWaypointError] = useState(null);
  // Route comparison: show the straight geometric baseline and the
  // slope-aware least-cost path for the same two endpoints, side by side.
  // Neither is labeled shortest/easiest/safe.
  const [compareOn, setCompareOn] = useState(stored?.compareOn ?? true);
  // Arbitrary-point inspector: click the map, read what the data says there.
  const [inspectMode, setInspectMode] = useState(false);
  const [inspectPt, setInspectPt] = useState(null);
  const [layers, setLayers] = useState({
    geology: true, roverRoute: false, roverStops: false,
    elevRamp: false, hillshade: false, slope: false, contours: false, crismVna: false, overlayOpacity: 0.55,
    // Per feature-type visibility (user request: each type independent, shapes not color alone)
    plannedRoute: true, droppedLegs: true, objectives: true, baseMarker: true, userWps: true, events: true,
  });

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [briefOpen, setBriefOpen] = useState(false);
  const [demoStep, setDemoStep] = useState(null);
  const [mapResetKey, setMapResetKey] = useState(0);
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
    setHiHm(null);
    if (region === 'jezero') {
      // Verified 4 m USGS DTM (same MOLA-DeltaGeoid product family as the
      // 20 m grid by file naming, numerically close; neither GeoTIFF carries
      // an explicit vertical-datum tag, so this is a qualified match, not a
      // documented one; 100% window coverage) - profiles + point inspector
      // only; routing stays on the 20 m grid both routes share.
      fetch('/data/heightmap_jezero_4m.json').then(r => r.ok ? r.json() : null)
        .then(m => m ? fetch(m.bin).then(r => r.arrayBuffer()).then(buf => setHiHm({ region, meta: m, buf })) : null)
        .catch(() => setHiHm(null));
    }
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
  const hiGrid = useMemo(() => {
    if (!hiHm || hiHm.region !== region) return null;
    try { return createGridFromBin(hiHm.meta, hiHm.buf); } catch { return null; }
  }, [hiHm, region]);
  const ptsOf = useMemo(() => {
    const map = Object.fromEntries(scenarioStations.filter(s => s.lat != null).map(s => [s.id, { lat: s.lat, lon: s.lon }]));
    return (id) => map[id] || null;
  }, [scenarioStations]);
  const activeLegs = useMemo(
    () => (grid && legsData && legsData.region === region)
      ? createRuntimeLegs(grid, ptsOf, { shippedMeta: legsData.payload.legsMeta, routeModel, srcLabel: GRID_SRC[region], hiGrid })
      : null,
    [grid, hiGrid, legsData, region, ptsOf, routeModel]);

  // Route mode lists REAL places only: declared scenario conveniences
  // (e.g. GaleBase, a hypothetical start at a recorded position) stay in the
  // planner, never in the real-place catalog or From/To selectors.
  const realPlaces = useMemo(() => scenarioStations.filter(s => !s.scenarioOnly), [scenarioStations]);

  const abMetrics = useMemo(() => {
    if (!activeLegs || !abFrom || !abTo || abFrom === abTo) return null;
    // null = unroutable (outside coverage / no-data): surfaced as such, never invented
    return legMetrics(activeLegs, abFrom, abTo, paceKmh);
  }, [activeLegs, abFrom, abTo, paceKmh]);

  const abPlan = useMemo(() => {
    if (!abFrom || !abTo || !abMetrics) return null;
    return {
      isTwoPoint: true,
      baseId: abFrom,
      visitedLegs: [],
      sim: {
        legs: [{
          from: abFrom,
          to: abTo,
          metrics: abMetrics,
        }],
        total: abMetrics.minutes,
      },
    };
  }, [abFrom, abTo, abMetrics]);

  const fromStation = useMemo(() => realPlaces.find(s => s.id === abFrom), [realPlaces, abFrom]);
  const toStation = useMemo(() => realPlaces.find(s => s.id === abTo), [realPlaces, abTo]);

  const traverseGraph = useMemo(
    () => (region === 'gale' && roverTrack && roverTrack.segments) ? buildTraverseGraph(roverTrack) : null,
    [region, roverTrack]);

  // Route comparison: both declared models for the same endpoints, computed
  // on the shared elevation grid. Skipped while the recorded-traverse mode
  // owns the route (historical geometry is neither grid model).
  const abCompare = useMemo(() => {
    if (!compareOn || appMode !== 'route' || followTraverse || !grid || !abFrom || !abTo || abFrom === abTo) return null;
    const a = ptsOf(abFrom), b = ptsOf(abTo);
    if (!a || !b) return null;
    return compareRoutes(grid, a, b, { srcLabel: GRID_SRC[region], hiGrid });
  }, [compareOn, appMode, followTraverse, grid, hiGrid, abFrom, abTo, ptsOf, region]);
  // Mapped geology along each compared route (Jezero SIM 3464 polygons only;
  // Gale has no integrated polygon layer - the panel says so explicitly).
  const abGeology = useMemo(() => {
    if (region !== 'jezero' || !geojson || !abCompare) return null;
    const a = ptsOf(abFrom), b = ptsOf(abTo);
    if (!a || !b) return null;
    return {
      straight: abCompare.straight ? geologyAlongPath(geojson, [[a.lat, a.lon], [b.lat, b.lon]]) : null,
      leastCost: abCompare.leastCost ? geologyAlongPath(geojson, abCompare.leastCost.pathLatLon) : null,
    };
  }, [region, geojson, abCompare, abFrom, abTo, ptsOf]);
  // Same geometry handed to the 2D map and the 3D terrain so both views draw
  // exactly what the comparison table reports.
  const abCompareGeom = useMemo(() => {
    if (!abCompare) return null;
    const a = ptsOf(abFrom), b = ptsOf(abTo);
    return {
      straight: abCompare.straight && a && b ? [[a.lat, a.lon], [b.lat, b.lon]] : null,
      leastCost: abCompare.leastCost ? abCompare.leastCost.pathLatLon : null,
    };
  }, [abCompare, abFrom, abTo, ptsOf]);
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
        scenarioId, priorities, mustHaves, windowMin, dwellMin, paceKmh, roundTrip, baseOverride, customPts, compareOn,
      }));
    } catch { /* storage full/blocked: plan still works for the session */ }
  }, [scenarioId, priorities, mustHaves, windowMin, dwellMin, paceKmh, roundTrip, baseOverride, customPts, compareOn]);

  const toggleAddMode = () => { setAddMode(a => !a); setWaypointError(null); setInspectMode(false); };
  const toggleInspectMode = () => { setInspectMode(v => !v); setAddMode(false); setWaypointError(null); };

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

  const [toast, setToast] = useState(null);
  const prevPlanSnapshot = useRef(null);

  const resetView = () => {
    setMapResetKey((k) => k + 1);
  };

  const resetPlan = () => {
    prevPlanSnapshot.current = {
      abFrom, abTo, customPts, visited, inspectPt, inspectMode,
      solLimit, mustHaves, priorities, windowMin, dwellMin, paceKmh,
      roundTrip, baseOverride, layers,
    };

    setAbFrom(null);
    setAbTo(null);
    setCustomPts({ jezero: [], gale: [] });
    setVisited([]);
    setInspectPt(null);
    setInspectMode(false);
    setSolLimit(null);
    setMustHaves([]);
    setPriorities(scenarios[scenarioId]?.priorities || scenarios.delta.priorities);
    setWindowMin(300);
    setDwellMin(60);
    setPaceKmh(1.0);
    setRoundTrip(false);
    setBaseOverride(null);
    setLayers({
      geology: true, roverRoute: false, roverStops: false,
      elevRamp: false, hillshade: false, slope: false, contours: false, crismVna: false, overlayOpacity: 0.55,
      plannedRoute: true, droppedLegs: true, objectives: true, baseMarker: true, userWps: true, events: true,
    });
    setMapResetKey((k) => k + 1);

    setToast({
      message: 'Plan cleared.',
      onUndo: () => {
        if (prevPlanSnapshot.current) {
          const s = prevPlanSnapshot.current;
          setAbFrom(s.abFrom);
          setAbTo(s.abTo);
          setCustomPts(s.customPts);
          setVisited(s.visited);
          setInspectPt(s.inspectPt);
          setInspectMode(s.inspectMode);
          setSolLimit(s.solLimit);
          setMustHaves(s.mustHaves);
          setPriorities(s.priorities);
          setWindowMin(s.windowMin);
          setDwellMin(s.dwellMin);
          setPaceKmh(s.paceKmh);
          setRoundTrip(s.roundTrip);
          setBaseOverride(s.baseOverride);
          setLayers(s.layers);
          prevPlanSnapshot.current = null;
          setToast(null);
        }
      }
    });
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

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
          <section className="panel text-xs space-y-2">
            <div className="eyebrow">Region & mission</div>
            <select aria-label="Select mission scenario" className="station-select w-full"
              value={scenarioId} onChange={e => switchScenario(e.target.value)}>
              {Object.entries(scenarios).map(([id, sc]) => <option key={id} value={id} disabled={!!sc.disabled}>{sc.label}{sc.disabled ? ' (in build)' : ''}</option>)}
            </select>
            <div className="text-xs text-slate-300 leading-normal">{scenario.blurb}</div>
            <details className="disclosure mt-1">
              <summary className="text-xs">Coverage & data limits</summary>
              <div className="disclosure-body text-xs text-slate-300 leading-normal">
                Supported coverage: dashed frame on map ({GRID_SRC[region]}). Routes compute only inside it; outside points are rejected.
              </div>
            </details>
          </section>

          <SolTimeline stations={scenarioStations} region={region} roverTrack={roverTrack} solLimit={solLimit} setSolLimit={setSolLimit} />

          <HistoricalEvents region={region} />

          <StationPanel appMode={appMode} stations={appMode === 'route' ? realPlaces : scenarioStations} baseId={baseId} priorities={priorities}
            setPriority={(id, v) => setPriorities(p => ({ ...p, [id]: v }))}
            mustHaves={mustHaves}
            toggleMustHave={id => setMustHaves(m => m.includes(id) ? m.filter(x => x !== id) : [...m, id])}
            droppedIds={plan.dropped.map(d => d.id)}
            coverageDropIds={(plan.coverageDrops || []).map(d => d.id)}
            visitedLegs={plan.visitedLegs}
            onRemoveWaypoint={removeWaypoint}
            onClose={() => setDrawerOpen(false)} />

          <section className="panel text-xs space-y-2">
            <div className="eyebrow">Your waypoints</div>
            <div className="text-xs text-slate-300">Coordinates only — no science objective is attached. Navigation points are always kept on route.</div>
            <button
              type="button"
              onClick={toggleAddMode}
              className={`btn btn-sm w-full font-bold ${addMode ? 'btn-primary' : 'btn-secondary'}`}
            >
              {addMode ? 'Cancel waypoint placement (active)' : '+ Add waypoint on map'}
            </button>
            <CoordinateEntry onAdd={addWaypoint} />
            {waypointError && <div className="text-xs text-amber-400 bg-amber-950/30 border border-amber-500/40 rounded-lg p-2">{waypointError}</div>}
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
                inspectMode={inspectMode} inspectPt={inspectPt} onInspect={(lat, lon) => setInspectPt({ lat, lon })}
                legsProvider={activeLegs} routeModel={routeModel} setRouteModel={setRouteModel} abLeg={abFrom && abTo && !(followTraverse && traverseResult && !traverseResult.ok) ? [abFrom, abTo] : null}
                abGeometry={traverseResult && traverseResult.ok ? traverseResult.pathLatLon : null}
                abGeometryParts={traverseResult && traverseResult.ok ? traverseResult.pathParts : null}
                abCompareGeom={appMode === 'route' ? abCompareGeom : null}
                showPlan={appMode === 'planner'}
                resetKey={mapResetKey} />
            </div>

            {terrainMounted && (
              <div
                className={`map-pane${viewMode === '3d' ? ' is-active' : ' is-hidden'}`}
                aria-hidden={viewMode === '3d' ? undefined : true}
                inert={viewMode === '3d' ? undefined : true}
              >
                <Suspense fallback={<div className="terrain-loading">Loading 3D terrain…</div>}>
                  {/* key={region}: a region change tears down and rebuilds the
                      whole 3D scene instead of reconciling two different
                      regions' stations/labels/lines inside one Canvas - the
                      in-place swap crashed React's commit (NotFoundError
                      removeChild in a drei Html portal) on the second cycle. */}
                  <Terrain3D key={region}
                    stations={appMode === 'route'
                      ? (realPlaces.filter(x => x.id === abFrom || x.id === abTo).length ? realPlaces.filter(x => x.id === abFrom || x.id === abTo) : realPlaces)
                      : scenarioStations}
                    plan={plan} region={region} baseId={baseId}
                    mode={appMode === 'route' ? 'route' : 'planner'} abPath={abPath3D} abParts={abParts3D}
                    abCompare={appMode === 'route' ? abCompareGeom : null}
                    legsProvider={appMode === 'planner' ? activeLegs : null}
                    resetKey={mapResetKey} />
                </Suspense>
              </div>
            )}

            <div
              className={`map-pane${viewMode === 'global' ? ' is-active' : ' is-hidden'}`}
              aria-hidden={viewMode === 'global' ? undefined : true}
              inert={viewMode === 'global' ? undefined : true }
            >
              {viewMode === 'global' && (
                <GlobalView onOpenRegion={(r) => { switchScenario(r === 'gale' ? 'gale' : 'delta'); setViewMode('2d'); }} resetKey={mapResetKey} />
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

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  className="tool-toggle"
                  title="Reset camera and framing to default"
                  onClick={resetView}
                >
                  <ResetIcon />
                  <span>Reset view</span>
                </button>
                <button
                  type="button"
                  className="tool-toggle text-amber-300 hover:text-amber-200"
                  title="Clear all waypoints, visited stops, and route selections"
                  onClick={resetPlan}
                >
                  <span>Reset plan</span>
                </button>
              </div>
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
            onReset={resetPlan} />}

          <section className="panel text-xs space-y-2.5">
            <div className="eyebrow">Two-point route</div>
            <div className="text-xs text-slate-400">
              Pick any two real places (or your own waypoints) — no assumed base, no automatic return.
            </div>

            <div className="grid grid-cols-[1fr,auto,1fr] items-center gap-2 pt-1">
              <div>
                <label className="block text-[11px] font-mono text-cyan-400 mb-1">FROM</label>
                <select aria-label="Route from" className="station-select w-full"
                  value={abFrom || ''} onChange={e => setAbFrom(e.target.value || null)}>
                  <option value="">Origin...</option>
                  {realPlaces.filter(s => s.lat != null).map(s => <option key={s.id} value={s.id}>{s.short || s.name}</option>)}
                </select>
              </div>
              <div className="text-cyan-400 font-bold pt-4 text-center">→</div>
              <div>
                <label className="block text-[11px] font-mono text-cyan-400 mb-1">TO</label>
                <select aria-label="Route to" className="station-select w-full"
                  value={abTo || ''} onChange={e => setAbTo(e.target.value || null)}>
                  <option value="">Destination...</option>
                  {realPlaces.filter(s => s.lat != null && s.id !== abFrom).map(s => <option key={s.id} value={s.id}>{s.short || s.name}</option>)}
                </select>
              </div>
            </div>

            <div className="pt-1">
              <div className="text-xs text-slate-400 mb-1 font-medium">Route model:</div>
              <div className="segmented w-full">
                <button
                  type="button"
                  className={`flex-1 justify-center ${routeModel === 'straight' ? 'is-active' : ''}`}
                  onClick={() => setRouteModel('straight')}
                >
                  Straight baseline
                </button>
                <button
                  type="button"
                  className={`flex-1 justify-center ${routeModel === 'leastcost' ? 'is-active' : ''}`}
                  onClick={() => setRouteModel('leastcost')}
                >
                  Least-cost terrain
                </button>
              </div>
            </div>

            {region === 'gale' && traverseGraph && (
              <label className="flex items-start gap-2 text-xs text-slate-300 cursor-pointer pt-1">
                <input type="checkbox" className="mt-0.5 accent-cyan-400" checked={followTraverse} onChange={e => setFollowTraverse(e.target.checked)} />
                <span>Follow Curiosity's recorded drive path (NASA MSL MMGIS traverse). Refuses when archive has a gap.</span>
              </label>
            )}

            {region === 'gale' && traverseGraph && followTraverse && (
              <label className="flex items-start gap-2 text-xs text-amber-300 cursor-pointer pl-4">
                <input type="checkbox" className="mt-0.5 accent-amber-400" checked={allowTraverseConnectors} onChange={e => setAllowTraverseConnectors(e.target.checked)} />
                <span>Experiment: bridge small archive gaps with synthetic connectors (dashed, not recorded drive ground).</span>
              </label>
            )}

            {region === 'gale' && followTraverse && abFrom && abTo && traverseResult && (
              traverseResult.ok ? (
                <div className="pt-1 space-y-1.5">
                  <div className="flex flex-wrap gap-1.5">
                    <span className="chip chip--cyan mono">{(traverseResult.distM / 1000).toFixed(2)} km</span>
                    <span className="chip chip--green mono">NASA Traverse</span>
                    {traverseResult.syntheticM > 0 && (
                      <span className="chip chip--amber mono">+{Math.round(traverseResult.syntheticM)} m synthetic</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 leading-normal">
                    Endpoints snap {Math.round(traverseResult.snapFromM)} m / {Math.round(traverseResult.snapToM)} m to record (limit {SNAP_TOLERANCE_M} m).
                  </div>
                  {traverseResult.reversed === true && (
                    <div className="text-amber-300 text-xs bg-amber-950/30 border border-amber-500/40 rounded-lg p-2">
                      Against driven record: Curiosity drove this the other way{traverseResult.solFrom != null && traverseResult.solTo != null ? ` (sol ${traverseResult.solTo} → ${traverseResult.solFrom})` : ''}.
                    </div>
                  )}
                </div>
              ) : traverseResult.reason === 'snap-too-far' ? (
                <div className="text-xs text-amber-300 bg-amber-950/30 border border-amber-500/40 rounded-lg p-2">
                  Off recorded path: nearest recorded drives are {Math.round(Math.min(traverseResult.snapFromM, traverseResult.snapToM))} m and {Math.round(Math.max(traverseResult.snapFromM, traverseResult.snapToM))} m away (limit {traverseResult.toleranceM} m). No path drawn.
                </div>
              ) : traverseResult.reason === 'gap-in-record' ? (
                <div className="text-xs text-amber-300 bg-amber-950/30 border border-amber-500/40 rounded-lg p-2">
                  Recorded drives do not connect these points — {traverseResult.gapM > 0 ? `archive has ~${Math.round(traverseResult.gapM)} m gap here.` : 'records break at same spot.'} Enable synthetic connectors above to bridge.
                </div>
              ) : (
                <div className="text-xs text-amber-300 bg-amber-950/30 border border-amber-500/40 rounded-lg p-2">
                  Recorded drives do not connect these points. No path drawn.
                </div>
              )
            )}

            {abFrom && abTo && !(followTraverse && traverseResult && !traverseResult.ok) && !traverseResult?.ok && (
              abMetrics ? (
                <div className="pt-1 space-y-1.5">
                  <div className="flex flex-wrap gap-1.5">
                    <span className="chip chip--cyan mono">{(abMetrics.dist / 1000).toFixed(2)} km</span>
                    <span className="chip chip--amber mono">{Math.round(abMetrics.minutes)} min walk</span>
                    {Math.round(abMetrics.asc) > 0 && (
                      <span className="chip chip--green mono">+{Math.round(abMetrics.asc)} m asc</span>
                    )}
                    <span className="chip mono">{routeModel === 'leastcost' ? 'terrain model' : 'straight baseline'}</span>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-amber-300 bg-amber-950/30 border border-amber-500/40 rounded-lg p-2">
                  No route: point is outside elevation coverage, or ground has missing data.
                </div>
              )
            )}

            {!followTraverse && (
              <label className="flex items-start gap-2 text-xs text-slate-300 cursor-pointer pt-1">
                <input type="checkbox" className="mt-0.5 accent-cyan-400" checked={compareOn} onChange={e => setCompareOn(e.target.checked)} />
                <span>Compare both route models (straight baseline vs slope-aware least-cost)</span>
              </label>
            )}
            {followTraverse && (
              <div className="text-xs text-slate-400">
                Grid-model comparison is disabled while following the recorded drive path.
              </div>
            )}
          </section>

          {appMode === 'route' && compareOn && abCompare && !followTraverse && (
            <RouteCompare compare={abCompare} geology={abGeology} region={region} paceKmh={paceKmh}
              fromName={(realPlaces.find(x => x.id === abFrom) || {}).short || abFrom}
              toName={(realPlaces.find(x => x.id === abTo) || {}).short || abTo} />
          )}

          {appMode === 'route' && (fromStation || toStation) && (
            <RoutePointDetails fromStation={fromStation} toStation={toStation} />
          )}

          {appMode === 'route' && abPlan && (
            <ElevationProfile plan={abPlan} stations={realPlaces} legsData={legs} geojson={region === 'jezero' ? geojson : null} />
          )}

          <section className="panel text-xs space-y-2">
            <div className="eyebrow">Inspect any point</div>
            <div className="text-xs text-slate-400 leading-normal">
              Click the map to read elevation, local slope, mapped geology (Jezero), nearest places and recorded rover evidence.
            </div>
            <button
              type="button"
              onClick={toggleInspectMode}
              className={`btn btn-sm w-full font-bold ${inspectMode ? 'btn-primary' : 'btn-secondary'}`}
            >
              {inspectMode ? 'Cancel inspection (click active)' : 'Inspect a point on map'}
            </button>
          </section>
          {inspectPt && (
            <PointInspector pt={inspectPt} grid={grid} hiGrid={hiGrid} geojson={geojson} region={region}
              stations={realPlaces} roverTrack={roverTrack} onClear={() => setInspectPt(null)} />
          )}

          {appMode === 'planner' && (
            <section className="panel text-xs space-y-2">
              <div className="eyebrow">Route options</div>
              <label className="flex items-center gap-2">
                <span className="text-slate-400">Start at</span>
                <select
                  aria-label="Scenario start location"
                  className="station-select flex-1"
                  value={baseId}
                  onChange={e => setBaseOverride(e.target.value === scenario.base ? null : e.target.value)}
                >
                  {scenarioStations.filter(s => s.lat != null).map(s => (
                    <option key={s.id} value={s.id}>
                      {s.id === scenario.base ? `${s.short || s.name} (recorded site position)` : (s.short || s.name)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={roundTrip}
                  onChange={e => setRoundTrip(e.target.checked)}
                  className="accent-cyan-400"
                />
                <span>Return to start</span>
                {!roundTrip && (
                  <span className="chip chip--amber mono text-xs">One-way</span>
                )}
              </label>
              {!roundTrip && (
                <div className="text-xs text-amber-300/90 font-mono">
                  Plan ends at the last stop; no return leg is counted.
                </div>
              )}
            </section>
          )}

          {appMode === 'planner' && <PlanSummary plan={plan} windowMin={windowMin} dwellMin={dwellMin} paceKmh={paceKmh} dtmNote={legs.dtm} routeModel={routeModel}
                planA={planA} onPinA={pinPlanA} onClearA={() => setPlanA(null)} />}
          {appMode === 'planner' && <ElevationProfile plan={plan} stations={scenarioStations} legsData={legs} geojson={region === 'jezero' ? geojson : null} />}
        </div>
      </div>

      <MissionBrief
        open={briefOpen}
        onClose={() => setBriefOpen(false)}
      />

      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[2000] flex items-center gap-3 bg-[#0d1420]/95 border border-cyan-400 rounded-lg px-4 py-2 text-xs text-white shadow-2xl backdrop-blur-md">
          <span>{toast.message}</span>
          {toast.onUndo && (
            <button
              type="button"
              onClick={toast.onUndo}
              className="px-2.5 py-1 bg-cyan-700 hover:bg-cyan-600 rounded text-xs font-bold text-white shadow"
            >
              Undo
            </button>
          )}
          <button
            type="button"
            onClick={() => setToast(null)}
            className="text-slate-400 hover:text-white text-sm ml-1"
            aria-label="Close notification"
          >
            ✕
          </button>
        </div>
      )}
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
    <form className="mt-1 flex gap-1.5 items-center" onSubmit={e => { e.preventDefault(); if (valid) { onAdd(la, lo); setLat(''); setLon(''); } }}>
      <input value={lat} onChange={e => setLat(e.target.value)} placeholder="lat" inputMode="decimal"
        className="station-select w-1/2 font-mono text-xs" />
      <input value={lon} onChange={e => setLon(e.target.value)} placeholder="lon" inputMode="decimal"
        className="station-select w-1/2 font-mono text-xs" />
      <button type="submit" disabled={!valid}
        className="btn btn-primary btn-sm text-xs">add</button>
    </form>
  );
}
