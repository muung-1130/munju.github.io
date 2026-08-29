# 알림(Alerting) 구축 현황 보고서

작성 기준: 2026-08-03, `/home/kevin/monitoring` 로컬 관측 스택 + `dai-run-ai-dashboard`

---

## 1. 전체 구조

```text
┌─────────────┐   평가   ┌──────────────┐   firing 알림   ┌───────────────┐   POST   ┌───────┐
│ Prometheus  │ ───────▶ │ (자체 rule    │ ──────────────▶ │ Alertmanager  │ ───────▶ │ Slack │
│  (규칙 평가)  │          │  engine)     │                 │ (라우팅·억제)   │          │ 채널   │
└─────────────┘          └──────────────┘                 └───────────────┘          └───────┘
       ▲
       │ 대시보드가 /api/v1/rules, /api/v1/alertmanagers를 직접 조회
       │
┌─────────────────────┐
│ dai-run-ai-dashboard │  (/incidents 탭에 실측 상태 표시)
└─────────────────────┘
```

핵심은 **역할이 세 곳으로 분리**되어 있다는 점입니다.

| 컴포넌트 | 역할 | 설정 파일 |
|---|---|---|
| Prometheus | "지금 임계치를 넘었는가"만 계속 평가 | `monitoring/prometheus/rules/dairun-alert-rules.yml` |
| Alertmanager | 그룹핑·재알림 주기·억제·실제 발송(Slack) | `monitoring/alertmanager/alertmanager.yml` |
| 대시보드 | 위 둘의 현재 상태를 읽기 전용으로 조회해 화면에 표시 | `src/lib/prometheus-alerts.ts` |

대시보드는 알림을 발송하지 않습니다 — Prometheus와 Alertmanager가 이미 하고 있는 일을
그대로 보여줄 뿐입니다.

---

## 2. Alert Rule 14개 — 실측 7개 / 시뮬레이션 7개

`/incidents?tab=alerts`에 보이는 14개 규칙 중 **7개만 실제로 Prometheus가 평가하고
Slack까지 연결**되어 있습니다. 나머지 7개는 아직 해당 데이터를 수집할 exporter가 없어
대시보드 mock 값으로만 표시됩니다.

### 2.1 실측 · Slack 연동됨 (Stage 1 — 정적 임계치, 모델 없음)

| 규칙 | 조건 | 심각도 | 데이터 소스 |
|---|---|---|---|
| `DairunHttp5xxRatioHigh` | 5xx 비율 > 5%, 5분 지속 | Critical | OTel `http_server_duration_milliseconds_count` |
| `DairunP95LatencyHigh` | p95 > 800ms, 5분 지속 | Warning | OTel histogram → `histogram_quantile(0.95, ...)` |
| `DairunContainerCpuHigh` | 컨테이너 CPU > 0.9 core, 5분 지속 | Warning | cAdvisor `container_cpu_usage_seconds_total` |
| `DairunContainerRestarted` | 15분 내 시작 시각 변경 감지 | Critical | cAdvisor `container_start_time_seconds` |
| `DairunHostMemoryHigh` | 호스트 메모리 사용률 > 85%, 5분 지속 | Warning | node-exporter |
| `DairunHostDiskLow` | 디스크 사용률 > 85%, 10분 지속 | Warning | node-exporter |
| `DairunTelemetryMissing` | Prometheus 자체 관측 5분 이상 두절 | Critical | `up{job="prometheus"}` |

원본 PromQL은 recording rule로 먼저 계산해두고(`dairun:http_rps:rate5m` 등,
`monitoring/prometheus/rules/dairun-recording-rules.yml`), alert rule은 그 결과값을
threshold와 비교만 합니다.

**지금 시점 상태(2026-08-03 확인): 14개 규칙 전부 `inactive`(정상) — 발화 중인 것 없음.**
전부 `health=ok`로 정상 평가되고 있습니다.

### 2.2 아직 시뮬레이션 (exporter 없음)

| 규칙 | 왜 아직 안 되는가 |
|---|---|
| 사용자 영향 / 성공률 저하 | 종합 지표라 다수 서비스 조합 판단 필요 — 우선순위 낮음 |
| API / 4xx 급증 | 로직은 있으나 baseline 데이터 부족 (§4 참고) |
| DB / Slow Query, Connection Pool 포화 | PostgreSQL이 직접 접속으로만 조회되고 있어 Prometheus가 못 봄 → `postgres_exporter` 필요 |
| Kafka / Consumer Lag | Kafka broker(`dai-run-kafka-broker`)는 떠 있지만 JMX/Kafka exporter가 없음 |
| Network / Port·Endpoint Down | Blackbox Exporter 미설치 |
| Capacity / HPA 확장 불가 | 실제 다중 노드 K8s 클러스터가 아직 없음 |

---

