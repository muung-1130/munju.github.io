# AI 진단·예측 실측 연동 가이드

이 문서는 `dai-run-ai-dashboard`에서 아직 시뮬레이션으로 남아있는 두 영역 —
**AI 이상 진단**(Incident 근거·헤드라인·권장 조치)과 **AI 예측**(트래픽 예측,
AI 권장 replica) — 을 실제 데이터 파이프라인으로 교체하는 방법을 정리합니다.

나머지 MELT 데이터(RPS·p95·오류율·로그·트레이스·컨테이너 리소스·DB·Redis·백업)는
이미 실제 Prometheus/Loki/Tempo/PostgreSQL/Redis/cAdvisor에서 읽어오도록
전환되었습니다 — 이 문서에서 다루는 두 영역만 남았습니다.

> 왜 이 두 영역만 남았는가: RPS나 CPU는 "지금 측정된 값"이라 소스만 연결하면
> 끝나지만, 이상 진단과 예측은 **판단**입니다. 판단에는 학습된 모델과 규칙,
> 그리고 그 판단을 계속 검증할 피드백 루프가 필요합니다. 이건 코드 몇 줄로
> "연동"할 수 있는 게 아니라 별도로 설계·구축해야 하는 서비스입니다.

---

## 1. 지금 상태 요약

| 영역 | 현재 | 실제 데이터로 만들려면 |
|---|---|---|
| RPS·p95·오류율 | ✅ 실측 (OTel → Prometheus) | — |
| 컨테이너 CPU·Memory | ✅ 실측 (cAdvisor → Prometheus) | — |
| 로그 | ✅ 실측 (Loki) | — |
| 트레이스 | ✅ 실측 (Tempo) | — |
| PostgreSQL·Redis 상태 | ✅ 실측 (직접 접속) | — |
| 백업 최신성 | ✅ 실측 (파일 mtime, 2건만) | 나머지 시스템도 실제 백업 필요 |
| **Incident 헤드라인·근거·권장 조치** | ❌ 시뮬레이션 (`src/lib/mock.ts` `getIncidents`) | 이 문서의 §3~§5 |
| **이상 점수·신뢰도** | ❌ 시뮬레이션 (`buildServiceMelt`의 `anomalyScore`) | 이 문서의 §4 |
| **10분 후 트래픽 예측·AI 권장 replica** | ❌ 시뮬레이션 (`getPrediction`, `getScaleTimeline`) | 이 문서의 §6 |
| Kubernetes 노드 5대, Service Mesh(ztunnel), Jenkins, Harbor | ❌ 시뮬레이션 | 실제 인프라 자체가 아직 없음 (별도 과제) |

---

## 2. 핵심 설계 원칙 (기존 가이드 문서와 동일)

> **LLM이 장애 여부를 결정하지 않고, 규칙과 모델이 결정한 결과를 LLM이 설명하게 한다.**

- 자동 조치는 하지 않는다. Shadow Mode로 "AI라면 이렇게 했을 것"만 보여주고,
  사람이 확인 후 실행한다.
- 모든 AI 결과에는 **이상 점수 · 신뢰도 · 근거 지표 · 권장 조치**가 함께 붙는다.
  근거 없는 결론은 표시하지 않는다.
- 판단은 지금 실제로 붙어있는 백엔드(Prometheus·Loki·Tempo)의 결과만 사용한다.
  새 저장소를 만들지 않는다.

---

## 3. 이상 진단 파이프라인

### 3.1 지금 실제로 조회 가능한 feature (전부 검증됨)

아래 PromQL은 이 dev 환경의 실제 Prometheus에서 그대로 실행되는 쿼리입니다.
서비스 식별은 `job`(OTel) / `name`(cAdvisor) 라벨이며 값은 컨테이너 이름과
동일합니다(예: `dai-run-marathon-service`).

```promql
# RPS (요청이 드물어 1h 창 권장 — 실서비스라면 5m)
sum(rate(http_server_duration_milliseconds_count{job="$service"}[1h]))

# 오류율 (%)
100 * sum(rate(http_server_duration_milliseconds_count{job="$service", http_status_code=~"5.."}[1h]))
  / sum(rate(http_server_duration_milliseconds_count{job="$service"}[1h]))

# p95 latency (ms)
histogram_quantile(0.95, sum by (le) (rate(http_server_duration_milliseconds_bucket{job="$service"}[1h])))

# 컨테이너 CPU (core) / Memory (bytes)
rate(container_cpu_usage_seconds_total{name="$service"}[2m])
container_memory_usage_bytes{name="$service"}

# DB 호출 지연 (OTel db client span)
histogram_quantile(0.95, sum by (le) (rate(db_client_operation_duration_seconds_bucket{job="$service"}[10m])))

# 서비스 의존성 (Tempo service-graph — 별도 계측 없이 트레이스에서 자동 생성됨)
traces_service_graph_request_total{client="$service"}
traces_service_graph_request_failed_total{client="$service"}
```

