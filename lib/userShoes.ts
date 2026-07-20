import { getPool } from '@/lib/db';

export class UserShoeOwnershipError extends Error {}
export class UserShoeValidationError extends Error {}

function toDateStr(value: string | Date): string {
  return typeof value === 'string' ? value : value.toISOString().slice(0, 10);
}

export type UserShoeInput = {
  shoeModelId: number;
  nickname: string | null;
  purchaseDate: string; // YYYY-MM-DD
  initialDistanceM: number;
};

function validateInput(input: UserShoeInput): void {
  if (!Number.isInteger(input.shoeModelId) || input.shoeModelId <= 0) {
    throw new UserShoeValidationError('러닝화 모델을 선택해 주세요.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.purchaseDate)) {
    throw new UserShoeValidationError('구매일을 선택해 주세요.');
  }
  if (input.purchaseDate > toDateStr(new Date())) {
    throw new UserShoeValidationError('구매일은 오늘 이후일 수 없어요.');
  }
  if (!Number.isFinite(input.initialDistanceM) || input.initialDistanceM < 0) {
    throw new UserShoeValidationError('이미 신은 거리는 0 이상이어야 해요.');
  }
}

// 신규 등록. "구매일 = 첫 사용일"로 간주해 first_used_at을 purchase_date와 동일하게 채운다
// (별도 입력란을 두지 않음). accumulated_distance_m은 등록 시점엔 initial_distance_m과 같다.
export async function createUserShoe(userId: string, input: UserShoeInput): Promise<string> {
  validateInput(input);
  const pool = getPool();
  const { rows } = await pool.query<{ user_shoe_id: string }>(
    `INSERT INTO shoe.user_shoes
       (user_id, shoe_model_id, nickname, purchase_date, first_used_at, initial_distance_m, accumulated_distance_m, status)
     VALUES ($1, $2, $3, $4, $4, $5, $5, 'ACTIVE')
     RETURNING user_shoe_id`,
    [userId, input.shoeModelId, input.nickname?.trim() || null, input.purchaseDate, input.initialDistanceM]
  );
  return rows[0].user_shoe_id;
}

async function assertOwnsUserShoe(userShoeId: string, userId: string): Promise<void> {
  const pool = getPool();
  const { rows } = await pool.query(`SELECT 1 FROM shoe.user_shoes WHERE user_shoe_id = $1 AND user_id = $2`, [
    userShoeId,
    userId
  ]);
  if (rows.length === 0) throw new UserShoeOwnershipError('본인이 등록한 러닝화가 아니에요.');
}

export async function updateUserShoe(userId: string, userShoeId: string, input: UserShoeInput): Promise<void> {
  validateInput(input);
  await assertOwnsUserShoe(userShoeId, userId);
  const pool = getPool();
  await pool.query(
    `UPDATE shoe.user_shoes
        SET shoe_model_id = $3, nickname = $4, purchase_date = $5, first_used_at = $5, initial_distance_m = $6
      WHERE user_shoe_id = $1 AND user_id = $2`,
    [userShoeId, userId, input.shoeModelId, input.nickname?.trim() || null, input.purchaseDate, input.initialDistanceM]
  );
}

// "버리기" — 물리 삭제가 아니라 은퇴 처리(status=RETIRED). 마모 분석/수명 기록은 그대로 남는다.
export async function retireUserShoe(userId: string, userShoeId: string): Promise<void> {
  await assertOwnsUserShoe(userShoeId, userId);
  const pool = getPool();
  await pool.query(
    `UPDATE shoe.user_shoes SET status = 'RETIRED', retired_at = now() WHERE user_shoe_id = $1 AND user_id = $2 AND status <> 'RETIRED'`,
    [userShoeId, userId]
  );
}

export type EditableUserShoe = {
  userShoeId: string;
  shoeModelId: number;
  shoeName: string;
  brandName: string;
  imageUrl: string;
  nickname: string | null;
  purchaseDate: string | null;
  initialDistanceM: number;
};

export async function getEditableUserShoe(userId: string, userShoeId: string): Promise<EditableUserShoe | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT us.user_shoe_id, us.shoe_model_id, us.nickname, us.purchase_date, us.initial_distance_m,
            sc.shoe_name, sc.brand_name, sc.image_url
       FROM shoe.user_shoes us
       JOIN shoe.shoe_catalog sc ON sc.shoe_id = us.shoe_model_id
      WHERE us.user_shoe_id = $1 AND us.user_id = $2`,
    [userShoeId, userId]
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    userShoeId: row.user_shoe_id,
    shoeModelId: Number(row.shoe_model_id),
    shoeName: row.shoe_name,
    brandName: row.brand_name,
    imageUrl: row.image_url,
    nickname: row.nickname,
    purchaseDate: row.purchase_date ? toDateStr(row.purchase_date) : null,
    initialDistanceM: row.initial_distance_m
  };
}

export type ActiveUserShoeOption = { userShoeId: string; shoeName: string; brandName: string; nickname: string | null };

// 러닝 종료 화면의 "무슨 신발을 신었나요?" 선택지 — 은퇴(RETIRED)하지 않은 신발만 보여준다.
export async function getActiveUserShoeOptions(userId: string): Promise<ActiveUserShoeOption[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT us.user_shoe_id, sc.shoe_name, sc.brand_name, us.nickname
       FROM shoe.user_shoes us
       JOIN shoe.shoe_catalog sc ON sc.shoe_id = us.shoe_model_id
      WHERE us.user_id = $1 AND us.status = 'ACTIVE'
      ORDER BY us.registered_at DESC`,
    [userId]
  );
  return rows.map((row) => ({
    userShoeId: row.user_shoe_id,
    shoeName: row.shoe_name,
    brandName: row.brand_name,
    nickname: row.nickname
  }));
}
