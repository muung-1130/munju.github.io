import type { NextFunction, Request, Response } from 'express';
import { decode } from 'next-auth/jwt';

// next-auth는 세션 전략이 'jwt'라 별도 세션 스토어 조회 없이, Next.js가 발급한 쿠키를
// 같은 NEXTAUTH_SECRET으로 복호화하기만 하면 이 서비스도 로그인 사용자를 알 수 있다.
// NextAuth는 NEXTAUTH_URL이 https면 쿠키 이름 앞에 __Secure-를 자동으로 붙인다(useSecureCookies).
// http(8080)/https(8443) 두 경로가 동시에 열려 있어 로그인 경로에 따라 쿠키 이름이 달라지므로 둘 다 확인한다.
// 토큰 필드는 lib/auth.ts의 jwt() 콜백이 실제로 심어두는 이름(userId/userName/dong)을 따른다 —
// NextAuth 기본 필드인 token.id/token.sub가 아니다.
const COOKIE_NAME = 'next-auth.session-token';
const SECURE_COOKIE_NAME = '__Secure-next-auth.session-token';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userName?: string;
      dong?: string | null;
    }
  }
}

function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export async function attachSession(req: Request, _res: Response, next: NextFunction) {
  try {
    const raw = readCookie(req.headers.cookie, SECURE_COOKIE_NAME) ?? readCookie(req.headers.cookie, COOKIE_NAME);
    if (!raw) return next();
    const token = await decode({ token: raw, secret: process.env.NEXTAUTH_SECRET! });
    if (token && typeof token.userId === 'string') {
      req.userId = token.userId;
      req.userName = typeof token.userName === 'string' ? token.userName : undefined;
      req.dong = typeof token.dong === 'string' ? token.dong : null;
    }
  } catch {
    // 토큰이 없거나 손상됐으면 비로그인으로 취급한다.
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.userId) {
    res.status(401).json({ error: '로그인이 필요해요.' });
    return;
  }
  next();
}
