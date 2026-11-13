import {
  MapContainer,
  ImageOverlay,
  GeoJSON,
  Polyline,
  Tooltip,
  Marker,
  ZoomControl,
  ScaleControl,
  useMap,
} from 'react-leaflet';
import { useEffect } from 'react';
import L from 'leaflet';
import 'proj4leaflet';

// Same Mars equidistant-cylindrical CRS and crop bounds as the original map.
const crs = new L.Proj.CRS(
  'MARS:EQC',
  '+proj=eqc +lat_ts=0 +lat_0=0 +lon_0=0 +x_0=0 +y_0=0 +a=3396190 +b=3396190 +units=m +no_defs',
  { origin: [4573663.251, 1109693.14], resolutions: [128, 64, 32, 16, 8, 4, 2] }
);
const BOUNDS = [
  [18.43, 77.375],
  [18.485, 77.44],
];

const CASING = { color: '#04070d', weight: 6.5, opacity: 0.6 };

function statusOf(id, dropped, visited, next) {
  if (id === 'Depot') return 'base';
  if (dropped) return 'deferred';
  if (visited) return 'completed';
  if (next) return 'next';
  return 'planned';
}

function stationIcon(s, status) {
  const badge =
    s.id === 'Depot'
      ? ''
      : `<span class="station-marker__badge">${s.id === 'Wildcat' ? 'W' : 'S'}</span>`;
  const skinner = s.id === 'Skinner' ? ' station-marker--skinner' : '';
  return L.divIcon({
    className: 'station-marker-host',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    html: `<div class="station-marker station-marker--${status}${skinner}">
      <span class="station-marker__ring"></span>
      <span class="station-marker__core"></span>
      ${badge}
    </div>`,
  });
}

function ViewController({ stations, resetKey }) {
  const map = useMap();
  useEffect(() => {
    const routable = stations.filter((s) => s.lat != null);
    const b = L.latLngBounds(routable.map((s) => [s.lat, s.lon]));
    map.fitBounds(b.pad(0.32), { animate: false, maxZoom: 5 });
  }, [map, stations, resetKey]);
  return null;
}

export default function MapView({ stations, plan, showGeology, geojson, resetKey }) {
  const byId = Object.fromEntries(stations.map((s) => [s.id, s]));
  const droppedIds = plan.dropped.map((d) => d.id);
  const visitedIds = plan.visitedLegs.map((l) => l.to);
  const lastVisited = visitedIds.length
    ? byId[visitedIds[visitedIds.length - 1]]
    : byId.Depot;
  const nextId = plan.sim.legs.find((l) => l.to !== 'Depot')?.to || null;

  const neighbor = (leg) => ({
    from: [byId[leg.from].lat, byId[leg.from].lon],
    to: [byId[leg.to].lat, byId[leg.to].lon],
  });

  return (
    <MapContainer
      crs={crs}
      center={[18.458, 77.408]}
      zoom={5}
      minZoom={3}
      maxZoom={5}
      zoomControl={false}
      doubleClickZoom={false}
      scrollWheelZoom
      className="map-view"
    >
      <ViewController stations={stations} resetKey={resetKey} />
      <ZoomControl position="topleft" />
      <ScaleControl position="bottomright" imperial={false} maxWidth={90} />

      <ImageOverlay url="/layers/ortho_crop.jpg" bounds={BOUNDS} opacity={1} />

      {showGeology && geojson && (
        <GeoJSON
          key="geo"
          data={geojson}
          style={() => ({ color: '#7cc4ff', weight: 1.6, fillOpacity: 0.07 })}
          onEachFeature={(f, layer) =>
            layer.bindPopup(`<b>${f.properties.name}</b> (${f.properties.symbol})`)
          }
        />
      )}

      {/* Deferred spurs sit under the live route so the decision reads clearly. */}
      {droppedIds.map((id) => {
        const seg = [
          [lastVisited.lat, lastVisited.lon],
          [byId[id].lat, byId[id].lon],
        ];
        return (
          <Polyline
            key={`drop-casing-${id}`}
            positions={seg}
            pathOptions={{ ...CASING, weight: 5 }}
            interactive={false}
          />
        );
      })}
      {droppedIds.map((id) => (
        <Polyline
          key={`drop-${id}`}
          positions={[
            [lastVisited.lat, lastVisited.lon],
            [byId[id].lat, byId[id].lon],
          ]}
          pathOptions={{
            color: '#f87171',
            weight: 2,
            dashArray: '5 6',
            opacity: 0.9,
          }}
        />
      ))}

      {/* Completed legs */}
      {plan.visitedLegs.map((leg, i) => {
        const p = neighbor(leg);
        return (
          <Polyline
            key={`done-casing-${i}`}
            positions={[p.from, p.to]}
            pathOptions={{ ...CASING }}
            interactive={false}
          />
        );
      })}
      {plan.visitedLegs.map((leg, i) => {
        const p = neighbor(leg);
        return (
          <Polyline
            key={`done-${i}`}
            positions={[p.from, p.to]}
            pathOptions={{ color: '#34d399', weight: 3 }}
            className="route-completed"
          />
        );
      })}

      {/* Remaining traverse, including the return leg */}
      {plan.sim.legs.map((leg, i) => {
        const p = neighbor(leg);
        return (
          <Polyline
            key={`plan-casing-${i}`}
            positions={[p.from, p.to]}
            pathOptions={{ ...CASING }}
            interactive={false}
          />
        );
      })}
      {plan.sim.legs.map((leg, i) => {
        const p = neighbor(leg);
        const isReturn = leg.to === 'Depot';
        return (
          <Polyline
            key={`plan-${i}`}
            positions={[p.from, p.to]}
            pathOptions={{
              color: isReturn ? '#94a3b8' : '#22d3ee',
              weight: isReturn ? 2.5 : 3,
              dashArray: isReturn ? '7 6' : undefined,
              opacity: isReturn ? 0.85 : 1,
            }}
            className={isReturn ? undefined : 'route-planned'}
          />
        );
      })}

      {stations
        .filter((s) => s.lat != null)
        .map((s) => {
          const dropped = droppedIds.includes(s.id);
          const visited = visitedIds.includes(s.id);
          const status = statusOf(s.id, dropped, visited, nextId === s.id);
          const dir = s.id === 'Skinner' ? 'left' : 'right';
          const off = s.id === 'Skinner' ? [-10, 0] : [10, 0];
          const name = s.id === 'Depot' ? 'Base' : s.name;
          return (
            <Marker
              key={s.id}
              position={[s.lat, s.lon]}
              icon={stationIcon(s, status)}
              title={name}
              keyboard
            >
              <Tooltip
                permanent
                direction={dir}
                offset={off}
                className={`station-label station-label--${status}`}
              >
                {name}
                {dropped ? ' · deferred' : ''}
              </Tooltip>
            </Marker>
          );
        })}
    </MapContainer>
  );
}
