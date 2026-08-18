import { generateAiDiagnosis } from "@/lib/ai-diagnosis";
import { checkAiDiagnosisRateLimit, recordAiDiagnosisCall } from "@/lib/ai-diagnosis-limit";
import { postAiDiagnosisToSlack } from "@/lib/slack";

export async function POST(request: Request) {
  let body: { containerJob?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  const containerJob = typeof body.containerJob === "string" ? body.containerJob : null;
  if (!containerJob) {
    return Response.json({ error: "containerJob is required" }, { status: 400 });
  }

  const limit = await checkAiDiagnosisRateLimit();
  if (!limit.allowed) {
    return Response.json({ error: limit.reason }, { status: 429 });
  }

  const result = await generateAiDiagnosis(containerJob);
  if (!result) {
    return Response.json(
      { error: "AI diagnosis not available (Bedrock not configured, or the call failed)" },
      { status: 503 },
    );
  }

  // Only mark the hour "used" on an actual successful (billed) call — a
  // rejection above never reaches here, and a downstream Bedrock failure
  // already returned null before this point.
  await recordAiDiagnosisCall(containerJob);
  await postAiDiagnosisToSlack(containerJob, result);

  return Response.json(result);
}
