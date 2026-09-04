# DAI RUN 프로젝트 작업 및 인수인계 요약

- 정리 기준일: 2026-09-03 (KST)
- 이 문서가 다루는 주요 작업 기간: 2026-07-17 ~ 2026-08-29
- 범위: Application, AI 서비스, 데이터·메시징, AWS EKS, GitOps, CI/CD, 보안, 장애 대응
- 기준 상태: Application `af71bf3`, GitOps `ae168aa`, 통합 아카이브 `23f4055`

> 이 문서는 현재 작업공간의 소스, Git 이력, 기존 작업일지와 운영 인수인계서를 기준으로 작성했다. 커밋 작성자에 공용 계정, 자동화 계정, 여러 별칭이 섞여 있으므로 개인별 기여도를 단정하지 않고 이 작업공간에 실제 반영된 작업을 정리한다.

| 구분 | 이 문서에서 확인한 상태 |
|---|---|
| 최종 소스·매니페스트 | 원본 Application/GitOps의 최종 `main`과 아카이브 하위 tree가 일치함 |
| 검증 결과 | 당시 작업일지·사고 보고서·커밋에 기록된 결과를 인용함 |
| 현재 라이브 AWS/EKS | 이번 정리 과정에서는 접속하거나 재검증하지 않음 |
| GitHub 아카이브 | 이력 보존용이며 현재 설정 그대로는 배포 원본으로 사용할 수 없음 |

## 1. 한눈에 보는 결과

DAI RUN의 러닝 서비스와 AI 기능을 정비하고, 기존 환경 중심 구성을 AWS EKS용 운영 구조로 이전하는 작업을 수행했다. Bedrock 기반 RAG·개인화·코칭 기능, 메시징과 데이터 처리, 모바일 UX와 인증을 확장했으며, ECR·GitOps·Argo CD를 잇는 배포 흐름과 SonarQube·Trivy 보안 검사를 구성했다. 이전 과정에서 발생한 페이지 지연, DB 연결, 외부 DNS, Cognito·Bedrock 통신 문제를 원인 단위로 분석하고 코드와 매니페스트에 해결 내용을 반영했다.

핵심 결과는 다음과 같다.

- Bedrock Knowledge Base 기반 러닝 RAG 서비스와 입력 가드레일, 사용자 데이터 기반 개인화, 오늘의 코칭 API를 구축했다.
- Next.js 프런트엔드, 12개 TypeScript MSA, AI 서비스 3종, consumer·scheduler를 AWS 배포 대상으로 정비했다.
- Kafka에서 SNS/SQS로 옮길 수 있는 이중 메시징 경로와 outbox·멱등성·checkpoint 처리를 추가했다.
- AWS EKS용 ECR 이미지, HPA/KEDA, HTTPRoute, NetworkPolicy, External Secrets, Argo CD 구성을 GitOps로 관리하도록 전환했다.
- 변경 감지부터 test target이 있는 서비스의 단위 테스트, 정적 분석, 이미지 취약점 검사, ECR push, GitOps 갱신, Argo CD 배포까지 이어지는 CI/CD 흐름을 만들었다.
- 코스 페이지 초기 응답을 실측 5.58초에서 0.099초로 줄였고, EKS의 DB·DNS 장애를 해결했다.
- 원본 Application/GitOps 이력과 최종 트리를 2026-08-29 GitHub 아카이브에 보존했다.

## 2. 현재 저장소 구조

```text
dairun-migration/
├── application.git/              # 원본 Application GitLab 저장소의 bare mirror
├── gitops.git/                    # 원본 GitOps GitLab 저장소의 bare mirror
└── munju.github.io/               # 현재 GitHub 아카이브 작업 트리
    └── dai-run/
        ├── application/           # Application 최종 스냅샷
        ├── gitops/                # GitOps 최종 스냅샷
        └── WORK_SUMMARY.md        # 이 문서
```

`dai-run/application`과 `dai-run/gitops`는 독립 저장소나 submodule이 아니다. 아카이브 커밋 `23f4055`가 원본 Application `af71bf3`과 GitOps `ae168aa`를 두 부모로 병합했고, 두 하위 디렉터리의 tree가 원본 최종 `main`과 일치한다. 원본 브랜치 이력도 `application/*`, `gitops/*` 이름으로 보존돼 있다.

