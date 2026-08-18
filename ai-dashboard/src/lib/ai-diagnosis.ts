import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { getLiveServiceRed } from "./otel-metrics";
import { getLiveLogs } from "./loki";
import { getLiveTraces } from "./tempo";
import { getLiveContainerResourceByName } from "./live";
import { getLiveAlertRuleStates } from "./prometheus-alerts";

/**
 * On-demand AI diagnosis draft: gathers this service's real MELT signals
 * (already-live Prometheus/Loki/Tempo data — no new collection) and asks a
 * Bedrock model to draft a root-cause hypothesis from them.
 *
 * Uses the Converse API (@aws-sdk/client-bedrock-runtime) rather than a
 * provider-specific SDK — Converse's request/response shape is the same
 * across Anthropic Claude, Amazon Nova, and every other Bedrock model, so
 * switching providers is a one-line env var change (BEDROCK_MODEL_ID), not
 * a code change.
 *
 * This intentionally is NOT a trained anomaly-detection model — there isn't
 * yet 2 weeks of labeled incident history to train one on (see
 * docs/ai-diagnosis-integration-guide.md §6). A generative model reading the
 * current signals directly is the pragmatic first step; swapping in a real
 * model later only means replacing this function's body, not any caller.
 *
 * Returns null (never throws) when AWS credentials/model id aren't
 * configured or the call fails, so callers can show an honest "not
 * configured yet" state — the same fallback shape used by every other
 * getLive*() function in this codebase.
 */

// Nova Pro on-demand: ~$0.95/1M input, $3.80/1M output tokens (ap-northeast-2,
// checked against AWS's public Price List API) — roughly 3-20x cheaper than
// Claude here and plenty capable for reading RED/log/trace signals into a
// draft. Needs the *inference profile* id, not the bare foundation-model id
// (`amazon.nova-pro-v1:0` alone gets rejected: "on-demand throughput isn't
// supported" — confirmed via `aws bedrock list-inference-profiles`).
const BEDROCK_MODEL_ID = process.env.BEDROCK_MODEL_ID ?? "apac.amazon.nova-pro-v1:0";

export type AiDiagnosisResult = {
  severity: "info" | "warning" | "critical";
  confidencePct: number;
  rootCauseHypothesis: string;
  narrative: string;
  recommendedActions: string[];
  generatedAt: string;
  modelId: string;
};

function isBedrockConfigured(): boolean {
  // Either auth mode works: a Bedrock API key (bearer token, the SDK reads
  // AWS_BEARER_TOKEN_BEDROCK itself) or a classic IAM access key pair.
  return Boolean(
    process.env.AWS_BEARER_TOKEN_BEDROCK || (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY),
  );
}

let client: BedrockRuntimeClient | null = null;
function getClient(): BedrockRuntimeClient {
  if (!client) {
    client = new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? "us-east-1" });
  }
  return client;
}

