// Global Mars globe: real Viking imagery on a rotatable planet for orientation +
// real mission sites for context. NO routing here: numeric elevation and route
// computation exist only in the two detailed workspaces (Jezero 20 m, Gale 2 m).
// The globe is a VISUAL presentation: it does not imply planet-wide detail.
import { useEffect, useMemo, useRef, useState } from 'react';
import { greatCircleProfile } from '../lib/globalelev.js';
import eventsData from '../data/historicalEvents.json';
import * as THREE from 'three';
import { Canvas, useLoader, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';

// site_type -> distinct shape AND color (user requirement: shape varies, not color alone)
const TYPE_STYLE = {
  landing_site_confirmed: { color: '#22d3ee', label: 'Confirmed landing site', shape: 'circle' },
  impact_site_located: { color: '#f97316', label: 'Located impact site', shape: 'triangle' },
  impact_site_approximate_unlocated: { color: '#a3a3a3', label: 'Impact site (approximate / unlocated)', shape: 'diamond' },
  landing_site_reported_unconfirmed: { color: '#eab308', label: 'Reported landing site (unconfirmed)', shape: 'square' },
  aim_point_unlocated: { color: '#c084fc', label: 'Aim point (unlocated)', shape: 'cross' },
};

function shapeSvg(shape, color, size = 14) {
  const s2 = size / 2;
  const inner = {
    circle: `<circle cx="${s2}" cy="${s2}" r="${s2 - 2}" fill="${color}" fill-opacity="0.85" stroke="#0b0f16" stroke-width="1"/>`,
    triangle: `<polygon points="${s2},1 ${size - 1},${size - 1} 1,${size - 1}" fill="${color}" fill-opacity="0.85" stroke="#0b0f16" stroke-width="1"/>`,
    diamond: `<polygon points="${s2},1 ${size - 1},${s2} ${s2},${size - 1} 1,${s2}" fill="${color}" fill-opacity="0.85" stroke="#0b0f16" stroke-width="1"/>`,
    square: `<rect x="1.5" y="1.5" width="${size - 3}" height="${size - 3}" fill="${color}" fill-opacity="0.85" stroke="#0b0f16" stroke-width="1"/>`,
    cross: `<path d="M ${s2} 1 V ${size - 1} M 1 ${s2} H ${size - 1}" stroke="${color}" stroke-width="3" stroke-linecap="round"/>`,
  }[shape];
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
}

// Recorded-natural-event archive on the globe: point markers ONLY at verified
// coordinates, ring markers at official Gazetteer region centers for
// region-level records - a ring is never an event position.
const EV_COLOR = '#fbbf24';
function evSvg(kind, size = 14) {
  const s2 = size / 2;
  const inner = kind === 'region'
    ? `<circle cx="${s2}" cy="${s2}" r="${s2 - 2}" fill="none" stroke="${EV_COLOR}" stroke-width="1.6" stroke-dasharray="3 2"/>`
    : `<polygon points="${s2},1 ${s2 + 2.6},${s2 - 2.2} ${size - 1},${s2 - 2.2} ${s2 + 3.8},${s2 + 0.9} ${s2 + 5.4},${size - 1.5} ${s2},${s2 + 3.2} ${s2 - 5.4},${size - 1.5} ${s2 - 3.8},${s2 + 0.9} 1,${s2 - 2.2} ${s2 - 2.6},${s2 - 2.2}" fill="${EV_COLOR}" fill-opacity="0.9" stroke="#0b0f16" stroke-width="1"/>`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
}
// Short place labels for the events list (UI labels only; positions come from
// the verified marker records).
const EV_PLACE = {
  'evm-insight': 'InSight lander site',
  'evm-amazonis-impact': 'Amazonis Planitia impact crater',
  'evm-polar-avalanches': 'North polar scarp',
  'evm-jezero-region': 'Jezero Crater',
  'evm-gale-region': 'Gale Crater',
};

const TYPE_LABEL = {
  dust_storm_regional: 'Regional dust storm',
  dust_storm_global: 'Planet-encircling dust event',
  dust_devil: 'Dust devil',
  marsquake: 'Marsquake',
  meteoroid_impact: 'Meteoroid impact',
  avalanche: 'Polar avalanche (CO2/dust fall)',
};

const R = 1;
function latLonToVec3(lat, lon, r = R) {
  const phi = (90 - lat) * Math.PI / 180;
  const theta = (lon + 180) * Math.PI / 180;
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta)
  );
}

// Great-circle (spherical surface) distance between two points, in km.
// This is the surface distance along the sphere - NOT a straight chord through
// the planet, and NOT a terrain-aware route. R = 3389.5 km (Mars mean radius).
const MARS_R_KM = 3389.5;
export function greatCircleDistanceKm(lat1, lon1, lat2, lon2) {
  const a = latLonToVec3(lat1, lon1, 1);
  const b = latLonToVec3(lat2, lon2, 1);
  const dot = Math.max(-1, Math.min(1, a.dot(b)));
  return Math.acos(dot) * MARS_R_KM;
}

// Midpoint (as a world-space Vector3 on the sphere surface) of the great-circle
// arc between two points, for placing the floating distance label.
export function greatCircleMidpointVec(lat1, lon1, lat2, lon2) {
  const a = latLonToVec3(lat1, lon1, 1);
  const b = latLonToVec3(lat2, lon2, 1);
  const dot = Math.max(-1, Math.min(1, a.dot(b)));
  const omega = Math.acos(dot);
  if (omega < 1e-9) return latLonToVec3(lat1, lon1, R * 1.005);
  const t = 0.5;
  const ka = Math.sin((1 - t) * omega) / Math.sin(omega);
  const kb = Math.sin(t * omega) / Math.sin(omega);
  return new THREE.Vector3()
    .addVectors(a.clone().multiplyScalar(ka), b.clone().multiplyScalar(kb))
    .normalize()
    .multiplyScalar(R * 1.005);
}