## 3. 기간별 작업 타임라인

| 기간 | 주요 작업 | 결과 |
|---|---|---|
| 07-17 ~ 07-18 | Spring Boot Bedrock 연동 실험, FastAPI RAG, 개인화·코칭·가드레일, 데모 UI와 Docker 구성 | 러닝 특화 AI API의 기본 기능과 로컬 실행 환경 확보 |
| 07-18 | 하드코딩 자격증명 제거, 실제 PostgreSQL 스키마 기반 조회 도구 교정, FastAPI 검증 | DB 조회와 프롬프트 문맥 생성 성공. 유효한 신규 자격증명이 준비되지 않아 당시 Bedrock 실호출은 미검증 |
| 08-04 | `/courses` 지연 분석, AI 호출 timeout·비동기화·중복 방지, PostGIS 인덱스 추가 | 초기 응답 5.58초 → 0.099초, nginx 전체 경로 0.49초 |
| 08-15 ~ 08-16 | Application/GitOps 저장소 분리, AWS 이전 착수 | EKS·ECR·CloudNativePG 기준의 별도 운영 구조 수립 |
| 08-16 ~ 08-18 | SNS/SQS 이중 메시징, DynamoDB checkpoint consumer, prod GitOps 리소스 구성 | AWS 관리형 서비스로 단계적 전환 가능한 코드·매니페스트 마련 |
| 08-17 ~ 08-19 | DB shadow canary, External Secrets, KEDA, workload별 egress, HTTPRoute, AI Dashboard 온보딩 | EKS 배포·확장·비밀 관리·통신 정책을 GitOps로 편입 |
| 08-18 ~ 08-19 | 비차단 SonarQube 분석, 차단형 Trivy 게이트, ZAP baseline, DB·외부 DNS 장애 대응 | 빌드 보안 검사와 장애 원인·복구 절차 문서화 |
| 08-19 ~ 08-22 | Redis 캐시, DynamoDB crew chat, Argo Rollouts 검증, 모바일 UX, Cognito 인증 | 서비스 성능·운영 배포·사용자 경험 개선 |
| 08-22 ~ 08-26 | AI Dashboard 실데이터 확대, Bedrock/Pod Identity 통신 보완, AI 결과 저장, 모바일·러닝화 UI 마무리 | 관측·통신 코드와 매니페스트, 사용자 흐름 보완 |
| 08-29 | Application·GitOps 최종본 통합 아카이브 | 소스와 양쪽 Git 이력을 GitHub에 보존 |

## 4. Application 및 AI 작업

### 4.1 러닝 RAG와 개인화

- Spring Boot `ai-service`로 Bedrock Knowledge Base의 `RetrieveAndGenerate` 연동을 먼저 검증했다. 이 서비스는 현재 비운영 실험 코드로 남아 있다.
- FastAPI `ai-rag-service`에 health, 데모, 채팅, 오늘의 코칭 API를 구성했다.
- Bedrock 세션 유지, 출처 URI 반환, 러너 프로필 기반 프롬프트, PostgreSQL 조회 결과 결합을 구현했다.
- 프롬프트 인젝션, 자격증명 요청, 의료 진단 오인, 러닝 도메인 이탈을 검사하는 애플리케이션 가드레일을 추가했다.
- 가드레일이 Bedrock 설정이나 장애와 독립적으로 먼저 동작하도록 호출 순서를 교정했다.
- 러닝 부상, 대회 준비, 다이어트, 복장·용품 등 RAG 원천 데이터를 확장했다.
- 한글 접두어 매칭 때문에 정상 러닝 질문이 차단되던 가드레일 오탐을 수정했다.

### 4.2 서비스와 데이터 처리

