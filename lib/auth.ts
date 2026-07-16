import type { AuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import bcrypt from 'bcryptjs';
import { getPool } from '@/lib/db';
import { resolveUniqueField } from '@/lib/uniqueField';

function isProfileComplete(row: { gender: string | null; birth_year: number | null; dong: string | null }) {
  return Boolean(row.gender && row.birth_year && row.dong);
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
          name: row.nickname,
          email: row.user_email,
          userName: row.user_name,
          createdAt: row.created_at,
          profileComplete: isProfileComplete(row)
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

      return true;
    },
    async jwt({ token, user, account, trigger }) {
      const pool = getPool();

      if (account?.provider === 'google' && user?.email) {
        const { rows } = await pool.query(
          `SELECT user_id, user_name, nickname, created_at, gender, birth_year, dong
           FROM "user" WHERE user_email = $1`,
          [user.email]
        );
        const row = rows[0];
        if (row) {
          token.userId = String(row.user_id);
          token.userName = row.user_name;
          token.name = row.nickname;
          token.createdAt = row.created_at;
          token.profileComplete = isProfileComplete(row);
        }
      } else if (user) {
        token.userId = user.id;
        token.userName = (user as { userName?: string }).userName;
        token.createdAt = (user as { createdAt?: string }).createdAt;
        token.profileComplete = (user as { profileComplete?: boolean }).profileComplete ?? true;
      }

      if (trigger === 'update' && token.userId) {
        const { rows } = await pool.query('SELECT gender, birth_year, dong FROM "user" WHERE user_id = $1', [token.userId]);
        if (rows[0]) token.profileComplete = isProfileComplete(rows[0]);
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
      }
      return session;
    }
  },
  pages: {
    signIn: '/login'
  }
};
