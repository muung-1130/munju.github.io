# D.A.I. RUN AWS 이전 작업일지

- 작업일: 2026-08-16 (KST)
- 작업 범위: `dai-run-aws` 프로젝트 신설, environment-dynamodb-consumer 체크포인트 전환, GitOps 산출물 분리, Kafka→SNS/SQS 이중 프로바이더 마이그레이션, DB connection(CloudNativePG) 수정
- 저장소: `/home/kevin/dai-run-aws` (신규, `dai-run-repo`에서 분리)
- 브랜치: `main` (커밋 없음 — `git add -A`로 스테이징만 된 상태)
- 주의: Git commit, push, 실제 AWS 배포(ECR push, CloudFormation, kubectl apply)는 전부 수행하지 않았다. 이 세션에는 AWS 자격증명이 없다.

## 1. 작업 배경

기존 `dai-run-repo`는 온프레미스 Kubernetes(Harbor, Strimzi Kafka 등)를 기준으로 운영 중이던 저장소다(`CLAUDE.md` 기준). AWS(EKS + 관리형 서비스)로 옮기려면 코드 일부가 AWS 전용으로 바뀌어야 하는데, 그 작업을 `dai-run-repo`와 분리된 별도 프로젝트에서 진행하기 위해 `dai-run-aws`를 새로 만들었다. 이후 GitLab의 새 저장소에 올릴 예정이다.

## 2. `dai-run-aws` 프로젝트 신설

- `dai-run-repo`를 기준으로 선택(다른 후보: `dai-run-ai-dashboard-cryptox-v2`, `dai-run-terraform-helm-added` 등은 제외).
- `node_modules/`, `.next/`, `.git/`(커밋 이력)을 제외하고 나머지 전체를 `rsync`로 복사(약 7.2GB → 284MB).
- 새 git 저장소로 `git init`, 기본 브랜치를 `main`으로 변경. 기존 GitHub origin(`dai-run/dai-run.git`)과는 연결하지 않은 완전히 독립된 저장소.
- `.env`/`.env.local`은 디스크엔 복사됐지만 `.gitignore`에 걸려 있어 커밋 대상에서는 제외됨을 확인.

## 3. environment-dynamodb-consumer 체크포인트 전환

`/home/kevin/consumer.zip`으로 전달된 내용을 검토한 결과, 이미 저장소에 있던 `services/environment-dynamodb-consumer`(DynamoDB `dai-environment` 테이블의 날씨·미세먼지를 폴링해 PostgreSQL `environment.weather_hourly`/`air_quality_hourly`에 UPSERT하는 컨슈머, v1은 매 polling마다 DynamoDB 전체 Scan)의 개선판이었다. `k8s/environment-consumer/README.md`가 이미 "LastEvaluatedKey 체크포인트 방식으로 전환 권장"이라고 남겨뒀던 것과 정확히 일치했다.

반영 내용(전부 `dai-run-aws`에만 적용, `dai-run-repo`는 건드리지 않음):

- `services/environment-dynamodb-consumer/index.mjs` — 체크포인트(`environment.ingest_consumer_checkpoint`) 기반 증분 Scan, 배치 upsert, 헬스 파일(`/tmp/healthy`), graceful shutdown, RUN_ONCE, PGSSL 지원. 환경변수명은 zip의 `ENVIRONMENT_TABLE_NAME`(기본값 `dir-environment`, 위험한 오기본값) 대신 기존 실배포값(`dai-environment`)과 일치하는 `DIR_ENVIRONMENT_TABLE_NAME`(기본값 없음, 필수)으로 되돌림.
- `services/environment-dynamodb-consumer/otel.mjs` — 형제 컨슈머(`course-stats-consumer`, `crew-notification-consumer`)와 동일한 OpenTelemetry 계측 추가(기존엔 k8s manifest에 `OTEL_SERVICE_NAME`만 있고 실제 계측 코드가 없어 무시되고 있었음).
- `Dockerfile`, `package.json`, `package-lock.json` — 형제 컨슈머와 동일한 멀티스테이지 non-root Alpine 패턴으로 통일.
- `db/044_environment_consumer_checkpoint.sql` — 체크포인트 커서 테이블 신규 migration. `environment_writer` role에 idempotent GRANT 포함.
- `scripts/build-push-environment-consumer.sh`, `scripts/check-environment-consumer.sh`, `scripts/apply-environment-checkpoint-schema.sh`(로컬/Docker Compose용), `scripts/apply-environment-checkpoint-schema-eks.sh`(EKS 클러스터 내부 1회성 Pod로 마이그레이션 적용) 신규 작성.

검증: `node --check` 통과, `npm install --package-lock-only` 성공. Docker 빌드·실제 EKS/ECR 접근은 자격증명이 없어 미실행.

## 4. GitOps 산출물 분리

목표 아키텍처(§16.1, §22 `CLAUDE.md` 참고: 서비스별 immutable 이미지 → GitOps 저장소 변경 → Argo CD sync)에 따라, 앱 저장소에는 k8s manifest가 남아있으면 안 된다고 판단해 분리했다.

- `dai-run-aws/k8s/environment-consumer/`(`deployment.yaml`, `serviceaccount.yaml`, `secret.example.yaml`, `README.md`)를 앱 저장소에서 제거하고 `/home/kevin/dai-run-aws-gitops/environment-consumer/`로 이동(로컬에만 존재, 실제 GitOps 원격 저장소에는 아직 push 안 함).
- `deployment.yaml` 수정: image를 Harbor 참조에서 ECR placeholder(`<AWS_ACCOUNT_ID>.dkr.ecr.ap-northeast-2.amazonaws.com/dai-run/dir-environment-consumer:pending-first-build`)로 변경. readinessProbe를 `kill -0 1`(항상 true)에서 `test -f /tmp/healthy`(실제 sync 성공 여부 반영)로 수정.
- `README.md`를 체크포인트 방식 반영, ECR/EKS 마이그레이션 스크립트 사용법으로 갱신.

