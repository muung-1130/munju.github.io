import { getPool } from '@/lib/db';

export class UserShoeOwnershipError extends Error {}
export class UserShoeValidationError extends Error {}

function toDateStr(value: string | Date): string {
  return typeof value === 'string' ? value : value.toISOString().slice(0, 10);
}

export type UserShoeInput = {
  shoeModelId: number | null;
  nickname: string | null;
  purchaseDate: string; // YYYY-MM-DD
};

function validateInput(input: UserShoeInput): void {
  if (input.shoeModelId !== null && (!Number.isInteger(input.shoeModelId) || input.shoeModelId <= 0)) {
    throw new UserShoeValidationError('러닝화 모델을 선택해 주세요.');
  }
  if (input.shoeModelId === null && !input.nickname?.trim()) {
    throw new UserShoeValidationError('모델을 선택하지 않은 경우 이름을 꼭 입력해 주세요.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.purchaseDate)) {
    throw new UserShoeValidationError('구매일을 선택해 주세요.');
  }
  if (input.purchaseDate > toDateStr(new Date())) {
    throw new UserShoeValidationError('구매일은 오늘 이후일 수 없어요.');
  }
}

// 신규 등록. "구매일 = 첫 사용일"로 간주해 first_used_at을 purchase_date와 동일하게 채운다
// (별도 입력란을 두지 않음). shoeModelId가 null이면(카탈로그에 없는 신발) nickname이 유일한
// 표시 이름이 되고, 썸네일은 이후 wear-analysis 업로드 시 setCustomThumbnailKey로 채워진다.
export async function createUserShoe(userId: string, input: UserShoeInput): Promise<string> {
  validateInput(input);
  const pool = getPool();
  const { rows } = await pool.query<{ user_shoe_id: string }>(
    `INSERT INTO shoe.user_shoes (user_id, shoe_model_id, nickname, purchase_date, first_used_at, status)
     VALUES ($1, $2, $3, $4, $4, 'ACTIVE')
     RETURNING user_shoe_id`,
    [userId, input.shoeModelId, input.nickname?.trim() || null, input.purchaseDate]
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
  // 카탈로그 모델이 있는 신발로 다시 바뀌면(수정 시 모델을 새로 선택) 예전에 저장해둔 커스텀
  // 썸네일은 더 이상 쓸 데가 없으므로 같이 비워준다.
  await pool.query(
    `UPDATE shoe.user_shoes
        SET shoe_model_id = $3, nickname = $4, purchase_date = $5, first_used_at = $5,
            custom_thumbnail_key = CASE WHEN $3 IS NOT NULL THEN NULL ELSE custom_thumbnail_key END
      WHERE user_shoe_id = $1 AND user_id = $2`,
    [userShoeId, userId, input.shoeModelId, input.nickname?.trim() || null, input.purchaseDate]
  );
}

// wear-analysis 업로드 성공 후, 카탈로그 모델이 없는 신발이면 방금 올린 사진 중 하나(측면)를
// 썸네일로 저장한다 — 이미 있는 사진을 재사용하므로 사용자에게 별도 업로드를 요구하지 않는다.
export async function setCustomThumbnailKey(userShoeId: string, key: string): Promise<void> {
  const pool = getPool();
  await pool.query(
    `UPDATE shoe.user_shoes SET custom_thumbnail_key = $2 WHERE user_shoe_id = $1 AND shoe_model_id IS NULL`,
    [userShoeId, key]
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
  shoeModelId: number | null;
  shoeName: string | null;
  brandName: string | null;
  imageUrl: string | null;
  hasCustomThumbnail: boolean;
  nickname: string | null;
  purchaseDate: string | null;
};

export async function getEditableUserShoe(userId: string, userShoeId: string): Promise<EditableUserShoe | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT us.user_shoe_id, us.shoe_model_id, us.nickname, us.purchase_date, us.custom_thumbnail_key,
            sc.shoe_name, sc.brand_name, sc.image_url
       FROM shoe.user_shoes us
       LEFT JOIN shoe.shoe_catalog sc ON sc.shoe_id = us.shoe_model_id
      WHERE us.user_shoe_id = $1 AND us.user_id = $2`,
    [userShoeId, userId]
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    userShoeId: row.user_shoe_id,
    shoeModelId: row.shoe_model_id !== null ? Number(row.shoe_model_id) : null,
    shoeName: row.shoe_name,
    brandName: row.brand_name,
    imageUrl: row.image_url,
    hasCustomThumbnail: !!row.custom_thumbnail_key,
    nickname: row.nickname,
    purchaseDate: row.purchase_date ? toDateStr(row.purchase_date) : null
  };
}

export type ActiveUserShoeOption = { userShoeId: string; shoeName: string | null; brandName: string | null; nickname: string | null };

// 러닝 종료 화면의 "무슨 신발을 신었나요?" 선택지 — 은퇴(RETIRED)하지 않은 신발만 보여준다.
export async function getActiveUserShoeOptions(userId: string): Promise<ActiveUserShoeOption[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT us.user_shoe_id, sc.shoe_name, sc.brand_name, us.nickname
       FROM shoe.user_shoes us
       LEFT JOIN shoe.shoe_catalog sc ON sc.shoe_id = us.shoe_model_id
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