// Curved great-circle route drawn on the globe surface. Rotates with the globe
// because it lives in the same world space as the sphere (centre at origin).
function RouteArc({ fromLat, fromLon, toLat, toLon, color }) {
  const positions = useMemo(() => {
    const a = latLonToVec3(fromLat, fromLon, 1);
    const b = latLonToVec3(toLat, toLon, 1);
    const dot = Math.max(-1, Math.min(1, a.dot(b)));
    const omega = Math.acos(dot);
    if (!isFinite(omega) || omega < 1e-6) return null; // identical endpoints: draw nothing, never invent geometry
    const samples = 80;
    const so = Math.sin(omega);
    const arr = [];
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const ka = Math.sin((1 - t) * omega) / so;
      const kb = Math.sin(t * omega) / so;
      const v = new THREE.Vector3()
        .addVectors(a.clone().multiplyScalar(ka), b.clone().multiplyScalar(kb))
        .normalize()
        .multiplyScalar(R * 1.002);
      arr.push(v.x, v.y, v.z);
    }
    return new Float32Array(arr);
  }, [fromLat, fromLon, toLat, toLon]);
  if (!positions) return null;
  return (
    <line>
      <bufferGeometry key={`${fromLat},${fromLon}-${toLat},${toLon}`}>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color={color} transparent opacity={0.85} />
    </line>
  );
}


const ARC_FROM = [0.13, 0.83, 0.93]; // cyan, matches "from" ring
const ARC_TO = [0.64, 0.90, 0.23];   // lime, matches "to" ring

// Lifted great-circle connector between the two SAMPLED sites: visualizes the
// SAME great-circle measurement the elevation panel reports - not a route.
// Identical endpoints draw nothing (never invent geometry); the lift is
// visual only. Declarative buffer attributes (raw arrays crash three.js).
function SampleArc({ fromLat, fromLon, toLat, toLon }) {
  const data = useMemo(() => {
    const va = latLonToVec3(fromLat, fromLon, R), vb = latLonToVec3(toLat, toLon, R);
    const theta = va.angleTo(vb);
    if (theta < 1e-6) return null;
    const N = 96;
    const pts = [], colors = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const p = va.clone().lerp(vb, t).normalize().multiplyScalar(R * 1.006 + 0.05 * Math.sin(Math.PI * t));
      pts.push(p.x, p.y, p.z);
      colors.push(ARC_FROM[0] + (ARC_TO[0] - ARC_FROM[0]) * t, ARC_FROM[1] + (ARC_TO[1] - ARC_FROM[1]) * t, ARC_FROM[2] + (ARC_TO[2] - ARC_FROM[2]) * t);
    }
    return { positions: new Float32Array(pts), colors: new Float32Array(colors.flat ? colors : colors) };
  }, [fromLat, fromLon, toLat, toLon]);
  if (!data) return null;
  return (
    <line key={`${fromLat},${fromLon}-${toLat},${toLon}`}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[data.positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[data.colors, 3]} />
      </bufferGeometry>
      <lineBasicMaterial vertexColors transparent opacity={0.95} />
    </line>
  );
}

