import { describe, it, expect, vi, beforeEach } from "vitest";
import { gzipSync } from "zlib";

const { mockSend } = vi.hoisted(() => {
  return { mockSend: vi.fn() };
});

type MockCommand = { __type: string; input: { Bucket: string; [key: string]: unknown } };

vi.mock("@aws-sdk/client-s3", () => {
  return {
    S3Client: vi.fn().mockImplementation(function () {
      return { send: mockSend };
    }),
    ListObjectsV2Command: vi.fn().mockImplementation(function (input: Record<string, unknown>) {
      return { __type: "ListObjectsV2Command", input };
    }),
    GetObjectCommand: vi.fn().mockImplementation(function (input: Record<string, unknown>) {
      return { __type: "GetObjectCommand", input };
    }),
  };
});

import { GET } from "./route";

describe("GET /api/security-events", () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  it("returns parsed CloudTrail events and VPC flow log lines", async () => {
    const cloudtrailRecord = {
      Records: [
        {
          eventTime: "2026-08-14T08:00:43Z",
          eventName: "AssumeRole",
          eventSource: "sts.amazonaws.com",
          userIdentity: { arn: "arn:aws:sts::123:assumed-role/test" },
        },
      ],
    };
    const cloudtrailGz = gzipSync(Buffer.from(JSON.stringify(cloudtrailRecord)));
    const vpcflowText =
      "version account eni\n2 970307871446 eni-abc - - - - - - - 1786691700 1786691761 - NODATA";
    const vpcflowGz = gzipSync(Buffer.from(vpcflowText));

    mockSend.mockImplementation(async (command: MockCommand) => {
      if (command.__type === "ListObjectsV2Command") {
        const isCloudtrail = command.input.Bucket.includes("cloudtrail");
        return {
          Contents: [
            { Key: isCloudtrail ? "a.json.gz" : "b.log.gz", LastModified: new Date("2026-08-14T09:00:00Z") },
          ],
        };
      }
      if (command.__type === "GetObjectCommand") {
        const isCloudtrail = command.input.Bucket.includes("cloudtrail");
        const bytes = isCloudtrail ? cloudtrailGz : vpcflowGz;
        return { Body: { transformToByteArray: async () => new Uint8Array(bytes) } };
      }
      throw new Error("unexpected command");
    });

    const res = await GET();
    const json = await res.json();

    expect(json.cloudtrailEvents).toHaveLength(1);
    expect(json.cloudtrailEvents[0].eventName).toBe("AssumeRole");
    expect(json.vpcflowLines.length).toBeGreaterThan(0);
  });

  it("returns empty arrays when S3 has no objects", async () => {
    mockSend.mockImplementation(async () => ({ Contents: [] }));
    const res = await GET();
    const json = await res.json();
    expect(json.cloudtrailEvents).toEqual([]);
    expect(json.vpcflowLines).toEqual([]);
  });

  it("skips CloudTrail files that fail to parse as JSON", async () => {
    mockSend.mockImplementation(async (command: MockCommand) => {
      if (command.__type === "ListObjectsV2Command") {
        return { Contents: [{ Key: "bad.json.gz", LastModified: new Date() }] };
      }
      const bad = gzipSync(Buffer.from("not json"));
      return { Body: { transformToByteArray: async () => new Uint8Array(bad) } };
    });
    const res = await GET();
    const json = await res.json();
    expect(json.cloudtrailEvents).toEqual([]);
  });
});
