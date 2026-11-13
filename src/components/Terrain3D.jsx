import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import proj4 from 'proj4';
import { Canvas, useLoader } from '@react-three/fiber';
import { OrbitControls, Line } from '@react-three/drei';

// Same Mars equidistant-cylindrical CRS as the 2D map (MapView.jsx).
const EQC = '+proj=eqc +lat_ts=0 +lat_0=0 +lon_0=0 +x_0=0 +y_0=0 +a=3396190 +b=3396190 +units=m +no_defs';

// Display-only vertical exaggeration so the delta-front relief is legible.
// Labeled on screen; horizontal scale and DTM values are unmodified.
const VE = 2;

function markerColor(s, dropped, visited) {
  if (s.id === 'Depot') return '#ffffff';
  if (dropped) return '#884444';
  if (visited) return '#44cc66';
  if (s.id === 'Kodiak') return '#cc88ff';
  if (s.id === 'Skinner') return '#2dd4bf';
  return '#ffb02e';
}

function makeLabelSprite(text, color) {
  const font = 'bold 26px monospace';
  const pad = 10;
  const c = document.createElement('canvas');
  let ctx = c.getContext('2d');
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + pad * 2;
  const h = 40;
  c.width = w; c.height = h;
  ctx = c.getContext('2d');
  ctx.font = font;
  ctx.fillStyle = 'rgba(10,14,23,0.82)';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, w - 2, h - 2);
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, pad, h / 2 + 1);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  const scale = 0.55; // canvas px -> meters
  spr.scale.set(w * scale, h * scale, 1);
  return spr;
}

function Terrain({ hm }) {
  const texture = useLoader(THREE.TextureLoader, '/layers/ortho_3d.jpg');
  const geometry = useMemo(() => {
    const { nx, ny, dx, min } = hm;
    const pos = new Float32Array(nx * ny * 3);
    const uv = new Float32Array(nx * ny * 2);
    const W = (nx - 1) * dx, H = (ny - 1) * dx;
    let p = 0, q = 0;
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
        const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
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
    texture.anisotropy = 4;
  }, [texture]);

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial map={texture} roughness={1} metalness={0} />
    </mesh>
  );
}

// World position of an EQC-meter point on the terrain mesh.
function worldPos(hm, mx, my) {
  const { x0, y0, dx, nx, ny, min, values } = hm;
  const W = (nx - 1) * dx, H = (ny - 1) * dx;
  const i = Math.max(0, Math.min(nx - 1, Math.round((mx - x0) / dx)));
  const j = Math.max(0, Math.min(ny - 1, Math.round((y0 - my) / dx)));
  const v = values[j][i];
  return [i * dx - W / 2, (v - min) * VE, j * dx - H / 2];
}

function stationPos(hm, s) {
  const [mx, my] = proj4(EQC, [s.lon, s.lat]);
  return worldPos(hm, mx, my);
}

// Sample a straight leg on the terrain, nearest grid node - same convention
// as the app's existing DTM leg profiles (legs.json).
function legPoints(hm, a, b) {
  const [ax, ay] = proj4(EQC, [a.lon, a.lat]);
  const [bx, by] = proj4(EQC, [b.lon, b.lat]);
  const dist = Math.hypot(bx - ax, by - ay);
  const n = Math.max(2, Math.ceil(dist / 15));
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const p = worldPos(hm, ax + (bx - ax) * t, ay + (by - ay) * t);
    pts.push([p[0], p[1] + 3, p[2]]); // 3 m lift so the line does not z-fight the surface
  }
  return pts;
}

function Scene({ hm, stations, plan }) {
  const byId = Object.fromEntries(stations.map(s => [s.id, s]));
  const droppedIds = plan.dropped.map(d => d.id);
  const visitedIds = plan.visitedLegs.map(l => l.to);
  const legs = plan.visitedLegs.concat(plan.sim.legs);
  const lastVisited = visitedIds.length ? byId[visitedIds[visitedIds.length - 1]] : byId.Depot;

  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[-2500, 3500, -1500]} intensity={1.6} />
      <Terrain hm={hm} />
      {legs.map((leg, k) => (
        <Line key={'leg' + k} points={legPoints(hm, byId[leg.from], byId[leg.to])}
          color="#22d3ee" lineWidth={2} />
      ))}
      {droppedIds.map(id => (
        <Line key={'drop' + id} points={legPoints(hm, lastVisited, byId[id])}
          color="#cc3333" lineWidth={2} dashed dashSize={35} gapSize={22} />
      ))}
      {stations.map(s => {
        const dropped = droppedIds.includes(s.id);
        const visited = visitedIds.includes(s.id);
        const color = markerColor(s, dropped, visited);
        const [x, y, z] = stationPos(hm, s);
        const name = s.id === 'Depot' ? 'Base' : s.name;
        const label = name + (s.id === 'Kodiak' ? ' (candidate - not verified)' : '') + (dropped ? ' - LOST' : '');
        return (
          <group key={s.id} position={[x, y, z]}>
            <mesh position={[0, 45, 0]}>
              <cylinderGeometry args={[2.5, 2.5, 90, 6]} />
              <meshBasicMaterial color={color} transparent opacity={0.55} />
            </mesh>
            <mesh position={[0, 92, 0]}>
              <sphereGeometry args={[16, 16, 16]} />
              <meshBasicMaterial color={color} />
            </mesh>
            <primitive object={makeLabelSprite(label, color)} position={[0, 165, 0]} />
          </group>
        );
      })}
      <OrbitControls makeDefault target={[0, 60, 0]}
        maxPolarAngle={1.45} minDistance={250} maxDistance={12000}
        enableDamping dampingFactor={0.08} />
    </>
  );
}

export default function Terrain3D({ stations, plan }) {
  const [hm, setHm] = useState(null);
  useEffect(() => {
    fetch('/data/heightmap.json').then(r => r.json()).then(d => {
      let min = Infinity;
      for (const row of d.values) for (const v of row) if (v !== null && v < min) min = v;
      setHm({ ...d, min });
    });
  }, []);

  if (!hm) return <div className="h-full w-full flex items-center justify-center text-cyan-200 font-mono text-xs">Loading 3D terrain (USGS 20m DTM)...</div>;

  return (
    <div className="relative h-full w-full">
      <Canvas camera={{ position: [600, 2100, 3300], fov: 45, near: 10, far: 40000 }}
        style={{ background: '#0a0e17' }} dpr={[1, 1.5]}>
        <Scene hm={hm} stations={stations} plan={plan} />
      </Canvas>
      <div className="absolute bottom-1 left-1 z-[1000] pointer-events-none bg-[#0d1420cc] border border-cyan-900 rounded px-2 py-1 text-[9px] leading-tight text-gray-300 max-w-[260px]">
        3D Terrain: Visual representation of 20m DTM grid. Not a navigational surface.
        <br />Vertical exaggeration x{VE} (display only). Texture: CTX ortho (grayscale).
      </div>
    </div>
  );
}