## 5. Kafka → SNS/SQS 이중 프로바이더 마이그레이션

`SNS-SQS-DB-DEVELOPMENT-GUIDE.md`(사용자가 붙여넣은 문서가 UTF-8/Latin-1 mojibake로 깨져 있어 세션 중 디코딩)를 기준으로 진행. Plan 모드로 전환해 사용자 승인을 받은 뒤 구현했다.

**사용자 결정 사항(구현 전 확인):**
- 서비스 간 공유 코드 패키지를 새로 만들지 않고 기존처럼 서비스별로 복붙(이 저장소의 기존 관행).
- 기존 Kafka consumer의 "처리 실패해도 자동 commit되는" 버그는 이번엔 건드리지 않음(가이드의 롤백 절차가 "기존 Kafka 동작 복원"을 전제하기 때문).
- CloudFormation(`aws/sns-sqs-messaging.yaml`)과 IAM 정책 문서는 이번 패스에서 제외, 코드만 작업.
- `course-stats-consumer`의 멱등성 부재(CLAUDE.md §6.3에 이미 알려진 갭)는 이번에 같이 보강.

**구현 내용:** `MESSAGING_PROVIDER=kafka(기본값)|sns-sqs|dual` 스위치를 아래 8개 파일에 추가. 기존 export 함수 시그니처는 그대로 유지하고 내부에서만 분기했다.

- Producer 쪽(SNS 추가): `running-record-service`, `challenge-service`, `crew-service`, `course-service`의 `src/lib/kafka.ts`
- Consumer 쪽(SQS 추가, 성공 시에만 메시지 삭제 — Kafka와 달리 실패 시 재수신·DLQ 이동): `challenge-service`, `crew-service`, `ai-assistant-service`, `notification-service`의 `src/lib/kafka.ts` + 각 `src/consumer.ts`에 SIGTERM 연결 추가(기존엔 전혀 없었음)
- 레거시 `services/course-stats-consumer/index.mjs`(SQS 경로 + **새 멱등성 가드**), `services/crew-notification-consumer/index.mjs`(SQS 경로만, 멱등성은 기존 것 재사용)
- `db/045_course_like_event_inbox.sql` — course-stats-consumer 멱등키 테이블 신규 migration
- 8개 서비스 `package.json`에 `@aws-sdk/client-sns`/`client-sqs` 추가, `package-lock.json` 재생성

**검증:** 6개 services-msa 파일 `tsc --noEmit` 전부 통과, 2개 legacy `.mjs` `node --check` 통과, `npm install` 8곳 전부 성공, `scripts/check-schema-boundaries.mjs` 실행 확인(기존에 있던 위반 2건은 이번 변경과 무관한 `crewBattle.ts`/`challengeProgress.ts`). **실행하지 못한 검증**: 실제 `sns-sqs`/`dual` 경로는 AWS 자격증명/큐가 없어 end-to-end 미실행.

## 6. DB connection 수정 (CloudNativePG)

가이드의 "DB 주소" 섹션: 실제 Postgres는 EKS 내부 CloudNativePG(RDS 아님), writer `dir-postgresql-rw.dir-db-ns.svc.cluster.local:5432/dai_run`, reader `dir-postgresql-ro.dir-db-ns.svc.cluster.local:5432/dai_run`.

- `services-msa/*/src/lib/db.ts` 12개는 전부 이미 `PGHOST` 등을 env로만 읽어서 코드 변경 불필요(Secret 값 자체는 이 저장소 밖 GitOps `dir-<workload>-db-secret`에 있음 — ops 쪽 갱신 사항).
- `dai-run-aws-gitops/environment-consumer/secret.example.yaml`의 `PGHOST`가 범용 placeholder(`postgres.example.internal`)였던 걸 `dir-postgresql-rw.dir-db-ns.svc.cluster.local`로 수정(writer 엔드포인트만 사용 — 이 컨슈머는 upsert 위주라 reader 분리 불필요). `PGUSER`/`PGPASSWORD`는 유지, SSL 옵션은 가이드에 명시 안 돼 있어 추가하지 않음.

## 7. 현재 상태 / 남은 판단

- **커밋도, push도, 실제 배포도 아직 안 했다.** `dai-run-aws`는 로컬 워킹트리 상태(`git add -A`로 스테이징만).
- GitOps 산출물(`/home/kevin/dai-run-aws-gitops/environment-consumer/`)도 로컬에만 있고 실제 GitOps 원격 저장소에는 push 안 함.
- **미결정 사항**: GitOps YAML을 지금 미리 push해둘지. 검토 결과 — 이미지 태그를 바꾸는 변경은 실제 ECR push 전엔 위험(기존에 떠 있는 서비스라면 롤아웃이 어중간하게 걸릴 수 있음). 반면 `environment-consumer`는 한 번도 배포된 적 없는 신규 워크로드라 placeholder 이미지 태그 그대로 먼저 apply해도 `ImagePullBackOff`로 조용히 대기할 뿐 안전하다고 판단. Secret/ServiceAccount/env var 같은 설정성 변경은 이미지와 무관하니 언제든 먼저 올려도 안전. → 사용자 최종 확인 대기 중.
- 다음 단계 후보: (1) GitOps 저장소 실제 push, (2) `aws/sns-sqs-messaging.yaml` CloudFormation + IAM 정책 작성(이번 패스에서 의도적으로 제외), (3) 실제 AWS 자격증명으로 이미지 빌드·push 및 e2e 검증.