- Application 최종 스냅샷은 auth, course, recommendation, running record, crew, coaching, AI assistant, challenge, shoe, marathon, notification, media의 12개 Express/TypeScript MSA를 정의한다.
- producer와 consumer에 `kafka`, `sns-sqs`, `dual` 메시징 모드를 추가해 Kafka에서 AWS SNS/SQS로 단계적으로 전환할 수 있게 했다.
- SQS 성공 처리 후에만 메시지를 삭제하고, consumer 종료 처리와 DLQ 재수신 흐름을 고려했다.
- course stats에는 inbox 기반 멱등성 가드를, environment consumer에는 DynamoDB 증분 scan용 checkpoint와 health 파일을 추가했다.
- crew chat 저장소를 MongoDB에서 DynamoDB로 전환하고 필요한 egress 정책을 연결했다.
- 마라톤 정원·요청 제한과 코스 추천 패널에 Redis 캐시를 추가했다.
- 비밀번호 재설정 메일을 AWS SES SMTP에 연결했다.

### 4.3 사용자 화면과 인증

- 모바일 내비게이션, 챗봇 패널, 메뉴 슬라이드, 배너와 AI 추천 레이아웃을 반응형으로 다듬었다.
- 마이페이지를 하위 라우트로 분리하고 러닝 기록 동선, 리뷰 수정·삭제, 중단된 러닝 표시를 보완했다.
- 걷기 안내 화면에서 러닝을 수동 시작할 수 있게 했다.
- 러닝화 마모 분석 결과의 가독성을 높이고 중복 업로드 UI를 정리했다.
- 소셜 로그인을 Google 직접 OAuth에서 AWS Cognito 기반 흐름으로 전환하고, EKS의 DNS·IPv4·NetworkPolicy·Ambient Mesh 관련 통신 문제를 순차적으로 보완했다.

### 4.4 AI 운영 대시보드

- Prometheus, Loki, Tempo, PostgreSQL, Redis 등의 데이터를 조회하는 Next.js 기반 AI 운영 대시보드를 독립 서비스로 온보딩했다.
- 실제 HPA replica 수, Argo CD 배포 이력, Loki 기반 클러스터 로그 인사이트를 연결했다.
- Bedrock 진단 결과를 DB에 저장하고 후속 권장 명령을 제공하도록 확장했다.
- 실데이터 connector와 함께 mock 기준값·fallback을 유지한다. 최종 소스에서도 Predictive Autoscaling, 서비스 목록, incident 서술 등 여러 영역이 mock을 사용한다. 2026-08-03 인벤토리 작성 후 HPA, Changes, AI 진단이 추가 개발됐으므로 페이지별 최신 데이터 출처는 다시 점검해야 한다.

## 5. AWS EKS 및 GitOps 작업

GitOps 최종 스냅샷에는 다음 작업이 반영돼 있다.

- prod backend, frontend, AI 워크로드의 이미지를 Harbor 중심 구성에서 ECR 이미지 digest pin 중심 구성으로 전환했다.
- EKS node group의 `workload=app` 배치 기준을 적용하고, API 서비스는 HPA, 비동기 consumer는 KEDA로 desired state를 관리했다.
- backend·frontend·AI용 Argo CD Application과 AppProject를 구성하고, 필요한 리소스 종류와 대상 namespace를 제한했다.
- ConfigMap, Service, Deployment/Rollout, HTTPRoute, NetworkPolicy, ExternalSecret, SecretStore, TriggerAuthentication을 GitOps에 편입했다.
- course recommendation DB shadow와 AI assistant SQS canary를 구성해 새 연결을 본 배포 전에 검증할 수 있게 했다.
- PostgreSQL, DynamoDB, SQS/SNS, Cognito, Bedrock, EKS Pod Identity, Kubernetes API를 대상으로 workload별 네트워크 egress 규칙을 분리·추가했다. IAM과 RBAC 권한은 별도 확인 대상이다.
- 격리된 namespace에서 Argo Rollouts blue/green smoke test를 수행한 뒤 prod frontend를 Rollout으로 전환했다.

검증된 blue/green 결과:

- active/preview Service 모두 HTTP 200
- preview가 promotion 전까지 별도 ReplicaSet을 선택
- 수동 promotion 성공
- promotion 후 active selector 전환
- 이전 ReplicaSet이 30초 뒤 0개로 축소
- 최종 Rollout `Healthy`, Ready Pod 2개, Warning event 없음

## 6. CI/CD와 보안

저장소에 구현된 배포 흐름은 다음과 같다.

