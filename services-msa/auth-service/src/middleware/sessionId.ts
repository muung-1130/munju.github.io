// session.ts의 attachSession은 userId/userName/dong만 뽑는데, 로그아웃(revoke-session)에는
// 세션 회수용 sessionId도 필요해서 이 서비스에서만 별도로 뽑는다.
import { decode } from 'next-auth/jwt';

function readCookie(cookieHeader: string, name: string): string | null {
  for (const part of cookieHeader.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export async function getSessionId(cookieHeader: string | undefined): Promise<string | null> {
  if (!cookieHeader) return null;
  // NEXTAUTH_URL이 https면 NextAuth가 쿠키 이름 앞에 __Secure-를 자동으로 붙인다(useSecureCookies).
  // http(8080)/https(8443) 두 경로가 동시에 열려 있어 로그인 경로에 따라 쿠키 이름이 달라지므로 둘 다 확인한다.
  const raw = readCookie(cookieHeader, '__Secure-next-auth.session-token') ?? readCookie(cookieHeader, 'next-auth.session-token');
  if (!raw) return null;
  try {
    const token = await decode({ token: raw, secret: process.env.NEXTAUTH_SECRET! });
    return typeof token?.sessionId === 'string' ? token.sessionId : null;
  } catch {
    return null;
  }
}