## 3. Alertmanager 라우팅 — 지금 기준

```yaml
# monitoring/alertmanager/alertmanager.yml 요약
route:
  group_by: [alertname, job, name]
  group_wait: 30s        # 같은 그룹 알림을 30초 모았다가 한 번에 발송
  group_interval: 5m     # 그룹에 새 알림 추가 시 최소 5분 간격
  routes:
    - severity=critical → repeat_interval 15분
    - severity=warning  → repeat_interval 2시간
receivers:
  - slack-default (Incoming Webhook, 파일로만 보관 — 코드에 없음)
inhibit_rules:
  - DairunTelemetryMissing firing 중이면 같은 job의 다른 알림은 억제
```

**지금은 Critical·Warning 전부 같은 Slack 채널 하나로 갑니다.** 대시보드 Notification
Policy 탭에 있는 "Critical=메신저+문자, High=담당팀 채널, Warning=모니터링 채널"처럼
채널을 심각도별로 분리하려면 Slack Incoming Webhook을 심각도별로 하나씩 더 만들어
`routes`에 receiver를 추가해야 합니다(§5.1).

---

## 4. 실제로 검증한 것

| 항목 | 방법 | 결과 |
|---|---|---|
| Prometheus가 규칙을 평가하는가 | `/api/v1/rules` 조회 | 14개 전부 `health=ok` |
| Prometheus가 Alertmanager를 찾는가 | `/api/v1/alertmanagers` 조회 | `activeAlertmanagers` 1개 연결됨 |
| Alertmanager가 Slack까지 보내는가 | API로 합성 테스트 알림 4회 발송 + `--log.level=debug`로 `Notify success` 로그 직접 확인 | 성공 (firing 메시지 확인) |
| resolve 알림도 오는가 | 테스트 알림을 갱신하지 않고 방치 → `resolve_timeout: 5m` 경과 대기 | 성공 (✅ resolved 메시지 확인) |
| 라벨 렌더링 버그 | 초기 템플릿이 `job`+`name`을 붙여 써서 깨짐 → 수정 후 재테스트 | 수정 확인됨 |

테스트 중 발견해서 고친 실제 이슈 2건:
1. **권한 문제**: Alertmanager 컨테이너가 `nobody`(uid 65534)로 실행되는데 webhook
   secret 파일이 600(kevin 전용)이라 읽기 실패 → 644로 조정.
2. **템플릿 버그**: `{{ .Labels.job }}{{ .Labels.name }}`처럼 구분자 없이 이어 붙여서
   두 라벨이 동시에 있으면 글자가 붙어버림 → `job`이 있으면 `job`, 없으면 `name` 하나만
   쓰도록 수정.

---

## 5. 다음에 하면 좋은 것

### 5.1 채널 분리 (가장 쉬움)

지금은 Critical·Warning이 같은 채널로 갑니다. 심각도별로 채널을 나누려면:

1. Slack에서 채널별로 Incoming Webhook을 추가로 만든다.
2. `monitoring/alertmanager/secrets/`에 `slack_webhook_url_critical`,
   `slack_webhook_url_warning` 같은 파일을 추가한다.
3. `alertmanager.yml`의 `routes`에 receiver를 심각도별로 분리한다.

### 5.2 커버리지 확장 (§2.2의 7개)

가장 효과가 큰 순서:

1. **postgres_exporter** 추가 — DB pool 포화 알림을 실측으로 전환 가능 (이미 DB
   접속 정보는 `.env.local`에 있으니 exporter만 추가하면 됨)
2. **Blackbox Exporter** — Istio Gateway·CI/CD SSH 등 포트 상태를 실제로 체크
3. Kafka exporter — Consumer Lag 실측

### 5.3 Silence / On-call 관리

지금은 Silence(알림 일시 중지)를 Alertmanager UI(`http://localhost:9093`)에서만
할 수 있습니다. 대시보드에 "이 알림 30분간 무시" 버튼을 추가하려면 Alertmanager의
`/api/v2/silences` API를 호출하는 작은 API route 하나만 추가하면 됩니다.

---

## 6. 파일 위치 요약

```text
monitoring/prometheus/prometheus.yml              # rule_files, alerting.alertmanagers
monitoring/prometheus/rules/dairun-recording-rules.yml
monitoring/prometheus/rules/dairun-alert-rules.yml
monitoring/alertmanager/alertmanager.yml           # 라우팅 · Slack receiver
monitoring/alertmanager/secrets/slack_webhook_url  # 실제 URL (git 대상 아님, 644)
monitoring/docker-compose.yml                      # alertmanager 서비스 정의

dai-run-ai-dashboard/src/lib/prometheus-alerts.ts  # 대시보드가 상태를 읽어오는 클라이언트
dai-run-ai-dashboard/src/app/incidents/page.tsx    # Alert Rules / Notification Policy 탭
```
