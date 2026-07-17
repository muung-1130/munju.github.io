'use client';

<<<<<<< HEAD
import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip, useMap } from 'react-leaflet';
import { latLngBounds } from 'leaflet';
import 'leaflet/dist/leaflet.css';

export type CourseRoute = {
  id: string;
  name: string;
  color: string;
  positions: [number, number][];
};

function InvalidateSizeOnMount() {
  const map = useMap();

  // 부모가 flex/모바일 레이아웃으로 바뀌는 타이밍에 지도가 폭 0으로 초기화되면 그 크기로
  // 굳어버리는 Leaflet의 고질적인 문제라, 마운트 직후·리사이즈 시 강제로 다시 측정시킨다.
  useEffect(() => {
    map.invalidateSize();
    const timer = setTimeout(() => map.invalidateSize(), 250);
    const handleResize = () => map.invalidateSize();
    window.addEventListener('resize', handleResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
    };
  }, [map]);

  return null;
}

// center가 없는 코스 상세 페이지 등에서만 쓰인다: 코스 경로 전체가 보이도록 매번 fitBounds.
function FitToRoutesBounds({ routes }: { routes: CourseRoute[] }) {
  const map = useMap();

  useEffect(() => {
    const allPositions = routes.flatMap((route) => route.positions);
    if (allPositions.length > 0) map.fitBounds(latLngBounds(allPositions), { padding: [28, 28] });
  }, [map, routes]);

  return null;
}

// 코스 탐색(반경 검색) 지도 전용: 코스 목록이 바뀌는 것만으로는 절대 축척을 건드리지 않고,
// recenterSignal이 바뀔 때만(위치 갱신·"현재 위치로" 버튼·반경 선택 변경) 중심을 옮긴다. 최초
// 1회만 기본 축척을 적용하고, 그 다음부터는 사용자가 확대/축소해 둔 축척에 zoomDelta(반경 선택을
// 바꿀 때 ±1)만 더해서 유지한다.
function RecenterKeepZoom({
  center,
  defaultZoom,
  recenterSignal,
  zoomDelta = 0
}: {
  center: [number, number];
  defaultZoom: number;
  recenterSignal?: number;
  zoomDelta?: number;
}) {
  const map = useMap();
  const hasSetViewRef = useRef(false);

  useEffect(() => {
    const targetZoom = hasSetViewRef.current ? map.getZoom() + zoomDelta : defaultZoom;
    hasSetViewRef.current = true;
    map.setView(center, targetZoom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, center[0], center[1], recenterSignal]);

  return null;
}

export function CourseRouteMap({
  routes,
  height = 380,
  center,
  scrollWheelZoom = false,
  recenterSignal,
  zoomDelta = 0,
  defaultZoom = 14,
  highlightCourseId,
  locationMarker
}: {
  routes: CourseRoute[];
  height?: number;
  /** 지도 중심(내 위치) — 코스가 하나도 없어도 지도를 계속 보여주기 위한 폴백 중심이기도 하다. */
  center?: [number, number];
  /** 마우스 휠로 확대/축소할지. 페이지 스크롤과 충돌할 수 있어 기본은 꺼둔다. */
  scrollWheelZoom?: boolean;
  /** 값이 바뀔 때만(위치 갱신, "현재 위치로" 버튼, 반경 선택 변경 등 명시적 액션) 중심을 다시 맞춘다. */
  recenterSignal?: number;
  /** recenterSignal이 바뀔 때 현재 축척에 더할 값(반경을 한 단계 넓히면 -1, 좁히면 +1). */
  zoomDelta?: number;
  /** center가 주어졌을 때 최초 1회 적용할 기본 축척(대략 1:100,000). 이후엔 사용자의 축척을 유지한다. */
  defaultZoom?: number;
  /** 값이 있으면 그 코스만 지도에 표시하고 나머지는 숨긴다(목록 hover 시 단일 코스만 보기). */
  highlightCourseId?: string | null;
  /** 있으면 빨간 점으로 "내 위치"를 표시한다. */
  locationMarker?: [number, number];
}) {
  const validRoutes = routes.filter((route) => route.positions.length > 0);
  const displayedRoutes = highlightCourseId
    ? validRoutes.filter((route) => route.id === highlightCourseId)
    : validRoutes;
  const fallbackCenter = validRoutes[0]?.positions[Math.floor(validRoutes[0].positions.length / 2)] ?? center;
  if (!fallbackCenter) return null;

  return (
    <MapContainer center={fallbackCenter} zoom={defaultZoom} scrollWheelZoom={scrollWheelZoom} className="course-route-map" style={{ height }}>
=======
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

export type RoutePoint = { seq: number; lat: number; lng: number };

export function CourseRouteMap({ points }: { points: RoutePoint[] }) {
  if (points.length === 0) return null;

  const positions: [number, number][] = points.map((point) => [point.lat, point.lng]);
  const center = positions[Math.floor(positions.length / 2)];

  return (
    <MapContainer center={center} zoom={14} scrollWheelZoom={false} className="course-route-map">
>>>>>>> origin/main
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
<<<<<<< HEAD
      <InvalidateSizeOnMount />
      {center ? (
        <RecenterKeepZoom center={center} defaultZoom={defaultZoom} recenterSignal={recenterSignal} zoomDelta={zoomDelta} />
      ) : (
        <FitToRoutesBounds routes={validRoutes} />
      )}
      {locationMarker && (
        <CircleMarker
          center={locationMarker}
          radius={8}
          pathOptions={{ color: 'white', fillColor: '#ff3b30', fillOpacity: 1, weight: 3 }}
        >
          <Tooltip>내 위치</Tooltip>
        </CircleMarker>
      )}
      {displayedRoutes.map((route) => (
        <Polyline key={route.id} positions={route.positions} pathOptions={{ color: route.color, weight: 3 }}>
          <Tooltip sticky>{route.name}</Tooltip>
        </Polyline>
      ))}
      {displayedRoutes.map((route) => (
        <CircleMarker
          key={`${route.id}-start`}
          center={route.positions[0]}
          radius={8}
          pathOptions={{ color: route.color, fillColor: route.color, fillOpacity: 1, weight: 2 }}
        >
          <Tooltip>{route.name} · 출발</Tooltip>
        </CircleMarker>
      ))}
=======
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
>>>>>>> origin/main
    </MapContainer>
  );
}
