import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import proj4 from 'proj4';
import { Canvas, useLoader, useThree } from '@react-three/fiber';
import { OrbitControls, Line, Html } from '@react-three/drei';

// Same Mars equidistant-cylindrical CRS as the 2D map (MapView.jsx).
const EQC =
  '+proj=eqc +lat_ts=0 +lat_0=0 +lon_0=0 +x_0=0 +y_0=0 +a=3396190 +b=3396190 +units=m +no_defs';

// Display-only vertical exaggeration so the delta-front relief is legible.
// Labeled on screen; horizontal scale and DTM values are unmodified.
const VE = 2;

// Label anchor offsets in world meters [x, y, z] relative to the marker.
// Markers stay at true coordinates; only the label plates are offset, with a
// connector line back to the marker (same idea as the 2D tooltip directions).
const LABEL_OFFSET = {
  Depot: [0, 150, 0],
  Wildcat: [-280, 190, 150],
  Skinner: [280, 300, -150],
};
// Narrow (portrait) containers: wider world offsets so the screen-space labels
// of the two ridges (~20 m apart in reality) do not collide.
const LABEL_OFFSET_MOBILE = {
  Depot: [-180, 200, 0],
  Wildcat: [-450, 430, 240],
  Skinner: [450, 560, -240],
};

function markerColor(s, dropped, visited) {
  if (s.id === 'Depot') return '#ffffff';
  if (dropped) return '#f87171';
  if (visited) return '#34d399';
  if (s.id === 'Skinner') return '#2dd4bf';
  return '#ffb02e';
}

function Terrain({ hm }) {
  const texture = useLoader(THREE.TextureLoader, '/layers/ortho_3d.jpg');
  const geometry = useMemo(() => {
    const { nx, ny, dx, min } = hm;
    const pos = new Float32Array(nx * ny * 3);
    const uv = new Float32Array(nx * ny * 2);
    const W = (nx - 1) * dx,
      H = (ny - 1) * dx;
    let p = 0,
      q = 0;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const v = hm.values[j][i];
        pos[p++] = i * dx - W / 2;
        pos[p++] = (v - min) * VE;
        pos[p++] = j * dx - H / 2;
        uv[q++] = i / (nx - 1);
        uv[q++] = 1 - j / (ny - 1);
      }
    }
    const idx = [];
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i,
          b = a + 1,
          c = a + nx,
          d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }, [hm]);

  useMemo(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    texture.needsUpdate = true;
  }, [texture]);

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        map={texture}
        roughness={0.78}
        metalness={0}
      />
    </mesh>
  );
}

// Terrain height (world Y) at an EQC-meter point, interpolated on the exact
// rendered triangle surface (same (a,c,b)/(b,c,d) split as the mesh above),
// so draped lines lie on the mesh, not on a differing bilinear surface.
function terrainY(hm, mx, my) {
  const { x0, y0, dx, nx, ny, min, values } = hm;
  const fx = Math.max(0, Math.min(nx - 1.001, (mx - x0) / dx));
  const fy = Math.max(0, Math.min(ny - 1.001, (y0 - my) / dx));
  const i = Math.floor(fx),
    j = Math.floor(fy);
  const tx = fx - i,
    ty = fy - j;
  const v00 = values[j][i],
    v10 = values[j][i + 1];
  const v01 = values[j + 1][i],
    v11 = values[j + 1][i + 1];
  const v =
    tx + ty <= 1
      ? v00 + (v10 - v00) * tx + (v01 - v00) * ty
      : v11 + (v01 - v11) * (1 - tx) + (v10 - v11) * (1 - ty);
  return (v - min) * VE;
}

function worldXY(hm, mx, my) {
  const W = (hm.nx - 1) * hm.dx,
    H = (hm.ny - 1) * hm.dx;
  return [mx - hm.x0 - W / 2, hm.y0 - my - H / 2];
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
    const mx = ax + (bx - ax) * t,
      my = ay + (by - ay) * t;
    const [x, z] = worldXY(hm, mx, my);
    pts.push([x, terrainY(hm, mx, my) + 1.5, z]);
  }
  return pts;
}

