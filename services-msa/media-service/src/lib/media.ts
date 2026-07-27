import { randomUUID } from 'crypto';
import { getPool } from './db.js';
import { MEDIA_BUCKET, presignGetUrl, presignPutUrl, deleteObject } from './s3.js';

// 자세 분석(Posture Analysis)은 제품 범위에서 제외돼서 도메인 타입에 넣지 않는다 —
// DB의 chk_media_domain 제약에는 아직 POSTURE 값이 남아있지만(별도 마이그레이션 필요),
// 이 서비스가 실제로 그 값을 만들어내는 일은 없다.
export type MediaDomainType = 'PROFILE' | 'COURSE' | 'SHOE' | 'CHAT' | 'CHALLENGE' | 'MARATHON';
export type MediaStatus = 'PENDING' | 'SCANNING' | 'READY' | 'REJECTED';

export type MediaObjectRow = {
  media_id: string;
  owner_user_id: string;
  domain_type: MediaDomainType;
  bucket_name: string;
  object_key: string;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  status: MediaStatus;
  uploaded_at: string | null;
  created_at: string;
};

export class MediaNotFoundError extends Error {}
export class MediaOwnershipError extends Error {}

async function getRow(mediaId: string): Promise<MediaObjectRow | null> {
  const pool = getPool();
  const { rows } = await pool.query<MediaObjectRow>(
    `SELECT media_id, owner_user_id, domain_type, bucket_name, object_key, original_filename,
            content_type, size_bytes, status, uploaded_at, created_at
       FROM media.media_objects WHERE media_id = $1 AND deleted_at IS NULL`,
    [mediaId]
  );
  return rows[0] ?? null;
}

async function assertOwnership(mediaId: string, userId: string): Promise<MediaObjectRow> {
  const row = await getRow(mediaId);
  if (!row) throw new MediaNotFoundError('미디어를 찾을 수 없어요.');
  if (row.owner_user_id !== userId) throw new MediaOwnershipError('본인 소유의 미디어가 아니에요.');
  return row;
}

// --- 브라우저 직접 업로드용(presigned URL) ---
// 클라이언트가 이 서비스 자체 버킷(MEDIA_BUCKET)에 직접 PUT하고, 완료되면 /complete을 부른다.
export async function createUploadSlot(params: {
  ownerUserId: string;
  domainType: MediaDomainType;
  contentType: string;
  originalFilename: string;
  sizeBytes: number;
}): Promise<{ mediaId: string; uploadUrl: string; objectKey: string; bucketName: string; expiresInSec: number }> {
  const objectKey = `${params.domainType.toLowerCase()}/${params.ownerUserId}/${randomUUID()}-${params.originalFilename}`;
  const pool = getPool();
  const { rows } = await pool.query<{ media_id: string }>(
    `INSERT INTO media.media_objects
       (owner_user_id, domain_type, bucket_name, object_key, original_filename, content_type, size_bytes, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING')
     RETURNING media_id`,
    [params.ownerUserId, params.domainType, MEDIA_BUCKET, objectKey, params.originalFilename, params.contentType, params.sizeBytes]
  );
  const mediaId = rows[0].media_id;
  const expiresInSec = 300;
  const uploadUrl = await presignPutUrl(objectKey, params.contentType, expiresInSec);
  return { mediaId, uploadUrl, objectKey, bucketName: MEDIA_BUCKET, expiresInSec };
}

export async function completeUpload(mediaId: string, userId: string): Promise<void> {
  await assertOwnership(mediaId, userId);
  const pool = getPool();
  await pool.query(`UPDATE media.media_objects SET status = 'READY', uploaded_at = NOW() WHERE media_id = $1`, [mediaId]);
}

export async function discardUpload(mediaId: string, userId: string): Promise<void> {
  const row = await assertOwnership(mediaId, userId);
  await deleteObject(row.object_key);
  const pool = getPool();
  await pool.query(`DELETE FROM media.media_objects WHERE media_id = $1`, [mediaId]);
}

export async function getMediaWithDownloadUrl(
  mediaId: string,
  userId: string
): Promise<{ mediaId: string; domainType: string; status: string; originalFilename: string; contentType: string; downloadUrl: string | null }> {
  const row = await assertOwnership(mediaId, userId);
  const downloadUrl = row.status === 'READY' ? await presignGetUrl(row.object_key) : null;
  return {
    mediaId: row.media_id,
    domainType: row.domain_type,
    status: row.status,
    originalFilename: row.original_filename,
    contentType: row.content_type,
    downloadUrl
  };
}

// --- 서비스 간 내부 호출용 ---
// shoe-service처럼 자기 자신의 버킷/키를 이미 갖고 있고(예: shoe-life-ai가 직접 올리는 버킷),
// media.media_objects에는 북키핑만 필요한 호출자를 위한 것 — 소유권 검사 없이 호출자가 준 그대로 믿는다.
export async function createPendingMediaObjectInternal(params: {
  ownerUserId: string;
  domainType: string;
  bucketName: string;
  objectKey: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
}): Promise<string> {
  const pool = getPool();
  const { rows } = await pool.query<{ media_id: string }>(
    `INSERT INTO media.media_objects
       (owner_user_id, domain_type, bucket_name, object_key, original_filename, content_type, size_bytes, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING')
     RETURNING media_id`,
    [
      params.ownerUserId,
      params.domainType,
      params.bucketName,
      params.objectKey,
      params.originalFilename,
      params.contentType,
      params.sizeBytes
    ]
  );
  return rows[0].media_id;
}

export async function markMediaObjectReadyInternal(mediaId: string): Promise<void> {
  const pool = getPool();
  await pool.query(`UPDATE media.media_objects SET status = 'READY', uploaded_at = NOW() WHERE media_id = $1`, [mediaId]);
}

export async function discardMediaObjectInternal(mediaId: string): Promise<void> {
  const pool = getPool();
  await pool.query(`DELETE FROM media.media_objects WHERE media_id = $1`, [mediaId]);
}
