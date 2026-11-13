import { MapContainer, ImageOverlay, GeoJSON, Polyline, Tooltip, Marker, useMap } from 'react-leaflet';
import { useEffect } from 'react';
import L from 'leaflet';
import 'proj4leaflet';

const crs = new L.Proj.CRS('MARS:EQC',
  '+proj=eqc +lat_ts=0 +lat_0=0 +lon_0=0 +x_0=0 +y_0=0 +a=3396190 +b=3396190 +units=m +no_defs',
  { origin: [4573663.251, 1109693.14], resolutions: [128, 64, 32, 16, 8, 4, 2] });
const BOUNDS = [[18.43, 77.375], [18.485, 77.44]];

function stationIcon(s, dropped, visited) {
  const color = s.id === 'Depot' ? '#ffffff' : dropped ? '#884444' : visited ? '#44cc66' : s.id === 'Kodiak' ? '#cc88ff' : s.id === 'Skinner' ? '#2dd4bf' : '#ffb02e';
  const shape = s.id === 'Skinner'
    ? `width:13px;height:13px;background:${color};transform:rotate(45deg);border:2px solid #0a0e17;`
    : s.id === 'Kodiak'
      ? `width:15px;height:15px;border-radius:50%;border:2.5px dashed ${color};background:transparent;`
      : `width:13px;height:13px;border-radius:50%;background:${color};border:2px solid #0a0e17;`;
  return L.divIcon({ className: '', iconSize: [16, 16], iconAnchor: [8, 8], html: `<div style="${shape}"></div>` });
}

function FitStations({ stations }) {
  const map = useMap();
  useEffect(() => {
    const b = L.latLngBounds(stations.filter(s => s.lat != null).map(s => [s.lat, s.lon]));
    map.fitBounds(b.pad(0.3), { animate: false, maxZoom: 5 });
  }, [map, stations]);
  return null;
}

export default function MapView({ stations, plan, showGeology, setShowGeology, geojson }) {
  const byId = Object.fromEntries(stations.map(s => [s.id, s]));
  const droppedIds = plan.dropped.map(d => d.id);
  const visitedIds = plan.visitedLegs.map(l => l.to);
  const routePts = [];
  for (const leg of plan.visitedLegs.concat(plan.sim.legs)) {
    routePts.push([byId[leg.from].lat, byId[leg.from].lon], [byId[leg.to].lat, byId[leg.to].lon]);
  }
  const lastVisited = visitedIds.length ? byId[visitedIds[visitedIds.length - 1]] : byId.Depot;
  return (
    <MapContainer crs={crs} center={[18.458, 77.408]} zoom={5} maxZoom={5} doubleClickZoom={false}
      style={{ height: '100%', width: '100%', background: '#0a0e17' }}>
      <FitStations stations={stations} />
      <ImageOverlay url="/layers/ortho_crop.jpg" bounds={BOUNDS} opacity={1} />
      {showGeology && geojson && (
        <GeoJSON key="geo" data={geojson}
          style={() => ({ color: '#7cc4ff', weight: 1.75, fillOpacity: 0.07 })}
          onEachFeature={(f, l) => l.bindPopup(`<b>${f.properties.name}</b> (${f.properties.symbol})`)} />
      )}
      {routePts.length > 1 && <Polyline positions={routePts} pathOptions={{ color: '#22d3ee', weight: 3 }} />}
      {droppedIds.map(id => (
        <Polyline key={'drop' + id} positions={[[lastVisited.lat, lastVisited.lon], [byId[id].lat, byId[id].lon]]}
          pathOptions={{ color: '#cc3333', weight: 2, dashArray: '6 6' }} />
      ))}
      {stations.filter(s => s.lat != null).map(s => {
        const dropped = droppedIds.includes(s.id);
        const visited = visitedIds.includes(s.id);
        const candidate = s.id === 'Kodiak';
        const dir = s.id === 'Skinner' ? 'left' : s.id === 'Kodiak' ? 'top' : 'right';
        const off = s.id === 'Skinner' ? [-10, 0] : s.id === 'Kodiak' ? [0, -12] : [10, 0];
        return (
          <Marker key={s.id} position={[s.lat, s.lon]} icon={stationIcon(s, dropped, visited)}>
            <Tooltip permanent direction={dir} offset={off} className="station-label">
              {s.id === 'Depot' ? 'Base' : s.name}{candidate ? ' (candidate - not verified)' : ''}{dropped ? ' — LOST' : ''}
            </Tooltip>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