이 6종이 곧 원래 계획했던 evidence bundle(`currentRps`, `errorRatio`,
`p95Ms`, `dbPoolUsage`, 관련 트레이스)의 실제 데이터 소스입니다.
`src/lib/otel-metrics.ts`, `src/lib/live.ts`가 이미 이 패턴으로
Prometheus를 조회하고 있으니 같은 클라이언트를 재사용하면 됩니다.

로그·트레이스 근거는 이미 만들어둔 `src/lib/loki.ts`(`getLiveLogs`),
`src/lib/tempo.ts`(`getLiveTraces`)를 그대로 재사용합니다.

### 3.2 4단계 탐지 (기존 가이드와 동일한 구조, 지금 붙일 수 있는 것부터)

**1단계 — 정적 규칙 (지금 바로 가능, AI 불필요)**

```text
5xx 비율 > 5%
p95 > 800ms (SLO)
CPU > 90% 5분 지속
컨테이너 재시작 발생 (container_last_seen 리셋 감지)
DB 활성 연결 / max_connections > 90%
```

`src/lib/mock.ts`의 `getAlertRules()`가 이미 이 형태의 규칙 목록과
`firingNow` 계산 로직을 갖고 있습니다 — 지금은 mock 데이터로 계산하지만
쿼리 대상만 실제 Prometheus로 바꾸면 1단계는 오늘 바로 실화할 수 있습니다.

**2단계 — 시계열 기준선**

```promql
# 같은 요일·시간대 4주 평균 대비 현재 RPS 편차
sum(rate(http_server_duration_milliseconds_count{job="$service"}[1h]))
  /
avg_over_time(
  sum(rate(http_server_duration_milliseconds_count{job="$service"}[1h]))[4w:1h] @ (time() - 604800)
)
```

이 dev 환경은 트래픽이 거의 없어(§1) 기준선이 의미 있으려면 최소 몇 주간의
실측 데이터 축적이 필요합니다. 지금 당장은 2단계를 건너뛰고 1단계(정적
규칙) + 3단계(모델)로 시작하는 것을 권장합니다.

**3단계 — IsolationForest (다변량 이상탐지)**

Python으로 별도 배치 서비스를 만들어 아래처럼 구성합니다.

```python
# 학습 데이터: Prometheus range query로 직접 가져온다 (별도 저장소 불필요)
# GET /api/v1/query_range?query=...&start=...&end=...&step=60
features = ["rps", "p95_ms", "error_ratio", "cpu_cores", "memory_mb", "restart_count"]

from sklearn.ensemble import IsolationForest
model = IsolationForest(contamination=0.02)
model.fit(training_df[features])

# 서비스마다 별도 모델 (트래픽 패턴이 다름)
# model-dai-run-marathon-service.joblib
# model-dai-run-crew-service.joblib ...
```

서비스별 모델 파일은 `src/lib/mock.ts`의 `getPrediction()`에 있는
`modelVersion` 필드(`model-dir-marathon-v3.2.joblib` 형태)와 동일한
네이밍을 그대로 쓰면 대시보드 문구를 바꿀 필요가 없습니다.

**4단계 — LLM 설명**

증거 묶음을 JSON으로 모아 LLM에 넘기고 자연어 설명만 받습니다. 판단은
LLM이 아니라 1~3단계가 이미 끝낸 상태입니다.

```json
{
  "service": "dai-run-marathon-service",
  "anomaly_score": 0.94,
  "current_rps": 0.24,
  "expected_rps": 0.05,
  "p95_ms": 49.6,
  "error_ratio_pct": 0,
  "recent_deploy_minutes_ago": 4,
  "top_log_error": "(Loki 최근 ERROR 라인)",
  "slow_trace_operation": "(Tempo 최장 span)"
}
```

로컬 LLM(Ollama/llama.cpp, 1~3B Q4)이든 Bedrock이든 §11(원본 가이드)의
Provider Adapter 구조를 그대로 쓰면 됩니다 — 이 dev 환경은 GPU가 없으므로
로컬 LLM은 작은 모델로 시작하세요.

### 3.3 결과를 대시보드까지 연결하는 방법 (가장 중요)

새 백엔드 API를 만들지 않는 게 핵심입니다. 지금 대시보드의 모든 실측
패널은 **"Prometheus를 쿼리한다"**는 한 가지 패턴만 알고 있습니다
(`src/lib/prometheus.ts`). AI 서비스도 똑같이 결과를 Prometheus에 값으로
남기면, 대시보드 쪽은 새로 배울 게 없습니다.

```text
dairun_anomaly_score{service="dai-run-marathon-service"} 0.94
dairun_anomaly_active{service="dai-run-marathon-service", severity="critical"} 1
dairun_anomaly_confidence{service="dai-run-marathon-service"} 0.91
```

