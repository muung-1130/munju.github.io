"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";

type RecommendedAction = { description: string; command: string | null };

type AiDiagnosisResult = {
  severity: "info" | "warning" | "critical";
  confidencePct: number;
  rootCauseHypothesis: string;
  narrative: string;
  recommendedActions: RecommendedAction[];
  generatedAt: string;
  modelId: string;
};

const SEVERITY_COLOR: Record<AiDiagnosisResult["severity"], string> = {
  info: "var(--status-good)",
  warning: "var(--status-warning)",
  critical: "var(--status-critical)",
};

function RecommendedActions({ actions }: { actions: RecommendedAction[] }) {
  if (actions.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        권장 조치
      </p>
      <ul className="space-y-2">
        {actions.map((a, i) => (
          <li key={i} className="text-sm">
            <p style={{ color: "var(--text-secondary)" }}>{a.description}</p>
            {a.command && (
              <pre
                className="mt-1 overflow-x-auto rounded-lg px-3 py-2 font-mono text-xs"
                style={{ background: "var(--surface-2)", color: "var(--text-primary)" }}
              >
                {a.command}
              </pre>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AiDiagnosisPanel({
  containerJob,
  initialResult,
}: {
  containerJob: string | null;
  initialResult: AiDiagnosisResult | null;
}) {
  const [state, setState] = useState<
    { status: "idle" } | { status: "loading" } | { status: "error"; message: string } | { status: "done"; result: AiDiagnosisResult }
  >(initialResult ? { status: "done", result: initialResult } : { status: "idle" });

  const generate = async () => {
    if (!containerJob) return;
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/ai-diagnosis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ containerJob }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setState({ status: "error", message: body.error ?? `요청 실패 (${res.status})` });
        return;
      }
      const result = (await res.json()) as AiDiagnosisResult;
      setState({ status: "done", result });
    } catch {
      setState({ status: "error", message: "네트워크 오류로 요청에 실패했습니다." });
    }
  };

  return (
    <Card
      title="AI 진단 초안 (생성형 LLM)"
      subtitle="Loki 실측 신호를 근거로 Bedrock LLM이 그 자리에서 작성 — 학습된 이상탐지 모델이 아닌 초안입니다"
      action={
        <button
          type="button"
          onClick={generate}
          disabled={!containerJob || state.status === "loading"}
          className="rounded-lg border px-2.5 py-1.5 text-xs font-medium disabled:opacity-50"
          style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
        >
          {state.status === "loading" ? "생성 중…" : state.status === "done" ? "재분석" : "초안 생성"}
        </button>
      }
    >
      {!containerJob && (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          이 서비스는 실측 컨테이너 매핑이 없어 AI 진단 초안을 생성할 신호가 없습니다.
        </p>
      )}

      {containerJob && state.status === "idle" && (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          &quot;초안 생성&quot;을 누르면 이 서비스의 최근 로그를 모아 LLM에게 진단을 요청합니다. 결과는 다시
          분석하기 전까지 계속 보입니다.
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
                color: SEVERITY_COLOR[state.result.severity],
                background: `color-mix(in oklab, ${SEVERITY_COLOR[state.result.severity]} 14%, transparent)`,
              }}
            >
              {state.result.severity.toUpperCase()}
            </span>
            <span className="text-xs tabular" style={{ color: "var(--text-muted)" }}>
              신뢰도 {state.result.confidencePct.toFixed(0)}%
            </span>
          </div>

          <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            {state.result.rootCauseHypothesis}
          </p>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            {state.result.narrative}
          </p>

          <RecommendedActions actions={state.result.recommendedActions} />

          <p className="text-xs tabular" style={{ color: "var(--text-muted)" }}>
            {state.result.modelId} · {new Date(state.result.generatedAt).toLocaleString("ko-KR")}
          </p>
        </div>
      )}
    </Card>
  );
}
