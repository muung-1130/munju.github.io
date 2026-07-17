'use client';

import { useRef, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { CourseMapView } from '@/components/CourseMapView';
import type { CourseRoute } from '@/components/CourseMapView';
import { DIFFICULTY_LABEL } from '@/lib/courseDifficulty';
import { truncateToOneDecimal } from '@/lib/format';

const RADIUS_PRESETS_KM = [1, 3, 5, 10];
// 위치 정보를 못 가져오고 로그인도 안 돼있을 때의 최종 폴백: 종로3가역(5번출구 인근).
const JONGNO_3GA_EXIT5 = { lat: 37.5725, lng: 126.9903 };
// center가 주어졌을 때 최초 1회만 적용하는 기본 축척 — 대략 1:100,000에 해당.
const DEFAULT_ZOOM = 14;
// 난이도가 대부분 같은 값(보통)이라 색으로 구분이 안 되므로, 코스마다 팔레트를 순환시켜 서로
// 다른 색으로 구분되게 한다.
const ROUTE_COLOR_PALETTE = [
  '#135be8', '#ff8b1a', '#3aa655', '#e0439a', '#00a3a3', '#7d5cff', '#d63c3c', '#b8860b'
];

type NearbyCourse = {
  courseId: string;
  name: string;
  region: string | null;
  difficulty: number | null;
  distanceM: number;
  distanceFromUserM: number;
  reviewAverage: number;
  reviewCount: number;
  viewCount: number;
  positions: [number, number][];
};

export function CourseNearbyExplorer() {
  const { data: session } = useSession();
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationLabel, setLocationLabel] = useState<string | null>(null);
  const [usingFallback, setUsingFallback] = useState(false);
  const [radiusKm, setRadiusKm] = useState(5);
  const [showAll, setShowAll] = useState(false);
  const [courses, setCourses] = useState<NearbyCourse[] | null>(null);
  const [recenterSignal, setRecenterSignal] = useState(0);
  const [zoomDelta, setZoomDelta] = useState(0);
  const [hoveredCourseId, setHoveredCourseId] = useState<string | null>(null);
  const radiusIndexRef = useRef(RADIUS_PRESETS_KM.indexOf(5));

  async function applyLocation(point: { lat: number; lng: number }, fallback: boolean) {
    setLocation(point);
    setUsingFallback(fallback);
    setZoomDelta(0);
    setRecenterSignal((n) => n + 1);
    setLocationLabel(null);
    try {
      const res = await fetch(`/api/geo/reverse-dong?lat=${point.lat}&lng=${point.lng}`);
      if (res.ok) {
        const data = await res.json();
        if (data.label) setLocationLabel(data.label);
      }
    } catch {
      // 라벨 표시는 부가 정보라 실패해도 지도 동작에는 영향 없음
    }
  }

  // 우선순위: 브라우저 위치 정보 -> 로그인 계정의 동(auth_user.users.dong) -> 종로3가역 5번출구.
  async function locateMe() {
    if (!navigator.geolocation) {
      await resolveFallbackLocation();
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => applyLocation({ lat: position.coords.latitude, lng: position.coords.longitude }, false),
      () => resolveFallbackLocation(),
      { timeout: 8000 }
    );
  }

  async function resolveFallbackLocation() {
    if (session?.user?.dong) {
      try {
        const res = await fetch(`/api/geo/dong-center?address=${encodeURIComponent(session.user.dong)}`);
        if (res.ok) {
          const point = await res.json();
          await applyLocation(point, true);
          return;
        }
      } catch {
        // 동 주소 지오코딩 실패 시 아래 최종 폴백으로 이어짐
      }
    }
    await applyLocation(JONGNO_3GA_EXIT5, true);
  }

  function selectRadius(km: number) {
    const newIndex = RADIUS_PRESETS_KM.indexOf(km);
    const delta = newIndex > radiusIndexRef.current ? -1 : newIndex < radiusIndexRef.current ? 1 : 0;
    radiusIndexRef.current = newIndex;
    setRadiusKm(km);
    setZoomDelta(delta);
    setRecenterSignal((n) => n + 1);
  }

  useEffect(() => {
    locateMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!location) return;
    const params = showAll
      ? `lat=${location.lat}&lng=${location.lng}&all=true`
      : `lat=${location.lat}&lng=${location.lng}&radius_m=${radiusKm * 1000}`;
    fetch(`/api/courses/nearby?${params}`)
      .then((res) => (res.ok ? res.json() : { courses: [] }))
      .then((json) => setCourses(json.courses ?? []));
  }, [location, radiusKm, showAll]);

  if (!location) {
    return <p>내 위치를 확인하는 중…</p>;
  }

  const routes: CourseRoute[] = (courses ?? []).map((course, index) => ({
    id: course.courseId,
    name: course.name,
    color: ROUTE_COLOR_PALETTE[index % ROUTE_COLOR_PALETTE.length],
    positions: course.positions
  }));
  const routeColorByCourseId = new Map(routes.map((route) => [route.id, route.color]));

  return (
    <div className="course-nearby-layout">
      <div className="course-nearby-toolbar">
        <div className="course-nearby-location">
          <span className="location-label">📍 {locationLabel ?? '위치 확인 중...'}</span>
          {usingFallback && (
            <span className="location-fallback-hint">위치 정보를 가져오지 못해 계정 정보로 표시했어요.</span>
          )}
        </div>
        <div className="course-nearby-toolbar-actions">
          <button type="button" className="locate-me-btn icon-only" onClick={locateMe} aria-label="현재 위치로 이동">
            <img src="/assets/gps-target.png" alt="" />
          </button>
          {!showAll && (
            <div className="radius-slider">
              <div className="radius-slider-track">
                {RADIUS_PRESETS_KM.map((km, i) => (
                  <button
                    key={km}
                    type="button"
                    className={`radius-slider-dot ${km === radiusKm ? 'active' : ''}`}
                    style={{ left: `${(i / (RADIUS_PRESETS_KM.length - 1)) * 100}%` }}
                    onClick={() => selectRadius(km)}
                  >
                    <span className="radius-slider-label">{km}km</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <label className="switch-toggle">
            <input type="checkbox" checked={showAll} onChange={() => setShowAll((v) => !v)} />
            <span className="switch-track" />
            전체보기
          </label>
        </div>
      </div>

      <div className="course-nearby-map">
        <CourseMapView
          routes={routes}
          height={560}
          center={[location.lat, location.lng]}
          scrollWheelZoom
          recenterSignal={recenterSignal}
          zoomDelta={zoomDelta}
          defaultZoom={DEFAULT_ZOOM}
          highlightCourseId={hoveredCourseId}
          locationMarker={[location.lat, location.lng]}
        />
      </div>

      <div className="course-nearby-list">
        {courses === null ? (
          <p className="muted">코스를 찾는 중…</p>
        ) : courses.length === 0 ? (
          <p className="muted">{radiusKm}km 내에 코스가 없어요. 반경을 조정해주세요…</p>
        ) : (
          courses.map((course) => (
            <Link
              key={course.courseId}
              href={`/courses/${course.courseId}`}
              className={`course-nearby-card ${course.courseId === hoveredCourseId ? 'hovered' : ''}`}
              onMouseEnter={() => setHoveredCourseId(course.courseId)}
              onMouseLeave={() => setHoveredCourseId(null)}
            >
              <h3>
                <i className="course-color-dot" style={{ backgroundColor: routeColorByCourseId.get(course.courseId) }} />
                {course.name}
              </h3>
              <p>
                {course.region} · {(course.distanceM / 1000).toFixed(1)}km · {DIFFICULTY_LABEL[course.difficulty ?? 2]}
              </p>
              <p className="course-nearby-stats">
                ★ {truncateToOneDecimal(course.reviewAverage).toFixed(1)} ({course.reviewCount}) · 조회 {course.viewCount}
              </p>
              <span className="course-nearby-distance">내 위치에서 {(course.distanceFromUserM / 1000).toFixed(1)}km</span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
