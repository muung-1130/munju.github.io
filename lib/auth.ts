<<<<<<< HEAD
import { randomBytes, createHash } from 'crypto';
=======
>>>>>>> origin/main
import type { AuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import bcrypt from 'bcryptjs';
import { getPool } from '@/lib/db';
import { resolveUniqueField } from '@/lib/uniqueField';

function isProfileComplete(row: { gender: string | null; birth_year: number | null; dong: string | null }) {
  return Boolean(row.gender && row.birth_year && row.dong);
}

<<<<<<< HEAD
// 로그인 성공 시 auth_user.auth_sessions에 세션 기록을 남긴다.
// NextAuth 자체는 JWT 쿠키로 동작하므로 이 refresh token은 실제로 쿠키 갱신에 쓰이진 않지만,
// 팀 공용 스키마(WATCH/앱 등 다른 클라이언트도 참조)에 로그인 기록을 남기기 위해 저장한다.
async function recordAuthSession(userId: string) {
  const pool = getPool();
  const refreshToken = randomBytes(32).toString('hex');
  const refreshTokenHash = createHash('sha256').update(refreshToken).digest('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await pool.query(
    `INSERT INTO auth_user.auth_sessions (user_id, refresh_token_hash, device_type, expires_at)
     VALUES ($1, $2, 'WEB', $3)`,
    [userId, refreshTokenHash, expiresAt]
  );
}

=======
>>>>>>> origin/main
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
<<<<<<< HEAD
          `SELECT user_id, user_name, nickname, user_email, user_password, created_at, gender, birth_year, dong
           FROM auth_user.users WHERE user_name = $1 AND deleted_at IS NULL`,
          [credentials.username]
        );
        const row = rows[0];
        if (!row || !row.user_password) return null;

        const valid = await bcrypt.compare(credentials.password, row.user_password);
        if (!valid) return null;

        await pool.query('UPDATE auth_user.users SET last_login_at = now() WHERE user_id = $1', [row.user_id]);
        await recordAuthSession(row.user_id);

        return {
          id: row.user_id,
=======
          `SELECT user_id, user_name, nickname, user_email, password_hash, created_at, gender, birth_year, dong
           FROM "user" WHERE user_name = $1 AND auth_provider = 'local'`,
          [credentials.username]
        );
        const row = rows[0];
        if (!row || !row.password_hash) return null;

        const valid = await bcrypt.compare(credentials.password, row.password_hash);
        if (!valid) return null;

        await pool.query('UPDATE "user" SET last_login_at = now() WHERE user_id = $1', [row.user_id]);

        return {
          id: String(row.user_id),
>>>>>>> origin/main
          name: row.nickname,
          email: row.user_email,
          userName: row.user_name,
          createdAt: row.created_at,
<<<<<<< HEAD
          profileComplete: isProfileComplete(row),
          dong: row.dong
=======
          profileComplete: isProfileComplete(row)
>>>>>>> origin/main
        };
      }
    }),
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET
          })
        ]
      : [])
  ],
  callbacks: {
    async signIn({ account, profile }) {
<<<<<<< HEAD
      if (account?.provider !== 'google' || !profile?.email || !account.providerAccountId) return true;

      const pool = getPool();

      const existingIdentity = await pool.query(
        `SELECT user_id FROM auth_user.user_identities WHERE provider = 'GOOGLE' AND provider_user_id = $1`,
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

      let userId: string;
      if (existingUser.rows.length > 0) {
        userId = existingUser.rows[0].user_id;
        await pool.query('UPDATE auth_user.users SET last_login_at = now() WHERE user_id = $1', [userId]);
      } else {
        const emailLocalPart = profile.email.split('@')[0];
        const userName = await resolveUniqueField(pool, 'user_name', undefined, emailLocalPart);
        const nickname = await resolveUniqueField(pool, 'nickname', undefined, emailLocalPart);

        // 구글에서 받는 정보(이메일) 외의 성별/출생년도/동은 아직 비어있는 채로 생성한다.
        // 로그인 직후 AppShell이 profileComplete === false를 보고 추가 정보 입력창을 띄운다.
        const inserted = await pool.query(
          `INSERT INTO auth_user.users (user_name, user_email, nickname, status, last_login_at)
           VALUES ($1, $2, $3, 'ACTIVE', now())
           RETURNING user_id`,
          [userName, profile.email, nickname]
        );
        userId = inserted.rows[0].user_id;
      }

      await pool.query(
        `INSERT INTO auth_user.user_identities (user_id, provider, provider_user_id, provider_email)
         VALUES ($1, 'GOOGLE', $2, $3)`,
        [userId, account.providerAccountId, profile.email]
      );

=======
      if (account?.provider !== 'google' || !profile?.email) return true;

      const pool = getPool();
      const existing = await pool.query('SELECT user_id FROM "user" WHERE user_email = $1', [profile.email]);

      if (existing.rows.length === 0) {
        const emailLocalPart = profile.email.split('@')[0];
        const userName = await resolveUniqueField(pool, 'user_name', undefined, emailLocalPart);
        const nickname = await resolveUniqueField(pool, 'nickname', undefined, emailLocalPart);
        const realName = (profile as { name?: string }).name || emailLocalPart;

        // 구글에서 받는 정보(이름, 이메일) 외의 성별/출생년도/동은 아직 비어있는 채로 생성한다.
        // 로그인 직후 AppShell이 profileComplete === false를 보고 추가 정보 입력창을 띄운다.
        await pool.query(
          `INSERT INTO "user" (user_name, name, user_email, nickname, status, auth_provider, provider_account_id, last_login_at)
           VALUES ($1, $2, $3, $4, 'active', 'google', $5, now())`,
          [userName, realName, profile.email, nickname, account.providerAccountId]
        );
      } else {
        await pool.query('UPDATE "user" SET last_login_at = now() WHERE user_id = $1', [existing.rows[0].user_id]);
      }

>>>>>>> origin/main
      return true;
    },
    async jwt({ token, user, account, trigger }) {
      const pool = getPool();

<<<<<<< HEAD
      if (account?.provider === 'google' && account.providerAccountId) {
        const { rows } = await pool.query(
          `SELECT u.user_id, u.user_name, u.nickname, u.created_at, u.gender, u.birth_year, u.dong
             FROM auth_user.user_identities i
             JOIN auth_user.users u ON u.user_id = i.user_id
            WHERE i.provider = 'GOOGLE' AND i.provider_user_id = $1`,
          [account.providerAccountId]
        );
        const row = rows[0];
        if (row) {
          token.userId = row.user_id;
=======
      if (account?.provider === 'google' && user?.email) {
        const { rows } = await pool.query(
          `SELECT user_id, user_name, nickname, created_at, gender, birth_year, dong
           FROM "user" WHERE user_email = $1`,
          [user.email]
        );
        const row = rows[0];
        if (row) {
          token.userId = String(row.user_id);
>>>>>>> origin/main
          token.userName = row.user_name;
          token.name = row.nickname;
          token.createdAt = row.created_at;
          token.profileComplete = isProfileComplete(row);
<<<<<<< HEAD
          token.dong = row.dong;
          await recordAuthSession(row.user_id);
=======
>>>>>>> origin/main
        }
      } else if (user) {
        token.userId = user.id;
        token.userName = (user as { userName?: string }).userName;
        token.createdAt = (user as { createdAt?: string }).createdAt;
        token.profileComplete = (user as { profileComplete?: boolean }).profileComplete ?? true;
<<<<<<< HEAD
        token.dong = (user as { dong?: string | null }).dong ?? null;
      }

      if (trigger === 'update' && token.userId) {
        const { rows } = await pool.query('SELECT gender, birth_year, dong FROM auth_user.users WHERE user_id = $1', [
          token.userId
        ]);
        if (rows[0]) {
          token.profileComplete = isProfileComplete(rows[0]);
          token.dong = rows[0].dong;
        }
=======
      }

      if (trigger === 'update' && token.userId) {
        const { rows } = await pool.query('SELECT gender, birth_year, dong FROM "user" WHERE user_id = $1', [token.userId]);
        if (rows[0]) token.profileComplete = isProfileComplete(rows[0]);
>>>>>>> origin/main
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
<<<<<<< HEAD
        session.user.dong = token.dong ?? null;
=======
>>>>>>> origin/main
      }
      return session;
    }
  },
  pages: {
    signIn: '/login'
  }
};
