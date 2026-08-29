import { NextResponse } from 'next/server';

// backend 역할 인스턴스는 APP_ROLE=backend일 때 middleware가 '/' 등 페이지 경로를 막아버리므로,
// docker-compose healthcheck가 확인할 수 있는 /api/* 경로의 헬스체크 엔드포인트가 필요하다.
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ status: 'ok' });
}