// Screen-space overlay items live in the MAIN React tree (same pattern as
// Terrain3D.jsx): drei Html's secondary React root double-tears-down under
// React 19 on unmount and crashed Global->2D switches (NotFoundError
// removeChild), so globe overlays are plain DOM positioned per frame from
// inside the scene through a ref registry.
function GlobeOverlayDriver({ registry }) {
  const { camera, size } = useThree();
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    for (const it of registry.current.values()) {
      if (!it.el) continue;
      v.set(it.world[0], it.world[1], it.world[2]).project(camera);
      if (v.z > 1) { it.el.style.visibility = 'hidden'; continue; }
      it.el.style.visibility = 'visible';
      const sx = (v.x * 0.5 + 0.5) * size.width;
      const sy = (-v.y * 0.5 + 0.5) * size.height;
      it.el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%,-50%)`;
    }
  });
  return null;
}

// One overlay item anchored to a world position. Only items marked
// interactive receive pointer events; the wrapper never blocks the canvas.
function GlobeAnchor({ registry, id, world, z = 0, interactive = false, style, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    registry.current.set(id, { world, el });
    return () => registry.current.delete(id);
  });
  return (
    <div ref={ref} style={{ position: 'absolute', left: 0, top: 0, zIndex: z, visibility: 'hidden', pointerEvents: interactive ? 'auto' : 'none', ...style }}>
      {children}
    </div>
  );
}

function MarsSphere({ globeRef }) {
  const texture = useLoader(THREE.TextureLoader, '/data/mars_viking_mdim21_2048.jpg');
  texture.colorSpace = THREE.SRGBColorSpace;
  return (
    <mesh ref={globeRef}>
      <sphereGeometry args={[R, 96, 96]} />
      <meshStandardMaterial map={texture} roughness={1} metalness={0} />
    </mesh>
  );
}

// zoom tiers (camera distance -> minimum feature diameter in km). Official
// IAU/USGS Gazetteer nomenclature; unnamed ground is never given invented names.
const ZOOM_TIERS = [[4.5, 600], [3.4, 300], [2.6, 120], [1.9, 50], [0, 15]];
const MAX_LABELS = 60;

// Label density presets: scale the minimum feature diameter (fewer/larger
// labels when minimal), the label cap, and the base opacity.
const DENSITY_PRESETS = {
  minimal: { scale: 1.7, cap: 0.5, opacity: 0.4 },
  balanced: { scale: 1.0, cap: 1.0, opacity: 0.75 },
  detailed: { scale: 0.65, cap: 1.4, opacity: 0.92 },
};

const _v = new THREE.Vector3();
function LabelLayout({ features, view, density, setVisibleKeys, excludeRects }) {
  const { camera, size } = useThree();
  const last = useRef(0);
  const densityCfg = DENSITY_PRESETS[density];
  useFrame(() => {
    const now = performance.now();
    if (now - last.current < 120) return; // ~8 Hz relayout
    last.current = now;
    const px = [];
    for (const f of features) {
      _v.copy(f.pos);
      // strong front-facing requirement: cull near the limb
      const dirDot = f.pos.x * view.dir[0] + f.pos.y * view.dir[1] + f.pos.z * view.dir[2];
      if (dirDot < 0.25) continue;
      _v.project(camera);
      if (Math.abs(_v.x) > 0.88 || Math.abs(_v.y) > 0.86) continue;
      const x = (_v.x * 0.5 + 0.5) * size.width;
      const y = (-_v.y * 0.5 + 0.5) * size.height;
      // cull under overlays (banner, entry buttons)
      let blocked = false;
      for (const r of excludeRects.current) {
        if (r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) { blocked = true; break; }
      }
      if (blocked) continue;
      px.push({ key: f.n + '|' + f.la, x, y, d: f.d });
    }
    px.sort((a, b) => b.d - a.d);
    const minGap = size.width < 560 ? 44 : 52;
    const cap = Math.max(1, Math.round((size.width < 560 ? 24 : 40) * densityCfg.cap));
    const kept = [];
    for (const c of px) {
      if (kept.length >= cap) break;
      if (kept.every(k => Math.hypot(k.x - c.x, k.y - c.y) >= minGap)) kept.push(c);
    }
    setVisibleKeys(prev => {
      const sig = kept.map(k => k.key).join(';');
      return prev.sig === sig ? prev : { sig, keys: new Set(kept.map(k => k.key)) };
    });
  });
  return null;
}

// Camera auto-fit: point the globe at a selected marker. Antipodal pairs
// cannot share one view; then only the distance is adjusted.
function CameraFit({ fit }) {
  const { camera } = useThree();
  useEffect(() => {
    if (!fit) return;
    const d = fit.dir ? new THREE.Vector3(...fit.dir) : camera.position.clone().normalize();
    camera.position.copy(d.multiplyScalar(fit.dist));
    camera.lookAt(0, 0, 0);
  }, [fit]);
  return null;
}

// Initial fit: pull the camera back far enough that the whole planet fits
// the canvas on first paint (narrow phone screens crop the disc at the
// desktop distance). Runs once, before any interaction; OrbitControls and
// CameraFit own the camera afterwards.
function InitialFit() {
  const { camera, size } = useThree();
  const done = useRef(false);
  useFrame(() => {
    if (done.current || !size.width || !size.height) return;
    done.current = true;
    const aspect = size.width / size.height;
    const halfV = (camera.fov * Math.PI) / 360;
    const halfH = Math.atan(Math.tan(halfV) * aspect);
    const need = 1.06 / Math.sin(Math.min(halfV, halfH));
    const d = camera.position.length();
    if (need > d) {
      camera.position.copy(camera.position.clone().normalize().multiplyScalar(Math.min(need, 5.6)));
      camera.lookAt(0, 0, 0);
    }
  });
  return null;
}

function ZoomTracker({ setView }) {
  const { camera } = useThree();
  useFrame(() => setView(v => {
    const d = camera.position.length();
    const dir = camera.position.clone().normalize();
    const moved = Math.abs(v.dist - d) > 0.05 ||
      Math.abs(v.dir[0] - dir.x) + Math.abs(v.dir[1] - dir.y) + Math.abs(v.dir[2] - dir.z) > 0.02;
    return moved ? { dist: d, dir: [dir.x, dir.y, dir.z] } : v;
  }));
  return null;
}

export default function GlobalView({ onOpenRegion, endpoints, abMetrics, routeModel = 'straight', routeVisible = true, onToggleRoute }) {
  const [catalog, setCatalog] = useState(null);
  const [selected, setSelected] = useState(null);
  const [bannerOpen, setBannerOpen] = useState(() => typeof window !== 'undefined' ? window.innerWidth > 560 : true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [nom, setNom] = useState(null);
  const [demFrom, setDemFrom] = useState('');
  const [demTo, setDemTo] = useState('');
  const [demBusy, setDemBusy] = useState(false);
  const [demResult, setDemResult] = useState(null);
  const [demError, setDemError] = useState(null);
  const [view, setView] = useState({ dist: 3.0, dir: [0, 0.35, 0.94] });
  const [visibleKeys, setVisibleKeys] = useState({ sig: '', keys: new Set() });
  const [labelDensity, setLabelDensity] = useState('balanced');
  const [labelsVisible, setLabelsVisible] = useState(true);
  const [geoSelected, setGeoSelected] = useState(null);
  const [evCatalog, setEvCatalog] = useState(null);
  const [selectedEv, setSelectedEv] = useState(null);
  const [selectedEvId, setSelectedEvId] = useState(null);
  const [evDetailOpen, setEvDetailOpen] = useState(false);
  const [showEvents, setShowEvents] = useState(true);
  const [fit, setFit] = useState(null);
  const [spin, setSpin] = useState(() => !(typeof location !== 'undefined' && location.hash.includes('globelon')));
  const bannerRef = useRef(null);
  const buttonsRef = useRef(null);
  const canvasWrapRef = useRef(null);
  const excludeRects = useRef([]);
  const globeRef = useRef();
  const overlayReg = useRef(new Map());
  useEffect(() => {
    fetch('/data/mission_sites.json').then(r => r.json()).then(setCatalog).catch(() => setCatalog(null));
    fetch('/data/event_markers.json').then(r => r.json()).then(setEvCatalog).catch(() => setEvCatalog(null));
    fetch('/data/mars_nomenclature.json').then(r => r.json()).then(d => setNom(d.features)).catch(() => setNom(null));
  }, []);
  const baseMinDiam = ZOOM_TIERS.find(([d]) => view.dist >= d)[1];
  const minDiam = baseMinDiam * DENSITY_PRESETS[labelDensity].scale;
  const front = f => {
    const p = latLonToVec3(f.la, f.lo, 1);
    return p.x * view.dir[0] + p.y * view.dir[1] + p.z * view.dir[2] > 0.08;
  };
  const candidates = (nom || []).filter(f => f.d >= minDiam).map(f => ({ ...f, pos: latLonToVec3(f.la, f.lo, R * 1.004) }));
  const labels = candidates.filter(f => visibleKeys.keys.has(f.n + '|' + f.la));
  const markers = useMemo(() => (catalog ? catalog.sites.map(s => ({
    ...s, st: TYPE_STYLE[s.site_type] || { color: '#ffffff', label: s.site_type, shape: 'circle' },
    pos: latLonToVec3(s.lat, s.lon, R * 1.005),
  })) : []), [catalog]);
  const evMarkers = useMemo(() => (evCatalog ? evCatalog.markers.map(m => ({
    ...m,
    events: m.eventIds.map(id => eventsData.events.find(e => e.id === id)).filter(Boolean),
    pos: latLonToVec3(m.lat, m.lon, R * 1.006),
  })) : []), [evCatalog]);
  const sampleArc = useMemo(() => {
    if (!demResult || !catalog || !demFrom || !demTo) return null;
    const a = catalog.sites.find(x => x.id === demFrom), b = catalog.sites.find(x => x.id === demTo);
    if (!a || !b || (a.lat === b.lat && a.lon === b.lon)) return null;
    return { a, b };
  }, [demResult, demFrom, demTo, catalog]);

  useEffect(() => {
    const id = setInterval(() => {
      const wrap = canvasWrapRef.current;
      if (!wrap) return;
      const wr = wrap.getBoundingClientRect();
      const rel = el => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { left: r.left - wr.left, right: r.right - wr.left, top: r.top - wr.top, bottom: r.bottom - wr.top };
      };
      excludeRects.current = [rel(bannerRef.current), rel(buttonsRef.current)];
    }, 250);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="global-view" style={{ position: 'absolute', inset: 0 }} ref={canvasWrapRef}>
      <Canvas camera={{ position: (() => {
          const m = (typeof location !== 'undefined' ? location.hash : '').match(/globelon=(-?[0-9.]+)&globelat=(-?[0-9.]+)/);
          const v = m ? latLonToVec3(parseFloat(m[2]), parseFloat(m[1]), 3.0) : new THREE.Vector3(0, 0.9, 3.0);
          return [v.x, v.y, v.z];
        })(), fov: 42 }} style={{ background: '#05070c' }}>
        <ambientLight intensity={0.85} />
        <directionalLight position={[4, 2, 4]} intensity={1.1} />
        <MarsSphere globeRef={globeRef} />
        <InitialFit />
        <ZoomTracker setView={setView} />
        <CameraFit fit={fit} />
        <LabelLayout features={candidates} view={view} density={labelDensity} setVisibleKeys={setVisibleKeys} excludeRects={excludeRects} />
        {/* Two-point distance visualization: curved great-circle route. */}
        {endpoints && routeVisible && (
          <RouteArc
            fromLat={endpoints[0].lat} fromLon={endpoints[0].lon}
            toLat={endpoints[1].lat} toLon={endpoints[1].lon}
            color={routeModel === 'traverse' ? '#a3e635' : '#22d3ee'} />
        )}
        {sampleArc && (
          <SampleArc fromLat={sampleArc.a.lat} fromLon={sampleArc.a.lon} toLat={sampleArc.b.lat} toLon={sampleArc.b.lon} />
        )}
        <GlobeOverlayDriver registry={overlayReg} />
        <OrbitControls enablePan={false} minDistance={1.7} maxDistance={6}
          autoRotate={spin} autoRotateSpeed={0.5} enableDamping dampingFactor={0.08} />
      </Canvas>

      {/* Globe-anchored overlays: plain DOM in the main tree, positioned per
          frame by GlobeOverlayDriver (see note above it). */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        {markers.filter(s => s.pos.x * view.dir[0] + s.pos.y * view.dir[1] + s.pos.z * view.dir[2] > 0.02).map(s => (
          <GlobeAnchor key={s.id} registry={overlayReg} id={'site-' + s.id}
            world={[s.pos.x, s.pos.y, s.pos.z]} z={900} interactive>
            <div className="globe-marker-touch">
              <button type="button" aria-label={s.name} onClick={() => { setSelected(s); setSelectedEv(null); setSelectedEvId(null); setEvDetailOpen(false); }}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                dangerouslySetInnerHTML={{ __html: shapeSvg(s.st.shape, s.st.color) }} />
            </div>
          </GlobeAnchor>
        ))}
        {showEvents && evMarkers.filter(s => s.pos.x * view.dir[0] + s.pos.y * view.dir[1] + s.pos.z * view.dir[2] > 0.02).map(s => (
          <GlobeAnchor key={s.id} registry={overlayReg} id={'ev-' + s.id}
            world={[s.pos.x, s.pos.y, s.pos.z]} z={950} interactive>
            <div className="globe-marker-touch">
              <button type="button" aria-label={`recorded natural events: ${s.events.length}`} onClick={() => { setSelectedEv(s); setSelectedEvId(null); setEvDetailOpen(false); setSelected(null); }}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                dangerouslySetInnerHTML={{ __html: evSvg(s.kind) }} />
            </div>
          </GlobeAnchor>
        ))}
        {labelsVisible && labels.map(f => {
          const active = geoSelected && geoSelected.n === f.n && geoSelected.la === f.la;
          return (
            <GlobeAnchor key={f.n + '|' + f.la} registry={overlayReg} id={'lbl-' + f.n + '|' + f.la}
              world={[f.pos.x, f.pos.y, f.pos.z]} z={100} interactive>
              <div
                className={`globe-label ${active ? 'globe-label--active' : ''} globe-label--${labelDensity}`}
                title={`${f.n} (${f.t}, ${f.d} km) - IAU/USGS Gazetteer`}
                onClick={() => setGeoSelected(f)}
              >
                <span className="globe-label-title">{f.n}</span>
              </div>
            </GlobeAnchor>
          );
        })}
        {geoSelected && labelsVisible && (() => {
          const gp = latLonToVec3(geoSelected.la, geoSelected.lo, R * 1.006);
          return (
            <GlobeAnchor registry={overlayReg} id="geo-highlight" world={[gp.x, gp.y, gp.z]} z={200}>
              <div className="geo-highlight" />
            </GlobeAnchor>
          );
        })()}
        {endpoints && routeVisible && [0, 1].map((i) => {
          const e = endpoints[i];
          const isStart = i === 0;
          const ep = latLonToVec3(e.lat, e.lon, R * 1.007);
          return (
            <GlobeAnchor key={i} registry={overlayReg} id={'ep-' + i} world={[ep.x, ep.y, ep.z]} z={300} interactive style={{ cursor: 'default' }}>
              <div className={`globe-endpoint ${isStart ? 'globe-endpoint--start' : 'globe-endpoint--dest'}`}
                title={`${e.label} (${e.lat.toFixed(3)}°, ${e.lon.toFixed(3)}°)`}>
                <div className="globe-endpoint-core" />
              </div>
              <div className="globe-endpoint-label">{e.label}</div>
            </GlobeAnchor>
          );
        })}
        {/* Floating distance label at the arc midpoint - only when the arc
            is visible at globe scale; the panel always shows the value. */}
        {endpoints && routeVisible && greatCircleDistanceKm(endpoints[0].lat, endpoints[0].lon, endpoints[1].lat, endpoints[1].lon) >= 100 && (() => {
          const mp = greatCircleMidpointVec(endpoints[0].lat, endpoints[0].lon, endpoints[1].lat, endpoints[1].lon);
          return (
            <GlobeAnchor registry={overlayReg} id="dist-label" world={[mp.x, mp.y, mp.z]} z={250}>
              <div className="globe-dist-label">
                <div className="globe-dist-label-inner">
                  <div className="globe-dist-label-pair">{endpoints[0].label} → {endpoints[1].label}</div>
                  <div className="globe-dist-label-value">
                    {greatCircleDistanceKm(endpoints[0].lat, endpoints[0].lon, endpoints[1].lat, endpoints[1].lon).toFixed(2)} km
                  </div>
                  <div className="globe-dist-label-model">{routeModel === 'traverse' ? 'recorded traverse' : routeModel === 'leastcost' ? 'least-cost terrain' : 'great-circle surface'} distance</div>
                </div>
              </div>
            </GlobeAnchor>
          );
        })()}
        {sampleArc && [[sampleArc.a, '#22d3ee', 'from'], [sampleArc.b, '#a3e635', 'to']].map(([site, color, kind]) => {
          const pp = latLonToVec3(site.lat, site.lon, R * 1.007);
          if (pp.x * view.dir[0] + pp.y * view.dir[1] + pp.z * view.dir[2] <= 0.02) return null;
          return (
            <GlobeAnchor key={kind} registry={overlayReg} id={'sa-' + kind} world={[pp.x, pp.y, pp.z]} z={960}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, transform: 'translateY(-6px)' }}>
                <svg width="18" height="18" viewBox="0 0 18 18"><circle cx="9" cy="9" r="6.5" fill="none" stroke={color} strokeWidth="2"/><circle cx="9" cy="9" r="2.4" fill={color}/></svg>
                <div style={{ color, background: 'rgba(13,20,32,0.9)', border: `1px solid ${color}`, borderRadius: 4, padding: '1px 5px', fontSize: 10, whiteSpace: 'nowrap' }}>{site.name.split(' - ')[0]}</div>
              </div>
            </GlobeAnchor>
          );
        })}
        {sampleArc && (() => {
          const mid = greatCircleMidpointVec(sampleArc.a.lat, sampleArc.a.lon, sampleArc.b.lat, sampleArc.b.lon);
          if (mid.x * view.dir[0] + mid.y * view.dir[1] + mid.z * view.dir[2] <= 0.02) return null;
          return (
            <GlobeAnchor registry={overlayReg} id="sa-mid" world={[mid.x, mid.y, mid.z]} z={955}>
              <div title="Great-circle measurement between the two sites - not a route"
                style={{ background: 'rgba(13,20,32,0.92)', border: '1px solid #a3e635', color: '#d9f99d', borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', transform: 'translateY(-14px)' }}>
                {demResult.distKm} km
              </div>
            </GlobeAnchor>
          );
        })()}
      </div>

      <div className="globe-controls">
        <div className="globe-control-row">
          <label className="text-[10px] text-gray-400">
            <input type="checkbox" checked={labelsVisible} onChange={e => setLabelsVisible(e.target.checked)} style={{ marginRight: 6 }} />
            Geographical labels
          </label>
          <select value={labelDensity} onChange={e => setLabelDensity(e.target.value)}
            className="bg-[#0a0e17] border border-cyan-900 rounded px-1.5 py-0.5 text-[10px] text-gray-200">
            <option value="minimal">Minimal</option>
            <option value="balanced">Balanced</option>
            <option value="detailed">Detailed</option>
          </select>
          <span className={`globe-density-chip globe-density-chip--active`}>{labelDensity}</span>
        </div>
        <div className="globe-control-row">
          <label className="text-[10px] text-gray-400">
            <input type="checkbox" checked={showEvents} onChange={e => setShowEvents(e.target.checked)} style={{ marginRight: 6 }} />
            Recorded natural events
          </label>
        </div>
        {endpoints && (
          <div className="globe-control-row">
            <button type="button" onClick={onToggleRoute}
              className={`globe-route-toggle ${routeVisible ? 'globe-route-toggle--active' : ''}`}>
              {routeVisible ? 'Hide route' : 'Show route'}
            </button>
          </div>
        )}
      </div>


      <div className={`global-left-col${sheetOpen ? ' sheet-open' : ''}`}>
        <button type="button" className="global-sheet-handle" aria-expanded={sheetOpen}
          onClick={() => setSheetOpen(o => !o)}>
          <span className="global-sheet-handle-grip" aria-hidden="true" />
          {sheetOpen ? 'Hide globe panels' : 'Globe panels: info, elevation, events'}
        </button>
      <div ref={bannerRef} style={{ maxWidth: bannerOpen ? 300 : 170, overflowY: 'auto', flexShrink: 1, minHeight: 0 }}
        className="bg-[#0d1420] border border-cyan-900 rounded p-2 text-[10px] text-gray-300">
        <div className="flex items-center justify-between gap-2">
          <b className="text-cyan-400">Global overview - orientation only.</b>
          <button type="button" onClick={() => setBannerOpen(o => !o)}
            className="text-gray-500 hover:text-gray-200 text-[10px] shrink-0">{bannerOpen ? 'hide' : 'info'}</button>
        </div>
        {bannerOpen && <>
        <div className="mb-1">Place names: official IAU/USGS Gazetteer ({nom ? nom.length : '...'}
          features; zoom in for smaller ones). Unnamed ground stays unnamed. Drag to spin,
          scroll to zoom. Site markers: real mission/landing sites at context precision
          ({catalog ? catalog.sites.length : '...'} shown; not all verified).</div>
        <div className="space-y-0.5 pt-1 border-t border-gray-800">
          <div><b className="text-gray-300">Available here:</b> Viking MDIM 2.1 imagery
            (NASA/JPL via Mars Trek; source 232 m/px, shown ~10 km/px) - the source mosaic
            has a real brightness seam at +/-180, most visible near the poles, left as-is.
            Coarse elevation profiles at ~12.8 km/px (USGS HRSC/MOLA 200 m v2, panel
            below) - experimental, not a route.</div>
          <div><b className="text-gray-300">Only in the Jezero/Gale workspaces</b> (buttons
            lower right): fine elevation grids + routing on recorded rover traverses.
            No planet-wide routing or fine terrain is claimed.</div>
          <div><b className="text-gray-300">Not available at globe scale:</b> geology /
            thermal / mineral layers - no global real dataset integrated. The local
            workspaces do add Jezero USGS SIM 3464 geology polygons and Gale CRISM
            770 nm brightness; a SIM-scale geology map for Gale was not found.</div>
        </div>
        <div className="mt-1 pt-1 border-t border-gray-800" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 6, rowGap: 2 }}>
          {Object.entries(TYPE_STYLE).map(([k, v]) => (
            <div key={k} className="flex items-center gap-1.5">
              <span style={{ width: 12, height: 12, display: 'inline-block' }}
                dangerouslySetInnerHTML={{ __html: shapeSvg(v.shape, v.color, 12) }} />
              {v.label}
            </div>
          ))}
        </div>
        </>}
      </div>


      <div style={{ maxWidth: 330, flexShrink: 0 }}
        className="bg-[#0d1420] border border-gray-700 rounded p-2 text-[10px] text-gray-300">
        <b className="text-gray-200">Coarse global elevation - sampled at ~12.8 km/px (experimental).</b>

      {geoSelected && (
        <div style={{ position: 'absolute', bottom: 140, left: 10, zIndex: 1000, maxWidth: 260 }}
          className="bg-[#0d1420] border border-cyan-900 rounded p-2 text-[10px] text-gray-300">
          <div className="flex items-start justify-between gap-2 mb-1">
            <b className="text-cyan-400">{geoSelected.n}</b>
            <button type="button" onClick={() => setGeoSelected(null)}
              className="text-gray-500 hover:text-gray-200">×</button>
          </div>
          <div className="text-gray-400 text-[9px] mb-1">{geoSelected.t}</div>
          <div className="text-gray-400 text-[9px] mb-1">~{geoSelected.d} km across</div>
          <a href={geoSelected.u} target="_blank" rel="noreferrer" className="text-cyan underline text-[9px] block">USGS Gazetteer entry →</a>
          <div className="mt-1 text-gray-500 text-[9px]">Tap any place name on the globe to select it.</div>
        </div>
      )}
        <div className="text-gray-500 mb-1">Great-circle sampling of the coarse grid - NOT terrain-aware pathfinding, not a route. USGS HRSC/MOLA v2 (MOLA CC0 + HRSC CC BY-SA 3.0 IGO).</div>
        <div className="flex items-center gap-1.5">
          <select aria-label="Profile from" value={demFrom} onChange={e => setDemFrom(e.target.value)}
            className="flex-1 min-w-0 bg-[#0d1420] border border-gray-700 rounded px-1 py-0.5 text-[10px] text-gray-200">
            <option value="">From site...</option>
            {(catalog ? catalog.sites : []).map(s => <option key={s.id} value={s.id}>{s.name.split(' - ')[0].slice(0, 26)}</option>)}
          </select>
          <select aria-label="Profile to" value={demTo} onChange={e => setDemTo(e.target.value)}
            className="flex-1 min-w-0 bg-[#0d1420] border border-gray-700 rounded px-1 py-0.5 text-[10px] text-gray-200">
            <option value="">To site...</option>
            {(catalog ? catalog.sites : []).filter(s => s.id !== demFrom).map(s => <option key={s.id} value={s.id}>{s.name.split(' - ')[0].slice(0, 26)}</option>)}
          </select>
          <button type="button" disabled={!demFrom || !demTo || demBusy}
            onClick={async () => {
              const a = catalog.sites.find(s => s.id === demFrom), b = catalog.sites.find(s => s.id === demTo);
              if (!a || !b) return;
              setDemBusy(true); setDemError(null); setDemResult(null);
              try { const r = await greatCircleProfile(a.lat, a.lon, b.lat, b.lon); r.ok ? setDemResult(r) : setDemError(r.error || 'no data'); }
              catch (e) { setDemError('fetch/decode failed: ' + (e && e.message ? e.message : 'network')); }
              setDemBusy(false);
            }}
            className="bg-gray-800 border border-gray-600 rounded px-1.5 py-0.5 text-[10px] text-gray-200 disabled:opacity-40">
            {demBusy ? 'reading...' : 'Sample'}
          </button>
        </div>
        {demError && <div className="text-amber-400 mt-1">{demError}</div>}
        {demResult && (
          <div className="mt-1">
            <div>{demResult.distKm} km great-circle | min {demResult.minM} m / max {demResult.maxM} m | asc +{demResult.ascentM} m / desc -{demResult.descentM} m</div>
            <div className="text-gray-500">actual sample spacing ~{demResult.actualSpacingM} m (coarse overview), {demResult.samples} samples | {demResult.method}</div>
            <svg width="300" height="36" className="mt-0.5" aria-label="Elevation profile">
              {(() => {
                const pts = demResult.pts.filter(p => p.elevM != null);
                const span = Math.max(1, demResult.maxM - demResult.minM);
                const step = 300 / (pts.length - 1);
                const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(34 - ((p.elevM - demResult.minM) / span) * 30).toFixed(1)}`).join(' ');
                return <path d={d} stroke="#94a3b8" fill="none" strokeWidth="1.2" />;
              })()}
            </svg>
          </div>
        )}
      </div>

      {endpoints && routeVisible && (
        <div style={{ maxWidth: 330, flexShrink: 0 }}
          className="bg-[#0d1420]/95 border border-cyan-900 rounded p-2 text-[10px] text-gray-300 globe-distance-panel">
          <div className="globe-distance-panel-head">
            <span className="globe-distance-panel-title">Two-point route</span>
            <span className="text-[9px] text-gray-500">
              {routeModel === 'traverse' ? 'Recorded traverse' : routeModel === 'leastcost' ? 'Least-cost terrain' : 'Great-circle surface'}
            </span>
          </div>
          <div className="globe-distance-panel-body">
            <div className="globe-distance-row">
              <span className="globe-distance-row-label">From</span>
              <span className="globe-distance-row-value">{endpoints[0].label}</span>
            </div>
            <div className="globe-distance-row">
              <span className="globe-distance-row-label">To</span>
              <span className="globe-distance-row-value">{endpoints[1].label}</span>
            </div>
            <div className="globe-distance-row">
              <span className="globe-distance-row-label">Distance</span>
              <span className="globe-distance-row-value"><b>
                {greatCircleDistanceKm(endpoints[0].lat, endpoints[0].lon, endpoints[1].lat, endpoints[1].lon).toFixed(2)}
              </b> km</span>
            </div>
            <div className="globe-distance-row">
              <span className="globe-distance-row-label">Est. travel time</span>
              <span className="globe-distance-row-value">
                {Math.round(greatCircleDistanceKm(endpoints[0].lat, endpoints[0].lon, endpoints[1].lat, endpoints[1].lon) / 1.0 * 60)} min walk <span className="text-gray-500 text-[9px]">(1.0 km/h declared pace)</span>
              </span>
            </div>
            <div className="globe-distance-row">
              <span className="globe-distance-row-label">Elevation gain</span>
              <span className="globe-distance-row-value globe-distance-row-value--muted">
                not available at globe scale (coarse grid only)
              </span>
            </div>
            <div className="globe-distance-row">
              <span className="globe-distance-row-label">Model note</span>
              <span className="globe-distance-row-value globe-distance-row-value--muted">
                Globe route is great-circle surface distance on the coarse global grid - not terrain-aware. Fine terrain/route models run in the Jezero and Gale workspaces only.
              </span>
            </div>
          </div>
        </div>
      )}

      <div style={{ maxWidth: 330, flexShrink: 1, minHeight: 0, overflowY: 'auto' }}
        className="bg-[#0d1420] border border-amber-600/30 rounded p-2 text-[10px] text-gray-300">
        <b className="text-amber-300">Recorded natural events - select to view</b>
        <div className="text-gray-500 mb-1.5 leading-normal">Verified historical records with observation dates. Historical archive, not current conditions.</div>
        {evMarkers.map(m => (
          <div key={m.id} className="mt-1.5 pt-1.5 border-t border-gray-800">
            <div className="text-gray-500">{EV_PLACE[m.id] || m.id}{m.kind === 'region' ? ' - region-level' : ''}</div>
            {m.events.map(e => (
              <button key={e.id} type="button"
                onClick={() => {
                  setSelectedEv(m); setSelectedEvId(e.id); setEvDetailOpen(false); setSelected(null);
                  const v = latLonToVec3(m.lat, m.lon, 1);
                  setFit({ dir: [v.x, v.y, v.z], dist: 2.3 });
                  setSpin(false);
                }}
                className="block w-full text-left text-gray-200 hover:text-amber-200 py-0.5 text-[10px]">
                {TYPE_LABEL[e.type] || e.type} - {e.sol != null ? `Sol ${e.sol} - ` : ''}{e.date_utc}
              </button>
            ))}
          </div>
        ))}
      </div>
      </div>
      {(selected || selectedEv) && (
        <div style={{ position: 'absolute', top: 132, right: 8, zIndex: 1000, maxWidth: 300, maxHeight: '60vh', overflowY: 'auto' }}
          className="bg-[#0d1420] border border-gray-700 rounded p-2 text-[10px] text-gray-300">
          {selected && (
            <>
              <div className="flex items-start justify-between gap-2">
                <b className="text-gray-100">{selected.name}</b>
                <button type="button" aria-label="Close site info" onClick={() => setSelected(null)}
                  className="text-gray-500 hover:text-gray-200">x</button>
              </div>
              <div>{selected.mission} ({selected.agency}){selected.landing_date_utc ? ` - ${selected.landing_date_utc}` : ''}</div>
              <div className="italic">{selected.st.label}{selected.region ? ` - ${selected.region}` : ''}</div>
              <div className="mt-1 text-gray-500">
                Context position for orientation - not a routing target, not geodetic precision.
              </div>
              {selected.source_quote && <div className="mt-1 text-gray-500">Source: {selected.source_quote.slice(0, 220)}</div>}
            </>
          )}
          {selectedEv && (() => {
            const e = selectedEv.events.find(x => x.id === selectedEvId) || selectedEv.events[0];
            if (!e) return null;
            const others = selectedEv.events.filter(x => x.id !== e.id);
            return (
              <>
                <div className="flex items-start justify-between gap-2">
                  <b className="text-amber-300">{TYPE_LABEL[e.type] || e.type}</b>
                  <button type="button" aria-label="Close event info" onClick={() => { setSelectedEv(null); setSelectedEvId(null); setEvDetailOpen(false); }}
                    className="text-gray-500 hover:text-gray-200">x</button>
                </div>
                <div className="text-gray-100">{e.sol != null ? `Sol ${e.sol} (${e.sol_mission || 'rover sol'}) - ` : ''}{e.date_utc} - {e.location}</div>
                {selectedEv.anchorNote && <div className="mt-0.5 text-amber-200/90">{selectedEv.anchorNote}</div>}
                <button type="button" onClick={() => setEvDetailOpen(o => !o)}
                  className="mt-1 text-cyan-400 hover:text-cyan-300 underline">
                  {evDetailOpen ? 'Hide details' : 'Details + source'}
                </button>
                {evDetailOpen && (
                  <div className="mt-1 pt-1 border-t border-gray-800">
                    {e.summary && <div>{e.summary}</div>}
                    {e.estimated_fields && e.estimated_fields.length > 0 && (
                      <div className="mt-0.5 text-amber-200/80">Estimated/inferred (not measured): {e.estimated_fields.join('; ')}</div>
                    )}
                    {e.source_url && (
                      <div className="mt-0.5">Source: <a href={e.source_url} target="_blank" rel="noreferrer"
                        className="text-cyan-400 underline">{e.credit || e.source_url}</a></div>
                    )}
                    <div className="mt-1 text-gray-500">Historical record - not current conditions.</div>
                  </div>
                )}
                {others.length > 0 && (
                  <div className="mt-1 pt-1 border-t border-gray-800 text-gray-500">
                    Also recorded here:
                    {others.map(o => (
                      <button key={o.id} type="button" onClick={() => { setSelectedEvId(o.id); setEvDetailOpen(false); }}
                        className="block w-full text-left text-gray-300 hover:text-amber-200 py-0.5">
                        {TYPE_LABEL[o.type] || o.type} - {o.sol != null ? `Sol ${o.sol} - ` : ''}{o.date_utc}
                      </button>
                    ))}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      <div ref={buttonsRef} style={{ position: 'absolute', right: 10, bottom: 52, zIndex: 1000 }} className="global-actions flex flex-col gap-1.5">
        <button type="button" onClick={() => onOpenRegion && onOpenRegion('jezero')}
          className="bg-[#0d1420]/95 border border-lime-700 rounded px-2 py-1.5 text-[11px] text-lime-300 hover:bg-lime-950 text-left">
          Open Jezero workspace - 20 m elevation, routing available
        </button>
        <button type="button" onClick={() => onOpenRegion && onOpenRegion('gale')}
          className="bg-[#0d1420]/95 border border-lime-700 rounded px-2 py-1.5 text-[11px] text-lime-300 hover:bg-lime-950 text-left">
          Open Gale workspace - 2 m elevation, routing available
        </button>
      </div>
    </div>
  );
              }
