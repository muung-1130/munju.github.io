import { randomBytes, createHash } from 'crypto';
import type { AuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import CognitoProvider from 'next-auth/providers/cognito';
import bcrypt from 'bcryptjs';
import { getPool } from '@/lib/db';
import { resolveUniqueField } from '@/lib/uniqueField';

function isProfileComplete(row: { gender: string | null; birth_year: number | null; dong: string | null }) {
  return Boolean(row.gender && row.birth_year && row.dong);
}

// 로그인 성공 시 auth_user.auth_sessions에 세션 기록을 남긴다.
// NextAuth 자체는 JWT 쿠키로 동작하므로 이 refresh token은 실제로 쿠키 갱신에 쓰이진 않지만,
// 팀 공용 스키마(WATCH/앱 등 다른 클라이언트도 참조)에 로그인 기록을 남기기 위해 저장한다.
// session_id를 JWT에 실어두면 로그아웃할 때 이 행을 정확히 찾아 회수(revoke)할 수 있다 —
// 그러지 않으면 로그아웃해도 auth_sessions에는 "활성" 세션이 계속 쌓이기만 하는 문제가 있었다.
async function recordAuthSession(userId: string): Promise<string> {
  const pool = getPool();
  const refreshToken = randomBytes(32).toString('hex');
  const refreshTokenHash = createHash('sha256').update(refreshToken).digest('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const { rows } = await pool.query(
    `INSERT INTO auth_user.auth_sessions (user_id, refresh_token_hash, device_type, expires_at)
     VALUES ($1, $2, 'WEB', $3)
     RETURNING session_id`,
    [userId, refreshTokenHash, expiresAt]
  );
  return rows[0].session_id;
}

export const authOptions: AuthOptions = {
  session: { strategy: 'jwt' },
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    CredentialsProvider({
      name: '아이디/비밀번호',
      credentials: {
        username: { label: '아이디', type: 'text' },
        password: { label: '비밀번호', type: 'password' }
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null;

        const pool = getPool();
        const { rows } = await pool.query(
          `SELECT user_id, user_name, nickname, user_email, user_password, created_at, gender, birth_year, dong, is_admin
           FROM auth_user.users WHERE user_name = $1 AND deleted_at IS NULL`,
          [credentials.username]
        );
        const row = rows[0];
        if (!row || !row.user_password) return null;

        const valid = await bcrypt.compare(credentials.password, row.user_password);
        if (!valid) return null;

        await pool.query('UPDATE auth_user.users SET last_login_at = now() WHERE user_id = $1', [row.user_id]);
        const sessionId = await recordAuthSession(row.user_id);

        return {
          id: row.user_id,
          name: row.nickname,
          email: row.user_email,
          userName: row.user_name,
          createdAt: row.created_at,
          profileComplete: isProfileComplete(row),
          dong: row.dong,
          isAdmin: row.is_admin,
          sessionId
        };
      }
    }),
    // 시연용 원클릭 로그인. 비밀번호를 주고받지 않고 서버에서만 계정을 결정하므로 클라이언트
    // 번들에는 어떤 자격 증명도 노출되지 않는다 — DEMO_LOGIN_ENABLED가 꺼져 있으면(기본값)
    // 항상 로그인을 거부한다. 행사·시연이 끝나면 반드시 다시 꺼둔다.
    CredentialsProvider({
      id: 'demo',
      name: '시연용 로그인',
      credentials: {},
      async authorize() {
        if (process.env.DEMO_LOGIN_ENABLED !== 'true') return null;

        const pool = getPool();
        const { rows } = await pool.query(
          `SELECT user_id, user_name, nickname, user_email, created_at, gender, birth_year, dong, is_admin
           FROM auth_user.users WHERE is_admin = true AND deleted_at IS NULL
           ORDER BY created_at ASC LIMIT 1`
        );
        const row = rows[0];
        if (!row) return null;

        await pool.query('UPDATE auth_user.users SET last_login_at = now() WHERE user_id = $1', [row.user_id]);
        const sessionId = await recordAuthSession(row.user_id);

        return {
          id: row.user_id,
          name: row.nickname,
          email: row.user_email,
          userName: row.user_name,
          createdAt: row.created_at,
          profileComplete: isProfileComplete(row),
          dong: row.dong,
          isAdmin: row.is_admin,
          sessionId
        };
      }
    }),
    ...(process.env.COGNITO_CLIENT_ID && process.env.COGNITO_CLIENT_SECRET && process.env.COGNITO_ISSUER
      ? [
          CognitoProvider({
            clientId: process.env.COGNITO_CLIENT_ID,
            clientSecret: process.env.COGNITO_CLIENT_SECRET,
            issuer: process.env.COGNITO_ISSUER
          })
        ]
      : [])
  ],
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== 'cognito' || !profile?.email || !account.providerAccountId) return true;

      const pool = getPool();

      const existingIdentity = await pool.query(
        `SELECT user_id FROM auth_user.user_identities WHERE provider = 'COGNITO' AND provider_user_id = $1`,
        [account.providerAccountId]
      );

      if (existingIdentity.rows.length > 0) {
        await pool.query('UPDATE auth_user.users SET last_login_at = now() WHERE user_id = $1', [
          existingIdentity.rows[0].user_id
        ]);
        return true;
      }

      const existingUser = await pool.query('SELECT user_id FROM auth_user.users WHERE user_email = $1', [
        profile.email
      ]);

      // 신규 계정 생성 + 소셜 로그인 연결(user_identities)을 하나의 트랜잭션으로 묶는다 — 둘 중
      // 하나만 반영되면(예: users는 만들어졌는데 user_identities insert가 실패) jwt 콜백이
      // user_identities를 거쳐 사용자를 못 찾게 되고, 그 사용자는 로그인도 회원가입도 안 되는
      // 상태로 남는다.
      const client = await pool.connect();
      let userId: string;
      try {
        await client.query('BEGIN');

        if (existingUser.rows.length > 0) {
          userId = existingUser.rows[0].user_id;
          await client.query('UPDATE auth_user.users SET last_login_at = now() WHERE user_id = $1', [userId]);
        } else {
          const emailLocalPart = profile.email.split('@')[0];
          const userName = await resolveUniqueField(pool, 'user_name', undefined, emailLocalPart);
          const nickname = await resolveUniqueField(pool, 'nickname', undefined, emailLocalPart);

          // Cognito에서 받는 정보(이메일) 외의 성별/출생년도/동은 아직 비어있는 채로 생성한다.
          // 로그인 직후 AppShell이 profileComplete === false를 보고 추가 정보 입력창을 띄운다.
          const inserted = await client.query(
            `INSERT INTO auth_user.users (user_name, user_email, nickname, status, last_login_at)
             VALUES ($1, $2, $3, 'ACTIVE', now())
             RETURNING user_id`,
            [userName, profile.email, nickname]
          );
          userId = inserted.rows[0].user_id;
        }

        await client.query(
          `INSERT INTO auth_user.user_identities (user_id, provider, provider_user_id, provider_email)
           VALUES ($1, 'COGNITO', $2, $3)`,
          [userId, account.providerAccountId, profile.email]
        );

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        console.error('Cognito 로그인 계정 생성/연결 실패:', err);
        return false;
      } finally {
        client.release();
      }

      return true;
    },
    async jwt({ token, user, account, trigger }) {
      const pool = getPool();

      if (account?.provider === 'cognito' && account.providerAccountId) {
        const { rows } = await pool.query(
          `SELECT u.user_id, u.user_name, u.nickname, u.created_at, u.gender, u.birth_year, u.dong, u.is_admin
             FROM auth_user.user_identities i
             JOIN auth_user.users u ON u.user_id = i.user_id
            WHERE i.provider = 'COGNITO' AND i.provider_user_id = $1`,
          [account.providerAccountId]
        );
        const row = rows[0];
        if (row) {
          token.userId = row.user_id;
          token.userName = row.user_name;
          token.name = row.nickname;
          token.createdAt = row.created_at;
          token.profileComplete = isProfileComplete(row);
          token.dong = row.dong;
          token.isAdmin = row.is_admin;
          token.sessionId = await recordAuthSession(row.user_id);
        }
      } else if (user) {
        token.userId = user.id;
        token.userName = (user as { userName?: string }).userName;
        token.createdAt = (user as { createdAt?: string }).createdAt;
        token.profileComplete = (user as { profileComplete?: boolean }).profileComplete ?? true;
        token.dong = (user as { dong?: string | null }).dong ?? null;
        token.isAdmin = (user as { isAdmin?: boolean }).isAdmin ?? false;
        token.sessionId = (user as { sessionId?: string }).sessionId;
      }

      if (trigger === 'update' && token.userId) {
        const { rows } = await pool.query(
          'SELECT user_name, nickname, gender, birth_year, dong, is_admin FROM auth_user.users WHERE user_id = $1',
          [token.userId]
        );
        if (rows[0]) {
          token.userName = rows[0].user_name;
          token.name = rows[0].nickname;
          token.profileComplete = isProfileComplete(rows[0]);
          token.dong = rows[0].dong;
          token.isAdmin = rows[0].is_admin;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId as string;
        session.user.name = (token.name as string) ?? session.user.name;
        session.user.userName = token.userName as string;
        session.user.createdAt = token.createdAt as string;
        session.user.profileComplete = token.profileComplete ?? true;
        session.user.dong = token.dong ?? null;
        session.user.isAdmin = token.isAdmin ?? false;
      }
      session.sessionId = token.sessionId;
      return session;
    }
  },
  pages: {
    signIn: '/login'
  }
};
