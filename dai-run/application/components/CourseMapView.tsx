'use client';

import dynamic from 'next/dynamic';

export type { CourseRoute } from '@/components/CourseRouteMap';

export const CourseMapView = dynamic(() => import('@/components/CourseRouteMap').then((mod) => mod.CourseRouteMap), {
  ssr: false,
  loading: () => <div className="course-route-map-loading">지도를 불러오는 중...</div>
});