노출 방법 두 가지:

1. **AI 서비스가 자체 `/metrics`를 열고, `monitoring/prometheus/prometheus.yml`에
   scrape job 하나 추가** (이번에 `dir-master1-node-exporter` 잡을 추가한 것과
   완전히 동일한 절차).
2. 상시 실행 서비스가 아니라 배치/cron이라면 **Pushgateway에 push**
   (`job=pushgateway`는 이미 `honor_labels: true`로 스크레이프 중이므로,
   Trivy 취약점 스캔과 같은 방식으로 바로 연동 가능 — `src/lib/live.ts`의
   `getLiveVulnerabilitySummary()`가 이 패턴의 실제 동작 예시입니다).

이렇게 하면 대시보드 쪽 변경은 다음처럼 아주 작아집니다.

```ts
// src/lib/ai-signals.ts (신규, 패턴은 src/lib/live.ts와 동일)
export async function getLiveAnomalyScore(containerJob: string) {
  const score = await promInstantQuery(`dairun_anomaly_score{service="${containerJob}"}`);
  if (!score?.length) return null; // AI 서비스가 아직 이 서비스를 채점 안 함 → 시뮬레이션 유지
  return parseFloat(score[0].value[1]);
}
```

그리고 `src/lib/mock.ts`의 `getIncidents()`를 호출하는 4곳
(`app/page.tsx`, `app/incidents/page.tsx`, `app/services/[service]/page.tsx`,
`components/incidents/IncidentCard.tsx`가 받는 `Incident` 객체)에서
`getLiveAnomalyScore`가 값을 주는 서비스는 실측 Incident로, 값이 없는
서비스는 지금처럼 시뮬레이션 Incident로 표시하면 — 이번에 RPS/p95를
블렌딩한 것과 동일한 패턴이 그대로 적용됩니다.

---

## 4. Incident 헤드라인·근거 문장을 실제로 생성하는 방법

지금 `getIncidents()`는 `incidentProfile`(`"capacity" | "latency" | "deploy_regression"`)에
따라 미리 써둔 한국어 문장 템플릿을 채워 넣습니다. 실제로 전환하면:

1. §3의 4단계 파이프라인이 `anomaly_score`, `suspected_cause`(규칙 엔진이
   가장 크게 벗어난 feature로 결정), `counter_evidence`(모델 신뢰도를
   낮추는 요인 — 예: "동일 시간대 다른 서비스도 증가")를 계산합니다.
