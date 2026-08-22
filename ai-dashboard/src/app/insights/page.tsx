import { Topbar } from "@/components/layout/Topbar";
import { AiInsightsPanel } from "@/components/insights/AiInsightsPanel";

export default function InsightsPage() {
  return (
    <>
      <Topbar title="AI Insights" subtitle="Loki 로그를 Bedrock LLM이 해석 — Prometheus 메트릭 연동은 아직 없음" />
      <main className="flex-1 space-y-4 p-4 md:p-6">
        <AiInsightsPanel />
      </main>
    </>
  );
}
