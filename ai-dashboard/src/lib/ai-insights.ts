import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { getLiveClusterLogSample } from "./loki";
import type { RecommendedAction } from "./ai-diagnosis";

/**
 * Cluster-wide "what do the logs mean" draft: samples recent warn/error Loki
 * lines across every dir-* namespace and asks a Bedrock model to summarize
 * them in plain language.
 *
 * There is deliberately no metrics input here. This cluster has no
 * Prometheus deployed yet (no service, and Kiali's own configured
 * dir-kps-prometheus target fails DNS lookup — confirmed live), and the
 * ADOT collector's pipeline is logs-only (see adot-config.yaml), so there
 * is no RED/resource metric signal to hand the model. Once a metrics
 * backend exists in this cluster, extend buildContext() with it rather
 * than fabricating a metrics section now.
 */

const BEDROCK_MODEL_ID = process.env.BEDROCK_MODEL_ID ?? "apac.amazon.nova-pro-v1:0";

export type AiInsightsResult = {
  overallAssessment: "normal" | "attention" | "concerning";
  summary: string;
  findings: { namespace: string; container: string; observation: string }[];
  recommendedActions: RecommendedAction[];
  logLinesAnalyzed: number;
  generatedAt: string;
  modelId: string;
};

function isBedrockConfigured(): boolean {
  // See the identical check in ai-diagnosis.ts for why EKS Pod Identity /
  // IRSA count too, not just static keys.
  return Boolean(
    process.env.AWS_BEARER_TOKEN_BEDROCK ||
      (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) ||
      process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI ||
      process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI ||
      (process.env.AWS_ROLE_ARN && process.env.AWS_WEB_IDENTITY_TOKEN_FILE),
  );
}

let client: BedrockRuntimeClient | null = null;
function getClient(): BedrockRuntimeClient {
  if (!client) {
    client = new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? "us-east-1" });
  }
  return client;
}

const SYSTEM_PROMPT = `당신은 SRE 관측 대시보드에 들어가는 로그 기반 인사이트를 작성하는 보조자입니다.
입력으로 여러 서비스의 최근 warn/error 로그 라인만 주어집니다 (Prometheus 메트릭은
이 클러스터에 아직 없어 포함되지 않았습니다 — 로그만 근거로 판단하세요).
로그에 없는 사실을 지어내지 말고, 특별한 이상 징후가 없으면 솔직하게 "normal"로 답하세요.
반복되는 패턴이나 여러 서비스에 걸친 공통 원인이 보이면 짚어주세요.
recommendedActions는 사람이 그대로 복붙해서 실행할 수 있는 kubectl 등 실제 명령어를 우선 제시하세요
(namespace는 findings에 나온 실제 namespace/container 값을 쓰세요).
명령어가 필요 없는 조치는 command를 null로 두세요.
데이터를 삭제하거나(DELETE/DROP) 되돌리기 어려운 명령어는 제안하지 마세요 — 조회·재시작·스케일 조정 수준으로 제한하세요.
반드시 아래 JSON 스키마 그대로, 다른 텍스트 없이 JSON만 출력하세요:
{
  "overallAssessment": "normal" | "attention" | "concerning",
  "summary": string (2-3문장, 한국어, 전체 상황 요약),
  "findings": [{ "namespace": string, "container": string, "observation": string }] (최대 5개, 눈에 띄는 서비스만),
  "recommendedActions": [{ "description": string (한국어, 한 문장), "command": string | null }] (0-4개)
}`;

export async function generateClusterInsights(): Promise<AiInsightsResult | null> {
  if (!isBedrockConfigured()) return null;

  try {
    const logs = await getLiveClusterLogSample(60, 6);
    if (!logs) return null;

    const contextText =
      logs.length === 0
        ? "최근 6시간 동안 dir-* 네임스페이스 전체에서 warn/error 수준 로그가 없습니다."
        : [
            `최근 6시간, dir-* 네임스페이스 전체 warn/error 로그 ${logs.length}건 (최신순):`,
            ...logs.map((l) => `[${l.namespace}/${l.container}] ${l.line.slice(0, 200)}`),
          ].join("\n");

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

    const textBlock = response.output?.message?.content?.find((b) => typeof b.text === "string");
    if (!textBlock?.text) return null;

    const jsonText = textBlock.text.replace(/^```(?:json)?\s*/, "").replace(/```\s*$/, "");
    const parsed = JSON.parse(jsonText) as Omit<AiInsightsResult, "generatedAt" | "modelId" | "logLinesAnalyzed">;

    return {
      ...parsed,
      logLinesAnalyzed: logs.length,
      generatedAt: new Date().toISOString(),
      modelId: BEDROCK_MODEL_ID,
    };
  } catch {
    return null;
  }
}
