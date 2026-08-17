import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadBucketCommand, CreateBucketCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const MEDIA_BUCKET = process.env.MEDIA_MINIO_BUCKET ?? 'runspot-media';

let client: S3Client | undefined;

function getClient(): S3Client {
  if (!client) {
    client = new S3Client({
      endpoint: process.env.MINIO_ENDPOINT,
      region: process.env.MINIO_REGION ?? 'us-east-1',
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.MINIO_ACCESS_KEY!,
        secretAccessKey: process.env.MINIO_SECRET_KEY!
      }
    });
  }
  return client;
}

// 이 서비스가 소유하는 버킷이 없으면 처음 뜰 때 만든다 — shoe-life-ai 등 다른 서비스가 쓰는
// 버킷(runspot-shoe-life-images)과는 분리된, media 스키마 전용 범용 버킷이다.
export async function ensureBucketExists(): Promise<void> {
  const s3 = getClient();
  try {
    await s3.send(new HeadBucketCommand({ Bucket: MEDIA_BUCKET }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: MEDIA_BUCKET }));
    console.log(`[media-service] bucket 생성됨: ${MEDIA_BUCKET}`);
  }
}

export async function presignPutUrl(objectKey: string, contentType: string, expiresInSec = 300): Promise<string> {
  const s3 = getClient();
  const command = new PutObjectCommand({ Bucket: MEDIA_BUCKET, Key: objectKey, ContentType: contentType });
  return getSignedUrl(s3, command, { expiresIn: expiresInSec });
}

export async function presignGetUrl(objectKey: string, expiresInSec = 300): Promise<string> {
  const s3 = getClient();
  const command = new GetObjectCommand({ Bucket: MEDIA_BUCKET, Key: objectKey });
  return getSignedUrl(s3, command, { expiresIn: expiresInSec });
}

export async function deleteObject(objectKey: string): Promise<void> {
  const s3 = getClient();
  await s3.send(new DeleteObjectCommand({ Bucket: MEDIA_BUCKET, Key: objectKey })).catch(() => {
    // 아직 업로드가 안 됐을 수도 있으므로(PENDING인 채로 discard) 삭제 실패는 무시한다.
  });
}
