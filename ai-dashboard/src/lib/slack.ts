import type { AiDiagnosisResult } from "./ai-diagnosis";

/**
 * Posts AI diagnosis results to Slack via the same kind of Incoming Webhook
 * Alertmanager uses (monitoring/alertmanager/secrets/slack_webhook_url) —
 * a separate call from this app, not routed through Alertmanager, since
 * these are LLM drafts, not rule-evaluated alerts. Best-effort: a failed
 * Slack post never fails the API response, since the diagnosis itself
 * already succeeded and the caller shouldn't lose it over a Slack hiccup.
 */

const SEVERITY_EMOJI: Record<AiDiagnosisResult["severity"], string> = {
  info: "ℹ️",
  warning: "🟡",
  critical: "🔴",
};

export async function postAiDiagnosisToSlack(containerJob: string, result: AiDiagnosisResult): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;

  const actions =
    result.recommendedActions.length > 0
      ? "\n권장 조치:\n" + result.recommendedActions.map((a) => `• ${a}`).join("\n")
      : "";

  const text = [
    `🤖 *[AI 진단 초안]* ${containerJob} — ${SEVERITY_EMOJI[result.severity]} ${result.severity.toUpperCase()} (신뢰도 ${result.confidencePct.toFixed(0)}%)`,
    `*가설*: ${result.rootCauseHypothesis}`,
    result.narrative,
    actions,
    `_${result.modelId} · 생성형 LLM 초안입니다 — 학습된 이상탐지 모델이 아니므로 검증 후 판단하세요._`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // best-effort, see file docblock
  }
}
