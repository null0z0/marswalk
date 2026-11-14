import { MapContainer, ImageOverlay, GeoJSON, Polyline, Tooltip, Marker, CircleMarker, Rectangle, ZoomControl, useMap } from 'react-leaflet';
import { useEffect, useState } from 'react';
import eventsData from '../data/historicalEvents.json';
import medaData from '../data/meda.json';
import BottomSheet from './BottomSheet.jsx';
import { LayersIcon, InfoIcon, ResetIcon } from './Icons.jsx';

const EV_TYPE_LABEL = {
  dust_storm_regional: 'Regional dust storm',
  dust_storm_global: 'Planet-encircling dust event',
  dust_devil: 'Dust devil',
  marsquake: 'Marsquake',
  meteoroid_impact: 'Meteoroid impact',
  avalanche: 'Polar avalanche (CO2/dust fall)',
};
import L from 'leaflet';
import 'proj4leaflet';

const crs = new L.Proj.CRS('MARS:EQC',
  '+proj=eqc +lat_ts=0 +lat_0=0 +lon_0=0 +x_0=0 +y_0=0 +a=3396190 +b=3396190 +units=m +no_defs',
  { origin: [4573663.251, 1109693.14], resolutions: [128, 64, 32, 16, 8, 4, 2, 1, 0.5, 0.25] });
// proj4leaflet defaults R to Earth's 6371000 m; Mars sphere is 3396190 m, so
// override R or the Leaflet scale bar reports Earth-radius distances (~1.88x too long).
crs.R = 3396190;
const BOUNDS = [[18.43, 77.375], [18.485, 77.44]];
// Per-region basemap: url + lat/lon bounds. Gale bounds come from
// public/layers/gale/ortho_crop_extent.json (build_gale_ortho.py).
const ORTHO = {
  jezero: { url: '/layers/ortho_crop.jpg', bounds: BOUNDS, maxFitZoom: 5 },
  gale: { url: '/layers/gale/ortho_crop.jpg', bounds: [[-4.6194837, 137.4179935], [-4.5884924, 137.4499971]], maxFitZoom: 8 },
};

const STATION_STYLE = {
  Wildcat: { color: '#ffb02e', shape: 'circle' },
  Skinner: { color: '#2dd4bf', shape: 'diamond' },
  Kukaklek: { color: '#a78bfa', shape: 'triangle' },
  Shuyak: { color: '#f472b6', shape: 'square' },
  Mageik: { color: '#93c5fd', shape: 'pentagon' },
  Rocknest: { color: '#fdba74', shape: 'circle' },
  Shaler: { color: '#bef264', shape: 'diamond' },
  JohnKleinCumberland: { color: '#67e8f9', shape: 'square' },
  Departure: { color: '#fca5a5', shape: 'triangle' },
};

function stationIcon(s, dropped, visited, dim = false) {
  const st = STATION_STYLE[s.id] || { color: '#ffb02e', shape: 'circle' };
  const color = (s.id === 'Depot' || s.id === 'GaleBase') ? '#ffffff' : dropped ? '#884444' : visited ? '#44cc66' : st.color;
  const shape = st.shape === 'diamond'
    ? `width:13px;height:13px;background:${color};transform:rotate(45deg);border:2px solid #0a0e17;`
    : st.shape === 'triangle'
    ? `width:13px;height:13px;background:${color};clip-path:polygon(50% 0%, 0% 100%, 100% 100%);border:2px solid #0a0e17;`
    : st.shape === 'square'
    ? `width:12px;height:12px;background:${color};border:2px solid #0a0e17;`
    : st.shape === 'pentagon'
    ? `width:13px;height:13px;background:${color};clip-path:polygon(50% 0%, 100% 38%, 81% 100%, 19% 100%, 0% 38%);border:2px solid #0a0e17;`
    : `width:13px;height:13px;border-radius:50%;background:${color};border:2px solid #0a0e17;`;
  return L.divIcon({ className: '', iconSize: [16, 16], iconAnchor: [8, 8], html: `<div style="${dim ? 'opacity:0.25;' : ''}">${shape ? `<div style="${shape}"></div>` : ''}</div>` });
}

function FitStations({ stations, maxFitZoom, orthoBounds, resetKey = 0 }) {
  const map = useMap();
  useEffect(() => {
    // keep the view inside real imagery: the station cluster sits near the NE
    // corner of the Gale crop, and an unconstrained fit would frame mostly void
    const ob = L.latLngBounds(orthoBounds);
    map.setMaxBounds(ob.pad(0.005));
    const b = L.latLngBounds(stations.filter(s => s.lat != null).map(s => [s.lat, s.lon]));
    map.fitBounds(b.pad(0.6), { animate: resetKey > 0, maxZoom: maxFitZoom });
  }, [map, stations, maxFitZoom, orthoBounds, resetKey]);
  return null;
}

// Forwards map clicks to the parent while "add waypoint" or "inspect point"
// mode is active (the parent keeps them mutually exclusive).
// Implemented as a DOM listener + mouseEventToLatLng instead of Leaflet's map
// 'click' event: the geology polygons tile the whole crop as interactive
// layers, and Leaflet swallows the map click when an interactive layer is
// hit, so clicks on mapped ground would never reach us.
function MapClickHandler({ addMode, onMapClick, inspectMode = false, onInspect = null }) {
  const map = useMap();
  useEffect(() => {
    if (!addMode && !inspectMode) return undefined;
    const el = map.getContainer();
    let downX = 0, downY = 0;
    const onDown = (ev) => { downX = ev.clientX; downY = ev.clientY; };
    const onClick = (ev) => {
      // a pan ends with the mouse released somewhere else: not a placement click
      if (Math.hypot(ev.clientX - downX, ev.clientY - downY) > 5) return;
      // map controls (zoom buttons, attribution) and popup chrome are UI
      // interaction, not ground placement
      if (ev.target && ev.target.closest && ev.target.closest('.leaflet-popup, .leaflet-control')) return;
      const latlng = map.mouseEventToLatLng(ev);
      if (addMode && onMapClick) onMapClick(latlng.lat, latlng.lng);
      else if (inspectMode && onInspect) onInspect(latlng.lat, latlng.lng);
    };
    el.addEventListener('mousedown', onDown);
    el.addEventListener('click', onClick);
    return () => {
      el.removeEventListener('mousedown', onDown);
      el.removeEventListener('click', onClick);
    };
  }, [map, addMode, inspectMode, onMapClick, onInspect]);
  return null;
}

