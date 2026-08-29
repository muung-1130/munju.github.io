# 실측 데이터 vs Mock/하드코딩 인벤토리

작성 기준: 2026-08-03. 페이지·탭 단위로 각 패널이 실제 데이터인지, 시뮬레이션인지
정리합니다. "실측"은 실제로 떠 있는 Prometheus·Loki·Tempo·PostgreSQL·Redis·파일
시스템을 그때그때 조회한다는 뜻이고, "Mock"은 `src/lib/mock.ts`의 결정적
시드 기반 가짜 데이터입니다.

범례: 🟢 실측 · 🟡 부분 실측(블렌딩) · ⚪ Mock/시뮬레이션

---

## `/` Overview

| 패널 | 상태 | 근거 |
|---|---|---|
| 전체 요청 성공률 · p95 응답시간 | 🟡 | 8개 서비스 중 6개는 실측(OTel), Community Feed·Payment Gateway는 mock — 평균에 섞여 들어감 |
| 활성 사용자 · 프론트엔드 에러율 | ⚪ | "Mock · Planned" 배지로 이미 표시됨 (RUM 미연동) |
| 영향받은 사용자(추정) | ⚪ | mock Incident의 `affectedUsers` 합산 |
| SLO 위반 서비스 수 | 🟡 | 위와 같은 블렌딩된 배열 기준 |
| 진행 중 Incident | ⚪ | AI 진단 서술 — 의도적으로 시뮬레이션 유지 (§ AI 가이드 문서 참고) |
| 10분 후 트래픽 예측 | ⚪ | "(시뮬레이션)" 라벨 있음 |
| Pod 확장 상태 | ⚪ | "(시뮬레이션)" 라벨 있음 |
| 클러스터 여유도 | ⚪ | "(시뮬레이션)" 라벨 있음 |
| 서비스 건강 지표 표 | 🟡 | RPS·p95·오류율 열만 실측(6/8), 이상 점수·replica 열은 mock |
| 최근 Kubernetes 이벤트 | ⚪ | "(시뮬레이션)" 라벨 있음 |
| 최근 변경 이벤트 | ⚪ | "(시뮬레이션)" 라벨 있음 |

---

## `/incidents` Incidents & Alerts

| 탭 | 상태 | 근거 |
|---|---|---|
| Incident | ⚪ | 전부 AI 서술(mock) — `IncidentCard` |
| Alert Rules | 🟡 | 14개 중 7개는 Prometheus `/api/v1/rules` 실측(LIVE 배지), 7개는 mock |
| Notification Policy — Alertmanager 연동 상태 카드 | 🟢 | Prometheus `/api/v1/alertmanagers` 실측 |
| Notification Policy — 정책 표 | ⚪ | 정적 참고용 표 (실제 라우팅은 §알림 보고서 참고, 표 자체는 하드코딩) |

---

## `/services` Services 목록

| 패널 | 상태 |
|---|---|
| 서비스 카드 전체 | ⚪ Mock — 이 페이지는 실측 연동 안 함 (상세 페이지에서만 실측) |

---

## `/services/[service]` Service MELT Drill-down

여기는 서비스마다 다릅니다. 실측 컨테이너 매핑(`LIVE_CONTAINER_MAP`)이 있는
6개(Marathon, Running Record, AI Assistant, Course Recommendation, Crew,
Notification)만 실측이고, Community Feed·Payment Gateway는 매핑이 없어 전부 Mock.

| 탭 / 패널 | 6개 매핑 서비스 | Community·Payment |
|---|---|---|
| Summary — Health Score, 활성 Incident, replica, 배포 버전, SLO 상태 | ⚪ Mock | ⚪ Mock |
| Summary — RPS·성공률/오류율·p95 | 🟢 실측 (OTel) | ⚪ Mock |
| Metrics — 실시간 컨테이너 리소스(CPU·Memory) | 🟢 실측 (cAdvisor) | 표시 안 됨 |
| Metrics — RPS·p95·오류율 차트 | 🟢 실측 | ⚪ Mock (시뮬레이션 라벨) |
| Metrics — CPU·Memory(목표 K8s %) | ⚪ Mock (시뮬레이션 라벨) | ⚪ Mock |
| Metrics — DB Pool·Kafka Lag | ⚪ Mock (시뮬레이션 라벨) | ⚪ Mock |
| Dependencies | ⚪ Mock (시뮬레이션 라벨) | ⚪ Mock |
| Logs | 🟢 실측 (Loki) 또는 "스트림 없음" | "스트림 없음" (Loki 조회는 시도하나 매핑 자체가 없음) |
| Traces | 🟢 실측 (Tempo) 또는 "trace 없음" | "trace 없음" |
| Events & Changes | ⚪ Mock 전부 | ⚪ Mock 전부 |
| AI Diagnosis | ⚪ Mock (의도적 유지) | ⚪ Mock |

---

## `/autoscaling` Predictive Autoscaling

