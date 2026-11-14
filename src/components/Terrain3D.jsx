import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import proj4 from 'proj4';
import { Canvas, useLoader, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Line } from '@react-three/drei';

// Screen-space labels are plain DOM in the MAIN React tree (overlay div
// below the Canvas's parent), positioned per frame from inside the scene
// through a ref registry. They intentionally do NOT use drei Html: its
// per-label secondary React root (createRoot on a canvas-sibling div,
// root.unmount() in a layout cleanup) double-tears-down under React 19 on
// repeated region swaps and crashed the whole app (NotFoundError
// removeChild on the second Gale mount of a region cycle).
function LabelDriver({ items }) {
  const { camera, size } = useThree();
  const invalidate = useThree(s => s.invalidate);
  const v = useMemo(() => new THREE.Vector3(), []);
  // Demand mode renders no frames on its own: after the terrain texture's
  // suspense resolves and whenever a label plate (re)attaches, we must ask
  // for a frame or the plates would never get positioned.
  useEffect(() => {
    items.current.invalidate = invalidate;
    invalidate();
  }, [items, invalidate]);
  useFrame(() => {
    for (const it of items.current.map.values()) {
      if (!it.el) continue;
      v.set(it.world[0], it.world[1], it.world[2]).project(camera);
      if (v.z > 1) { it.el.style.visibility = 'hidden'; continue; }
      it.el.style.visibility = 'visible';
      const sx = (v.x * 0.5 + 0.5) * size.width;
      const sy = (-v.y * 0.5 + 0.5) * size.height;
      it.el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) ${it.baseTransform}`;
    }
  });
  return null;
}

// Same Mars equidistant-cylindrical CRS as the 2D map (MapView.jsx).
const EQC = '+proj=eqc +lat_ts=0 +lat_0=0 +lon_0=0 +x_0=0 +y_0=0 +a=3396190 +b=3396190 +units=m +no_defs';

// Display-only vertical exaggeration so the delta-front relief is legible.
// Labeled on screen; horizontal scale and DTM values are unmodified.
const VE = 2;

// Label anchor offsets in world meters [x, y, z] relative to the marker.
// Markers stay at true coordinates; only the label plates are offset, with a
// connector line back to the marker (same idea as the 2D tooltip directions).
const LABEL_OFFSET = {
  Depot: [0, 150, 0],
  Wildcat: [-280, 190, 150],
  Skinner: [360, 380, -40],
  // Gale Yellowknife Bay cluster: all stops sit within ~150 m, so offsets
  // stay small but staggered in height/azimuth to keep plates apart.
  GaleBase: [-60, 15, 80],
  Rocknest: [-170, 130, 30],
  JohnKleinCumberland: [110, 190, -20],
  Shaler: [-150, 130, -110],
  Departure: [140, 380, 90],
};
// Mobile (lk > 1): wider world offsets so the screen-space labels of the two
// ridges (~20 m apart in reality) do not collide; desktop offsets unchanged.
const LABEL_OFFSET_MOBILE = {
  Depot: [-180, 200, 0],
  Wildcat: [-450, 430, 240],
  Skinner: [450, 560, -240],
  GaleBase: [0, 60, 0],
  Rocknest: [-160, 170, 40],
  JohnKleinCumberland: [160, 260, -30],
  Shaler: [-130, 350, -90],
  Departure: [130, 440, 90],
};

function markerColor(s, dropped, visited) {
  if (s.id === 'Depot' || s.id === 'GaleBase') return '#ffffff';
  if (dropped) return '#cc3333';
  if (visited) return '#44cc66';
  if (s.id === 'Skinner') return '#2dd4bf';
  return '#ffb02e';
}

function Terrain({ hm, region }) {
  const texture = useLoader(THREE.TextureLoader, region === 'gale' ? '/layers/gale/ortho_3d.jpg' : '/layers/ortho_3d.jpg');
  const geometry = useMemo(() => {
    const { nx, ny, dx, min } = hm;
    const pos = new Float32Array(nx * ny * 3);
    const uv = new Float32Array(nx * ny * 2);
    const col = new Float32Array(nx * ny * 3);
    const W = (nx - 1) * dx, H = (ny - 1) * dx;
    let p = 0, q = 0, c = 0;
    // Hillshade computed from the SAME DTM grid (vertical exaggeration
    // applied, matching the mesh) and baked into vertex colors that darken
    // the existing ortho texture. Display-only relief readability: no new
    // terrain detail is added, values are a shading of data already shown.
    const sunAlt = 42 * Math.PI / 180, sunAz = 315 * Math.PI / 180; // NW sun, display convention
    const shadeAt = (j, i) => {
      const iL = Math.max(0, i - 1), iR = Math.min(nx - 1, i + 1);
      const jU = Math.max(0, j - 1), jD = Math.min(ny - 1, j + 1);
      const val = (jj, ii) => { const v = hm.values[jj][ii]; return v == null ? min : v; };
      const dzdx = ((val(j, iR) - val(j, iL)) * VE) / ((iR - iL) * dx);
      const dzdy = ((val(jD, j) - val(jU, j)) * VE) / ((jD - jU) * dx);
      const slope = Math.atan(Math.hypot(dzdx, dzdy));
      const aspect = Math.atan2(dzdx, -dzdy);
      const hs = Math.cos(sunAlt) * Math.cos(slope) + Math.sin(sunAlt) * Math.sin(slope) * Math.cos(sunAz - aspect);
      // map illumination [0..1] to a darkening-only factor so the texture is
      // never brightened beyond its recorded brightness
      return 0.55 + 0.45 * Math.max(0, hs);
    };
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const v = hm.values[j][i];
        pos[p++] = i * dx - W / 2;
        pos[p++] = ((v == null ? min : v) - min) * VE;
        pos[p++] = j * dx - H / 2;
        uv[q++] = i / (nx - 1);
        uv[q++] = 1 - j / (ny - 1);
        const s = shadeAt(j, i);
        col[c++] = s; col[c++] = s; col[c++] = s;
      }
    }
    const idx = [];
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }, [hm]);

  useMemo(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
  }, [texture]);

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial map={texture} vertexColors roughness={1} metalness={0} />
    </mesh>
  );
}

// Terrain height (world Y) at an EQC-meter point, interpolated on the exact
// rendered triangle surface (same (a,c,b)/(b,c,d) split as the mesh below),
// so draped lines lie on the mesh, not on a differing bilinear surface.
function terrainY(hm, mx, my) {
  const { x0, y0, dx, nx, ny, min, values } = hm;
  const fx = Math.max(0, Math.min(nx - 1.001, (mx - x0) / dx));
  const fy = Math.max(0, Math.min(ny - 1.001, (y0 - my) / dx));
  const i = Math.floor(fx), j = Math.floor(fy);
  const tx = fx - i, ty = fy - j;
  const v00 = values[j][i], v10 = values[j][i + 1];
  const v01 = values[j + 1][i], v11 = values[j + 1][i + 1];
  const v = (tx + ty <= 1)
    ? v00 + (v10 - v00) * tx + (v01 - v00) * ty
    : v11 + (v01 - v11) * (1 - tx) + (v10 - v11) * (1 - ty);
  return (v - min) * VE;
}

function worldXY(hm, mx, my) {
  const W = (hm.nx - 1) * hm.dx, H = (hm.ny - 1) * hm.dx;
  return [(mx - hm.x0) - W / 2, (hm.y0 - my) - H / 2];
}

function stationPos(hm, s) {
  const [mx, my] = proj4(EQC, [s.lon, s.lat]);
  const [x, z] = worldXY(hm, mx, my);
  return [x, terrainY(hm, mx, my), z];
}

// Drape a straight leg on the terrain: sample every 10 m on the exact mesh
// surface, lifted just 1.5 m so the line hugs the ground without z-fighting.
function legPoints(hm, a, b) {
  const [ax, ay] = proj4(EQC, [a.lon, a.lat]);
  const [bx, by] = proj4(EQC, [b.lon, b.lat]);
  const dist = Math.hypot(bx - ax, by - ay);
  const n = Math.max(2, Math.ceil(dist / 10));
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const mx = ax + (bx - ax) * t, my = ay + (by - ay) * t;
    const [x, z] = worldXY(hm, mx, my);
    pts.push([x, terrainY(hm, mx, my) + 1.5, z]);
  }
  return pts;
}

// Drape an arbitrary lat/lon path (two-point route geometry: recorded-drive
// polylines, least-cost path, or a straight pair) on the terrain. Each segment
// is resampled every ~10 m in projected meters and every sample takes its
// height from the DTM (same convention as legPoints) so the line hugs the
// relief instead of cutting through it - horizontal positions unchanged.
export function pathPoints(hm, latlons) {
  // A zero-length path (identical endpoints -> 1-cell A* path, or a 1-point
  // recorded part) yields < 2 points; callers skip the line in that case.
  // Zero-length semantics are preserved: no geometry is invented.
  const pts = [];
  for (let i = 0; i < latlons.length - 1; i++) {
    const [ax, ay] = proj4(EQC, [latlons[i][1], latlons[i][0]]);
    const [bx, by] = proj4(EQC, [latlons[i + 1][1], latlons[i + 1][0]]);
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 10));
    for (let k = (i === 0 ? 0 : 1); k <= n; k++) {
      const mx = ax + (bx - ax) * (k / n), my = ay + (by - ay) * (k / n);
      const [x, z] = worldXY(hm, mx, my);
      pts.push([x, terrainY(hm, mx, my) + 1.5, z]);
    }
  }
  return pts;
}

// Label-plate spec for the main-tree overlay (replaces drei Html). The world
// anchor matches the old Html position: station position + the offset that
// the in-scene connector line still points at.
function stationLabelSpec(hm, s, dropped, visited, lk, mode) {
  const color = markerColor(s, dropped, visited);
  const [x, y, z] = stationPos(hm, s);
  // Short map labels only; caveats/disclaimers live in the left panel card.
  // Route mode always shows the real place name - there is no assumed base.
  const name = (mode !== 'route' && (s.id === 'Depot' || s.id === 'GaleBase')) ? 'Base' : (s.short || s.name);
  const label = name + (dropped ? ' - LOST' : '');
  const base = (lk > 1 && LABEL_OFFSET_MOBILE[s.id]) || LABEL_OFFSET[s.id] || [0, 150, 0];
  const off = base.map(v => v * lk);
  return { id: 'st-' + s.id, world: [x + off[0], y + off[1], z + off[2]], color, label,
    baseTransform: 'translate(-50%, calc(-100% - 10px))' };
}

function StationMarker({ hm, s, dropped, visited, lk, ms = 1, mode = 'planner' }) {
  const color = markerColor(s, dropped, visited);
  const [x, y, z] = stationPos(hm, s);
  const base = (lk > 1 && LABEL_OFFSET_MOBILE[s.id]) || LABEL_OFFSET[s.id] || [0, 150, 0];
  const off = base.map(v => v * lk);
  return (
    <group position={[x, y, z]}>
      {/* thin neutral stem so it never reads as part of the cyan route */}
      <mesh position={[0, 45 * ms, 0]}>
        <cylinderGeometry args={[1.5 * ms, 1.5 * ms, 90 * ms, 6]} />
        <meshBasicMaterial color="#94a3b8" transparent opacity={0.45} />
      </mesh>
      <mesh position={[0, 95 * ms, 0]}>
        <sphereGeometry args={[20 * ms, 16, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <Line points={[[0, 100 * ms, 0], off]} color={color} lineWidth={1.5} transparent opacity={0.9} />
      {/* The label plate itself lives in the main-tree overlay (see
          Terrain3D below); this scene keeps only the connector line. */}
    </group>
  );
}

// Wildcat and Skinner are 20.96 m apart (about one 20 m DTM cell), so their markers nearly touch at
// these scales; a small note keeps that from reading as a rendering error.
// Positions stay true. Rendered through the main-tree overlay like the
// station labels (drei Html removed - see LabelDriver).
function sepNoteSpec(hm, a, b, lk) {
  const pa = stationPos(hm, a), pb = stationPos(hm, b);
  const mid = [(pa[0] + pb[0]) / 2, Math.max(pa[1], pb[1]) + 95, (pa[2] + pb[2]) / 2];
  return { id: 'sepnote', world: mid, sep: true,
    baseTransform: lk > 1 ? 'translate(calc(-50% + 35px), -50%)' : 'translate(-50%, -50%)' };
}

function Scene({ hm, stations, plan, focus, lk, region, minDist = 150, mode = 'planner', abPath = null, abParts = null, abCompare = null, legsProvider = null }) {
  const byId = Object.fromEntries(stations.map(s => [s.id, s]));
  const droppedIds = mode === 'route' ? [] : plan.dropped.map(d => d.id);
  const visitedIds = mode === 'route' ? [] : plan.visitedLegs.map(l => l.to);
  const legs = mode === 'route' ? [] : plan.visitedLegs.concat(plan.sim.legs);
  // Marker size scales with route spread so fixed-size spheres don't
  // swallow a compact cluster (Gale ~150 m across vs Jezero ~700 m).
  let spread = 0;
  const pos = {};
  for (const s of stations) if (s.lat != null) pos[s.id] = stationPos(hm, s);
  const ids = Object.keys(pos);
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = pos[ids[i]], c = pos[ids[j]];
    spread = Math.max(spread, Math.hypot(a[0] - c[0], a[2] - c[2]));
  }
  const ms = Math.min(1, Math.max(0.15, spread / 700));
  const baseId = (plan.sim.legs[0] && plan.sim.legs[0].from) || 'Depot';
  const lastVisited = visitedIds.length ? byId[visitedIds[visitedIds.length - 1]] : byId[baseId];

  return (
    <>
      <ambientLight intensity={0.6} />
      <hemisphereLight args={['#2a3850', '#0c0f14', 0.5]} />
      <directionalLight position={[-3200, 2100, -900]} intensity={1.35} />
      <Terrain hm={hm} region={region} />
      {legs.map((leg, k) => {
        // Same geometry as the 2D map: when the least-cost model routed this
        // leg, drape its actual A* polyline; otherwise the straight segment.
        const meta = legsProvider && legsProvider.legsMeta ? legsProvider.legsMeta[leg.from + '|' + leg.to] : null;
        const pts = meta && meta.pathLatLon
          ? pathPoints(hm, meta.pathLatLon)
          : legPoints(hm, byId[leg.from], byId[leg.to]);
        // drei Line2 needs >= 2 points: a zero-length leg (identical
        // endpoints, e.g. GaleBase/Rocknest share coordinates) draws nothing.
        if (pts.length < 2) return null;
        return (
          <Line key={'leg' + k} points={pts}
            color="#22d3ee" lineWidth={3.5}
            dashed={leg.to === baseId && k > 0} dashSize={18} gapSize={12} />
        );
      })}
      {mode === 'route' && abParts
        // Recorded-traverse mode: keep the 2D map's synthetic-vs-recorded
        // distinction - recorded runs solid green, synthetic connectors dashed,
        // each draped on the DTM at ~10 m sampling.
        ? abParts.map((part, i) => {
            // A 1-point part (single recorded cell) drapes to < 2 points:
            // skip it rather than crashing Line2 or inventing geometry.
            const pts = pathPoints(hm, part.latlons);
            if (pts.length < 2) return null;
            return (
              <Line key={'ab3p' + i} points={pts} color="#a3e635"
                lineWidth={3.5} dashed={part.synthetic} dashSize={10} gapSize={7} />
            );
          })
        : mode === 'route' && abCompare && (abCompare.straight || abCompare.leastCost)
          // Route comparison: the same two geometries the 2D map and the
          // comparison table show - baseline dashed gray, least-cost solid.
          ? (<>
              {abCompare.straight && abCompare.straight.length > 1 && pathPoints(hm, abCompare.straight).length >= 2 && (
                <Line points={pathPoints(hm, abCompare.straight)} color="#9ca3af" lineWidth={2.5} dashed dashSize={14} gapSize={10} />
              )}
              {abCompare.leastCost && abCompare.leastCost.length > 1 && pathPoints(hm, abCompare.leastCost).length >= 2 && (
                <Line points={pathPoints(hm, abCompare.leastCost)} color="#a3e635" lineWidth={3.5} />
              )}
            </>)
          : mode === 'route' && abPath && abPath.length > 1 && pathPoints(hm, abPath).length >= 2 && (
              <Line points={pathPoints(hm, abPath)} color="#22d3ee" lineWidth={3.5} />
            )}
      {droppedIds.map(id => (
        <Line key={'drop' + id} points={legPoints(hm, lastVisited, byId[id])}
          color="#cc3333" lineWidth={3} dashed dashSize={35} gapSize={22} />
      ))}
      {stations.filter(s => s.lat != null).map(s => {
        const dropped = droppedIds.includes(s.id);
        const visited = visitedIds.includes(s.id);
        return <StationMarker key={s.id} hm={hm} s={s} dropped={dropped} visited={visited} lk={lk} ms={ms} mode={mode} />;
      })}
      <OrbitControls makeDefault target={focus}
        maxPolarAngle={1.45} minDistance={minDist} maxDistance={12000}
        enableDamping dampingFactor={0.08} />
    </>
  );
}

function ResetCamera({ resetKey, camPos, focus }) {
  const { camera, controls, invalidate } = useThree();
  useEffect(() => {
    if (!resetKey || !controls) return;
    camera.position.set(...camPos);
    controls.target.set(...focus);
    controls.update();
    invalidate();
  }, [resetKey, camPos, focus, camera, controls, invalidate]);
  return null;
}

export default function Terrain3D({ stations, plan, region = 'jezero', baseId = 'Depot', mode = 'planner', abPath = null, abParts = null, abCompare = null, legsProvider = null, resetKey = 0 }) {
  const [hm, setHm] = useState(null);
  useEffect(() => {
    setHm(null);
    fetch(region === 'gale' ? '/data/heightmap_gale.json' : '/data/heightmap.json').then(r => r.json()).then(d => {
      let min = Infinity;
      for (const row of d.values) for (const v of row) if (v !== null && v < min) min = v;
      setHm({ ...d, min });
    });
  }, [region]);

  // Default framing centers on the route stops (Wildcat, Skinner) so
  // the traverse fills the view, not the middle of the whole crop.
  const { camPos, focus, k, minDist } = useMemo(() => {
    if (!hm) return { camPos: [600, 2100, 3300], focus: [0, 60, 0], k: 1, minDist: 150 };
    // Frame all stops so Base on the floor and the ridge stops
    // are both visible; oblique ~35 deg elevation keeps the relief readable
    // instead of flattening to a top-down map.
    const routable = stations.filter(s => s.lat != null);
    let cx = 0, cy = 0, cz = 0;
    for (const s of routable) {
      const p = stationPos(hm, s);
      cx += p[0]; cy += p[1]; cz += p[2];
    }
    cx /= routable.length; cy /= routable.length; cz /= routable.length;
    // narrow (portrait/mobile) screens see a thinner horizontal slice - pull back,
    // and scale label anchors by the same factor so screen separation is preserved
    let spread = 0;
    for (let i = 0; i < routable.length; i++) for (let j = i + 1; j < routable.length; j++) {
      const a = stationPos(hm, routable[i]), c = stationPos(hm, routable[j]);
      spread = Math.max(spread, Math.hypot(a[0] - c[0], a[2] - c[2]));
    }
    // Camera distance scales with the route spread so a compact cluster
    // (Gale, ~150 m across) fills the view like the Jezero traverse does.
    const camK = Math.min(1, Math.max(0.12, (spread * 2.4) / 1977));
    const k = ((typeof window !== 'undefined' && window.innerWidth < window.innerHeight) ? 1.55 : 1) * Math.max(0.15, camK);
    return { camPos: [cx + 1700 * k, cy + 1000 * k, cz + 600 * k], focus: [cx, cy + 20 * camK, cz], k, minDist: Math.max(40, 150 * camK) };
  }, [hm, stations]);

  const labelItems = useRef({ map: new Map(), invalidate: null });

  // Label plates: same content/positions the drei Html labels had, but as
  // ordinary DOM owned by this component (no portal roots to tear down).
  const labelSpecs = useMemo(() => {
    if (!hm) return [];
    const byId = Object.fromEntries(stations.map(s => [s.id, s]));
    const droppedIds = mode === 'route' ? [] : plan.dropped.map(d => d.id);
    const visitedIds = mode === 'route' ? [] : plan.visitedLegs.map(l => l.to);
    const specs = stations.filter(s => s.lat != null).map(s =>
      stationLabelSpec(hm, s, droppedIds.includes(s.id), visitedIds.includes(s.id), k, mode));
    if (mode !== 'route' && byId.Wildcat && byId.Skinner) specs.push(sepNoteSpec(hm, byId.Wildcat, byId.Skinner, k));
    return specs;
  }, [hm, stations, plan, k, mode]);

  if (!hm) return <div className="h-full w-full flex items-center justify-center text-cyan-200 font-mono text-xs">{region === 'gale' ? 'Loading 3D terrain (USGS Gale DEM 1 m, decimated to 2 m)...' : 'Loading 3D terrain (USGS 20m DTM)...'}</div>;

  return (
    <div className="relative h-full w-full">
      {/* frameloop demand: render only when something invalidates (orbit,
          controls change, prop/data updates, mount). The default 'always'
          loop re-rasterized the full terrain grid (870k triangles on Gale)
          every frame; on software-GL machines each frame occupied the
          browser's frame pipeline for ~0.7-2 s, so real pointer moves and
          orbit drags stalled behind it. Measured: synthetic pointermove
          handlers cost ~0-1 ms (no raycast load); the render loop was the
          stall. OrbitControls (makeDefault) invalidates on every change,
          so orbiting still renders; label plates track via LabelDriver on
          rendered frames. */}
      <Canvas frameloop="demand" camera={{ position: camPos, fov: 45, near: 10, far: 40000 }}
        style={{ background: '#0a0e17' }} dpr={[1, 1.5]}>
        <ResetCamera resetKey={resetKey} camPos={camPos} focus={focus} />
        <Scene hm={hm} stations={stations} plan={plan} focus={focus} lk={k} region={region} minDist={minDist} mode={mode} abPath={abPath} abParts={abParts} abCompare={abCompare} legsProvider={legsProvider} />
        <LabelDriver items={labelItems} />
      </Canvas>
      <div className="absolute inset-0 z-[40] pointer-events-none overflow-hidden" aria-hidden="true">
        {labelSpecs.map(spec => (
          <div key={spec.id}
            ref={el => { if (el) { labelItems.current.map.set(spec.id, { el, world: spec.world, baseTransform: spec.baseTransform }); labelItems.current.invalidate && labelItems.current.invalidate(); } else labelItems.current.map.delete(spec.id); }}
            style={{ position: 'absolute', top: 0, left: 0, transform: 'translate(-10000px, -10000px)', visibility: 'hidden' }}>
            {spec.sep
              ? <div className="terrain3d-sep">~21 m apart (~1 DTM cell)</div>
              : <div className="terrain3d-label"><span className="terrain3d-dot" style={{ background: spec.color }} />{spec.label}</div>}
          </div>
        ))}
      </div>
      <div className="absolute bottom-2 left-2 z-[1000] pointer-events-none bg-[#070d18]/90 border border-cyan-500/25 rounded-lg px-2.5 py-1.5 text-xs leading-normal text-slate-300 max-w-[280px] shadow-lg backdrop-blur-md">
        {region === 'gale'
          ? '3D Terrain: Visual representation of the 2 m grid decimated from the USGS MSL Gale DEM Mosaic 1 m v3. Not a navigational surface.'
          : '3D Terrain: Visual representation of 20 m DTM grid. Not a navigational surface.'}
        <br />Vertical exaggeration x{VE} (display only). Texture: {region === 'gale' ? 'HiRISE LRGB ortho (grayscale).' : 'CTX ortho (grayscale).'}
      </div>
    </div>
  );
}
