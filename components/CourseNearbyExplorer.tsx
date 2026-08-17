'use client';

import { useRef, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { CourseMapView } from '@/components/CourseMapView';
import type { CourseRoute } from '@/components/CourseMapView';
import { DIFFICULTY_LABEL } from '@/lib/courseDifficulty';
import { truncateToOneDecimal } from '@/lib/format';
import { useChat } from '@/components/ChatContext';

const RADIUS_PRESETS_KM = [1, 3, 5, 10];
// 위치 정보를 못 가져오고 로그인도 안 돼있을 때의 최종 폴백: 종로3가역(5번출구 인근).
const JONGNO_3GA_EXIT5 = { lat: 37.5725, lng: 126.9903 };
const LOCATION_NOTICE_SHOWN_KEY = 'locationDeniedNoticeShown';
// center가 주어졌을 때 최초 1회만 적용하는 기본 축척 — 대략 1:100,000에 해당.
const DEFAULT_ZOOM = 14;
// 난이도가 대부분 같은 값(보통)이라 색으로 구분이 안 되므로, 코스마다 팔레트를 순환시켜 서로
// 다른 색으로 구분되게 한다.
const ROUTE_COLOR_PALETTE = [
  '#135be8', '#ff8b1a', '#3aa655', '#e0439a', '#00a3a3', '#7d5cff', '#d63c3c', '#b8860b'
];

type DistanceBucket = 'KM5' | 'KM10' | 'KM15' | 'HALF' | 'FULL';

const DISTANCE_BUCKET_OPTIONS: { value: DistanceBucket; label: string; range: string }[] = [
  { value: 'KM5', label: '5km', range: '~5km' },
  { value: 'KM10', label: '10km', range: '6~10km' },
  { value: 'KM15', label: '15km', range: '11~19km' },
  { value: 'HALF', label: '하프', range: '20~30km' },
  { value: 'FULL', label: '풀', range: '31km~' }
];

const COURSE_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: '마라톤', label: '마라톤' },
  { value: '시티런', label: '시티런' }
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
  likeCount: number;
  positions: [number, number][];
};