function ScaleControl() {
  const map = useMap();
  useEffect(() => {
    const sc = L.control.scale({ imperial: false, metric: true, position: 'bottomleft' });
    sc.addTo(map);
    return () => { sc.remove(); };
  }, [map]);
  return null;
}

const OVERLAY_LAYERS = (region) => {
  const dir = region === 'gale' ? '/layers/gale' : '/layers';
  const base = [
    { key: 'elevRamp', label: 'Elevation colors', url: `${dir}/elev_ramp.png` },
    { key: 'hillshade', label: 'Hillshade relief', url: `${dir}/hillshade.png` },
    { key: 'slope', label: 'Slope shading', url: `${dir}/slope.png` },
  ];
  return base;
};

export default function MapView({ stations, plan, geojson, roverTrack, terrainMeta, contours, layers, setLayers, region = 'jezero', baseId = 'Depot', solLimit = null, addMode = false, onMapClick = null, onMoveWaypoint = null, inspectMode = false, inspectPt = null, onInspect = null, legsProvider = null, routeModel = 'straight', setRouteModel = null, abLeg = null, abGeometry = null, abGeometryParts = null, abCompareGeom = null, showPlan = true, resetKey = 0, onResetView = null, onResetPlan = null }) {
  const ortho = ORTHO[region] || ORTHO.jezero;
  const byId = Object.fromEntries(stations.map(s => [s.id, s]));
  const droppedIds = plan.dropped.map(d => d.id);
  const visitedIds = plan.visitedLegs.map(l => l.to);
  const routePts = [];
  if (showPlan) {
    // plan legs may reference scenario-only points hidden in route mode
    for (const leg of plan.visitedLegs.concat(plan.sim.legs)) {
      if (byId[leg.from] && byId[leg.to]) routePts.push([byId[leg.from].lat, byId[leg.from].lon], [byId[leg.to].lat, byId[leg.to].lon]);
    }
  }
  const base = stations.find(s => s.id === baseId) || stations[0];
  const lastVisited = visitedIds.length ? byId[visitedIds[visitedIds.length - 1]] : base;
  const toggle = (k) => setLayers(prev => ({ ...prev, [k]: !prev[k] }));
  const [activeSheet, setActiveSheet] = useState(null);
  const [resetPopoverOpen, setResetPopoverOpen] = useState(false);
  const [layersSheetOpen, setLayersSheetOpen] = useState(false);
  const [legendSheetOpen, setLegendSheetOpen] = useState(false);

  return (
    <div className="relative h-full w-full">
      <MapContainer crs={crs} center={[(ortho.bounds[0][0] + ortho.bounds[1][0]) / 2, (ortho.bounds[0][1] + ortho.bounds[1][1]) / 2]} zoom={5} maxZoom={9} doubleClickZoom={false} zoomControl={false}
        style={{ height: '100%', width: '100%', background: '#0a0e17', cursor: (addMode || inspectMode) ? 'crosshair' : '' }}>
        {/* zoom controls bottom-right with 44px tap targets */}
        <ZoomControl position="bottomright" />
        <MapClickHandler addMode={addMode} onMapClick={onMapClick} inspectMode={inspectMode} onInspect={onInspect} />
        <FitStations stations={stations} maxFitZoom={ortho.maxFitZoom} orthoBounds={ortho.bounds} resetKey={resetKey} />
        <ScaleControl />
        <ImageOverlay key={region} url={ortho.url} bounds={ortho.bounds} opacity={1} />
        {/* honest coverage boundary: outside this rectangle there is no imagery */}
        <Rectangle bounds={ortho.bounds} pathOptions={{ color: '#8a8f98', weight: 1, dashArray: '4 6', fill: false, opacity: 0.6 }}
          eventHandlers={{}}>
          <Tooltip sticky className="station-label">Imagery coverage limit - no ortho data outside this frame</Tooltip>
        </Rectangle>
        {terrainMeta && OVERLAY_LAYERS(region).map(ol => layers[ol.key] && (
          <ImageOverlay key={ol.key} url={ol.url} bounds={terrainMeta.bounds} opacity={layers.overlayOpacity} />
        ))}
        {region === 'gale' && layers.crismVna && (
          <ImageOverlay key="crismvna" url="/layers/gale/crism_vna.png" bounds={ortho.bounds} opacity={layers.overlayOpacity} />
        )}
        {layers.contours && contours && (
          <GeoJSON key="contours" data={contours}
            style={() => ({ color: '#e5e7eb', weight: 0.7, opacity: 0.7 })}
            onEachFeature={(f, l) => l.bindTooltip(`${f.properties.elev} m`, { sticky: true })} />
        )}
        {layers.geology && geojson && (
          <GeoJSON key={(addMode || inspectMode) ? 'geo-modal' : 'geo'} data={geojson}
            style={() => ({ color: '#7cc4ff', weight: 1.75, fillOpacity: 0.07 })}
            onEachFeature={((addMode || inspectMode)
              // while a click mode is armed the click belongs to the mode -
              // the polygon must not swallow it into a popup
              ? undefined
              : (f, l) => l.bindPopup(`<b>${f.properties.name}</b> (${f.properties.symbol})`))} />
        )}
        {layers.roverRoute && roverTrack && roverTrack.route && (
          <Polyline positions={roverTrack.route.filter(p => solLimit == null || p[2] <= solLimit).map(p => [p[0], p[1]])}
            pathOptions={{ color: '#f97316', weight: 2, dashArray: '2 5', opacity: 0.9 }} />
        )}
        {layers.roverRoute && roverTrack && roverTrack.segments && roverTrack.segments.map((seg, i) => (
          <Polyline key={'seg' + i} positions={seg}
            pathOptions={{ color: '#f97316', weight: 2, opacity: 0.85 }} />
        ))}
        {layers.roverStops && roverTrack && roverTrack.stops.filter(st => solLimit == null || st.solFirst <= solLimit).map(st => (
          <CircleMarker key={'rs' + st.site} center={[st.lat, st.lon]} radius={4}
            pathOptions={{ color: '#f97316', weight: 1.5, fillColor: '#f97316', fillOpacity: 0.35 }}>
            <Tooltip direction="top" offset={[0, -4]} className="station-label">
              Recorded rover site {st.site} - sols {st.solFirst}-{st.solLast}
            </Tooltip>
          </CircleMarker>
        ))}
        {showPlan && layers.plannedRoute && routeModel === 'straight' && routePts.length > 1 && <Polyline positions={routePts} pathOptions={{ color: '#22d3ee', weight: 3 }} />}
        {showPlan && layers.plannedRoute && routeModel === 'leastcost' && legsProvider && plan.visitedLegs.concat(plan.sim.legs).map((leg, i) => {
          // drawn geometry is exactly the A* path the metrics were sampled on
          const meta = legsProvider.legsMeta[leg.from + '|' + leg.to];
          return meta && meta.pathLatLon
            ? <Polyline key={'lc' + i} positions={meta.pathLatLon} pathOptions={{ color: '#22d3ee', weight: 3 }} />
            : null; // unreachable leg: no invented geometry; plan reports it
        })}
        {layers.droppedLegs && droppedIds.map(id => (
          <Polyline key={'drop' + id} positions={[[lastVisited.lat, lastVisited.lon], [byId[id].lat, byId[id].lon]]}
            pathOptions={{ color: '#cc3333', weight: 2, dashArray: '6 6' }} />
        ))}
        {/* Route comparison mode: BOTH declared models for the same endpoints,
            drawn together - straight geometric baseline dashed gray, least-cost
            path solid lime. Exactly the geometries the comparison table samples. */}
        {abCompareGeom && abLeg && byId[abLeg[0]] && byId[abLeg[1]] && (
          <>
            {abCompareGeom.straight && (
              <Polyline positions={abCompareGeom.straight} pathOptions={{ color: '#9ca3af', weight: 2.5, dashArray: '6 6', opacity: 0.9 }}>
                <Tooltip sticky className="station-label">straight-line geometric baseline (not a proposed path)</Tooltip>
              </Polyline>
            )}
            {abCompareGeom.leastCost && (
              <Polyline positions={abCompareGeom.leastCost} pathOptions={{ color: '#a3e635', weight: 3.5 }}>
                <Tooltip sticky className="station-label">least-cost path (slope-aware model on the elevation grid; not a surveyed or safest route)</Tooltip>
              </Polyline>
            )}
          </>
        )}
        {!abCompareGeom && abLeg && legsProvider && byId[abLeg[0]] && byId[abLeg[1]] && (() => {
          // user-chosen two-point route (lime) - drawn geometry matches the active model
          const meta = legsProvider.legsMeta[abLeg[0] + '|' + abLeg[1]];
          const pos = abGeometry
            ? abGeometry // recorded-traverse following: the actual drive polylines
            : (routeModel === 'leastcost' && meta && meta.pathLatLon)
            ? meta.pathLatLon
            : [[byId[abLeg[0]].lat, byId[abLeg[0]].lon], [byId[abLeg[1]].lat, byId[abLeg[1]].lon]];
          if (abGeometryParts) {
            // recorded-traverse following: solid = actual recorded drive polylines,
            // dashed = our synthetic connectors bridging archive gaps (NOT driven ground)
            return abGeometryParts.map((part, i) => part.synthetic
              ? <Polyline key={'abp' + i} positions={part.latlons} pathOptions={{ color: '#a3e635', weight: 2.5, dashArray: '4 6', opacity: 0.8 }}>
                  <Tooltip sticky>synthetic connector - no recorded drive data across this gap (stop-pad join, not driven geometry)</Tooltip>
                </Polyline>
              : <Polyline key={'abp' + i} positions={part.latlons} pathOptions={{ color: '#a3e635', weight: 3.5 }} />);
          }
          return (abGeometry || routeModel === 'straight' || (meta && meta.pathLatLon))
            ? <Polyline positions={pos} pathOptions={{ color: '#a3e635', weight: 3.5 }} />
            : null; // unroutable: no line, the panel says why
        })()}
        {/* Inspect marker: the clicked point the inspector panel describes. */}
        {inspectPt && (
          <Marker position={[inspectPt.lat, inspectPt.lon]}
            icon={L.divIcon({ className: '', iconSize: [18, 18], iconAnchor: [9, 9], html: '<div style="width:14px;height:14px;border-radius:50%;background:transparent;border:3px solid #e879f9;box-shadow:0 0 0 2px #0a0e17;"></div>' })}>
            <Tooltip permanent direction="top" offset={[0, -10]} className="station-label">inspected point</Tooltip>
          </Marker>
        )}
        {/* Recorded MEDA weather sols (Jezero): pinned ONLY at the rover's
            recorded position that sol in the archived NASA M20 waypoints -
            a verified anchor, never a guessed event position. */}
        {layers.events && region === 'jezero' && roverTrack && roverTrack.route && Object.keys(medaData).map(Number).map(sol => {
          const rec = roverTrack.route.find(r => r[2] === sol);
          if (!rec) return null;
          return (
            <Marker key={`meda-${sol}`} position={[rec[0], rec[1]]}
              icon={L.divIcon({ className: '', iconSize: [14, 14], iconAnchor: [7, 7], html: '<div style="width:12px;height:12px;background:#fbbf24;border:1.5px solid #0a0e17;clip-path:polygon(50% 0%, 63% 35%, 98% 35%, 70% 57%, 81% 91%, 50% 70%, 19% 91%, 30% 57%, 2% 35%, 37% 35%);"></div>' })}>
              <Tooltip direction="top" offset={[0, -8]}>
                Recorded weather (MEDA) - sol {sol}: measured at the rover's recorded position that sol (archived NASA M20 waypoints). Historic point record, not current conditions.
              </Tooltip>
            </Marker>
          );
        })}
        {/* User waypoints: draggable, cyan-ringed, coordinates only. Dragging
            off the coverage grid is rejected by the parent (position snaps back). */}
        {layers.userWps && stations.filter(s => s.custom && s.lat != null).map(s => (
          <Marker key={s.id} position={[s.lat, s.lon]} draggable={!!onMoveWaypoint}
            icon={L.divIcon({ className: '', iconSize: [18, 18], iconAnchor: [9, 9], html: '<div style="width:14px;height:14px;border-radius:50%;background:#0a0e17;border:3px solid #22d3ee;"></div>' })}
            eventHandlers={onMoveWaypoint ? {
              dragend(e) {
                const ll = e.target.getLatLng();
                onMoveWaypoint(s.id, ll.lat, ll.lng);
              },
            } : {}}>
            <Tooltip permanent direction="top" offset={[0, -10]} className="station-label">
              {s.short || s.id} (yours)
            </Tooltip>
          </Marker>
        ))}
        {stations.filter(s => !s.custom && s.lat != null && (s.id === baseId ? layers.baseMarker : layers.objectives)).map(s => {
          const dropped = droppedIds.includes(s.id);
          const visited = visitedIds.includes(s.id);
          // Per-station label placement so labels never cover each other at fit bounds
          // (Skinner and Wildcat sit ~21 m apart: Skinner is slightly North -> top,
          // Wildcat is South -> bottom, guaranteeing 28px+ vertical clearance).
          const LABEL_PLACEMENT = {
            Skinner: ['top', [0, -14]],
            Wildcat: ['bottom', [0, 14]],
            Kukaklek: ['left', [-12, 0]],
            Depot: ['right', [12, 0]],
            Shuyak: ['left', [-12, 0]],
            Mageik: ['top', [0, -12]],
            GaleBase: ['bottom', [0, 12]],
            Rocknest: ['left', [-12, 0]],
            Shaler: ['bottom', [0, 12]],
            JohnKleinCumberland: ['top', [0, -12]],
            Departure: ['right', [12, 0]],
          };
          const [dir, off] = LABEL_PLACEMENT[s.id] || ['right', [10, 0]];
          return (
            <Marker key={s.id} position={[s.lat, s.lon]} icon={stationIcon(s, dropped, visited, solLimit != null && s.sol != null && s.sol > solLimit)} opacity={solLimit != null && s.sol != null && s.sol > solLimit ? 0.35 : 1}>
              <Tooltip permanent direction={dir} offset={off} className="station-label">
                {s.short || s.name.split(' ')[0]}{dropped ? ' — LOST' : ''}
              </Tooltip>
            </Marker>
          );
        })}
      </MapContainer>

      {addMode && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1002] bg-cyan-900/95 border border-cyan-400 rounded-lg px-3 py-1.5 text-xs text-white shadow-xl pointer-events-none">
          Click inside the dashed coverage frame to place your waypoint
        </div>
      )}
      {inspectMode && !addMode && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1002] bg-cyan-900/95 border border-cyan-400 rounded-lg px-3 py-1.5 text-xs text-white shadow-xl pointer-events-none">
          Click anywhere to read the data at that point
        </div>
      )}

      {/* Historical event records for this workspace: crater-level context only. */}
      {layers.events && (() => {
        const regionEvents = eventsData.events.filter(e => e.workspace === region);
        if (!regionEvents.length) return null;
        return (
          <div className="absolute bottom-12 right-3 z-[1000] bg-[#070d18]/95 border border-amber-600/40 rounded-xl p-3 text-xs text-slate-200 max-w-[260px] shadow-2xl backdrop-blur-md">
            <div className="flex items-start justify-between gap-2">
              <b className="text-amber-300">Recorded natural events - {region === 'gale' ? 'Gale' : 'Jezero'} Crater</b>
              <button type="button" aria-label="Hide event records" onClick={() => toggle('events')}
                className="text-slate-400 hover:text-white shrink-0 font-bold">✕</button>
            </div>
            <div className="text-slate-300 mt-1 text-xs leading-relaxed">Historical records, not current conditions. None of these records has a verified position inside this map, so none is pinned - no position is guessed. {region === 'jezero' ? 'The amber stars mark the 2 recorded MEDA weather sols (477, 502) at the rover\'s recorded position those sols. ' : ''}Verified point markers are on the Global globe.</div>
            {regionEvents.map(e => (
              <div key={e.id} className="mt-1.5 pt-1.5 border-t border-slate-800 text-xs">
                <b className="text-slate-100">{EV_TYPE_LABEL[e.type] || e.type}</b>
                <span className="text-slate-300"> - {e.date_utc}{e.sol != null ? ` (Sol ${e.sol})` : ''}</span>
                <div className="text-slate-300 mt-0.5">{e.summary}</div>
                {e.source_url && <a href={e.source_url} target="_blank" rel="noreferrer" className="text-cyan-400 underline break-all mt-0.5 inline-block">Source{e.credit ? `: ${e.credit}` : ''}</a>}
              </div>
            ))}
          </div>
        );
      })()}

      {/* Layers panel — floating glass HUD (single border; no doubled focus box) */}
      <details className="layers-hud absolute top-3 left-3 z-[1000] bg-[#070d18]/92 border border-cyan-900/30 rounded-xl p-3 text-xs text-slate-200 max-w-[270px] shadow-2xl backdrop-blur-md max-h-[calc(100vh-140px)] overflow-y-auto">
        <summary className="cursor-pointer font-bold text-cyan-400 select-none flex items-center justify-between gap-2 tracking-wide uppercase">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400 inline-block animate-pulse"></span>
            Layers
          </span>
          <span className="text-xs text-cyan-500/80 font-mono">HUD</span>
        </summary>

        <div className="mt-2 space-y-2 pt-2 border-t border-cyan-900/40">
          <div className="eyebrow text-cyan-400/90">Your plan</div>

          <label className="switch flex items-center gap-2 cursor-pointer py-0.5">
            <input type="checkbox" checked={layers.plannedRoute} onChange={() => toggle('plannedRoute')} />
            <span className="switch-track shrink-0"></span>
            <span className="flex items-center gap-1.5 text-xs text-slate-200 flex-1">
              <span className="w-3.5 h-0.5 bg-[#22d3ee] rounded-full shrink-0"></span>
              <span>Planned route</span>
            </span>
          </label>

          {layers.plannedRoute && setRouteModel && (
            <div className="pl-6 space-y-1">
              <label className="block text-slate-300 text-xs">
                <span className="mb-1 block text-slate-400">Route model:</span>
                <select aria-label="Route model" value={routeModel} onChange={e => setRouteModel(e.target.value)}
                  className="station-select w-full">
                  <option value="straight">Straight line baseline</option>
                  <option value="leastcost">Least-cost over terrain</option>
                </select>
              </label>
              {routeModel === 'leastcost' && (
                <div className="text-xs text-slate-400 leading-normal">
                  A* over elevation grid: no-data ground impassable, steep slopes cost more. Declared model, not a surveyed path.
                </div>
              )}
            </div>
          )}

          <label className="switch flex items-center gap-2 cursor-pointer py-0.5">
            <input type="checkbox" checked={layers.droppedLegs} onChange={() => toggle('droppedLegs')} />
            <span className="switch-track shrink-0"></span>
            <span className="flex items-center gap-1.5 text-xs text-slate-200 flex-1">
              <span className="w-3.5 border-t-2 border-dashed border-[#cc3333] shrink-0"></span>
              <span>Deferred legs</span>
            </span>
          </label>

          <label className="switch flex items-center gap-2 cursor-pointer py-0.5">
            <input type="checkbox" checked={layers.baseMarker} onChange={() => toggle('baseMarker')} />
            <span className="switch-track shrink-0"></span>
            <span className="flex items-center gap-1.5 text-xs text-slate-200 flex-1">
              <span className="w-2.5 h-2.5 rounded-full bg-white border border-slate-900 shrink-0"></span>
              <span>Base (scenario start)</span>
            </span>
          </label>

          <label className="switch flex items-center gap-2 cursor-pointer py-0.5">
            <input type="checkbox" checked={layers.userWps} onChange={() => toggle('userWps')} />
            <span className="switch-track shrink-0"></span>
            <span className="flex items-center gap-1.5 text-xs text-slate-200 flex-1">
              <span className="w-2.5 h-2.5 rounded-full border-2 border-[#22d3ee] bg-[#0a0e17] shrink-0"></span>
              <span>Your waypoints</span>
            </span>
          </label>

          <div className="eyebrow text-cyan-400/90 pt-2 border-t border-cyan-900/40">Places & rover record</div>

          <label className="switch flex items-center gap-2 cursor-pointer py-0.5">
            <input type="checkbox" checked={layers.objectives} onChange={() => toggle('objectives')} />
            <span className="switch-track shrink-0"></span>
            <span className="flex items-center gap-1.5 text-xs text-slate-200 flex-1">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0"></span>
              <span>Science objectives</span>
            </span>
          </label>

          <label className="switch flex items-center gap-2 cursor-pointer py-0.5">
            <input type="checkbox" checked={layers.roverRoute} onChange={() => toggle('roverRoute')} />
            <span className="switch-track shrink-0"></span>
            <span className="flex items-center gap-1.5 text-xs text-slate-200 flex-1">
              <span className="w-3.5 h-0.5 bg-[#f97316] rounded-full shrink-0"></span>
              <span>{roverTrack && roverTrack.segments ? 'Recorded drive path' : 'Recorded rover positions'}</span>
            </span>
          </label>

          <label className="switch flex items-center gap-2 cursor-pointer py-0.5">
            <input type="checkbox" checked={layers.roverStops} onChange={() => toggle('roverStops')} />
            <span className="switch-track shrink-0"></span>
            <span className="flex items-center gap-1.5 text-xs text-slate-200 flex-1">
              <span className="w-2.5 h-2.5 rounded-full border border-[#f97316] bg-[#f97316]/40 shrink-0"></span>
              <span>Recorded rover stops</span>
            </span>
          </label>

          <label className="switch flex items-center gap-2 cursor-pointer py-0.5">
            <input type="checkbox" checked={layers.events} onChange={() => toggle('events')} />
            <span className="switch-track shrink-0"></span>
            <span className="flex items-center gap-1.5 text-xs text-slate-200 flex-1">
              <span className="w-2.5 h-2.5 inline-block shrink-0" style={{ background: '#fbbf24', clipPath: 'polygon(50% 0%, 63% 35%, 98% 35%, 70% 57%, 81% 91%, 50% 70%, 19% 91%, 30% 57%, 2% 35%, 37% 35%)' }}></span>
              <span>Historical event records</span>
            </span>
          </label>

          <details className="disclosure mt-1">
            <summary className="text-xs">What is pinned, what is not</summary>
            <div className="disclosure-body text-xs text-slate-300">
              {region === 'jezero'
                ? 'Weather sols 477+502 are pinned at the rover\'s recorded positions those sols (archived M20 waypoints). Natural events are crater-level context: no verified positions inside this map, so no pins — positions are never guessed.'
                : 'Crater-level context only: no verified event positions inside this map, so nothing is pinned — positions are never guessed.'}
            </div>
          </details>

          <div className="eyebrow text-cyan-400/90 pt-2 border-t border-cyan-900/40">Geology maps</div>

          {region === 'jezero' && (
            <>
              <label className="switch flex items-center gap-2 cursor-pointer py-0.5">
                <input type="checkbox" checked={layers.geology} onChange={() => toggle('geology')} />
                <span className="switch-track shrink-0"></span>
                <span className="flex items-center gap-1.5 text-xs text-slate-200 flex-1">
                  <span className="w-2.5 h-2.5 rounded-sm border border-[#7cc4ff] bg-[#7cc4ff]/25 shrink-0"></span>
                  <span>USGS geology units (SIM 3464)</span>
                </span>
              </label>
              <details className="disclosure mt-1">
                <summary className="text-xs">Accuracy limits</summary>
                <div className="disclosure-body text-xs text-slate-300">
                  Semi-controlled CTX basemap: unit boundaries carry ~100-200 m registration vs rover waypoint records — approximate at stop scale. Rock type does not rate walking difficulty.
                </div>
              </details>
            </>
          )}

          {region === 'gale' && (
            <>
              <label className="switch flex items-center gap-2 cursor-pointer py-0.5">
                <input type="checkbox" checked={layers.crismVna} onChange={() => toggle('crismVna')} />
                <span className="switch-track shrink-0"></span>
                <span className="flex items-center gap-1.5 text-xs text-slate-200 flex-1">
                  <span className="w-2.5 h-2.5 rounded-sm bg-gradient-to-br from-amber-700/60 to-slate-800 shrink-0 border border-amber-600/50"></span>
                  <span>CRISM 770 nm brightness</span>
                </span>
              </label>
              <details className="disclosure mt-1">
                <summary className="text-xs">What this layer is</summary>
                <div className="disclosure-body text-xs text-slate-300">
                  JHU/APL 2012 targeted mosaic, source resolution 19-38 m/px. Brightness only, not a mineral or unit map. Cropped with integer-pixel edge match (offsets up to ~19 m possible).
                </div>
              </details>
            </>
          )}

          {terrainMeta && (
            <>
              <div className="eyebrow text-cyan-400/90 pt-2 border-t border-cyan-900/40">Terrain layers</div>
              <div className="text-xs text-slate-400 mb-1">
                Views of the same elevation grid ({region === 'gale' ? 'MSL Gale DEM 2 m' : 'CTX DTM 20 m'}):
              </div>
              {OVERLAY_LAYERS(region).map(ol => (
                <label key={ol.key} className="switch flex items-center gap-2 cursor-pointer py-0.5">
                  <input type="checkbox" checked={layers[ol.key]} onChange={() => toggle(ol.key)} />
                  <span className="switch-track shrink-0"></span>
                  <span className="flex items-center gap-1.5 text-xs text-slate-200 flex-1">
                    <span className={`w-2.5 h-2.5 rounded-sm shrink-0 ${ol.key === 'elevRamp' ? 'bg-gradient-to-r from-purple-600 via-teal-500 to-yellow-400' : ol.key === 'hillshade' ? 'bg-gradient-to-br from-white/80 via-slate-500 to-black' : 'bg-gradient-to-r from-emerald-600 via-amber-500 to-rose-600'}`}></span>
                    <span>{ol.label}</span>
                  </span>
                </label>
              ))}
              <label className="switch flex items-center gap-2 cursor-pointer py-0.5">
                <input type="checkbox" checked={layers.contours} onChange={() => toggle('contours')} />
                <span className="switch-track shrink-0"></span>
                <span className="flex items-center gap-1.5 text-xs text-slate-200 flex-1">
                  <span className="w-3.5 border-t border-slate-300 shrink-0"></span>
                  <span>Contours{terrainMeta ? ` (${terrainMeta.contourIntervalM} m)` : ''}</span>
                </span>
              </label>

              <div className="pt-2 border-t border-cyan-900/40 mt-1">
                <div className="flex items-center justify-between text-xs text-slate-300 mb-1">
                  <span>Overlay opacity</span>
                  <span className="font-mono text-cyan-300">{Math.round(layers.overlayOpacity * 100)}%</span>
                </div>
                <input type="range" min="0.15" max="0.9" step="0.05" value={layers.overlayOpacity}
                  onChange={e => setLayers(prev => ({ ...prev, overlayOpacity: +e.target.value }))}
                  className="w-full accent-cyan-400 cursor-pointer" />
              </div>

              <div className="text-xs text-slate-400 space-y-0.5 pt-1">
                <div>Elevation {terrainMeta.elevMin} to {terrainMeta.elevMax} m</div>
                <div>Slope 0 to {terrainMeta.slopeMaxDeg}&deg; at {terrainMeta.gridM} m grid</div>
                <div>Contours every {terrainMeta.contourIntervalM} m</div>
              </div>
            </>
          )}
        </div>
      </details>

      {/* Collapsible legend & sources link — floating glass card */}
      <details className="absolute bottom-3 right-3 z-[1000] bg-[#070d18]/92 border border-cyan-500/25 rounded-xl p-3 text-xs text-slate-200 max-w-[260px] max-h-[60vh] overflow-y-auto shadow-2xl backdrop-blur-md">
        <summary className="cursor-pointer font-bold text-cyan-400 select-none flex items-center justify-between gap-2 tracking-wide uppercase">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400 inline-block"></span>
            Legend & Data
          </span>
          <span className="text-xs text-cyan-500/80 font-mono">INFO</span>
        </summary>

        <div className="mt-2 space-y-1.5 pt-2 border-t border-cyan-900/40 text-xs">
          <div className="flex items-center gap-2"><span className="w-3.5 h-0.5 bg-[#22d3ee] rounded-full shrink-0"></span> <span>Planned route ({routeModel === 'leastcost' ? 'least-cost model' : 'straight baseline'})</span></div>
          <div className="flex items-center gap-2"><span className="w-3.5 h-0.5 bg-[#a3e635] rounded-full shrink-0"></span> <span>{abCompareGeom ? 'Least-cost path' : `Your two-point route${region === 'gale' ? ' (model or drive path)' : ''}`}</span></div>
          {abCompareGeom && <div className="flex items-center gap-2"><span className="w-3.5 border-t-2 border-dashed border-[#9ca3af] shrink-0"></span> <span>Straight-line baseline</span></div>}
          {region === 'gale' && <div className="flex items-center gap-2"><span className="w-3.5 border-t-2 border-dashed border-[#a3e635] opacity-80 shrink-0"></span> <span>Synthetic gap connector</span></div>}
          {region === 'jezero' && <div className="flex items-center gap-2"><span className="w-3 h-3 border border-[#7cc4ff] bg-[#7cc4ff]/20 rounded-sm shrink-0"></span> <span>USGS geology units (SIM 3464)</span></div>}
          <div className="flex items-center gap-2"><span className="w-3.5 border-t-2 border-dashed border-[#cc3333] shrink-0"></span> <span>Deferred / dropped leg</span></div>
          {region === 'gale'
            ? <div className="flex items-center gap-2"><span className="w-3.5 h-0.5 bg-[#f97316] rounded-full shrink-0"></span> <span>NASA traverse geometry (MSL)</span></div>
            : <div className="flex items-center gap-2"><span className="w-3.5 border-t-2 border-dashed border-[#f97316] shrink-0"></span> <span>Recorded rover positions</span></div>}
          <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full border border-[#f97316] bg-[#f97316]/40 shrink-0"></span> <span>Recorded rover stop</span></div>
          <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-white border border-slate-900 shrink-0"></span> <span>{region === 'gale' ? 'Scenario base (start & return)' : 'Base (planning start & return)'}</span></div>
          <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full border-2 border-[#22d3ee] bg-[#0a0e17] shrink-0"></span> <span>Your waypoint (draggable)</span></div>

          {stations.filter(s => s.id !== 'Depot' && s.id !== 'GaleBase' && s.lat != null).map(s => {
            const st = STATION_STYLE[s.id] || { color: '#ffb02e', shape: 'circle' };
            const swatch = st.shape === 'diamond'
              ? { width: 10, height: 10, background: st.color, transform: 'rotate(45deg)', border: '1.5px solid #0a0e17' }
              : st.shape === 'triangle'
              ? { width: 10, height: 10, background: st.color, clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)' }
              : st.shape === 'square'
              ? { width: 9, height: 9, background: st.color, border: '1.5px solid #0a0e17' }
              : st.shape === 'pentagon'
              ? { width: 10, height: 10, background: st.color, clipPath: 'polygon(50% 0%, 100% 38%, 81% 100%, 19% 100%, 0% 38%)' }
              : { width: 10, height: 10, background: st.color, borderRadius: '50%', border: '1.5px solid #0a0e17' };
            return (
              <div key={s.id} className="flex items-center gap-2">
                <span style={swatch} className="shrink-0"></span>
                <span>{s.short || s.name.split('(')[0].trim()}</span>
              </div>
            );
          })}

          {region === 'gale' && (
            <div className="pt-1.5 border-t border-cyan-900/40 text-xs text-slate-400">
              Stop names are informal MSL mission names; no IAU-approved names exist for these stops.
            </div>
          )}

          <div className="pt-1.5 border-t border-cyan-900/40 text-xs space-y-1">
            {region === 'gale' ? (
              <>
                <div><a href="https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Mars/MSL/MSL_Gale_DEM_Mosaic_1m_v3.tif" target="_blank" rel="noreferrer" className="text-cyan-400 hover:text-cyan-300 underline break-all">Gale DEM (USGS MSL mosaic 1 m v3)</a></div>
                <div><a href="https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json" target="_blank" rel="noreferrer" className="text-cyan-400 hover:text-cyan-300 underline break-all">MSL waypoint records (NASA MMGIS)</a></div>
                <div><a href="http://crism.jhuapl.edu/msl_landing_sites/index_news.php" target="_blank" rel="noreferrer" className="text-cyan-400 hover:text-cyan-300 underline break-all">CRISM Gale mosaic (JHU/APL)</a></div>
              </>
            ) : (
              <a href="https://pubs.usgs.gov/publication/sim3464" target="_blank" rel="noreferrer" className="text-cyan-400 hover:text-cyan-300 underline break-all">Data sources (USGS SIM 3464 & NASA)</a>
            )}
          </div>
        </div>
      </details>

      {/* ---------- Mobile FAB controls ---------- */}
      <button type="button" className="layers-fab" aria-label="Map layers" onClick={() => setLayersSheetOpen(true)}>
        <LayersIcon size={20} />
      </button>
      <button type="button" className="reset-fab" aria-label="Reset menu" onClick={() => setResetPopoverOpen(!resetPopoverOpen)}>
        <ResetIcon size={20} />
      </button>
      <button type="button" className="info-fab" aria-label="Legend & data" onClick={() => setLegendSheetOpen(true)}>
        <InfoIcon size={20} />
      </button>

      {/* Reset popover (mobile) */}
      {resetPopoverOpen && (
        <div className="absolute top-70 left-12 z-[1150] w-[200px] bg-[#070d18]/95 border border-cyan-500/30 rounded-xl p-3 shadow-2xl backdrop-blur-md">
          <div className="text-xs font-bold text-cyan-400 mb-2">Reset</div>
          <button type="button" onClick={() => { setResetPopoverOpen(false); onResetView && onResetView(); }}
            className="w-full text-left text-xs text-slate-200 py-2 px-3 bg-[#0a0e17]/60 border border-cyan-900/30 rounded mb-1 hover:bg-cyan-900/30">Reset view (camera only)</button>
          <button type="button" onClick={() => { setResetPopoverOpen(false); onResetPlan && onResetPlan(); }}
            className="w-full text-left text-xs text-amber-300 py-2 px-3 bg-[#0a0e17]/60 border border-cyan-900/30 rounded hover:bg-amber-900/30">Reset plan (waypoints, route, layers)</button>
        </div>
      )}

      {/* Layers bottom sheet (mobile) */}
      <BottomSheet open={layersSheetOpen} onClose={() => setLayersSheetOpen(false)} title="Map layers">
        <div className="space-y-3">
          <div className="eyebrow text-cyan-400/90 text-xs">Your plan</div>
          <label className="switch flex items-center gap-2 cursor-pointer py-1">
            <input type="checkbox" checked={layers.plannedRoute} onChange={() => toggle('plannedRoute')} />
            <span className="switch-track shrink-0"></span>
            <span className="text-slate-200 text-sm flex-1">Planned route</span>
          </label>
          <label className="switch flex items-center gap-2 cursor-pointer py-1">
            <input type="checkbox" checked={layers.droppedLegs} onChange={() => toggle('droppedLegs')} />
            <span className="switch-track shrink-0"></span>
            <span className="text-slate-200 text-sm flex-1">Deferred legs</span>
          </label>
          <label className="switch flex items-center gap-2 cursor-pointer py-1">
            <input type="checkbox" checked={layers.baseMarker} onChange={() => toggle('baseMarker')} />
            <span className="switch-track shrink-0"></span>
            <span className="text-slate-200 text-sm flex-1">Base marker</span>
          </label>
          <label className="switch flex items-center gap-2 cursor-pointer py-1">
            <input type="checkbox" checked={layers.userWps} onChange={() => toggle('userWps')} />
            <span className="switch-track shrink-0"></span>
            <span className="text-slate-200 text-sm flex-1">Your waypoints</span>
          </label>

          <div className="eyebrow text-cyan-400/90 text-xs pt-2 border-t border-cyan-900/40">Places & rover</div>
          <label className="switch flex items-center gap-2 cursor-pointer py-1">
            <input type="checkbox" checked={layers.objectives} onChange={() => toggle('objectives')} />
            <span className="switch-track shrink-0"></span>
            <span className="text-slate-200 text-sm flex-1">Science objectives</span>
          </label>
          <label className="switch flex items-center gap-2 cursor-pointer py-1">
            <input type="checkbox" checked={layers.roverRoute} onChange={() => toggle('roverRoute')} />
            <span className="switch-track shrink-0"></span>
            <span className="text-slate-200 text-sm flex-1">Recorded drive path</span>
          </label>
          <label className="switch flex items-center gap-2 cursor-pointer py-1">
            <input type="checkbox" checked={layers.roverStops} onChange={() => toggle('roverStops')} />
            <span className="switch-track shrink-0"></span>
            <span className="text-slate-200 text-sm flex-1">Recorded stops</span>
          </label>
          <label className="switch flex items-center gap-2 cursor-pointer py-1">
            <input type="checkbox" checked={layers.events} onChange={() => toggle('events')} />
            <span className="switch-track shrink-0"></span>
            <span className="text-slate-200 text-sm flex-1">Event records</span>
          </label>

          <div className="eyebrow text-cyan-400/90 text-xs pt-2 border-t border-cyan-900/40">Geology</div>
          {region === 'jezero' && (
            <label className="switch flex items-center gap-2 cursor-pointer py-1">
              <input type="checkbox" checked={layers.geology} onChange={() => toggle('geology')} />
              <span className="switch-track shrink-0"></span>
              <span className="text-slate-200 text-sm flex-1">USGS geology units</span>
            </label>
          )}
          {region === 'gale' && (
            <label className="switch flex items-center gap-2 cursor-pointer py-1">
              <input type="checkbox" checked={layers.crismVna} onChange={() => toggle('crismVna')} />
              <span className="switch-track shrink-0"></span>
              <span className="text-slate-200 text-sm flex-1">CRISM 770 nm brightness</span>
            </label>
          )}
          {terrainMeta && (
            <>
              <label className="switch flex items-center gap-2 cursor-pointer py-1">
                <input type="checkbox" checked={layers.elevRamp} onChange={() => toggle('elevRamp')} />
                <span className="switch-track shrink-0"></span>
                <span className="text-slate-200 text-sm flex-1">Elevation ramp</span>
              </label>
              <label className="switch flex items-center gap-2 cursor-pointer py-1">
                <input type="checkbox" checked={layers.hillshade} onChange={() => toggle('hillshade')} />
                <span className="switch-track shrink-0"></span>
                <span className="text-slate-200 text-sm flex-1">Hillshade</span>
              </label>
              <label className="switch flex items-center gap-2 cursor-pointer py-1">
                <input type="checkbox" checked={layers.slope} onChange={() => toggle('slope')} />
                <span className="switch-track shrink-0"></span>
                <span className="text-slate-200 text-sm flex-1">Slope</span>
              </label>
              <label className="switch flex items-center gap-2 cursor-pointer py-1">
                <input type="checkbox" checked={layers.contours} onChange={() => toggle('contours')} />
                <span className="switch-track shrink-0"></span>
                <span className="text-slate-200 text-sm flex-1">Contours</span>
              </label>
            </>
          )}
          <label className="switch flex items-center gap-2 cursor-pointer py-1">
            <input type="checkbox" checked={setLayers ? layers.geology : false} onChange={() => {}} disabled />
            <span className="switch-track shrink-0 opacity-50"></span>
            <span className="text-slate-500 text-sm flex-1">Overlay opacity: {Math.round(layers.overlayOpacity * 100)}%</span>
          </label>
          <input type="range" min="15" max="90" step="5" value={Math.round(layers.overlayOpacity * 100)}
            onChange={e => setLayers(prev => ({ ...prev, overlayOpacity: +e.target.value / 100 }))}
            className="w-full accent-cyan-400 cursor-pointer" />
        </div>
      </BottomSheet>

      {/* Legend bottom sheet (mobile) */}
      <BottomSheet open={legendSheetOpen} onClose={() => setLegendSheetOpen(false)} title="Legend & data">
        <div className="space-y-3">
          <div className="flex items-center gap-2"><span className="w-3.5 h-0.5 bg-[#22d3ee] rounded-full shrink-0"></span> <span className="text-sm text-slate-200">Planned route ({routeModel === 'leastcost' ? 'least-cost model' : 'straight baseline'})</span></div>
          <div className="flex items-center gap-2"><span className="w-3.5 h-0.5 bg-[#a3e635] rounded-full shrink-0"></span> <span className="text-sm text-slate-200">Least-cost path / two-point route</span></div>
          {abCompareGeom && <div className="flex items-center gap-2"><span className="w-3.5 border-t-2 border-dashed border-[#9ca3af] shrink-0"></span> <span className="text-sm text-slate-200">Straight-line baseline</span></div>}
          {region === 'gale' && <div className="flex items-center gap-2"><span className="w-3.5 border-t-2 border-dashed border-[#a3e635] opacity-80 shrink-0"></span> <span className="text-sm text-slate-200">Synthetic gap connector</span></div>}
          {region === 'jezero' && <div className="flex items-center gap-2"><span className="w-3 h-3 border border-[#7cc4ff] bg-[#7cc4ff]/20 rounded-sm shrink-0"></span> <span className="text-sm text-slate-200">USGS geology units (SIM 3464)</span></div>}
          <div className="flex items-center gap-2"><span className="w-3.5 border-t-2 border-dashed border-[#cc3333] shrink-0"></span> <span className="text-sm text-slate-200">Deferred / dropped leg</span></div>
          {region === 'gale'
            ? <div className="flex items-center gap-2"><span className="w-3.5 h-0.5 bg-[#f97316] rounded-full shrink-0"></span> <span className="text-sm text-slate-200">NASA traverse geometry (MSL)</span></div>
            : <div className="flex items-center gap-2"><span className="w-3.5 border-t-2 border-dashed border-[#f97316] shrink-0"></span> <span className="text-sm text-slate-200">Recorded rover positions</span></div>}
          <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full border border-[#f97316] bg-[#f97316]/40 shrink-0"></span> <span className="text-sm text-slate-200">Recorded rover stop</span></div>
          <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-white border border-slate-900 shrink-0"></span> <span className="text-sm text-slate-200">Base marker</span></div>
          <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full border-2 border-[#22d3ee] bg-[#0a0e17] shrink-0"></span> <span className="text-sm text-slate-200">Your waypoint (draggable)</span></div>

          <div className="pt-2 border-t border-cyan-900/40 text-sm text-slate-400 space-y-1">
            {region === 'gale' ? (
              <>
                <div><a href="https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Mars/MSL/MSL_Gale_DEM_Mosaic_1m_v3.tif" target="_blank" rel="noreferrer" className="text-cyan-400 hover:text-cyan-300 underline break-all">Gale DEM (USGS MSL mosaic 1 m v3)</a></div>
                <div><a href="https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json" target="_blank" rel="noreferrer" className="text-cyan-400 hover:text-cyan-300 underline break-all">MSL waypoint records (NASA MMGIS)</a></div>
                <div><a href="http://crism.jhuapl.edu/msl_landing_sites/index_news.php" target="_blank" rel="noreferrer" className="text-cyan-400 hover:text-cyan-300 underline break-all">CRISM Gale mosaic (JHU/APL)</a></div>
              </>
            ) : (
              <a href="https://pubs.usgs.gov/publication/sim3464" target="_blank" rel="noreferrer" className="text-cyan-400 hover:text-cyan-300 underline break-all">Data sources (USGS SIM 3464 & NASA)</a>
            )}
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}
