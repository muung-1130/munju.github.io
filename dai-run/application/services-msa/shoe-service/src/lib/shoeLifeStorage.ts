import { S3Client, DeleteObjectsCommand } from '@aws-sdk/client-s3';

const SHOE_LIFE_MINIO_BUCKET = process.env.SHOE_LIFE_MINIO_BUCKET ?? 'runspot-shoe-life-images';

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

// user_shoes 하드 삭제 시 shoe-life-ai가 직접 올려둔 마모 분석 원본 사진을 함께 지운다.
// S3 DeleteObjects는 한 번에 최대 1000개까지 지원하므로 배치로 나눈다.
export async function deleteShoeLifeImages(objectKeys: string[]): Promise<void> {
  const keys = [...new Set(objectKeys.filter(Boolean))];
  if (keys.length === 0) return;
  const s3 = getClient();
  for (let i = 0; i < keys.length; i += 1000) {
    const batch = keys.slice(i, i + 1000);
    await s3.send(
      new DeleteObjectsCommand({
        Bucket: SHOE_LIFE_MINIO_BUCKET,
        Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true }
      })
    );
  }
}