function StationMarker({ hm, s, dropped, visited, lk }) {
  const color = markerColor(s, dropped, visited);
  const [x, y, z] = stationPos(hm, s);
  const name = s.id === 'Depot' ? 'Base' : s.name;
  const label = name + (dropped ? ' · deferred' : '');
  const base = (lk > 1 && LABEL_OFFSET_MOBILE[s.id]) || LABEL_OFFSET[s.id] || [0, 150, 0];
  const off = base.map((v) => v * lk);
  return (
    <group position={[x, y, z]}>
      {/* ground ring ties the marker to the surface, matching the 2D symbol */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 4, 0]}>
        <ringGeometry args={[s.id === 'Depot' ? 30 : 22, s.id === 'Depot' ? 38 : 29, 40]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.6}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {/* thin neutral stem so it never reads as part of the cyan route */}
      <mesh position={[0, 45, 0]}>
        <cylinderGeometry args={[1.5, 1.5, 90, 6]} />
        <meshBasicMaterial color="#94a3b8" transparent opacity={0.45} />
      </mesh>
      <mesh position={[0, 95, 0]}>
        <sphereGeometry args={[20, 16, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <Line points={[[0, 100, 0], off]} color={color} lineWidth={1} transparent opacity={0.7} />
      <Html
        position={off}
        zIndexRange={[40, 0]}
        style={{
          pointerEvents: 'none',
          transform: 'translate(-50%, calc(-100% - 10px))',
        }}
      >
        <div className="terrain3d-label">
          <span className="terrain3d-dot" style={{ background: color }} />
          {label}
        </div>
      </Html>
    </group>
  );
}

// Wildcat and Skinner are ~20.96 m apart (about one 20 m DTM cell), so their
// markers nearly touch at these scales; a small note keeps that from reading
// as a rendering error. Positions stay true.
function SepNote({ hm, a, b }) {
  const pa = stationPos(hm, a),
    pb = stationPos(hm, b);
  const mid = [(pa[0] + pb[0]) / 2, Math.max(pa[1], pb[1]) + 160, (pa[2] + pb[2]) / 2];
  return (
    <Html
      position={mid}
      zIndexRange={[30, 0]}
      style={{ pointerEvents: 'none', transform: 'translate(-50%, -50%)' }}
    >
      <div className="terrain3d-sep">~21 m apart (~1 DTM cell)</div>
    </Html>
  );
}

function RouteLeg({ hm, a, b, color, dashed, dashedSize = 18, gapSize = 12 }) {
  const points = useMemo(() => legPoints(hm, a, b), [hm, a, b]);
  return (
    <>
      <Line points={points} color={color} lineWidth={7} transparent opacity={0.16} />
      <Line
        points={points}
        color={color}
        lineWidth={2.5}
        dashed={dashed}
        dashSize={dashedSize}
        gapSize={gapSize}
      />
    </>
  );
}

function CameraReset({ camPos, focus, resetToken }) {
  const { camera, controls } = useThree();
  useEffect(() => {
    camera.position.set(camPos[0], camPos[1], camPos[2]);
    if (controls && controls.target) {
      controls.target.set(focus[0], focus[1], focus[2]);
      controls.update();
    }
    camera.updateProjectionMatrix();
    // Recenter on load, when the container reflows, or on an explicit reset.
  }, [resetToken, camPos[0], camPos[1], camPos[2], focus[0], focus[1], focus[2], camera, controls]);
  return null;
}

function Scene({ hm, stations, plan, focus, camPos, lk, resetToken }) {
  const byId = Object.fromEntries(stations.map((s) => [s.id, s]));
  const droppedIds = plan.dropped.map((d) => d.id);
  const visitedIds = plan.visitedLegs.map((l) => l.to);
  const lastVisited = visitedIds.length ? byId[visitedIds[visitedIds.length - 1]] : byId.Depot;

  return (
    <>
      <CameraReset camPos={camPos} focus={focus} resetToken={resetToken} />
      <ambientLight intensity={0.34} />
      <hemisphereLight args={['#cbe7ff', '#3a1c0e', 0.3]} />
      <directionalLight position={[-3200, 2100, -900]} intensity={1.85} color="#fff4e6" />
      <directionalLight position={[2900, 1500, 2400]} intensity={0.55} color="#cfe4ff" />
      <Terrain hm={hm} />

      {plan.visitedLegs.map((leg, k) => (
        <RouteLeg
          key={`done-${k}`}
          hm={hm}
          a={byId[leg.from]}
          b={byId[leg.to]}
          color="#34d399"
        />
      ))}
      {plan.sim.legs.map((leg, k) => (
        <RouteLeg
          key={`plan-${k}`}
          hm={hm}
          a={byId[leg.from]}
          b={byId[leg.to]}
          color={leg.to === 'Depot' ? '#94a3b8' : '#22d3ee'}
          dashed={leg.to === 'Depot'}
        />
      ))}
      {droppedIds.map((id) => (
        <RouteLeg
          key={`drop-${id}`}
          hm={hm}
          a={lastVisited}
          b={byId[id]}
          color="#f87171"
          dashed
          dashedSize={35}
          gapSize={22}
        />
      ))}

      {stations
        .filter((s) => s.lat != null)
        .map((s) => {
          const dropped = droppedIds.includes(s.id);
          const visited = visitedIds.includes(s.id);
          return (
            <StationMarker
              key={s.id}
              hm={hm}
              s={s}
              dropped={dropped}
              visited={visited}
              lk={lk}
            />
          );
        })}

      <SepNote hm={hm} a={byId.Wildcat} b={byId.Skinner} />

      <OrbitControls
        makeDefault
        target={focus}
        maxPolarAngle={1.45}
        minDistance={150}
        maxDistance={12000}
        enableDamping
        dampingFactor={0.08}
      />
    </>
  );
}

function useContainerPortrait(ref) {
  const [portrait, setPortrait] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setPortrait(height > width * 1.05);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return portrait;
}

export default function Terrain3D({ stations, plan, resetKey = 0, active = true }) {
  const [hm, setHm] = useState(null);
  const shellRef = useRef(null);
  const portrait = useContainerPortrait(shellRef);

  useEffect(() => {
    fetch('/data/heightmap.json')
      .then((r) => r.json())
      .then((d) => {
        let min = Infinity;
        for (const row of d.values) for (const v of row) if (v !== null && v < min) min = v;
        setHm({ ...d, min });
      });
  }, []);

  // Default framing centers on the route stops (Wildcat, Skinner) so the
  // traverse fills the view, not the middle of the whole crop.
  const { camPos, focus, k } = useMemo(() => {
    if (!hm) return { camPos: [600, 2100, 3300], focus: [0, 60, 0], k: 1 };
    // Frame all stops so Base on the floor and the ridge stops are both
    // visible; oblique ~35 deg elevation keeps the relief readable.
    const routable = stations.filter((s) => s.lat != null);
    let cx = 0,
      cy = 0,
      cz = 0;
    for (const s of routable) {
      const p = stationPos(hm, s);
      cx += p[0];
      cy += p[1];
      cz += p[2];
    }
    cx /= routable.length;
    cy /= routable.length;
    cz /= routable.length;
    // Narrow containers see a thinner horizontal slice — pull back, and scale
    // label anchors by the same factor so screen separation is preserved.
    const kk = portrait ? 1.55 : 1;
    return {
      camPos: [cx + 1850 * kk, cy + 1200 * kk, cz + 700 * kk],
      focus: [cx, cy + 30, cz],
      k: kk,
    };
  }, [hm, stations, portrait]);

  const resetToken = resetKey;

  return (
    <div className="terrain-shell" ref={shellRef}>
      {!hm ? (
        <div className="terrain-loading" role="status">
          Loading 3D terrain (USGS 20 m DTM)…
        </div>
      ) : (
        <Canvas
          camera={{ position: camPos, fov: 45, near: 10, far: 40000 }}
          style={{ background: 'transparent' }}
          dpr={[1, 1.5]}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
          frameloop={active ? 'always' : 'never'}
        >
          <Scene
            hm={hm}
            stations={stations}
            plan={plan}
            focus={focus}
            camPos={camPos}
            lk={k}
            resetToken={resetToken}
          />
        </Canvas>
      )}

      <div className="terrain-hud">
        <b>3D terrain · 20 m DTM</b>
        <span className="terrain-hud-note">
          Vertical exaggeration ×{VE} (display only). Not a navigational surface. Texture: CTX
          ortho (grayscale).
        </span>
      </div>

      <div className="terrain-legend" aria-label="3D route legend">
        <span className="legend-completed">
          <i className="legend-line" aria-hidden="true" />
          Completed
        </span>
        <span className="legend-planned">
          <i className="legend-line" aria-hidden="true" />
          Planned
        </span>
        <span className="legend-return">
          <i className="legend-dash" aria-hidden="true" />
          Return
        </span>
        <span className="legend-deferred">
          <i className="legend-dash" aria-hidden="true" />
          Deferred
        </span>
        <span className="legend-base">
          <i className="legend-dot" aria-hidden="true" />
          Base
        </span>
      </div>

      <div className="terrain-hint">Drag to orbit · scroll to zoom</div>
    </div>
  );
}
