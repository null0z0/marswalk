// Global Mars globe: real Viking imagery on a rotatable planet for orientation +
// real mission sites for context. NO routing here: numeric elevation and route
// computation exist only in the two detailed workspaces (Jezero 20 m, Gale 2 m).
// The globe is a VISUAL presentation: it does not imply planet-wide detail.
import { useEffect, useMemo, useRef, useState } from 'react';
import { greatCircleProfile } from '../lib/globalelev.js';
import * as THREE from 'three';
import { Canvas, useLoader, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';

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

export default function GlobalView({ onOpenRegion }) {
  const [catalog, setCatalog] = useState(null);
  const [selected, setSelected] = useState(null);
  const [bannerOpen, setBannerOpen] = useState(() => typeof window !== 'undefined' ? window.innerWidth > 560 : true);
  const [nom, setNom] = useState(null);
  const [demFrom, setDemFrom] = useState('');
  const [demTo, setDemTo] = useState('');
  const [demBusy, setDemBusy] = useState(false);
  const [demResult, setDemResult] = useState(null);
  const [demError, setDemError] = useState(null);
  const [view, setView] = useState({ dist: 3.0, dir: [0, 0.35, 0.94] });
  const [visibleKeys, setVisibleKeys] = useState({ sig: '', keys: new Set() });
  const bannerRef = useRef(null);
  const buttonsRef = useRef(null);
  const canvasWrapRef = useRef(null);
  const excludeRects = useRef([]);
  const globeRef = useRef();
  useEffect(() => {
    fetch('/data/mission_sites.json').then(r => r.json()).then(setCatalog).catch(() => setCatalog(null));
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
        {markers.filter(s => s.pos.x * view.dir[0] + s.pos.y * view.dir[1] + s.pos.z * view.dir[2] > 0.02).map(s => (
          <Html key={s.id} position={s.pos} zIndexRange={[900, 0]}
            style={{ pointerEvents: 'auto' }}>
            <button type="button" aria-label={s.name} onClick={() => setSelected(s)}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', transform: 'translate(-50%,-50%)' }}
              dangerouslySetInnerHTML={{ __html: shapeSvg(s.st.shape, s.st.color) }} />
          </Html>
        ))}
        <ZoomTracker setView={setView} />
        <LabelLayout features={candidates} view={view} setVisibleKeys={setVisibleKeys} excludeRects={excludeRects} />
        {labels.map(f => (
          <Html key={f.n + '|' + f.la} position={f.pos}
            zIndexRange={[100, 0]} style={{ pointerEvents: 'none' }} center>
            <div className="nom-label" title={`${f.n} (${f.t}, ${f.d} km) - IAU/USGS Gazetteer`}>{f.n}</div>
          </Html>
        ))}
        <OrbitControls enablePan={false} minDistance={1.7} maxDistance={6}
          autoRotate={!(typeof location !== 'undefined' && location.hash.includes('globelon'))} autoRotateSpeed={0.5} enableDamping dampingFactor={0.08} />
      </Canvas>

      <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 'calc(100% - 16px)' }}>
      <div ref={bannerRef} style={{ maxWidth: bannerOpen ? 300 : 170, overflowY: 'auto', flexShrink: 1, minHeight: 0 }}
        className="bg-[#0d1420]/95 border border-cyan-900 rounded p-2 text-[10px] text-gray-300">
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

      {selected && (
        <div style={{ position: 'absolute', top: 128, right: 8, zIndex: 1000, maxWidth: 300 }}
          className="bg-[#0d1420]/95 border border-gray-700 rounded p-2 text-[10px] text-gray-300">
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
        </div>
      )}

      <div style={{ maxWidth: 330, flexShrink: 0 }}
        className="bg-[#0d1420]/95 border border-gray-700 rounded p-2 text-[10px] text-gray-300">
        <b className="text-gray-200">Coarse global elevation - sampled at ~12.8 km/px (experimental).</b>
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
      </div>
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