```text
Application 변경
  → 변경 서비스 탐지
  → test target이 있는 변경 서비스 6개의 단위 테스트
  → SonarQube 분석
  → 컨테이너 이미지 빌드
  → Trivy HIGH/CRITICAL 보고 및 수정 가능한 CRITICAL 차단
  → ECR push와 digest 확정
  → GitOps 배포 MR 생성
  → GitLab 정책상 필요한 승인·파이프라인 조건이 충족되면 자동 병합 요청
  → Argo CD sync
  → EKS 배포
```

- CI 서비스 레지스트리에는 frontend/auth-web, 12개 MSA, AI 3종, AI Dashboard, consumer·scheduler 등 23개 빌드 대상이 등록돼 있다.
- SonarQube는 분석과 Quality Gate 결과 수집을 수행하며, 기존 코드 기준선을 설정한 뒤 검증 파이프라인 성공을 확인했다.
- Trivy는 ECR push 전에 이미지별 보고서를 만들고, 수정 가능한 CRITICAL 취약점이 있으면 배포를 차단한다.
- OWASP ZAP baseline은 운영과 격리된 smoke 환경에 비활성(`suspend: true`)·report-only 형태로 추가했다.
- Git push option으로 GitOps 배포 MR을 만들고 `merge_when_pipeline_succeeds`를 요청하도록 설정했다. 실제 병합은 당시 GitLab 프로젝트의 승인·파이프라인 정책에 따른다.
- 수동 배포로 생기는 drift와 승인형 GitOps 배포, cold/warm Docker cache를 보여 주는 CI/CD 시연 절차를 문서화했다.

현재 SonarQube는 `allow_failure: true`인 비차단 모드이며, ZAP도 정기 실행 또는 배포 차단 단계로 승격되지는 않았다.

## 7. 장애 분석 및 해결

| 일자 | 증상 | 근본 원인 | 조치와 결과 |
|---|---|---|---|
| 08-04 | 코스 탐색 첫 로딩이 수 초 이상 지연 | SSR이 timeout 없는 Bedrock 추천 생성을 동기적으로 기다림 | timeout, 백그라운드 처리, in-process 중복 방지, 재조회 추가. 초기 응답 5.58초 → 0.099초 |
| 08-18 | Pod는 Running이지만 백엔드 DB 연결 실패 | 온프레미스 DNS 잔존, 잘못된 CloudNativePG 라벨, DB role 5개 누락 | ConfigMap 26개와 NetworkPolicy 교정, role 생성·GRANT, 전체 연결 확인 |
| 08-19 | EKS workload의 외부 DNS 조회 timeout | 실제 kube-dns Service IP가 baseline egress 정책에 없음 | 실제 ClusterIP 허용 후 외부 이름 조회 복구, 정책을 GitOps에 반영 |
| 08-22 ~ 08-25 | Cognito와 AI Dashboard의 외부 서비스 연결 불안정 | IPv4/DNS, Ambient capture, VPC endpoint·Pod Identity egress 조건 | IPv4 우선, Ambient opt-out, 실제 endpoint ENI와 Pod Identity endpoint 허용 |

DB·DNS 장애 모두 liveness/readiness만으로는 드러나지 않았다. 이후 운영 점검에서는 Pod 상태뿐 아니라 실제 DB `SELECT 1`, DNS 조회, 외부 API 호출을 함께 확인해야 한다.

## 8. 확인된 검증 근거

