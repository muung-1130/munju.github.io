'use client';

import dynamic from 'next/dynamic';
import { Card } from '@/components/UI';
import type { RoutePoint } from '@/components/CourseRouteMap';

const CourseRouteMap = dynamic(() => import('@/components/CourseRouteMap').then((mod) => mod.CourseRouteMap), {
  ssr: false,
  loading: () => <div className="course-route-map-loading">지도를 불러오는 중...</div>
});

// TODO: PostGIS course_route 테이블에서 course_id로 조회해 대체 (현재는 임의의 GPS 값)
const dummyRoute: RoutePoint[] = [
  { seq: 0, lat: 37.5089, lng: 126.9973 },
  { seq: 1, lat: 37.5104, lng: 126.9946 },
  { seq: 2, lat: 37.5122, lng: 126.9905 },
  { seq: 3, lat: 37.5143, lng: 126.9861 },
  { seq: 4, lat: 37.5158, lng: 126.981 },
  { seq: 5, lat: 37.5175, lng: 126.9758 },
  { seq: 6, lat: 37.5199, lng: 126.97 },
  { seq: 7, lat: 37.5218, lng: 126.965 },
  { seq: 8, lat: 37.5238, lng: 126.959 },
  { seq: 9, lat: 37.526, lng: 126.952 },
  { seq: 10, lat: 37.5283, lng: 126.946 },
  { seq: 11, lat: 37.5296, lng: 126.94 }
];

export function CourseRouteSection() {
  return (
    <Card className="course-route-card">
      <div className="card-head">
        <h2>코스 GPS 경로 <span className="type-pill">PostGIS 연동 예정</span></h2>
        <span className="muted">경유점 {dummyRoute.length}개</span>
      </div>
      <p>코스에 등록된 GPS 경유점을 지도 위에 표시해요. 일부 경유점만 저장하고, 나머지 구간은 지도 API로 채운 뒤 PostGIS에 저장할 예정이에요. (현재는 임의의 좌표로 표시된 데모입니다)</p>
      <CourseRouteMap points={dummyRoute} />
      <div className="route-point-list">
        {dummyRoute.map((point, index) => (
          <span key={point.seq} className="route-point-chip">
            {index === 0 ? '출발' : index === dummyRoute.length - 1 ? '도착' : `#${point.seq}`} {point.lat.toFixed(4)}, {point.lng.toFixed(4)}
          </span>
        ))}
      </div>
    </Card>
  );
}
