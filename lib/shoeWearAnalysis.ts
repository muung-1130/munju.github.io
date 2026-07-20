import { randomUUID } from 'crypto';
import { getPool } from '@/lib/db';
import { createPendingMediaObject, discardMediaObject, markMediaObjectReady } from '@/lib/media';

const SHOE_LIFE_AI_URL = process.env.SHOE_LIFE_AI_SERVICE_URL ?? 'http://192.168.0.201:8002';
const SHOE_LIFE_MINIO_BUCKET = process.env.SHOE_LIFE_MINIO_BUCKET ?? 'runspot-shoe-life-images';

export const WEAR_IMAGE_ROLES = ['left_outsole', 'right_outsole', 'heels', 'left_side', 'right_side'] as const;
export type WearImageRole = (typeof WEAR_IMAGE_ROLES)[number];

export type WearImageInput = {
  buffer: Buffer;
  filename: string;
  contentType: string;
};

export class ShoeOwnershipError extends Error {}

async function assertOwnsShoe(userShoeId: string, userId: string): Promise<void> {
  const pool = getPool();
  const { rows } = await pool.query(`SELECT 1 FROM shoe.user_shoes WHERE user_shoe_id = $1 AND user_id = $2`, [
    userShoeId,
    userId
  ]);
  if (rows.length === 0) throw new ShoeOwnershipError('본인이 등록한 러닝화가 아니에요.');
}

// shoe-life-ai(FastAPI, Bedrock Nova 비전 분석)를 호출해 마모도/잔여 수명을 분석한다.
// 분석 성공(COMPLETED) 시 이미지 저장·shoe.shoe_wear_analyses/shoe_life_snapshots 기록은
// shoe-life-ai가 자기 책임으로 직접 수행한다 — 여기서는 media.media_objects 북키핑과
// AI 서비스 호출만 담당한다(shoe 스키마 쓰기는 shoe-life-ai가 소유).
export async function requestShoeWearAnalysis(params: {
  userId: string;
  userShoeId: string;
  purchaseDate: string;
  images: Record<WearImageRole, WearImageInput>;
}): Promise<{ httpStatus: number; body: any }> {
  await assertOwnsShoe(params.userShoeId, params.userId);

  const totalSize = WEAR_IMAGE_ROLES.reduce((sum, role) => sum + params.images[role].buffer.byteLength, 0);
  const mediaId = await createPendingMediaObject({
    ownerUserId: params.userId,
    domainType: 'SHOE',
    bucketName: SHOE_LIFE_MINIO_BUCKET,
    objectKey: `shoe-life-analyses/${params.userId}/${randomUUID()}`,
    originalFilename: 'shoe_wear_photos_5.zip',
    contentType: 'multipart/mixed',
    sizeBytes: totalSize
  });

  try {
    const form = new FormData();
    for (const role of WEAR_IMAGE_ROLES) {
      const image = params.images[role];
      form.append(role, new Blob([image.buffer], { type: image.contentType }), image.filename);
    }
    form.append('purchase_date', params.purchaseDate);
    form.append('user_id', params.userId);
    form.append('my_shoe_id', params.userShoeId);
    form.append('input_media_id', mediaId);

    const response = await fetch(`${SHOE_LIFE_AI_URL}/api/analyze`, { method: 'POST', body: form });
    const body = await response.json();

    if (response.ok && body?.status === 'COMPLETED') {
      await markMediaObjectReady(mediaId);
    } else {
      // RETAKE_REQUIRED/SAFETY_BLOCKED/ANALYSIS_REJECTED는 실제로 아무 것도 저장되지 않았으므로 정리한다.
      await discardMediaObject(mediaId);
    }
    return { httpStatus: response.status, body };
  } catch (error) {
    await discardMediaObject(mediaId);
    throw error;
  }
}
