'use client';

import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

export type RoutePoint = { seq: number; lat: number; lng: number };

export function CourseRouteMap({ points }: { points: RoutePoint[] }) {
  if (points.length === 0) return null;

  const positions: [number, number][] = points.map((point) => [point.lat, point.lng]);
  const center = positions[Math.floor(positions.length / 2)];

  return (
    <MapContainer center={center} zoom={14} scrollWheelZoom={false} className="course-route-map">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Polyline positions={positions} pathOptions={{ color: '#1259ee', weight: 5 }} />
      {points.map((point, index) => {
        const isStart = index === 0;
        const isEnd = index === points.length - 1;
        return (
          <CircleMarker
            key={point.seq}
            center={[point.lat, point.lng]}
            radius={isStart || isEnd ? 8 : 5}
            pathOptions={{
              color: isStart ? '#ff5b5b' : '#1259ee',
              fillColor: isStart ? '#ff5b5b' : '#1259ee',
              fillOpacity: 1,
              weight: 2
            }}
          >
            <Tooltip>{isStart ? '출발' : isEnd ? '도착' : `경유점 #${point.seq}`}</Tooltip>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
