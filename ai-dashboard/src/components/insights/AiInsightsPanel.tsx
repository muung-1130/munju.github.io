"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";

type AiInsightsResult = {
  overallAssessment: "normal" | "attention" | "concerning";
  summary: string;
  findings: { namespace: string; container: string; observation: string }[];
  recommendedActions: string[];
  logLinesAnalyzed: number;
  generatedAt: string;
  modelId: string;
};

const ASSESSMENT_META: Record<AiInsightsResult["overallAssessment"], { label: string; color: string }> = {
  normal: { label: "정상", color: "var(--status-good)" },
  attention: { label: "확인 필요", color: "var(--status-warning)" },
  concerning: { label: "우려됨", color: "var(--status-critical)" },
};

export function AiInsightsPanel() {
  const [state, setState] = useState<
    { status: "idle" } | { status: "loading" } | { status: "error"; message: string } | { status: "done"; result: AiInsightsResult }
  >({ status: "idle" });

  const generate = async () => {
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/ai-insights", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setState({ status: "error", message: body.error ?? `요청 실패 (${res.status})` });
        return;
      }
      const result = (await res.json()) as AiInsightsResult;
      setState({ status: "done", result });
    } catch {
      setState({ status: "error", message: "네트워크 오류로 요청에 실패했습니다." });
    }
  };

  return (
    <Card
      title="클러스터 로그 인사이트 (생성형 LLM)"
      subtitle="dir-* 네임스페이스 전체의 최근 warn/error 로그(Loki 실측)를 Bedrock LLM이 읽고 해석 — Prometheus 메트릭은 이 클러스터에 아직 없어 근거에 포함되지 않습니다"
      action={
        <button
          type="button"
          onClick={generate}
          disabled={state.status === "loading"}
          className="rounded-lg border px-2.5 py-1.5 text-xs font-medium disabled:opacity-50"
          style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
        >
          {state.status === "loading" ? "분석 중…" : "지금 분석"}
        </button>
      }
    >
      {state.status === "idle" && (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          &quot;지금 분석&quot;을 누르면 최근 6시간 내 warn/error 로그를 모아 LLM에게 요약·해석을 요청합니다. 시간당
          1회로 제한돼 있습니다(비용 절약, AI 진단 초안 기능과 예산 공유).
        </p>
      )}

      {state.status === "error" && (
        <p className="text-sm" style={{ color: "var(--status-critical)" }}>
          {state.message}
        </p>
      )}

      {state.status === "done" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span
              className="rounded-full px-2 py-0.5 text-xs font-semibold"
              style={{
                color: ASSESSMENT_META[state.result.overallAssessment].color,
                background: `color-mix(in oklab, ${ASSESSMENT_META[state.result.overallAssessment].color} 14%, transparent)`,
              }}
            >
              {ASSESSMENT_META[state.result.overallAssessment].label}
            </span>
            <span className="text-xs tabular" style={{ color: "var(--text-muted)" }}>
              로그 {state.result.logLinesAnalyzed}건 분석
            </span>
          </div>

          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            {state.result.summary}
          </p>

          {state.result.findings.length > 0 && (
            <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
              {state.result.findings.map((f, i) => (
                <li key={i} className="py-2 text-sm">
                  <span className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>
                    {f.namespace}/{f.container}
                  </span>
                  <p style={{ color: "var(--text-primary)" }}>{f.observation}</p>
                </li>
              ))}
            </ul>
          )}

          {state.result.recommendedActions.length > 0 && (
            <ul className="list-disc space-y-1 pl-4 text-sm" style={{ color: "var(--text-secondary)" }}>
              {state.result.recommendedActions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          )}

          <p className="text-xs tabular" style={{ color: "var(--text-muted)" }}>
            {state.result.modelId} · {new Date(state.result.generatedAt).toLocaleString("ko-KR")}
          </p>
        </div>
      )}
    </Card>
  );
}
