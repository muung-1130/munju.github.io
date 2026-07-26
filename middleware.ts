import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';

// Dockerfile.frontend / Dockerfile.backend가 같은 빌드 산출물을 쓰면서 이 값만 다르게 설정한다.
// 값이 없으면(로컬 개발 등) 기존처럼 프론트+백엔드를 모두 서빙하는 단일 인스턴스로 동작한다.
const APP_ROLE = process.env.APP_ROLE;

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApiRoute = pathname.startsWith('/api/');

  if (APP_ROLE === 'backend' && !isApiRoute) {
    return new NextResponse('Not Found', { status: 404 });
  }

  if (APP_ROLE === 'frontend' && isApiRoute) {
    return new NextResponse('Not Found', { status: 404 });
  }

  if (pathname.startsWith('/mypage')) {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });

    if (!token) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
};
