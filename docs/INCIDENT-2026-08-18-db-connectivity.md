# 2026-08-18 백엔드 DB 연결 장애 — 원인과 조치

## 증상

프론트 화면에서 백엔드가 응답 없음/오작동. `kubectl get pods`로는 모든 Pod가 `1/1 Running`이라 겉으로는 정상으로 보였음(DB 연결이 liveness에 안 묶여 있어 Pod 자체는 죽지 않음).

## 원인 (3중 문제, 전부 EKS 이전 시 미완료 항목)

1. **ConfigMap 26개 전체**가 `PGHOST=dairun-postgresql-pooler-rw.dir-db-ns.svc.dir-cluster`를 갖고 있었음. 실제 CloudNativePG 서비스는 `dir-postgresql-rw`(별도 pooler 없음)이고, EKS CoreDNS 도메인은 `.dir-cluster`가 아니라 `.cluster.local`. 마찬가지로 `*_SERVICE_URL`, `OTEL_EXPORTER_OTLP_ENDPOINT` 등 서비스 간 호출도 전부 `.svc.dir-cluster`로 박혀 있어 전부 `ENOTFOUND`.
2. **NetworkPolicy `dir-backend-postgresql-egress`**의 egress 대상 `podSelector`가 `cnpg.io/cluster: dairun-postgresql`로 돼 있었는데, 실제 CNPG Pod의 라벨은 `cnpg.io/cluster: dir-postgresql`. 즉 egress 허용 규칙이 실제 DB Pod와 매칭되지 않아 DNS가 맞아도 TCP 연결 자체가 드롭됨(default-deny 계열 baseline 정책과 결합).
3. **DB role 5개 누락**: `db/041_service_db_roles.sql`이 12개 서비스 role 중 7개만 적용된 상태였고 `auth_svc`, `coaching_svc`, `shoe_svc`, `marathon_svc`, `media_svc`가 이 Postgres 인스턴스에 아예 없었음. 위 1·2번을 고쳐도 이 5개 서비스는 `password authentication failed`로 계속 실패.

1·2번은 5개 서비스(course, crew, crew-stats-scheduler, challenge-weekly-scheduler, running-record-outbox-publisher)만 부분적으로 고쳐진 상태였고 나머지는 그대로 남아 있었다 — 마이그레이션이 절반만 끝난 상태로 추정.

## 조치 (2026-08-18, 라이브 클러스터에 직접 적용 + 이 저장소에 반영)

- ConfigMap 26개(`dir-backend-ns` 19개, `dir-ai-ns` 6개, `dir-frontend-ns` 1개) 전부 `.svc.dir-cluster` → `.svc.cluster.local`, `dairun-postgresql-pooler-rw` → `dir-postgresql-rw`, `PGDATABASE: dairun` → `dai_run`로 일괄 수정. 이 저장소에 처음으로 추가함(기존엔 전혀 GitOps 추적 안 되고 있었음 — `kubectl apply`로 수동 생성된 상태).
- `dir-backend-postgresql-egress` NetworkPolicy의 `cnpg.io/cluster` 라벨 값 수정, 이 저장소에 신규 추가.
- 누락된 DB role 5개(`auth_svc`, `coaching_svc`, `shoe_svc`, `marathon_svc`, `media_svc`)를 `db/041_service_db_roles.sql`(dai-run-aws 앱 저장소) 기준으로 생성 + GRANT, 비밀번호는 이미 배포돼 있던 K8s Secret 값과 일치시킴(Secret은 변경 안 함). 이 SQL 변경은 DB 자체에 대한 것이라 이 GitOps 저장소가 아니라 앱 저장소의 `db/041`이 원본 기준임 — 이 문서는 "언제·왜 다시 적용했는지"만 기록.
- 영향받은 Deployment 전체(`dir-backend-ns`, `dir-ai-ns`, `dir-frontend-ns`) rolling restart, 재기동 후 전 서비스 `SELECT 1` 연결 확인 완료.

## 확인 안 된/후속 필요 사항

- `dir-challenge-consumer`, `dir-course-stats-consumer`, `dir-crew-consumer`, `dir-crew-notification-consumer`, `dir-notification-consumer` 5개는 `replicas: 0`으로 이미 내려가 있는 상태를 그대로 뒀음(누가 왜 내렸는지 확인 안 됨 — SQS 전환 작업 중 의도적으로 멈춘 것으로 추정). DB/DNS는 고쳤지만 SNS_TOPIC_ARN/SQS_QUEUE_URL 등 나머지 설정까지 맞는지는 확인 전이라 임의로 replicas를 올리지 않았음.
- `dir-ai-ns`에 `dir-ai-assistant`/`dir-ai-assistant-service`, `dir-course-recommendation`/`dir-course-recommendation-service`처럼 이름이 겹치는 Deployment가 각각 떠 있음 — 의도적 마이그레이션 중간 상태인지 확인 필요.
- 이번에 처음 추적을 시작한 ConfigMap들이라 앞으로 `kubectl apply`로 라이브를 직접 고치면 다시 이 파일들과 어긋난다 — 이후 변경은 이 저장소를 통해서만 진행할 것.