function buildContext(
  containerJob: string,
  red: Awaited<ReturnType<typeof getLiveServiceRed>>,
  logs: Awaited<ReturnType<typeof getLiveLogs>>,
  traces: Awaited<ReturnType<typeof getLiveTraces>>,
  resource: Awaited<ReturnType<typeof getLiveContainerResourceByName>>,
  relatedAlerts: { name: string; state: string }[],
): string {
  const lines: string[] = [`서비스(container/job): ${containerJob}`];

  if (red) {
    lines.push(
      `- RPS: ${red.rpsNow.toFixed(2)}/s, 5xx 오류율: ${red.errorRatioPctNow.toFixed(2)}%, p95 지연: ${red.p95Ms !== null ? `${red.p95Ms.toFixed(0)}ms` : "N/A"} (최근 1시간 rate)`,
    );
  } else {
    lines.push("- RED 지표: 수집 안 됨 (OTel 계측 없음 또는 트래픽 없음)");
  }

  if (resource) {
    lines.push(`- 컨테이너 리소스: CPU ${resource.cpuCores.toFixed(3)} core, Memory ${resource.memoryMb.toFixed(0)}MB`);
  }

  if (relatedAlerts.length > 0) {
    lines.push(`- 관련 Prometheus Alert 상태: ${relatedAlerts.map((a) => `${a.name}=${a.state}`).join(", ")}`);
  } else {
    lines.push("- 관련 Prometheus Alert: 없음 (규칙 기반 임계치 정상)");
  }

  if (logs && logs.length > 0) {
    lines.push(`- 최근 로그 ${logs.length}건 (최신순, 최대 15건):`);
    for (const l of logs.slice(0, 15)) {
      lines.push(`  [${l.level ?? "?"}] ${l.line.slice(0, 200)}`);
    }
  } else {
    lines.push("- 최근 로그: 없음");
  }

  if (traces && traces.length > 0) {
    lines.push(`- 최근 trace ${traces.length}건 (최대 5건):`);
    for (const t of traces.slice(0, 5)) {
      lines.push(`  ${t.rootTraceName}: duration=${t.durationMs}ms, ${t.minutesAgo}분 전`);
    }
  } else {
    lines.push("- 최근 trace: 없음");
  }

  return lines.join("\n");
}

const SYSTEM_PROMPT = `당신은 SRE 관측 대시보드에 들어가는 1차 진단 초안을 작성하는 보조자입니다.
아래 실측 신호(Prometheus/Loki/Tempo/cAdvisor)만 근거로 사용하고, 신호에 없는 사실을 지어내지 마세요.
이상 징후가 없으면 솔직하게 낮은 confidence와 severity "info"로 답하세요.
반드시 아래 JSON 스키마 그대로, 다른 텍스트 없이 JSON만 출력하세요:
{
  "severity": "info" | "warning" | "critical",
  "confidencePct": number (0-100),
  "rootCauseHypothesis": string (한 문장),
  "narrative": string (2-4문장, 한국어),
  "recommendedActions": string[] (0-4개, 한국어)
}`;

export async function generateAiDiagnosis(containerJob: string): Promise<AiDiagnosisResult | null> {
  if (!isBedrockConfigured()) return null;

  try {
    const [red, logs, traces, resource, alertMap] = await Promise.all([
      getLiveServiceRed(containerJob),
      getLiveLogs(containerJob, 15),
      getLiveTraces(containerJob, 5),
      getLiveContainerResourceByName(containerJob),
      getLiveAlertRuleStates(),
    ]);

    const relatedAlerts = alertMap
      ? Array.from(alertMap.values())
          .filter((rule) => rule.instances.some((i) => i.labels.job === containerJob))
          .map((rule) => ({ name: rule.name, state: rule.instances.find((i) => i.labels.job === containerJob)!.state }))
      : [];

    const contextText = buildContext(containerJob, red, logs, traces, resource, relatedAlerts);

    const response = await Promise.race([
      getClient().send(
        new ConverseCommand({
          modelId: BEDROCK_MODEL_ID,
          system: [{ text: SYSTEM_PROMPT }],
          messages: [{ role: "user", content: [{ text: contextText }] }],
          inferenceConfig: { maxTokens: 1024 },
        }),
      ),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("bedrock timeout")), 20_000)),
    ]);

    // Some models (e.g. Claude with extended thinking) return non-text
    // blocks (reasoningContent, etc.) alongside the text — find the text
    // block regardless of position or how many other blocks exist.
    const textBlock = response.output?.message?.content?.find((b) => typeof b.text === "string");
    if (!textBlock?.text) return null;

    // Models tend to wrap JSON in a ```json fence despite being told not
    // to; strip it rather than fight the prompt further.
    const jsonText = textBlock.text.replace(/^```(?:json)?\s*/, "").replace(/```\s*$/, "");
    const parsed = JSON.parse(jsonText) as Omit<AiDiagnosisResult, "generatedAt" | "modelId">;

    return {
      ...parsed,
      generatedAt: new Date().toISOString(),
      modelId: BEDROCK_MODEL_ID,
    };
  } catch {
    return null;
  }
}
