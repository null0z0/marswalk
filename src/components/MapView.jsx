import { MapContainer, ImageOverlay, GeoJSON, Polyline, Tooltip, Marker, CircleMarker, Rectangle, ZoomControl, useMap } from 'react-leaflet';
import { useEffect } from 'react';
import eventsData from '../data/historicalEvents.json';
import medaData from '../data/meda.json';

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

function FitStations({ stations, maxFitZoom, orthoBounds }) {
  const map = useMap();
  useEffect(() => {
    // keep the view inside real imagery: the station cluster sits near the NE
    // corner of the Gale crop, and an unconstrained fit would frame mostly void
    const ob = L.latLngBounds(orthoBounds);
    map.setMaxBounds(ob.pad(0.005));
    const b = L.latLngBounds(stations.filter(s => s.lat != null).map(s => [s.lat, s.lon]));
    map.fitBounds(b.pad(0.6), { animate: false, maxZoom: maxFitZoom });
  }, [map, stations, maxFitZoom, orthoBounds]);
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

export default function MapView({ stations, plan, geojson, roverTrack, terrainMeta, contours, layers, setLayers, region = 'jezero', baseId = 'Depot', solLimit = null, addMode = false, onMapClick = null, onMoveWaypoint = null, inspectMode = false, inspectPt = null, onInspect = null, legsProvider = null, routeModel = 'straight', setRouteModel = null, abLeg = null, abGeometry = null, abGeometryParts = null, abCompareGeom = null, showPlan = true }) {
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

  return (
    <div className="relative h-full w-full">
      <MapContainer crs={crs} center={[(ortho.bounds[0][0] + ortho.bounds[1][0]) / 2, (ortho.bounds[0][1] + ortho.bounds[1][1]) / 2]} zoom={5} maxZoom={9} doubleClickZoom={false} zoomControl={false}
        style={{ height: '100%', width: '100%', background: '#0a0e17', cursor: (addMode || inspectMode) ? 'crosshair' : '' }}>
        {/* zoom at top-right: the default top-left corner is under the Layers panel */}
        <ZoomControl position="bottomleft" />
        <MapClickHandler addMode={addMode} onMapClick={onMapClick} inspectMode={inspectMode} onInspect={onInspect} />
        <FitStations stations={stations} maxFitZoom={ortho.maxFitZoom} orthoBounds={ortho.bounds} />
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
          // (Skinner/Wildcat sit ~21 m apart; Kukaklek sits just NW of Base).
          const LABEL_PLACEMENT = {
            Skinner: ['top', [0, -8]],
            Wildcat: ['right', [10, 0]],
            Kukaklek: ['left', [-10, 0]],
            Depot: ['right', [10, 0]],
            Shuyak: ['left', [-10, 0]],
            Mageik: ['top', [0, -8]],
            GaleBase: ['bottom', [0, 10]],
            Rocknest: ['left', [-10, 0]],
            Shaler: ['bottom', [0, 10]],
            JohnKleinCumberland: ['top', [0, -8]],
            Departure: ['right', [10, 0]],
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
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[1002] bg-cyan-900/95 border border-cyan-400 rounded px-3 py-1 text-[11px] text-white shadow-lg pointer-events-none">
          Click inside the dashed coverage frame to place your waypoint
        </div>
      )}
      {inspectMode && !addMode && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[1002] bg-cyan-900/95 border border-cyan-400 rounded px-3 py-1 text-[11px] text-white shadow-lg pointer-events-none">
          Click anywhere to read the data at that point
        </div>
      )}

      {/* Historical event records for this workspace: crater-level context only.
          No verified event position exists inside this map's data (the archived
          traverse has no rover record for the in-situ events' sols, and the other
          records happened kilometers from the rover or regionally), so NOTHING is
          pinned here - positions are never guessed. Verified point markers for
          other events live on the Global globe. */}
      {layers.events && (() => {
        const regionEvents = eventsData.events.filter(e => e.workspace === region);
        if (!regionEvents.length) return null;
        return (
          <div className="absolute bottom-8 right-2 z-[1000] bg-[#0d1420] border border-amber-800 rounded p-1.5 text-[9px] text-gray-200 max-w-[230px] shadow-lg">
            <div className="flex items-start justify-between gap-2">
              <b className="text-amber-300">Recorded natural events - {region === 'gale' ? 'Gale' : 'Jezero'} Crater</b>
              <button type="button" aria-label="Hide event records" onClick={() => toggle('events')}
                className="text-gray-500 hover:text-gray-200 shrink-0">x</button>
            </div>
            <div className="text-gray-400 mt-0.5">Historical records, not current conditions. None of these records has a verified position inside this map, so none is pinned - no position is guessed. {region === 'jezero' ? 'The amber stars mark the 2 recorded MEDA weather sols (477, 502) at the rover\'s recorded position those sols. ' : ''}Verified point markers (InSight quakes, Amazonis impact, polar avalanches) are on the Global globe.</div>
            {regionEvents.map(e => (
              <div key={e.id} className="mt-1 pt-1 border-t border-gray-800">
                <b className="text-gray-100">{EV_TYPE_LABEL[e.type] || e.type}</b>
                <span className="text-gray-300"> - {e.date_utc}{e.sol != null ? ` (Sol ${e.sol})` : ''}</span>
                <div className="text-gray-400">{e.summary}</div>
                {e.source_url && <a href={e.source_url} target="_blank" rel="noreferrer" className="text-cyan-400 underline">Source{e.credit ? `: ${e.credit}` : ''}</a>}
              </div>
            ))}
          </div>
        );
      })()}

      {/* Layers panel */}
      <details className="absolute top-2 left-2 z-[1000] bg-[#0d1420]/95 border border-cyan-900 rounded p-1.5 text-[10px] text-gray-300 max-w-[240px] shadow-lg">
        <summary className="cursor-pointer font-bold text-cyan-400 select-none">Layers</summary>
        <div className="mt-1 space-y-1 pt-1 border-t border-gray-800">
          <div className="text-gray-400 font-bold">Your plan</div>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={layers.plannedRoute} onChange={() => toggle('plannedRoute')} /> <span className="w-3 h-0.5 bg-[#22d3ee] inline-block"></span> Planned route (stop to stop)</label>
          {layers.plannedRoute && setRouteModel && (
            <label className="flex items-center gap-1.5 pl-4">Model
              <select aria-label="Route model" value={routeModel} onChange={e => setRouteModel(e.target.value)} className="bg-[#0a0e17] border border-cyan-900 rounded px-1 py-0.5 text-[10px] min-w-0 flex-1 max-w-full">
                <option value="straight">Straight line (geometric baseline)</option>
                <option value="leastcost">Least-cost over terrain (slope-aware)</option>
              </select>
            </label>)}
          {layers.plannedRoute && routeModel === 'leastcost' && (
            <div className="pl-4 text-[9px] text-gray-500">A* over the elevation grid: no-data ground impassable, steep slopes cost more. A model under declared rules, not a surveyed or safe path. Times/distances follow this geometry.</div>)}
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={layers.droppedLegs} onChange={() => toggle('droppedLegs')} /> <span className="w-3 border-t border-dashed border-[#cc3333] inline-block"></span> Deferred legs</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={layers.baseMarker} onChange={() => toggle('baseMarker')} /> <span className="w-2 h-2 rounded-full bg-white border border-black inline-block"></span> Base (scenario start)</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={layers.userWps} onChange={() => toggle('userWps')} /> <span className="w-2.5 h-2.5 rounded-full border-2 border-[#22d3ee] bg-[#0a0e17] inline-block"></span> Your waypoints</label>

          <div className="text-gray-400 font-bold pt-1 border-t border-gray-800">Places & rover record</div>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={layers.objectives} onChange={() => toggle('objectives')} /> Science objectives (shape per stop)</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={layers.roverRoute} onChange={() => toggle('roverRoute')} /> {roverTrack && roverTrack.segments ? 'Recorded drive path (NASA archive)' : 'Recorded rover positions (connected)'}</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={layers.roverStops} onChange={() => toggle('roverStops')} /> Recorded rover stops</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={layers.events} onChange={() => toggle('events')} /> <span className="w-2.5 h-2.5 inline-block" style={{ background: '#fbbf24', clipPath: 'polygon(50% 0%, 63% 35%, 98% 35%, 70% 57%, 81% 91%, 50% 70%, 19% 91%, 30% 57%, 2% 35%, 37% 35%)' }}></span> Historical event records</label>
          <details className="ml-5 text-[9px] text-gray-500">
            <summary className="cursor-pointer select-none">what is pinned, what is not</summary>
            {region === 'jezero'
              ? 'Weather sols 477+502 are pinned at the rover\'s recorded positions those sols (archived M20 waypoints). The natural events are crater-level context: no verified positions inside this map, so no pins - positions are never guessed.'
              : 'Crater-level context only: no verified event positions inside this map, so nothing is pinned - positions are never guessed.'}
          </details>

          <div className="text-gray-400 font-bold pt-1 border-t border-gray-800">Geology maps</div>
          {region === 'jezero' && <label className="flex items-center gap-1.5"><input type="checkbox" checked={layers.geology} onChange={() => toggle('geology')} /> USGS geology units (SIM 3464)</label>}
          {region === 'jezero' && <details className="ml-5 text-[9px] text-gray-500">
            <summary className="cursor-pointer select-none">accuracy limits</summary>
            Semi-controlled CTX basemap: unit boundaries carry ~100-200 m registration vs rover waypoint records - approximate at stop scale, not contact-level. Rock type does not rate how hard the walking is.
          </details>}
          {region === 'gale' && <label className="flex items-center gap-1.5"><input type="checkbox" checked={layers.crismVna} onChange={() => toggle('crismVna')} /> CRISM 770 nm brightness</label>}
          {region === 'gale' && <details className="ml-5 text-[9px] text-gray-500">
            <summary className="cursor-pointer select-none">what this layer is</summary>
            JHU/APL 2012 targeted mosaic, source resolution 19-38 m/px (FRT ~19 m, HRL ~38 m). Brightness only, NOT a mineral or unit map. Cropped with an integer-pixel window-edge match, so offsets up to about one 19 m source pixel are possible.
          </details>}

          {terrainMeta && <div className="text-gray-400 font-bold pt-1 border-t border-gray-800">Terrain layers</div>}
          {terrainMeta && <div className="text-[9px] text-gray-500">Views of the same elevation grid ({region === 'gale' ? 'MSL Gale merged DEM 1 m, decimated to 2 m' : 'CTX DTM 20 m'}) - not independent measurements:</div>}
          {terrainMeta && OVERLAY_LAYERS(region).map(ol => (
            <label key={ol.key} className="flex items-center gap-1.5"><input type="checkbox" checked={layers[ol.key]} onChange={() => toggle(ol.key)} /> {ol.label}</label>
          ))}
          {terrainMeta && <label className="flex items-center gap-1.5"><input type="checkbox" checked={layers.contours} onChange={() => toggle('contours')} /> Contours{terrainMeta ? ` (${terrainMeta.contourIntervalM} m)` : ''}</label>}
          {terrainMeta && <label className="flex items-center gap-1.5 pt-1 border-t border-gray-800">
            Overlay opacity
            <input type="range" min="0.15" max="0.9" step="0.05" value={layers.overlayOpacity}
              onChange={e => setLayers(prev => ({ ...prev, overlayOpacity: +e.target.value }))} className="w-20" />
          </label>}
          {terrainMeta && (
            <div className="pt-1 border-t border-gray-800 text-[9px] text-gray-500 space-y-0.5">
              <div>Elevation {terrainMeta.elevMin} to {terrainMeta.elevMax} m (viridis ramp)</div>
              <div>Slope 0 to {terrainMeta.slopeMaxDeg}&deg; at {terrainMeta.gridM} m grid - steepness display, not a safety rating</div>
              <div>Contours every {terrainMeta.contourIntervalM} m</div>
            </div>
          )}
        </div>
      </details>

      {/* Collapsible legend & sources link (closed by default on mobile) */}
      <details className="absolute bottom-2 right-2 z-[1000] bg-[#0d1420]/95 border border-cyan-900 rounded p-1.5 text-[10px] text-gray-300 max-w-[210px] shadow-lg">
        <summary className="cursor-pointer font-bold text-cyan-400 select-none">Legend & Data</summary>
        <div className="mt-1 space-y-1 pt-1 border-t border-gray-800">
          <div className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-[#22d3ee]"></span> Planned route ({routeModel === 'leastcost' ? 'least-cost terrain model' : 'straight-line baseline'})</div>
          <div className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-[#a3e635]"></span> {abCompareGeom ? 'Least-cost path (slope-aware model)' : `Your two-point route (same model${region === 'gale' ? ', or the recorded drive path when following it' : ''})`}</div>
          {abCompareGeom && <div className="flex items-center gap-1.5"><span className="w-3 border-t border-dashed border-[#9ca3af] inline-block"></span> Straight-line baseline (comparison, not a proposed path)</div>}
          {region === 'gale' && <div className="flex items-center gap-1.5"><span className="w-3 border-t-2 border-dashed border-[#a3e635] opacity-80"></span> Synthetic gap connector (not recorded drive ground)</div>}
          {region === 'jezero' && <div className="flex items-center gap-1.5"><span className="w-3 h-3 border border-[#7cc4ff] bg-[#7cc4ff]/10 inline-block"></span> USGS geology unit boundaries (SIM 3464)</div>}
          <div className="flex items-center gap-1.5"><span className="w-3 h-0.5 border-t border-dashed border-[#cc3333]"></span> Deferred / dropped leg</div>
          {region === 'gale'
            ? <div className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-[#f97316]"></span> NASA recorded traverse geometry (MSL MMGIS drive polylines)</div>
            : <div className="flex items-center gap-1.5"><span className="w-3 h-0.5 border-t border-dashed border-[#f97316]"></span> Recorded rover positions, connected (NASA snapshot 2022-12-23; not the measured driven path)</div>}
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full border border-[#f97316] bg-[#f97316]/40"></span> Recorded rover stop</div>
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-white border border-black"></span> {region === 'gale' ? 'Scenario base - declared start & return point (no real installation)' : 'Base - where your walk starts & returns (planning point, not a real base)'}</div>
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full border-2 border-[#22d3ee] bg-[#0a0e17]"></span> Your waypoint (draggable, route via - no science dwell)</div>
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
              <div key={s.id} className="flex items-center gap-1.5">
                <span style={swatch}></span> {s.short || s.name.split('(')[0].trim()}
              </div>
            );
          })}
          {region === 'gale' && <div className="pt-1 border-t border-gray-800 text-[9px] text-gray-500">Stop names are informal MSL mission names; a bounded search of the USGS Gazetteer (2026-11-13) found no IAU-approved names for these stops.</div>}
          <div className="pt-1 border-t border-gray-800 text-[9px] space-y-0.5">
            {region === 'gale' ? (<>
              <div><a href="https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Mars/MSL/MSL_Gale_DEM_Mosaic_1m_v3.tif" target="_blank" rel="noreferrer" className="text-cyan-400 underline">Gale DEM (USGS MSL mosaic 1 m v3)</a></div>
              <div><a href="https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json" target="_blank" rel="noreferrer" className="text-cyan-400 underline">MSL waypoint records (NASA MMGIS)</a></div>
              <div><a href="http://crism.jhuapl.edu/msl_landing_sites/index_news.php" target="_blank" rel="noreferrer" className="text-cyan-400 underline">CRISM Gale mosaic (JHU/APL)</a></div>
            </>) : (
              <a href="https://pubs.usgs.gov/publication/sim3464" target="_blank" rel="noreferrer" className="text-cyan-400 underline">Data sources (USGS & NASA)</a>
            )}
          </div>
        </div>
      </details>
    </div>
  );
}