| 패널 | 상태 |
|---|---|
| 전체 페이지 (Demand Forecast · Replica Decision · Capacity Guard) | ⚪ **100% Mock** — 실측 연동 안 함. AI 예측 영역이라 의도적으로 미착수 (`docs/ai-diagnosis-integration-guide.md` §6 참고) |

---

## `/infrastructure`

| 탭 | 패널 | 상태 |
|---|---|---|
| Kubernetes/Compute | 실시간 호스트 상태 (dev 컨테이너) | 🟢 실측 (node-exporter) |
| | 실시간 K8s Control Plane (dir-master1, 192.168.0.200) | 🟢 실측 (node-exporter) |
| | 노드 상태 (5-node 표) | ⚪ Mock ("시뮬레이션" 라벨) |
| | Pod 상태 이벤트 | ⚪ Mock |
| Network & Availability | 계층별 헬스체크 설명 카드 | 정적 텍스트 (데이터 없음) |
| | Endpoint/Port Health 표 | ⚪ Mock |
| Service Mesh | mTLS·연결·Top10·Waypoint 등 전부 | ⚪ **100% Mock** — 실제 Istio/ztunnel 없음 |
| Kafka | 실시간 Kafka Broker 리소스(CPU·Mem) | 🟢 실측 (cAdvisor) |
| | Consumer Lag 차트 · 토픽 상세 표 | ⚪ Mock ("시뮬레이션" 라벨) |
| Database & Cache | 실시간 PostgreSQL | 🟢 실측 (직접 접속) |
| | PostgreSQL (시뮬레이션) | ⚪ Mock |
| | 실시간 Redis | 🟢 실측 (직접 접속) |
| | Redis (시뮬레이션) | ⚪ Mock |
| CI/CD | 실시간 취약점 스캔 | 🟢 실측 (Pushgateway — 현재 데이터 없음, "정직한 empty") |
| | Jenkins (시뮬레이션) | ⚪ Mock — 실제 Jenkins 서버 없음 |
| | Harbor (시뮬레이션) | ⚪ Mock — 실제 Harbor 서버 없음 |
| Storage & Backups | Storage(PV/PVC/Longhorn) | ⚪ Mock |
| | 백업 현황 표 | 🟡 7행 중 2행(PostgreSQL Primary, MongoDB Snapshot)만 LIVE 배지 — 실제 파일 mtime. 나머지 5행(Longhorn·Harbor·Jenkins·Prometheus 설정)은 Mock |
| | 관측 파이프라인 상태 표 | ⚪ Mock (Prometheus/Loki/Tempo/Alloy 자체 헬스체크는 아직 실측 연동 안 함) |

---

## `/changes` Changes

| 패널 | 상태 |
|---|---|
| 전체 페이지 | ⚪ **100% Mock** — 실제 Argo CD·배포 이력 시스템 없음 |

---

## 한눈에 보는 실측 데이터 소스 목록

| 소스 | 무엇을 실측하나 | 클라이언트 파일 |
|---|---|---|
| Prometheus (cAdvisor) | 컨테이너 CPU·Memory (앱 6개 + DB·Redis·Kafka) | `src/lib/live.ts` |
| Prometheus (node-exporter ×2) | 이 dev 호스트 + 실제 dir-master1(192.168.0.200) | `src/lib/live.ts` |
| Prometheus (OTel HTTP) | RPS·p95·오류율 (앱 6개) | `src/lib/otel-metrics.ts` |
| Prometheus (rule engine) | Stage 1 Alert 7개 firing 상태 | `src/lib/prometheus-alerts.ts` |
| Prometheus (Pushgateway) | Trivy 취약점 스캔 (현재 빈 상태) | `src/lib/live.ts` |
| Alertmanager | Prometheus 연동 상태 | `src/lib/prometheus-alerts.ts` |
| Loki | 컨테이너 로그 (앱 6개) | `src/lib/loki.ts` |
| Tempo | Trace 검색 (앱 6개) | `src/lib/tempo.ts` |
| PostgreSQL (직접 접속) | 연결 수·hit ratio·DB 크기 등 | `src/lib/db.ts` |
| Redis (직접 접속) | 메모리·hit ratio·키 수 등 | `src/lib/redis-live.ts` |
| 파일시스템 | PostgreSQL·MongoDB 백업 mtime | `src/lib/live-backups.ts` |

**전부 `null` 반환 시 자동으로 mock으로 폴백**하도록 설계되어 있어서, 연결이
끊겨도 화면이 깨지지 않고 조용히 시뮬레이션 모드로 돌아갑니다.

## 완전히 시뮬레이션인 영역 (실제 인프라 자체가 없음)

- Predictive Autoscaling 전체 (AI 예측 모델 없음)
- Service Mesh(ztunnel/Istio) — 실제 Ambient Mesh 없음
- Jenkins·Harbor — 서버 자체가 없음
- Kubernetes 5-node 클러스터 표 — 실제 멀티 노드 클러스터 없음
- Changes(배포 이력) — Argo CD 등 실제 배포 추적 시스템 없음
- Incident 서술·AI Diagnosis — 이상탐지 모델 자체가 없음 (의도적, 가이드 문서 별도)
