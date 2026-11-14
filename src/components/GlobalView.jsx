// Global Mars globe: real Viking imagery on a rotatable planet for orientation +
// real mission sites for context. NO routing here: numeric elevation and route
// computation exist only in the two detailed workspaces (Jezero 20 m, Gale 2 m).
// The globe is a VISUAL presentation: it does not imply planet-wide detail.
import { useEffect, useMemo, useRef, useState } from 'react';
import { greatCircleProfile } from '../lib/globalelev.js';
import * as THREE from 'three';
import { Canvas, useLoader, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Html, Line } from '@react-three/drei';
import eventsData from '../data/historicalEvents.json';

// Recorded-natural-event archive on the globe (user-approved): point markers
// ONLY at verified coordinates, ring markers at official Gazetteer region
// centers for region-level records - a ring is never an event position.
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

const _v = new THREE.Vector3();
function LabelLayout({ features, view, setVisibleKeys, excludeRects }) {
  const { camera, size } = useThree();
  const last = useRef(0);
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
    const cap = size.width < 560 ? 24 : 40;
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

// Camera auto-fit for the distance arc: frame both endpoints. Antipodal pairs
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

// Soft fill that follows the camera so the side being looked at stays
// readable; the fixed key light and its terminator are untouched.
function CameraFill() {
  const { camera } = useThree();
  const light = useMemo(() => new THREE.DirectionalLight(0xffffff, 0.55), []);
  useFrame(() => { light.position.copy(camera.position); });
  return <primitive object={light} />;
}

const ARC_FROM = [0.13, 0.83, 0.93]; // cyan, matches "from" ring
const ARC_TO = [0.64, 0.90, 0.23];   // lime, matches "to" ring

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

function ResetGlobeCamera({ resetKey, homePos, setSpin }) {
  const { camera, controls, invalidate } = useThree();
  useEffect(() => {
    if (!resetKey || !controls) return;
    camera.position.set(...homePos);
    controls.target.set(0, 0, 0);
    controls.update();
    setSpin(true);
    invalidate();
  }, [resetKey, homePos, setSpin, camera, controls, invalidate]);
  return null;
}

export default function GlobalView({ onOpenRegion, resetKey = 0 }) {
  const [catalog, setCatalog] = useState(null);
  const [selected, setSelected] = useState(null);
  const [bannerOpen, setBannerOpen] = useState(() => typeof window !== 'undefined' ? window.innerWidth > 560 : true);
  const [nom, setNom] = useState(null);
  const [demFrom, setDemFrom] = useState('');
  const [demTo, setDemTo] = useState('');
  const [evCatalog, setEvCatalog] = useState(null);
  const [selectedEv, setSelectedEv] = useState(null);
  const [selectedEvId, setSelectedEvId] = useState(null);
  const [evDetailOpen, setEvDetailOpen] = useState(false);
  const [showEvents, setShowEvents] = useState(true);
  const [demBusy, setDemBusy] = useState(false);
  const [demResult, setDemResult] = useState(null);
  const [demError, setDemError] = useState(null);
  const [fit, setFit] = useState(null);
  const [spin, setSpin] = useState(() => !(typeof location !== 'undefined' && location.hash.includes('globelon')));
  const homePos = useMemo(() => {
    const m = (typeof location !== 'undefined' ? location.hash : '').match(/globelon=(-?[0-9.]+)&globelat=(-?[0-9.]+)/);
    const v = m ? latLonToVec3(parseFloat(m[2]), parseFloat(m[1]), 3.0) : new THREE.Vector3(0, 0.9, 3.0);
    return [v.x, v.y, v.z];
  }, []);

  useEffect(() => {
    if (!resetKey) return;
    setSelected(null);
    setSelectedEv(null);
    setSelectedEvId(null);
    setEvDetailOpen(false);
    setDemFrom('');
    setDemTo('');
    setDemResult(null);
    setDemError(null);
  }, [resetKey]);
  const [visibleKeys, setVisibleKeys] = useState({ sig: '', keys: new Set() });
  const [view, setView] = useState({ dist: 3, dir: [0, 0.9, 3] });
  const bannerRef = useRef(null);
  const buttonsRef = useRef(null);
  const canvasWrapRef = useRef(null);
  const popupRef = useRef(null);
  const excludeRects = useRef([]);
  const globeRef = useRef();
  const [narrow, setNarrow] = useState(typeof window !== 'undefined' && window.innerWidth < 700);
  useEffect(() => {
    fetch('/data/mission_sites.json').then(r => r.json()).then(setCatalog).catch(() => setCatalog(null));
    fetch('/data/event_markers.json').then(r => r.json()).then(setEvCatalog).catch(() => setEvCatalog(null));
    fetch('/data/mars_nomenclature.json').then(r => r.json()).then(d => setNom(d.features)).catch(() => setNom(null));
  }, []);
  const minDiam = ZOOM_TIERS.find(([d]) => view.dist >= d)[1];
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

  // Distance arc between the two sampled sites: a lifted great-circle
  // connector visualizing the SAME great-circle measurement the panel
  // reports - not a route. Identical endpoints draw nothing (never invent
  // geometry); the lift is visual only.
  const arc = useMemo(() => {
    if (!demResult || !catalog || !demFrom || !demTo) return null;
    const a = catalog.sites.find(s => s.id === demFrom), b = catalog.sites.find(s => s.id === demTo);
    if (!a || !b) return null;
    const va = latLonToVec3(a.lat, a.lon, R), vb = latLonToVec3(b.lat, b.lon, R);
    const theta = va.angleTo(vb);
    if (theta < 1e-6) return null;
    const N = 96;
    const pts = [], colors = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      pts.push(va.clone().lerp(vb, t).normalize().multiplyScalar(R * 1.006 + 0.05 * Math.sin(Math.PI * t)));
      colors.push([ARC_FROM[0] + (ARC_TO[0] - ARC_FROM[0]) * t, ARC_FROM[1] + (ARC_TO[1] - ARC_FROM[1]) * t, ARC_FROM[2] + (ARC_TO[2] - ARC_FROM[2]) * t]);
    }
    return { pts, colors, a, b, mid: pts[Math.floor(N / 2)] };
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

  // Track narrow screens for bottom-sheet popup layout
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 700);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Close all popups on Escape or clicking empty globe space (not on the popup itself).
  // Marker <Html> buttons live in drei portals outside this div, so clicking a marker
  // does not trigger this handler; it opens/replaces the popup via its own onClick.
  useEffect(() => {
    const closeAll = () => { setSelected(null); setSelectedEv(null); setSelectedEvId(null); setEvDetailOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') closeAll(); };
    const onClick = (e) => {
      if (canvasWrapRef.current && canvasWrapRef.current.contains(e.target) && !popupRef.current?.contains(e.target)) {
        closeAll();
      }
    };
    document.addEventListener('keydown', onKey);
    const wrap = canvasWrapRef.current;
    if (wrap) wrap.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (wrap) wrap.removeEventListener('click', onClick);
    };
  }, []);

  return (
    <div className="global-view" style={{ position: 'absolute', inset: 0 }} ref={canvasWrapRef}>
      <Canvas camera={{ position: homePos, fov: 42 }} style={{ background: '#05070c' }}
        dpr={typeof window !== 'undefined' && window.innerWidth <= 767 ? 2 : undefined}>
        <ResetGlobeCamera resetKey={resetKey} homePos={homePos} setSpin={setSpin} />
        <ambientLight intensity={0.85} />
        <directionalLight position={[4, 2, 4]} intensity={1.1} />
        <CameraFill />
        <MarsSphere globeRef={globeRef} />
        {markers.filter(s => s.pos.x * view.dir[0] + s.pos.y * view.dir[1] + s.pos.z * view.dir[2] > 0.02).map(s => (
          <Html key={s.id} position={s.pos} zIndexRange={[900, 0]}
            style={{ pointerEvents: 'auto' }}>
            <div className="globe-marker-touch">
              <button type="button" aria-label={s.name} onClick={() => { setSelectedEv(null); setSelectedEvId(null); setEvDetailOpen(false); setSelected(s); }}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', transform: 'translate(-50%,-50%)' }}
                dangerouslySetInnerHTML={{ __html: shapeSvg(s.st.shape, s.st.color) }} />
            </div>
          </Html>
        ))}
        {showEvents && evMarkers.filter(s => s.pos.x * view.dir[0] + s.pos.y * view.dir[1] + s.pos.z * view.dir[2] > 0.02).map(s => (
          <Html key={s.id} position={s.pos} zIndexRange={[950, 0]}
            style={{ pointerEvents: 'auto' }}>
            <div className="globe-marker-touch">
              <button type="button" aria-label={`recorded natural events: ${s.events.length}`} onClick={() => { setSelectedEv(s); setSelectedEvId(null); setEvDetailOpen(false); setSelected(null); }}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', transform: 'translate(-50%,-50%)' }}
                dangerouslySetInnerHTML={{ __html: evSvg(s.kind) }} />
            </div>
          </Html>
        ))}
        {arc && (
          <Line points={arc.pts} vertexColors={arc.colors} lineWidth={2.5} transparent opacity={0.95} />
        )}
        {arc && [[arc.a, '#22d3ee', 'from'], [arc.b, '#a3e635', 'to']].map(([s, color, kind]) => {
          const p = latLonToVec3(s.lat, s.lon, R * 1.007);
          if (p.x * view.dir[0] + p.y * view.dir[1] + p.z * view.dir[2] <= 0.02) return null;
          return (
            <Html key={kind} position={p} zIndexRange={[960, 0]} style={{ pointerEvents: 'none' }} center>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, transform: 'translateY(-6px)' }}>
                <svg width="18" height="18" viewBox="0 0 18 18"><circle cx="9" cy="9" r="6.5" fill="none" stroke={color} strokeWidth="2"/><circle cx="9" cy="9" r="2.4" fill={color}/></svg>
                <div style={{ color, background: 'rgba(13,20,32,0.9)', border: `1px solid ${color}`, borderRadius: 4, padding: '1px 5px', fontSize: 10, whiteSpace: 'nowrap' }}>{s.name.split(' - ')[0]}</div>
              </div>
            </Html>
          );
        })}
        {arc && demResult && (arc.mid.x * view.dir[0] + arc.mid.y * view.dir[1] + arc.mid.z * view.dir[2] > 0.02) && (
          <Html position={arc.mid} zIndexRange={[955, 0]} style={{ pointerEvents: 'none' }} center>
            <div title="Great-circle measurement between the two sites - not a route"
              style={{ background: 'rgba(13,20,32,0.92)', border: '1px solid #a3e635', color: '#d9f99d', borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', transform: 'translateY(-14px)' }}>
              {demResult.distKm} km
            </div>
          </Html>
        )}
        <CameraFit fit={fit} />
        <ZoomTracker setView={setView} />
        <LabelLayout features={candidates} view={view} setVisibleKeys={setVisibleKeys} excludeRects={excludeRects} />
        {labels.map(f => (
          <Html key={f.n + '|' + f.la} position={f.pos}
            zIndexRange={[100, 0]} style={{ pointerEvents: 'none' }} center>
            <div className="nom-label" title={`${f.n} (${f.t}, ${f.d} km) - IAU/USGS Gazetteer`}>{f.n}</div>
          </Html>
        ))}
        <OrbitControls enablePan={false} minDistance={1.7} maxDistance={6}
          autoRotate={spin} autoRotateSpeed={0.5} enableDamping dampingFactor={0.08}
          onPointerDown={() => setSpin(false)}
          onPointerUp={() => {
            if (typeof window !== 'undefined' && window.innerWidth > 767) setSpin(true);
          }} />
      </Canvas>

      <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 'calc(100% - 16px)' }}>
      <div ref={bannerRef} style={{ maxWidth: bannerOpen ? 320 : 180, overflowY: 'auto', flexShrink: 1, minHeight: 0 }}
        className="bg-[#070d18]/95 border border-cyan-500/30 rounded-xl p-3 text-xs text-slate-200 shadow-xl backdrop-blur-md">
        <div className="flex items-center justify-between gap-2">
          <b className="text-cyan-400">Global overview — orientation only</b>
          <button type="button" onClick={() => setBannerOpen(o => !o)}
            className="text-slate-400 hover:text-white text-xs shrink-0 underline">{bannerOpen ? 'hide' : 'info'}</button>
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
          <div className="flex items-center gap-1.5">
            <span style={{ width: 12, height: 12, display: 'inline-block' }}
              dangerouslySetInnerHTML={{ __html: evSvg('point', 12) }} />
            Recorded event (verified position)
          </div>
          <div className="flex items-center gap-1.5">
            <span style={{ width: 12, height: 12, display: 'inline-block' }}
              dangerouslySetInnerHTML={{ __html: evSvg('region', 12) }} />
            Region-level records (NOT positions)
          </div>
        </div>
        <label className="flex items-center gap-1.5 mt-1 cursor-pointer">
          <input type="checkbox" checked={showEvents} onChange={e => setShowEvents(e.target.checked)} />
          Show recorded natural events (historical archive - not current conditions)
        </label>
        </>}
      </div>


      {/* Shared popup container — top-right, one popup at a time. Site and event
          popups render here so they never overlap the left panel or each other. */}
      {selected || selectedEv ? (
        <div ref={popupRef}
          style={narrow
            ? { position: 'absolute', bottom: 100, left: 0, right: 0, maxHeight: '45vh', overflowY: 'auto', zIndex: 1100 }
            : { position: 'absolute', top: 16, right: 16, width: 'min(340px, calc(100vw - 32px))', maxHeight: '60vh', overflowY: 'auto', zIndex: 1100 }}
          className="bg-[#070d18]/95 border border-cyan-500/30 rounded-xl p-3 text-xs text-slate-200 shadow-xl backdrop-blur-md">
          {selected && (
            <>
              <div className="flex items-start justify-between gap-2 mb-2">
                <b className="text-slate-100">{selected.name}</b>
                <button type="button" aria-label="Close site info" onClick={() => setSelected(null)}
                  className="flex h-8 w-8 items-center justify-center text-slate-400 hover:text-white rounded">✕</button>
              </div>
              <div>{selected.mission} ({selected.agency}){selected.landing_date_utc ? ` - ${selected.landing_date_utc}` : ''}</div>
              <div className="italic text-slate-300">{selected.st.label}{selected.region ? ` - ${selected.region}` : ''}</div>
              <div className="mt-1 text-slate-400">
                Context position for orientation — not a routing target.
              </div>
              {selected.source_quote && <div className="mt-1 text-slate-400">Source: {selected.source_quote.slice(0, 220)}</div>}
            </>
          )}
          {selectedEv && (() => {
            const e = selectedEv.events.find(x => x.id === selectedEvId) || selectedEv.events[0];
            if (!e) return null;
            const others = selectedEv.events.filter(x => x.id !== e.id);
            return (
              <>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <b className="text-amber-300">{TYPE_LABEL[e.type] || e.type}</b>
                  <button type="button" aria-label="Close event info" onClick={() => { setSelectedEv(null); setSelectedEvId(null); setEvDetailOpen(false); }}
                    className="flex h-8 w-8 items-center justify-center text-slate-400 hover:text-white rounded">✕</button>
                </div>
                <div className="text-slate-100">{e.sol != null ? `Sol ${e.sol} (${e.sol_mission || 'rover sol'}) · ` : ''}{e.date_utc} - {e.location}</div>
                <div className="mt-0.5 text-amber-200/90">{selectedEv.anchorNote}</div>
                <button type="button" onClick={() => setEvDetailOpen(o => !o)}
                  className="mt-1 text-cyan-400 hover:text-cyan-300 underline">
                  {evDetailOpen ? 'Hide details' : 'Details + source'}
                </button>
                {evDetailOpen && (
                  <div className="mt-1 pt-1 border-t border-slate-800 text-xs">
                    {e.summary && <div>{e.summary}</div>}
                    {e.estimated_fields && e.estimated_fields.length > 0 && (
                      <div className="mt-0.5 text-amber-200/80">Estimated/inferred (not measured): {e.estimated_fields.join('; ')}</div>
                    )}
                    {e.source_url && (
                      <div className="mt-0.5">Source: <a href={e.source_url} target="_blank" rel="noreferrer"
                        className="text-cyan-400 underline">{e.credit || e.source_url}</a></div>
                    )}
                    <div className="mt-1 text-slate-400">
                      Historical record — not current conditions.
                    </div>
                  </div>
                )}
                {others.length > 0 && (
                  <div className="mt-1 pt-1 border-t border-slate-800 text-slate-400 text-xs">
                    Also recorded here:
                    {others.map(o => (
                      <button key={o.id} type="button" onClick={() => { setSelectedEvId(o.id); setEvDetailOpen(false); }}
                        className="block w-full text-left text-slate-300 hover:text-amber-200 py-0.5 text-xs">
                        {TYPE_LABEL[o.type] || o.type} — {e.sol != null ? `Sol ${o.sol} · ` : ''}{o.date_utc}
                      </button>
                    ))}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      ) : null}

      <div style={{ maxWidth: 340, flexShrink: 0 }}
        className="bg-[#070d18]/95 border border-cyan-500/30 rounded-xl p-3 text-xs text-slate-200 shadow-xl backdrop-blur-md">
        <b className="text-slate-200">Coarse global elevation — sampled at ~12.8 km/px.</b>
        <div className="text-slate-400 mb-1.5">Great-circle sampling of coarse grid — NOT terrain-aware pathfinding. USGS HRSC/MOLA v2.</div>
        <div className="flex items-center gap-1.5">
          <select aria-label="Profile from" value={demFrom} onChange={e => setDemFrom(e.target.value)}
            className="station-select flex-1 min-w-0 text-xs">
            <option value="">From site...</option>
            {(catalog ? catalog.sites : []).map(s => <option key={s.id} value={s.id}>{s.name.split(' - ')[0].slice(0, 26)}</option>)}
          </select>
          <select aria-label="Profile to" value={demTo} onChange={e => setDemTo(e.target.value)}
            className="station-select flex-1 min-w-0 text-xs">
            <option value="">To site...</option>
            {(catalog ? catalog.sites : []).filter(s => s.id !== demFrom).map(s => <option key={s.id} value={s.id}>{s.name.split(' - ')[0].slice(0, 26)}</option>)}
          </select>
          <button type="button" disabled={!demFrom || !demTo || demBusy}
            onClick={async () => {
              const a = catalog.sites.find(s => s.id === demFrom), b = catalog.sites.find(s => s.id === demTo);
              if (!a || !b) return;
              setDemBusy(true); setDemError(null); setDemResult(null);
              try {
                const r = await greatCircleProfile(a.lat, a.lon, b.lat, b.lon);
                if (r.ok) {
                  setDemResult(r);
                  // frame both endpoints: camera on the bisector, distance from
                  // the angular separation so the whole arc is visible
                  const va = latLonToVec3(a.lat, a.lon, 1), vb = latLonToVec3(b.lat, b.lon, 1);
                  const theta = va.angleTo(vb);
                  const mid = va.clone().add(vb);
                  const dir = mid.length() > 0.1 ? mid.normalize() : null;
                  // keep both endpoints inside the view cone (half-angle ~0.30
                  // rad inside the 42 deg fov), not just on the visible limb
                  const half = Math.min(theta / 2, 1.45);
                  const dist = Math.min(5.8, Math.max(1.8, Math.cos(half) + Math.sin(half) / Math.tan(0.30)));
                  setFit(dir ? { dir: [dir.x, dir.y, dir.z], dist } : { dir: null, dist });
                  setSpin(false);
                } else setDemError(r.error || 'no data');
              }
              catch (e) { setDemError('fetch/decode failed: ' + (e && e.message ? e.message : 'network')); }
              setDemBusy(false);
            }}
            className="btn btn-secondary btn-sm text-xs">
            {demBusy ? 'reading...' : 'Sample'}
          </button>
        </div>
        {demError && <div className="text-amber-400 mt-1">{demError}</div>}
        {demResult && (
          <div className="mt-1">
            <div>{demResult.distKm} km great-circle | min {demResult.minM} m / max {demResult.maxM} m | asc +{demResult.ascentM} m / desc -{demResult.descentM} m</div>
            <div className="text-slate-400">actual sample spacing ~{demResult.actualSpacingM} m, {demResult.samples} samples | {demResult.method}</div>
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

      <div style={{ maxWidth: 340, flexShrink: 1, minHeight: 0, overflowY: 'auto' }}
        className="bg-[#070d18]/95 border border-amber-600/30 rounded-xl p-3 text-xs text-slate-200 shadow-xl backdrop-blur-md">
        <b className="text-amber-300">Recorded natural events — select to view</b>
        <div className="text-slate-400 mb-1.5 leading-normal">Verified historical records with observation dates. Historical archive, not current conditions.</div>
        {evMarkers.map(m => (
          <div key={m.id} className="mt-1.5 pt-1.5 border-t border-slate-800">
            <div className="text-slate-400">{EV_PLACE[m.id] || m.id}{m.kind === 'region' ? ' — region-level' : ''}</div>
            {m.events.map(e => (
              <button key={e.id} type="button"
                onClick={() => {
                  setSelectedEv(m); setSelectedEvId(e.id); setEvDetailOpen(false); setSelected(null);
                  const v = latLonToVec3(m.lat, m.lon, 1);
                  setFit({ dir: [v.x, v.y, v.z], dist: 2.3 });
                  setSpin(false);
                }}
                className="block w-full text-left text-slate-200 hover:text-amber-200 py-0.5 text-xs">
                {TYPE_LABEL[e.type] || e.type} — {e.sol != null ? `Sol ${e.sol} · ` : ''}{e.date_utc}
              </button>
            ))}
          </div>
        ))}
      </div>
      </div>

      <div ref={buttonsRef} style={{ position: 'absolute', right: 10, bottom: 52, zIndex: 1000 }} className="global-actions flex flex-col gap-1.5">
        <button type="button" onClick={() => onOpenRegion && onOpenRegion('jezero')}
          className="btn btn-primary btn-sm text-xs text-left justify-start">
          Open Jezero workspace — 20 m elevation, routing available
        </button>
        <button type="button" onClick={() => onOpenRegion && onOpenRegion('gale')}
          className="btn btn-primary btn-sm text-xs text-left justify-start">
          Open Gale workspace — 2 m elevation, routing available
        </button>
      </div>
    </div>
  );
}
