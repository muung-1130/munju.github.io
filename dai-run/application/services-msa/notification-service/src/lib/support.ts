import { getPool } from './db.js';

export type InquiryStatus = 'OPEN' | 'ANSWERED' | 'CLOSED';

export type InquiryListItem = {
  inquiryId: string;
  title: string;
  nickname: string;
  status: InquiryStatus;
  createdAt: string;
};

// 목록은 누구나(로그인만 하면) 볼 수 있다 — 제목/작성자 닉네임/상태만, 문의 내용은 절대 포함하지 않는다.
export async function getInquiryList(limit = 50): Promise<InquiryListItem[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT i.inquiry_id, i.title, i.status, i.created_at, u.nickname
       FROM support.inquiries i
       JOIN auth_user.users u ON u.user_id = i.user_id
      ORDER BY i.created_at DESC
      LIMIT $1`,
    [limit]
  );
  return rows.map((row) => ({
    inquiryId: row.inquiry_id,
    title: row.title,
    nickname: row.nickname,
    status: row.status,
    createdAt: row.created_at
  }));
}

export type InquiryDetail = {
  inquiryId: string;
  userId: string;
  title: string;
  content: string;
  nickname: string;
  status: InquiryStatus;
  adminReply: string | null;
  repliedAt: string | null;
  createdAt: string;
};

// 문의 내용은 작성자 본인과 admin 계정만 볼 수 있다 — 호출하는 쪽(API 라우트)에서 이미 권한을
// 확인했다는 전제로, 여기서는 순수하게 데이터만 가져온다.
export async function getInquiryDetail(inquiryId: string): Promise<InquiryDetail | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT i.inquiry_id, i.user_id, i.title, i.content, i.status, i.admin_reply, i.replied_at, i.created_at, u.nickname
       FROM support.inquiries i
       JOIN auth_user.users u ON u.user_id = i.user_id
      WHERE i.inquiry_id = $1`,
    [inquiryId]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    inquiryId: row.inquiry_id,
    userId: row.user_id,
    title: row.title,
    content: row.content,
    nickname: row.nickname,
    status: row.status,
    adminReply: row.admin_reply,
    repliedAt: row.replied_at,
    createdAt: row.created_at
  };
}

export async function createInquiry(userId: string, title: string, content: string): Promise<string> {
  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO support.inquiries (user_id, title, content) VALUES ($1, $2, $3) RETURNING inquiry_id`,
    [userId, title, content]
  );
  return rows[0].inquiry_id;
}

export async function replyToInquiry(inquiryId: string, adminReply: string): Promise<boolean> {
  const pool = getPool();
  const { rowCount } = await pool.query(
    `UPDATE support.inquiries SET admin_reply = $1, status = 'ANSWERED', replied_at = now() WHERE inquiry_id = $2`,
    [adminReply, inquiryId]
  );
  return (rowCount ?? 0) > 0;
}