| 검증 항목 | 당시 결과 | 일자·환경 | 근거 |
|---|---|---|---|
| FastAPI health·demo·가드레일 | 로컬 API 호출 성공 | 07-18, 로컬 Ubuntu | [Codex 작업일지](application/task-descriptions/WORKLOG_2026-07-18_CODEX.md) |
| PostgreSQL 개인화 조회 | 프로필, 러닝, 날씨·대기질, 주변 코스, 챌린지 조회 성공 | 07-18, 실제 PostgreSQL 읽기 전용 조회 | [Codex 작업일지](application/task-descriptions/WORKLOG_2026-07-18_CODEX.md) |
| 코스 지연 개선 | 초기 응답 5.58초 → 0.099초, nginx 전체 경로 0.49초 | 08-04, 당시 실행 스택 | [지연 장애 보고서](application/task-descriptions/INCIDENT_REPORT_2026-08-04_course-explore-latency.md) |
| 메시징 전환 정적 검사 | TypeScript 6개 서비스 `tsc --noEmit`, legacy consumer 2개 `node --check` 성공 | 08-16, 로컬 | [AWS 이전 작업일지](application/task-descriptions/WORKLOG_2026-08-16_CLAUDE.md) |
| CI 품질 단계 | Pipeline #53의 runner, 변경 감지, 단위 테스트, SonarQube 성공 | 08-19, GitLab CI | [보안 게이트 문서](application/docs/GITLAB-SECURITY-GATES.md) |
| Argo Rollouts | active/preview HTTP 200, promotion·scale-down 성공 | 08-19, 격리 EKS smoke namespace | [blue/green 검증 문서](gitops/docs/AWS-ARGO-ROLLOUTS-BLUEGREEN-SMOKE.md) |
| EKS DB 연결 | 수정 후 전 서비스 `SELECT 1` 확인 | 08-18, 당시 EKS | [DB 장애 보고서](gitops/docs/INCIDENT-2026-08-18-db-connectivity.md) |
| EKS 외부 DNS | 실제 kube-dns 허용 후 외부 이름 조회 복구 | 08-19, 당시 EKS | [DNS 장애 보고서](gitops/docs/INCIDENT-2026-08-19-external-dns-resolution-failure.md) |

이 문서를 작성하면서 현재 소스를 다시 빌드하거나 라이브 AWS/EKS 상태를 재검증하지는 않았다. 위 항목은 저장소에 남은 당시 검증 기록을 요약한 것이다.

## 9. 현재 상태

- 조사 시작 시 GitHub 아카이브의 `main`은 `origin/main`과 일치하고 working tree가 깨끗했다. 현재는 새로 작성한 `WORK_SUMMARY.md`만 미추적 상태다.
- 원본 Application 최종본: `af71bf3` (2026-08-26)
- 원본 GitOps 최종본: `ae168aa` (2026-08-26)
- 통합 아카이브: `23f4055` (2026-08-29)
- 현재 아카이브는 보존용 구조다. Argo CD 매니페스트는 여전히 원본 내부 GitLab 저장소와 기존 경로를 가리키므로, GitHub 아카이브를 그대로 배포 원본으로 사용할 수는 없다.

## 10. 남은 작업과 점검 우선순위

### P0 — 운영 재개·안전성 확인

- [ ] course recommendation의 Bedrock 모델 ARN이 현재 AWS 계정과 일치하도록 교정한다.
- [ ] shoe-life AI ConfigMap에 분석 결과 저장 활성화 설정이 필요한지 확인하고 반영한다.
- [ ] AI assistant/course recommendation의 이름이 겹치는 이중 Deployment가 의도된 것인지 정리한다.
- [ ] Bedrock VPC endpoint, Pod Identity IAM role과 최소 권한 정책이 현재 라이브에 실제 반영됐는지 확인한다.
- [ ] 현재 GitHub 원격의 공개 범위를 즉시 확인한다. 외부 공개 상태라면 링크된 문서·매니페스트의 내부 주소와 AWS/Kubernetes 운영 식별자 노출 범위를 점검하고, 과거 노출 가능 자격증명의 폐기·교체 여부를 확인한다.

### P1 — 품질·보안 후속 작업

- [ ] SonarQube 품질 기준이 안정되면 `allow_failure: false`로 복구한다.
- [ ] ZAP baseline을 최소 2회 수동 검증한 뒤 규칙별 허용 기준, 정기 실행, GitLab DAST gate 승격 여부를 결정한다.
- [ ] 루트 웹과 AI Dashboard의 자동 단위 테스트를 추가하고, 현재 SQS 중심인 CI 테스트 범위를 넓힌다.

### P2 — 기능·구조 후속 작업

- [ ] AI 추천의 임시 고정 좌표를 실제 GPS 연동으로 교체한다.
- [ ] 코스 추천 생성의 in-process 중복 방지를 다중 Pod에서도 유효한 DB lock 등으로 보강한다.
- [ ] `application/main`에 없는 AI 크루 조회, 챌린지 키워드, marathon/shoe 조회 권한, “운동화” 동의어 브랜치를 검토해 병합·폐기 여부를 결정한다.
- [ ] GitOps README의 `selfHeal`, 보안 게이트 문서의 SonarQube 대기 설정, 과거 인계서의 push 대기 문구, AI Dashboard 실측/mock 인벤토리처럼 현재 소스와 달라진 내용을 갱신한다.