export function CourseNearbyExplorer() {
  const { data: session } = useSession();
  const { addMessage } = useChat();
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationLabel, setLocationLabel] = useState<string | null>(null);
  const [usingFallback, setUsingFallback] = useState(false);
  const [radiusKm, setRadiusKm] = useState(5);
  const [showAll, setShowAll] = useState(false);
  const [courses, setCourses] = useState<NearbyCourse[] | null>(null);
  const [recenterSignal, setRecenterSignal] = useState(0);
  const [zoomDelta, setZoomDelta] = useState(0);
  const [hoveredCourseId, setHoveredCourseId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [activeSearch, setActiveSearch] = useState<string | null>(null);
  const [fitSignal, setFitSignal] = useState(0);
  const [distanceBucket, setDistanceBucket] = useState<DistanceBucket | ''>('');
  const [courseType, setCourseType] = useState('');
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
  // 예전엔 실패 이유를 그냥 삼키고 조용히 폴백만 했는데, "위치가 계속 실패한다"는 피드백이 있어서
  // 실제 원인(권한 거부/시간초과/기기에서 위치 확인 불가)을 AI 챗봇 말풍선으로 알려주게 바꿨다.
  async function locateMe() {
    if (!navigator.geolocation) {
      await resolveFallbackLocation();
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => applyLocation({ lat: position.coords.latitude, lng: position.coords.longitude }, false),
      (error) => {
        const reason =
          error.code === 1
            ? '위치 권한이 거부돼 있어서 대신 동네 기준으로 보여드릴게요. 브라우저 설정에서 위치 권한을 허용하면 더 정확해져요.'
            : error.code === 3
              ? '위치를 가져오는 데 시간이 오래 걸려서 대신 동네 기준으로 보여드릴게요.'
              : '현재 위치를 확인할 수 없어서 대신 동네 기준으로 보여드릴게요.';
        // 위치 권한 거부처럼 브라우저 설정이 안 바뀌는 한 매번 같은 사유가 반복되므로, 이 안내는
        // 세션당 한 번만 챗봇 대화에 남긴다(페이지를 오갈 때마다 쌓이는 것을 방지).
        try {
          if (!sessionStorage.getItem(LOCATION_NOTICE_SHOWN_KEY)) {
            addMessage({ from: 'ai', text: reason });
            sessionStorage.setItem(LOCATION_NOTICE_SHOWN_KEY, '1');
          }
        } catch {
          addMessage({ from: 'ai', text: reason });
        }
        resolveFallbackLocation();
      },
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
    const params = new URLSearchParams();
    params.set('lat', String(location.lat));
    params.set('lng', String(location.lng));
    if (activeSearch) {
      params.set('q', activeSearch);
    } else if (showAll) {
      params.set('all', 'true');
    } else {
      params.set('radius_m', String(radiusKm * 1000));
    }
    if (distanceBucket) params.set('distance_bucket', distanceBucket);
    if (courseType) params.set('course_type', courseType);

    fetch(`/api/courses/nearby?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : { courses: [] }))
      .then((json) => {
        const results: NearbyCourse[] = json.courses ?? [];
        if (activeSearch && results.length === 0) {
          // 요청대로 검색 결과가 없으면 화면(지도/목록)은 그대로 두고 챗봇 말풍선으로만 안내한다.
          addMessage({ from: 'ai', text: '검색 결과가 없습니다.' });
          return;
        }
        setCourses(results);
        if (activeSearch) setFitSignal((n) => n + 1);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location, radiusKm, showAll, activeSearch, distanceBucket, courseType]);

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = searchInput.trim();
    if (!trimmed) return;
    setActiveSearch(trimmed);
  }

  function clearSearch() {
    setSearchInput('');
    setActiveSearch(null);
  }

  function toggleDistanceBucket(value: DistanceBucket) {
    setDistanceBucket((prev) => (prev === value ? '' : value));
  }

  function toggleCourseType(value: string) {
    setCourseType((prev) => (prev === value ? '' : value));
  }

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
        <form className="course-nearby-search" onSubmit={submitSearch}>
          <input
            type="text"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="코스 이름이나 동네로 검색"
          />
          {activeSearch && <span className="course-nearby-search-result-count">{courses?.length ?? 0}건</span>}
          {activeSearch ? (
            <button type="button" className="course-nearby-search-clear" onClick={clearSearch} aria-label="검색 지우기">
              ✕
            </button>
          ) : (
            <button type="submit" className="course-nearby-search-submit" aria-label="검색">
              🔍
            </button>
          )}
        </form>
        <div className="course-nearby-toolbar-actions">
          <button type="button" className="locate-me-btn icon-only" onClick={locateMe} aria-label="현재 위치로 이동">
            <img src="/assets/gps-target.png" alt="" />
          </button>
          {(() => {
            const radiusDisabled = showAll || Boolean(activeSearch);
            return (
              <div className={`radius-slider ${radiusDisabled ? 'disabled' : ''}`}>
                <div className="radius-slider-track">
                  {RADIUS_PRESETS_KM.map((km, i) => (
                    <button
                      key={km}
                      type="button"
                      className={`radius-slider-dot ${km === radiusKm ? 'active' : ''}`}
                      style={{ left: `${(i / (RADIUS_PRESETS_KM.length - 1)) * 100}%` }}
                      onClick={() => selectRadius(km)}
                      disabled={radiusDisabled}
                    >
                      <span className="radius-slider-label">{km}km</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}
          {!activeSearch && (
            <label className="switch-toggle">
              <input type="checkbox" checked={showAll} onChange={() => setShowAll((v) => !v)} />
              <span className="switch-track" />
              전체보기
            </label>
          )}
        </div>
      </div>

      <div className="course-filter-row">
        <div className="course-filter-buttons">
          <button type="button" className={distanceBucket === '' ? 'active' : ''} onClick={() => setDistanceBucket('')}>
            <strong>전체 거리</strong>
          </button>
          {DISTANCE_BUCKET_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={distanceBucket === opt.value ? 'active' : ''}
              onClick={() => toggleDistanceBucket(opt.value)}
            >
              <strong>{opt.label}</strong>
              <span>{opt.range}</span>
            </button>
          ))}
        </div>
        <div className="course-filter-buttons">
          <button type="button" className={courseType === '' ? 'active' : ''} onClick={() => setCourseType('')}>
            <strong>전체</strong>
          </button>
          {COURSE_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={courseType === opt.value ? 'active' : ''}
              onClick={() => toggleCourseType(opt.value)}
            >
              <strong>{opt.label}</strong>
            </button>
          ))}
        </div>
      </div>

      {activeSearch && (
        <p className="course-nearby-search-status">
          &quot;{activeSearch}&quot; 검색 결과 {courses?.length ?? 0}건
        </p>
      )}

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
          fitToRoutesSignal={fitSignal}
          targetWidthKm={!showAll && !activeSearch ? radiusKm : undefined}
        />
      </div>

      <div className={`course-nearby-list ${activeSearch ? 'search-mode' : ''}`}>
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
                ★ {truncateToOneDecimal(course.reviewAverage).toFixed(1)} ({course.reviewCount}) · 찜 {course.likeCount} · 조회{' '}
                {course.viewCount}
              </p>
              <span className="course-nearby-distance">내 위치에서 {(course.distanceFromUserM / 1000).toFixed(1)}km</span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
