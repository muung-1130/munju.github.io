import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { gunzipSync } from "zlib";
import { NextResponse } from "next/server";

const s3 = new S3Client({ region: "ap-northeast-2" });

async function getRecentLogs(bucket: string, prefix: string, limit: number) {
  const list = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, MaxKeys: 50 }));
  const sorted = (list.Contents || [])
    .sort((a, b) => (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0))
    .slice(0, limit);

  const results: string[] = [];
  for (const obj of sorted) {
    if (!obj.Key) continue;
    const file = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: obj.Key }));
    const bytes = await file.Body?.transformToByteArray();
    if (!bytes) continue;
    results.push(gunzipSync(Buffer.from(bytes)).toString("utf-8"));
  }
  return results;
}

export async function GET() {
  const cloudtrail = await getRecentLogs(
    "dir-main-cloudtrail-logs-20260814051339588300000002",
    "AWSLogs/970307871446/CloudTrail/",
    3
  );
  const vpcflow = await getRecentLogs(
    "dir-main-vpc-flow-logs-20260814051339587300000001",
    "AWSLogs/970307871446/vpcflowlogs/ap-northeast-2/",
    3
  );

  const cloudtrailEvents = cloudtrail
    .flatMap((f) => { try { return JSON.parse(f).Records ?? []; } catch { return []; } })
    .slice(0, 20);

  const vpcflowLines = vpcflow
    .flatMap((f) => f.trim().split("\n").slice(1))
    .slice(0, 20);

  return NextResponse.json({ cloudtrailEvents, vpcflowLines });
}