### 조건부 — GitHub 아카이브를 배포 원본으로 전환할 때

- [ ] Argo CD repo URL과 source path를 새 저장소 구조에 맞게 변경한다.
- [ ] 기존 내부 GitLab을 계속 사용할지 GitHub로 이전할지 결정하고, 접근 자격증명과 webhook/CI 연동을 함께 재구성한다.

## 11. 대표 커밋

| 커밋 | 영역 | 내용 |
|---|---|---|
| `3e262b5` | Application | SNS/SQS consumer와 이미지 파이프라인 추가 |
| `e839646` | Application | environment DynamoDB consumer checkpoint 전환 |
| `489234c` | Application | SonarQube·Trivy 배포 보안 게이트 |
| `b4acd7c` | Application | crew chat MongoDB → DynamoDB 전환 |
| `dc68750` | Application | 마라톤·코스 추천 Redis 캐시 |
| `e517a13` | Application | 모바일 반응형 UI와 마이페이지 라우팅 개선 |
| `01dad31` | Application | Cognito 소셜 로그인 전환 |
| `e0a9fd7` | Application | AI 진단 결과 저장과 권장 명령 |
| `961315c` | Application | 모바일·인증 최종 보완 |
| `40304b7` | GitOps | EKS production MSA GitOps 패키지 |
| `c4ede4f` | GitOps | DB DNS·NetworkPolicy·ConfigMap 장애 조치 |
| `85b604c` | GitOps | kube-dns egress 누락 해결 |
| `903e65a`, `4f2f347` | GitOps | blue/green smoke test와 성공 기록 |
| `50143d9` | GitOps | prod frontend Argo Rollouts 전환 |
| `38a6fef` | GitOps | Cognito endpoint egress 최종 보완 |
| `23f4055` | Archive | Application·GitOps 최종본과 이력 통합 |

## 12. 상세 근거 문서

### Application

- [2026-07-17~18 초기 AI/RAG 작업일지](application/task-descriptions/WORKLOG_2026-07-17_18.md)
- [2026-07-18 Codex 작업일지](application/task-descriptions/WORKLOG_2026-07-18_CODEX.md)
- [2026-08-04 코스 탐색 지연 장애 보고서](application/task-descriptions/INCIDENT_REPORT_2026-08-04_course-explore-latency.md)
- [2026-08-16 AWS 이전 작업일지](application/task-descriptions/WORKLOG_2026-08-16_CLAUDE.md)
- [GitLab 배포 보안 게이트 운영 절차](application/docs/GITLAB-SECURITY-GATES.md)
- [코스탐색 CI/CD 시연 가이드](application/docs/CICD-DEMO-COURSE-PAGE.md)
- [AI Dashboard 실측·mock 인벤토리](application/ai-dashboard/docs/real-vs-mock-inventory.md)
- [AI Dashboard 알림 구축 보고서](application/ai-dashboard/docs/alerting-setup-report.md)

### GitOps 및 운영

- [EKS GitOps 전환 인계서](gitops/docs/EKS-GITOPS-HANDOFF.md)
- [2026-08-19 EKS 운영 인수인계](gitops/docs/EKS-OPS-HANDOFF-2026-08-19.md)
- [2026-08-18 DB 연결 장애 보고서](gitops/docs/INCIDENT-2026-08-18-db-connectivity.md)
- [2026-08-19 외부 DNS 장애 보고서](gitops/docs/INCIDENT-2026-08-19-external-dns-resolution-failure.md)
- [AWS Argo Rollouts blue/green smoke test](gitops/docs/AWS-ARGO-ROLLOUTS-BLUEGREEN-SMOKE.md)
- [OWASP ZAP staging baseline 도입 절차](gitops/docs/ZAP-STAGING-BASELINE-ROLLOUT.md)
- [EKS GitOps README](gitops/README-EKS-GITOPS.md)
