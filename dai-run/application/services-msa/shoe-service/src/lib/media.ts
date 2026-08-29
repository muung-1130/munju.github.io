export type MediaDomainType = 'PROFILE' | 'COURSE' | 'SHOE' | 'CHAT' | 'CHALLENGE' | 'MARATHON';

const MEDIA_SERVICE_URL = process.env.MEDIA_SERVICE_URL ?? 'http://media-service:4000';
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET!;

// media.media_objects는 이제 media-service가 소유한다 — 이 서비스는 자기 버킷(shoe-life-ai가
// 직접 올리는 runspot-shoe-life-images)의 북키핑만 media-service의 서비스 간 전용 API로 위임한다.
export async function createPendingMediaObject(params: {
  ownerUserId: string;
  domainType: MediaDomainType;
  bucketName: string;
  objectKey: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
}): Promise<string> {
  const res = await fetch(`${MEDIA_SERVICE_URL}/api/internal/media/pending`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-secret': INTERNAL_API_SECRET },
    body: JSON.stringify(params)
  });
  if (!res.ok) throw new Error(`media-service pending 생성 실패: ${res.status}`);
  const body = await res.json();
  return body.mediaId;
}

export async function markMediaObjectReady(mediaId: string): Promise<void> {
  const res = await fetch(`${MEDIA_SERVICE_URL}/api/internal/media/${mediaId}/ready`, {
    method: 'POST',
    headers: { 'x-internal-secret': INTERNAL_API_SECRET }
  });
  if (!res.ok) throw new Error(`media-service ready 처리 실패: ${res.status}`);
}

export async function discardMediaObject(mediaId: string): Promise<void> {
  const res = await fetch(`${MEDIA_SERVICE_URL}/api/internal/media/${mediaId}/discard`, {
    method: 'POST',
    headers: { 'x-internal-secret': INTERNAL_API_SECRET }
  });
  if (!res.ok) throw new Error(`media-service discard 처리 실패: ${res.status}`);
}
