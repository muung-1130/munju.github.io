import { generateClusterInsights } from "@/lib/ai-insights";
import { checkAiDiagnosisRateLimit, recordAiDiagnosisCall } from "@/lib/ai-diagnosis-limit";
import { saveInsights } from "@/lib/ai-results-store";

// Shares the same hourly budget/business-hours gate as /api/ai-diagnosis —
// that limiter already caps the whole dashboard to one Bedrock call per
// clock hour regardless of which service triggered it, so folding this
// feature into the same bucket (under a sentinel job name) keeps the one
// cost-control mechanism authoritative instead of adding a second cap that
// could double the effective spend.
const INSIGHTS_JOB_SENTINEL = "__cluster-insights__";

export async function POST() {
  const limit = await checkAiDiagnosisRateLimit();
  if (!limit.allowed) {
    return Response.json({ error: limit.reason }, { status: 429 });
  }

  const result = await generateClusterInsights();
  if (!result) {
    return Response.json(
      { error: "AI insights not available (Bedrock not configured, Loki unreachable, or the call failed)" },
      { status: 503 },
    );
  }

  await recordAiDiagnosisCall(INSIGHTS_JOB_SENTINEL);
  await saveInsights(result);

  return Response.json(result);
}
