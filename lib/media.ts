import { getPool } from '@/lib/db';

export type MediaDomainType = 'PROFILE' | 'COURSE' | 'POSTURE' | 'SHOE' | 'CHAT' | 'CHALLENGE' | 'MARATHON';

// media.media_objects는 바이너리 자체가 아니라 실제 오브젝트 스토리지(MinIO/S3)에 저장된
// 파일의 메타데이터만 갖는다 — 업로드 상태(PENDING→READY/REJECTED) 추적용.
export async function createPendingMediaObject(params: {
  ownerUserId: string;
  domainType: MediaDomainType;
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

export async function markMediaObjectReady(mediaId: string): Promise<void> {
  const pool = getPool();
  await pool.query(
    `UPDATE media.media_objects SET status = 'READY', uploaded_at = NOW() WHERE media_id = $1`,
    [mediaId]
  );
}

// 분석이 완료되지 못한 경우(재촬영 필요/차단/오류) 실제로는 아무 오브젝트도 저장되지 않으므로
// 고아 레코드를 남기지 않도록 media_objects 행 자체를 지운다.
export async function discardMediaObject(mediaId: string): Promise<void> {
  const pool = getPool();
  await pool.query(`DELETE FROM media.media_objects WHERE media_id = $1`, [mediaId]);
}