2. LLM이 이 근거를 한국어 문장으로 풀어씁니다. **LLM 출력은 그대로 신뢰하지
   말고**, `reasons` 배열의 각 문장이 실제 숫자를 포함하는지(정규식으로
   숫자 존재 여부 확인 등) 검증한 뒤에만 화면에 노출하세요 — 숫자 없는
   막연한 문장("성능이 저하되었습니다")은 원본 가이드의 원칙("근거 없는
   결론 금지")을 어기게 됩니다.
3. `expectedRecoveryEffect`(권장 조치의 예상 효과)는 처음에는 LLM 문장이
   아니라 **규칙 기반 템플릿**으로 시작하는 것을 권장합니다. "Pod를 N개로
   확장하면 SLO 이내로 복귀할 것으로 예상"처럼 액션과 1:1로 대응되는
   문장은 굳이 생성할 필요가 없습니다.

---

## 5. 검증 없이 절대 넘어가면 안 되는 것

- **Confidence는 실제 모델 출력이어야 합니다.** IsolationForest의
  `decision_function` 값을 0~1로 정규화해서 쓰세요 — 지금 mock처럼
  `0.72 + rand() * 0.2`같은 임의 값이 되어서는 안 됩니다.
- **Shadow Mode 기간을 반드시 둡니다.** 최소 2주간 "AI가 맞았는가"를
  기록하세요 (`src/lib/mock.ts`의 `Incident.status`에 이미 `resolved`가
  있으니, 실측 전환 시 "AI가 예측한 원인이 맞았는지" 사람이 확인한 결과를
  같은 필드에 남기는 방식으로 확장하면 됩니다).
- **False positive rate를 계측하세요.** 알림 피로는 원본 가이드 §7에서
  이미 경고한 문제입니다 — 정밀도가 낮으면 Alert 임계치보다 모델 자체를
  먼저 의심하세요.

---

## 6. 예측(Predictive Autoscaling) 파이프라인

### 6.1 지금 대체해야 하는 함수

`src/lib/mock.ts`:

- `getPrediction(serviceId)` → 5·10·15분 후 RPS 예측
- `getScaleTimeline(serviceId)` → 실제/권장 replica 시계열, Scale 이벤트 로그
- `getCapacityGuard(serviceId)` → 클러스터 여유 대비 배치 가능 Pod 수

### 6.2 입력 feature (전부 §3.1의 실제 쿼리로 이미 확보됨)

```text
최근 1·5·10·30분 RPS (rate 창을 다르게 한 동일 쿼리)
최근 5분 p95
요일 · 시간
공휴일 여부 (외부 캘린더 API 또는 정적 테이블)
직전 배포 여부 (Loki에서 "started" 로그 라인의 최근성으로 판단 가능)
현재 replica 수 (컨테이너 개수 — cAdvisor `container_last_seen`으로 집계 가능)
```

### 6.3 모델

초기에는 복잡한 모델이 필요 없습니다. **이 dev 환경처럼 트래픽이 거의
없는 상태에서 LightGBM을 학습하면 과적합만 일어납니다.** 아래 순서를
권장합니다.

1. **지수가중이동평균(EWMA) + 선형 추세** — 데이터 없이도 바로 작동, 코드
   20줄 이내.
2. 실제 트래픽 패턴이 몇 주 쌓이면 → 요일·시간 계절성을 반영한 통계 모델
   (Holt-Winters 등).
3. 그래도 부족하면 LightGBM — 하지만 원본 가이드도 강조하듯 **핵심은
   복잡한 모델이 아니라 과잉 확장 방지의 안전장치(§9.2 Scale-down은
   느리게)** 입니다.

### 6.4 출력도 §3.3과 동일한 방식으로 노출

```text
dairun_predicted_rps{service="dai-run-marathon-service", horizon="10m"} 0.31
dairun_effective_rps{service="dai-run-marathon-service"} 0.24
dairun_recommended_replicas{service="dai-run-marathon-service"} 2
dairun_prediction_confidence{service="dai-run-marathon-service"} 0.68
```

`getScaleTimeline`이 만드는 Scale-out/in 이벤트 로그도 이 값들의 변화를
감지해서 만들면 되므로 — 대시보드 쪽에서 별도로 다시 구현할 게 없습니다.

### 6.5 Capacity Guard는 이미 실측 재료가 있습니다

이번 작업으로 `dir-master1`(192.168.0.200) 실제 컨트롤플레인 노드의
node-exporter가 Prometheus에 이미 들어와 있습니다
(`job="dir-master1-node-exporter"`, `src/lib/live.ts`의
`getRealServerHostStats()`). 실제 워커 노드가 추가되면 같은 패턴으로
`static_configs` targets만 늘리면 Capacity Guard의 "클러스터 여유 CPU·
Memory" 계산을 오늘 만든 host-stats 쿼리로 그대로 대체할 수 있습니다 —
새로운 통합 방식을 설계할 필요가 없습니다.

---

## 7. 로드맵 제안

| 단계 | 내용 | 선행 조건 |
|---|---|---|
| 0 (완료) | RPS·p95·오류율·로그·트레이스·CPU·Memory·DB·Redis 실측 전환 | — |
| 1 | Prometheus Recording Rule 배포 (`dairun:http_rps:rate5m` 등, §3.1 쿼리를 rule로 승격) | 0 |
| 2 | 정적 규칙 기반 Alert만으로 1단계 이상탐지 실화 (모델 불필요) | 1 |
| 3 | 트래픽 데이터 2주+ 축적 | 2 |
| 4 | IsolationForest Shadow Mode — 점수만 계산해 Pushgateway/자체 `/metrics`로 노출, 화면에는 아직 미반영 | 3 |
| 5 | LLM 설명 연결, Incident 카드에 실측 배지로 노출 (mock과 동일한 fallback 패턴) | 4 검증 완료 |
| 6 | 예측 모델(EWMA→통계모델) + `dairun_predicted_rps` 노출 | 3 |
| 7 | Predictive Autoscaling 화면 실측 전환, KEDA 연결은 Shadow Mode 검증 후 | 5, 6 |

각 단계는 **이전 단계가 실제로 검증된 뒤에만** 다음으로 넘어가세요. 원본
가이드 문서의 결론과 동일합니다 — 처음부터 완성형 예측 시스템을 만드는
것보다, `dir-marathon` 한 서비스에서 규칙 → 이상탐지 → 예측 → Shadow
Mode 순서로 얇게 먼저 완성하고 다른 서비스로 넓히는 편이 안전합니다.

---

## 8. 지금 코드에서 "여기가 mock입니다" 라고 표시된 지점

실측 전환 작업을 시작할 때 아래를 grep하면 정확히 어디를 바꿔야 하는지
나옵니다.

```bash
grep -rn "시뮬레이션" src/app          # UI에 노출된 mock 라벨
grep -rn "incidentProfile" src/lib/mock.ts   # Incident 시나리오 정의
grep -n "anomalyScore\|confidence" src/lib/mock.ts  # 가짜 확률값 생성 위치
```
