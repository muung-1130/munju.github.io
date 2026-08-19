# CLAUDE.md — D.A.I. RUN 공통 개발·Kubernetes 마이그레이션 지침

> 프로젝트: **D.A.I. RUN(데이런)**
> 목적: Claude, GPT, Codex 등 팀원이 사용하는 AI가 동일한 사실·코드·인프라 기준으로 작업하게 한다.
> 기준일: **2026-07-30**
> 현재 단계: **Docker 기반 애플리케이션은 이미 서비스별로 나뉘어 운영 중 — 온프레미스 Kubernetes로 마이그레이션 준비**
> 다음 단계: Kubernetes 이식·검증 후 AWS/EKS 이전 검토

---

## 0. 가장 먼저 지킬 기준

### 0.1 문서와 코드가 충돌할 때의 우선순위

현재 상태와 목표 상태의 우선순위를 분리한다.

**CURRENT(현재 사실)**

1. 실제 클러스터·스택 중인 워크로드·운영 DB
2. 저장소의 현재 코드, 적용된 DB migration, 실제 manifest와 실행 설정
3. 최신 검증 결과와 로그
4. 이 문서의 명시 사항

**TARGET(목표 설계)**

1. 사용자의 현재 요청과 명시적 승인
2. 이 `CLAUDE.md`의 최신 결정
3. 최신 Kubernetes 온프레미스안에서 서로 일치하는 항목
4. 최신 DB·API·Kafka 명세

과거 문서의 항목을 현재 설계의 사실로 자동 복원하지 않는다. 자료 간 값이 다르면 임의로 하나를 선택하지 말고 현재 코드와 실제 클러스터를 확인한다.

### 0.2 현재 상태와 목표 상태를 섞지 않는다

- **현재 구현**: `app/`(Next.js) 코드베이스는 남아 있지만 실제 트래픽은 nginx가 대부분 `services-msa/`의 12개 독립 Express 서비스로 라우팅한다. Next.js는 `frontend`(정적·페이지 서빙)와 `auth-web`(NextAuth 카탈로그 전용, `APP_ROLE=backend`로 빌드하되 컨테이너명은 `auth-web`으로 축소·개명됨) 두 컨테이너로만 살아 있다. `app/api/**` 아래 나머지 라우트 핸들러(코스, 크루, 러닝 등)는 코드가 남아 있을 뿐 nginx가 더는 그쪽으로 보내지 않는 **도달 불가능한 죽은 코드**다.
- **Kubernetes 목표**: `dir-*` 이름을 쓰는 도메인별 Deployment, StatefulSet, CronJob, Job, Operator 기반 리소스로 완전 분리한다.
- **AWS 목표**: EKS와 관리형 서비스를 고려하지만 현재 manifest와 구현을 AWS 전용으로 바꾸지 않는다.

문서든 답변이든 `현재 구현`, `K8s 목표`, `향후 검토` 중 어느 상태인지 명시한다. 목표 설계를 이미 구현된 사실처럼 표현하지 않는다.

### 0.3 임의 추가 금지

- 저장소, 이전 문서, 사용자 요청에 없는 서비스·도구·라벨·포트·환경변수·DB 컬럼을 임의로 만들지 않는다.
- 새 인프라 툴, Operator, Gateway, CI 도구를 추가하려면 필요성·운영 비용·대체안·마이그레이션 영향을 먼저 설명하고 승인을 받는다.
- **Jenkins는 현재 채택 도구가 아니다. 추가하거나 언급을 되살리지 않는다.**
- `alphacar-*`, 다른 프로젝트 namespace 코드, 샘플 이미지, 템플릿 값을 DAI RUN 운영 리소스로 재사용하지 않는다.
- 사용자가 직접 확인한 항목은 기존 코드 구조나 요청 없이 재배열하지 않는다. 새 항목이 필요하면 승인 후 기존 규칙에 맞춰 추가한다.

### 0.4 저장소 범위

사용자가 별도로 `dai-run-repo` 또는 `k8s 서버`라고 명시하지 않는 이상, 모든 요청은 이 저장소(`/home/kevin/dai-run-aws`, GitLab `dai-run/application`)를 대상으로 한다.

- `/home/kevin/dai-run-repo`는 이 프로젝트와 무관한 별도 저장소다(GitHub `dai-run/dai-run.git`, Jenkins 배포 — Jenkins는 §0.3에 따라 이 프로젝트의 채택 도구가 아니다). 같은 애플리케이션처럼 보이는 코드가 있어도 리모트·브랜치·커밋 이력이 전혀 다른 별개 프로젝트이므로, 명시적 지시 없이는 그쪽 코드나 로컬 컨테이너를 수정하지 않는다.
- 이 호스트에 로컬로 떠 있는 도커 컨테이너(`dai-run-frontend`, `dai-run-mongo` 등)는 `dai-run-repo` 기준으로 빌드된 것이며 `dai-run-aws` 코드 변경과 무관하다. `dai-run-aws`의 실제 배포는 GitLab MR이 `main`에 병합된 뒤 CI/CD가 처리한다(§19.6, §부록 A 참고) — 로컬에서 `dai-run-aws`를 도커로 재현하려면 컨테이너 이름이 겹치므로 별도 프로젝트명/포트로 새로 띄워야 한다.

---

## 1. 프로젝트 개요와 현재 우선순위

### 1.1 서비스 목표

D.A.I. RUN은 위치, 날씨·미세먼지, 러닝 기록, 사용자 선호를 결합해 코스 추천, 러닝 기록, 커뮤니티, 러닝화, 챌린지, 마라톤, AI 코칭을 제공하는 웹·앱 기반 러닝 플랫폼이다.

주요 사용자 흐름:

1. 위치와 러닝 목표·선호를 확인한다.
2. 최근 기록, 날씨, 미세먼지, 코스 난이도의 시작 조건을 조회한다.
3. 규칙 엔진이 권장 거리·강도·주의사항을 계산한다.
4. PostGIS가 실제 코스 후보를 검색한다.
5. AI가 근거와 함께 결과를 설명한다.
6. 러닝 중 GPS·시간·거리·페이스·심박 데이터를 기록한다.
7. 러닝 완료 이벤트가 챌린지, 크루 통계, AI 메시지 등 후행 처리를 실행한다.

### 1.2 현재 작업 우선순위

1. 기존 Docker 실행 경로와 데이터를 보존하며 Kubernetes로 이전
2. 핵심 앱, DB, Kafka, 스토리지, 관측 스택의 안정적인 배치
3. Service DNS, Secret, ConfigMap, Probe, requests/limits, HPA/KEDA 연결
4. PostgreSQL·MongoDB·Kafka·MinIO 등 기존 데이터 마이그레이션과 검증
5. Istio 단일 진입점, NetworkPolicy, RBAC, 백업·복구 구성
6. MELT 관측과 부하 테스트를 통한 리소스·스케일 기준 보정
7. 온프레미스 K8s 안정화 후 AWS/EKS 이전 설계

현재는 AWS 리소스 작성보다 Kubernetes 구현과 검증을 우선한다.

### 1.3 프로젝트 일정과 역할

- 전체 프로젝트: 2026-07-08 ~ 2026-08-20
- Docker 체크포인트: 2026-07-21
- Kubernetes 체크포인트: 2026-08-04
- AWS Cloud 체크포인트: 2026-08-19
- 이정진: 확장, 통합, Kubernetes, 관측
- 김문주: DB/ERD, AI
- 김하주: 데이터, 보안, 러닝화·오디오
- 장수아: CI/CD, Harbor, Kubernetes, 비용

---

## 2. 제품 기능 범위

### 2.1 러닝 코스 추천

- GPS 기준 가까운 코스와 동일 행정동 코스를 우선한다.
- 기본 검색 반경은 5km다. 반경 확대는 상권과 비용을 명시한다.
- 서울 지역 데이터를 우선한다.
- SNS 유명 코스, 관리자 코스, 공공데이터 코스, 사용자 코스, AI 추천 결과를 구분한다.
- 마라톤 연습 코스와 사용자가 만든 코스를 제공한다.
- 코스는 거리, 난이도, 노면, 경관, 경사도, 현재 날씨를 고려한다.
- 사용자는 코스를 찜하고 평점·노면·경치·경사 등의 리뷰를 남길 수 있다.
- 추천 결과에는 순위뿐 아니라 추천 이유를 제공한다.
- 공간 후보 검색은 PostGIS가 담당한다. LLM이 DB 공간 검색이나 실제 도로 경로 계산을 대신하지 않는다.

### 2.2 러닝 기록과 트레이싱

- 앱은 GPS, 시간, 거리, 페이스, 걸음 수, 가능한 경우 심박수를 수집한다.
- 웹은 수동 입력을 허용한다.
- 사용자는 러닝에 사용한 신발을 지정할 수 있다.
- 네트워크 단절을 고려해 GPS 샘플을 로컬 버퍼에 저장한 뒤 배치 전송한다.
- 러닝 완료는 중복 처리에 안전한 이벤트로 후행 도메인에 전달한다.
- 스마트워치 연동과 건강 데이터 연동은 확장 대상으로 유지한다.

### 2.3 크루와 채팅

- 지역, 목표 거리, 최소·최대 페이스, 주간 빈도, 정원 조건으로 크루를 검색한다.
- 한 사용자의 모집 글 수와 같은 조건을 서버에서 검증한다.
- 입장 방식은 `OPEN` 또는 `APPROVAL`이다.
- 내 크루, 모집 글, 가입 신청, 채팅, 주간 크루 랭킹을 제공한다.
- 크루 챌린지는 크루 간 거리·페이스 대결을 지원한다.
- 메시지 이력, 클라이언트 메시지 ID, 읽음 상태, WebSocket 연결 종료 처리를 고려한다.

### 2.4 러닝화 추천

- 쿠션, 안정성, 반발력, 발볼, 주로 달리는 노면, 거리, 페이스, 예산을 입력받는다.
- 취향 기반 추천과 인기 순위 추천을 구분한다.
- 최종 원본은 PostgreSQL이 소유하고 검색용 복제본은 Elasticsearch에 둔다.
- 사용자는 보유 신발 정보, 구매일, 대표 이미지, 상태를 관리할 수 있다.

### 2.5 러닝화 수명 예측

- 구매일·누적 거리와 여러 각도의 마모 사진을 조합한다.
- 사진 분석은 관찰 가능한 외관 마모만 평가하고 의학적 진단은 하지 않는다.
- 분석 결과, 잔여 거리·기간, 교체 권장일을 스냅샷으로 저장한다.
- 심한 또는 드문 마모 시 알림을 보낼 수 있게 설계한다.
- 이미지 품질, 동일 신발 여부, MIME type, 크기, 해상도, 소유권을 검증한다.

### 2.6 환경 기반 코칭

- 기상청·에어코리아 데이터를 수집하고 정규화한다.
- 기온, 강수, 습도, 대기질, 최근 운동량과 목표를 기준으로 권장 거리·강도를 계산한다.
- 안전 임계치와 이동 계산은 Rule Engine이 담당하고 AI는 결과의 근거를 설명한다.
- 외부 API 장애 시 마지막 정상 데이터와 수집 시각을 함께 표시한다.

### 2.7 챌린지

- 개인, 공개, 크루 챌린지를 지원한다.
- 지표는 거리, 횟수, 페이스, 연속 기록이다.
- 공개 챌린지는 `challenge_series` 템플릿과 주차별 `challenges` 인스턴스를 구분한다.
- 일요일 시작, 토요일 종료 등 한국 시간 기준의 주간 반복을 지원한다.
- 거리·페이스·시간·심박·케이던스·고도·출처·하루 시작 시각 조건을 검증한다.
- `run.completed` 계열 이벤트의 중복 반영을 막는다.

### 2.8 AI 러닝 비서

- 모든 주요 페이지에서 접근할 수 있다.
- 사용자 프로필, 선호, 최근 기록, 날씨, 미세먼지, 코스, 보유 러닝화, 대화 정보를 Tool Calling으로 조회한다.
- RAG, Guardrails, Provider Adapter를 사용한다.
- 최신 데이터가 필요한 답변은 실제 도구 결과를 사용한다.
- 데이터가 없으면 임의의 기록이나 수치를 만들지 않는다.
- 건강 관련 답변은 진단이 아니라 운동 참고 정보로 표현한다.

### 2.9 마라톤

- 대회 목록, 상세, 일정, 접수 정보, 정원 상태, 공식 사이트를 제공한다.
- 동시성·선착순 대회를 구분할 수 있다.
- 신청과 취소의 멱등성을 보장한다.
- 접속 폭주를 대비해 사전 확장, 대기열, 재시도, DLQ, 상태 조회를 설계한다.
- 단순 CPU HPA만 믿지 말고 RPS·queue depth·DB connection·외부 연동 회선도 함께 본다.

### 2.10 심박, 오디오, 알림

- 심박 Zone 1~5의 시간 비율과 그래프를 제공한다.
- 실시간 심박 코칭은 앱·워치 연동 후 별도 기준을 검증해 적용한다.
- 관광 정보를 포함한 다국어 오디오 가이드는 후행 기능이다.
- 알림은 인앱을 기본으로 하고 푸시·메일은 전송 이력과 재시도 정책을 추가한 뒤 확장한다.

### 2.11 화면 구조

- 홈: 오늘의 추천 코스, 날씨·미세먼지, 오늘의 기록, 챗봇, 이동 간격 추천, 러닝화 추천
- 코스: 주변 코스, 마라톤 연습 코스, 사용자 코스, 찜한 코스
- 코스 상세: 지도·경로·상세 정보·리뷰
- 트레이싱: GPS·페이스·시간 기록, 수동 입력, 신발 선택, 심박 기록
- 러닝 크루: 내 크루, 모집 글, 채팅, 주간 랭킹
- 챌린지: 개인, 공개, 크루, 참가 중 목록
- 러닝화 수명: 사진 업로드, 구매일 기반 예측
- 마라톤: 목록, 상세 분석, 신청
- 개인 맞춤 러닝화 추천: 취향 퀴즈 추천
- 마이페이지: 프로필·설정, 내 크루, 신청 대회, 보유 신발, 완주 코스, 코스 리뷰, 문의 내역

사이트맵만 보고 별도 백엔드나 서비스가 DB를 추가하지 않는다. 현재 서비스 경계와 실제 구현을 먼저 확인한다.

---

## 3. 현재 저장소 구현

### 3.1 현재 애플리케이션 구조

- **Next.js 계층**: `app/`, `lib/`, `components/`는 Next.js `14.2.35`, React `18.2`, TypeScript `5.4.3`, Node.js 20으로 빌드된다. `Dockerfile.frontend`는 `APP_ROLE=frontend`, `Dockerfile.auth-web`은 `APP_ROLE=backend`로 같은 빌드 산출물의 경로 접근만 구분한다(컨테이너 이름은 `frontend`/`auth-web`). `middleware.ts`가 이 값을 보고 `/api/*` 요청 허용 여부를 가른다.
- **auth-web의 실제 범위**: `nginx/locations.conf`는 `/api/auth/` 중 next-auth 카탈로그(`signin`/`signout`/`session`/`csrf`/`callback`/`providers`/`error`)와 `/api/health`만 `auth-web`으로 보낸다. next-auth v4의 CSRF 이중 제출 쿠키와 JWT 인코딩이 Next.js Route Handler에 강하게 결합돼 있어 이 부분만 Next.js로 남겼다.
- **`app/api/**`의 나머지 라우트는 죽은 코드다.** signup, check-username, courses, crew, runs, challenges, shoes, marathon, notifications, support, ai-assistant 등 부록 A에 나열된 나머지 전부는 nginx가 대응하는 `services-msa/*` 컨테이너로 직접 라우팅하므로 Next.js 쪽 구현에는 실제 트래픽이 도달하지 않는다. 코드 삭제는 아직 하지 않았으므로 신규 기능을 이 경로에 추가하지 않는다.
- **`services-msa/`가 실제 백엔드다.** 12개 Express+TypeScript 서비스가 각자 컨테이너로 떠 있고(4001~4012 포트), 이 중 5개는 API 컨테이너 외에 별도 Consumer/Worker 컨테이너를 추가로 갖는다(§3.2). 각 서비스는 자기 소유 PostgreSQL 스키마만 최소권한 role로 접근한다(§5.1).
- 실제 코드 분리가 되는 MSA이므로 이미지가 두 개라는 이유만으로 독립 서비스라고 단정하지 않는다 — 반대로 services-msa는 이미 독립 코드베이스·독립 컨테이너·독립 DB 계정을 갖췄으므로 "장차 분리해야 할 모놀리스"로 취급하지 않는다.
- 현재 Docker 진입점은 nginx이며 Kubernetes 목표 진입점은 Istio Ingress Gateway다.

### 3.2 현재 서비스 인벤토리

#### services-msa (API 컨테이너, 각 4000번 내부 포트)

| 서비스 | 외부 포트 | 소유 스키마 | K8s 목표 |
|---|---:|---|---|
| auth-service | 4001 | `auth_user` | `dir-auth-user`, 8101 |
| course-service | 4002 | `course` | `dir-course`, 8102 |
| course-recommendation-service | 4003 | `course_recommendation` | AI namespace, 8201 |
| running-record-service | 4004 | `running_record` | `dir-running-record`, 8103 |
| crew-service | 4005 | `crew`, `crew_chat`(관계 메타데이터만) | `dir-crew`/`dir-crew-chat`, 8104/8105 |
| coaching-service | 4006 | `coaching`, `environment` | `dir-coaching`/`dir-environment`, 8106/8110 |
| ai-assistant-service | 4007 | `ai_assistant` | AI namespace, 8202 |
| challenge-service | 4008 | `challenge` | `dir-challenge`, 8108 |
| shoe-service | 4009 | `shoe` | `dir-shoe`, 8109 |
| marathon-service | 4010 | `marathon` | `dir-marathon`, 8111 |
| notification-service | 4011 | `notification`, `support` | `dir-notification`/`dir-support`, 8112/8107 |
| media-service | 4012 | `media` | `dir-media`, 8113 |

#### services-msa (Consumer/Worker 컨테이너 — API와 별도 컨테이너, 포트 없음)

- `running-record-service-outbox-publisher`: `running_record.outbox_events` 폴링 → Kafka 발행
- `challenge-service-consumer`: `running.run-completed-events` 구독 + `challenge.outbox_events` 발행
- `crew-service-consumer`: `running.run-completed-events` 구독
- `ai-assistant-service-consumer`: `running.run-completed-events` 구독
- `notification-service-consumer`: `challenge.challenge-completed-events` 구독

같은 논리 서비스라도 API(HPA 대상)와 Consumer/Worker(KEDA 대상)는 스케일링 특성이 달라 K8s에서도 별도 Deployment로 유지한다(§14.1 참고).

#### AI FastAPI 백엔드 (services-msa 밖, 별도 컨테이너)

| 구성요소 | 현재 구현 | Docker 포트 | K8s 목표 |
|---|---|---:|---|
| AI RAG/Assistant | FastAPI, Bedrock Knowledge Base | 8000 | `dir-ai-assistant`, 8202 |
| Course Recommendation AI | FastAPI, PostGIS 후보 + Bedrock 설명 | host 8001 → container 8000 | `dir-course-recommendation`, 8201 |
| Shoe Life AI | FastAPI, Bedrock Vision, 이미지 품질 검증 | 8002 | `dir-shoe-life-ai`, 8204 |

#### 레거시 Kafka Consumer/Scheduler (services-msa 밖, 루트 docker-compose.yml)

| 구성요소 | 현재 구현 | K8s 목표 |
|---|---|---|
| Course Stats Consumer | Node.js + KafkaJS + PostgreSQL | Deployment + KEDA |
| Crew Notification Consumer | Node.js + KafkaJS + PostgreSQL | Deployment + KEDA |
| Crew Stats Scheduler | Node.js + PostgreSQL | CronJob |
| Challenge Weekly Scheduler | Node.js + PostgreSQL | CronJob |
| Environment Ingester | Node.js 수집 배치 | CronJob |
| Elasticsearch Sync | TypeScript sync script(`scripts/sync-elasticsearch.ts`) | Job + CronJob |

**`run-completion-consumer`는 2026-07-29에 완전히 폐기했다.** `running.run-completed-events`를 구독해 레거시 Next.js `/api/internal/run-completed`로 브리지하던 역할이었는데, challenge-service-consumer/crew-service-consumer/ai-assistant-service-consumer 세 네이티브 Consumer가 각자 직접 구독하는 구조로 대체됐다. 부록 A의 `/api/internal/run-completed`, `app/api/internal/**` 코드는 이 소비자가 사라지면서 함께 죽은 경로가 됐다.

`ai-service/`(Spring Boot)는 Bedrock RAG 호출을 실험하던 별도 코드다. 현재 운영 백엔드 실체나 전체 서비스 목표 자료로 해석하지 않는다. 새 Spring Boot 또는 Spring Cloud Gateway 도입은 사용자 승인 없이 진행하지 않는다.

### 3.3 현재 페이지

- `/`
- `/courses`, `/courses/[courseId]`
- `/run/[courseId]`
- `/crew`
- `/challenges`, `/challenges/[challengeId]`
- `/marathon`, `/marathon/[raceId]`, `/marathon/[raceId]/official`
- `/shoes`, `/shoes/[userShoeId]`, `/shoes/guide`
- `/mypage`
- `/support`, `/support/[inquiryId]`
- `/login`
- `/healthz`

### 3.4 현재 API 경로

외부 계약은 nginx가 받는 `/api/**`다. 기존 클라이언트를 깨뜨리며 일괄적으로 `/api/v1`로 바꾸지 않는다. 독립 FastAPI 서비스는 `/api/v1/**`를 사용한다. K8s 이전 시 Istio/Gateway에서 외부 계약과 내부 서비스 경로를 분리할 수 있다.

실제 처리 주체(§3.1~3.2 참고, 상세 표는 부록 A):

- 인증: `/api/auth/**`(대부분 auth-service, next-auth 카탈로그만 auth-web), `/api/user-running-preferences`
- 코스: `/api/courses/**`(course-service)
- 위치: `/api/dong/**`, `/api/geo/**`(course-service)
- 러닝: `/api/runs/**`(running-record-service)
- 러닝 통계: `/api/mypage/**`(running-record-service)
- 크루: `/api/crew/**`(crew-service)
- 챌린지: `/api/challenges/**`(challenge-service)
- 러닝화: `/api/shoes/**`, `/api/user-shoes/**`(shoe-service)
- 마라톤: `/api/marathon/**`(marathon-service)
- AI: `/api/ai-assistant/**`(ai-assistant-service), `/api/ai-recommendations/**`(course-recommendation-service)
- 알림: `/api/notifications/**`(notification-service)
- 고객지원: `/api/support/**`(notification-service)
- 환경: `/api/environment/**`(coaching-service)
- 상태 확인: `/api/health`(auth-web)

브라우저가 독립 AI 서비스, DB, Kafka, MinIO에 직접 접근하지 않게 한다. 인증된 backend proxy 또는 제한된 presigned URL을 사용한다.

---

## 4. 서비스 경계 — 목표와 현재 구현 상태

| 도메인 서비스 | 주요 책임 | 데이터 소유권 | 현재 구현 | K8s 목표 |
|---|---|---|---|---|
| Auth/User | 회원, 로그인, 세션, 프로필, 러닝 선호 | PostgreSQL `auth_user` | `services-msa/auth-service` | `dir-auth-user`, 8101 |
| Course | 코스, 경로, 찜, 리뷰, 통계 | PostgreSQL/PostGIS `course` | `services-msa/course-service` | `dir-course`, 8102 |
| Course Recommendation | 후보 생성, 순위, 피드백, 추천 이력 | PostgreSQL/PostGIS `course_recommendation` | `services-msa/course-recommendation-service` | AI namespace, 8201 |
| Running Record | 러닝 세션, GPS·심박 시계열 | PostgreSQL/PostGIS `running_record` | `services-msa/running-record-service` + outbox-publisher | `dir-running-record`, 8103 |
| Crew | 크루, 멤버, 가입, 주간 통계, 대결 | PostgreSQL `crew` | `services-msa/crew-service` + consumer | `dir-crew`, 8104 |
| Crew Chat | 채팅 연결과 메시지 | MongoDB 메시지, PostgreSQL 관계 메타데이터(`crew_chat`) | crew-service 내부 로직(§5.5) | `dir-crew-chat`, 8105 |
| Coaching | 데일리 계획과 Rule Engine 결과 | PostgreSQL `coaching` | `services-msa/coaching-service` | `dir-coaching`, 8106 |
| Support | 1:1 문의와 관리자 답변 | PostgreSQL `support` | `services-msa/notification-service` 내부 라우트(논리 모듈) | `dir-support`, 8107 |
| Challenge | 개인·공개·크루 챌린지와 진행 이력 | PostgreSQL `challenge` | `services-msa/challenge-service` + consumer | `dir-challenge`, 8108 |
| Shoe | 카탈로그, 선호, 보유화, 수명·마모 결과 | PostgreSQL `shoe`, Elasticsearch, MinIO | `services-msa/shoe-service` | `dir-shoe`, 8109 + AI 8204 |
| Environment | 날씨·미세먼지 RAW 수집과 정규화 | PostgreSQL `environment` | coaching-service 내부 로직(논리 모듈) | `dir-environment`, 8110 |
| Marathon | 대회, 접수 구간, 신청·취소 | PostgreSQL `marathon`, Redis queue/cache | `services-msa/marathon-service` | `dir-marathon`, 8111 |
| Notification | 인앱·푸시·메일 알림 상태 | PostgreSQL `notification` | `services-msa/notification-service` + consumer | `dir-notification`, 8112 |
| Media | 객체 메타데이터, 업로드 상태, presigned URL | PostgreSQL `media`, MinIO | `services-msa/media-service` | `dir-media`, 8113 |
| AI Assistant | 대화, RAG, Tool Calling, 모델 사용량 | PostgreSQL `ai_assistant`, Bedrock | `services-msa/ai-assistant-service` + consumer | AI namespace, 8202 |

### 4.1 서비스 경계 규칙

- 다른 서비스 테이블에 물리 FK를 추가하지 않는다.
- 다른 서비스 테이블을 직접 JOIN하는 신규 쿼리를 만들지 않는다.
- 타 서비스 ID는 LR(Logical Reference)로 저장한다.
- 서비스 간 데이터는 API, Kafka 이벤트, 읽기 모델로 교환한다.
- **DB 계정도 서비스별로 분리한다(2026-07-29 적용 완료).** 12개 서비스 전부 자기 소유 스키마만 SELECT/INSERT/UPDATE/DELETE 권한을 갖는 별도 Postgres role로 접속한다(`db/041_service_db_roles.sql`). 코드 규칙만으로는 재침범을 막을 수 없다는 판단에 따른 것이며, 이전에 쓰던 단일 superuser 계정은 롤백 경로로만 남겨뒀다.
- 지금 실제로 남아 있는 읽기 전용 교차 스키마 조회(예: course-service가 `running_record`를 읽어 완주 거리를 보여주는 것, notification-service가 `crew`를 읽어 알림에 크루명을 붙이는 것)는 각 서비스의 DB role에 SELECT 권한만 명시적으로 허용해뒀다. 새 크로스 스키마 **쓰기**는 절대 추가하지 않는다.
- `scripts/check-schema-boundaries.mjs`가 CI에서 이 경계를 정적으로 검사한다(§5.1, §19.1).
- Kubernetes 이전 시 이 12개 role의 자격증명이 그대로 `dir-<workload>-db-secret`이 된다(§9.1, §18).
- timeout, 제한된 retry, circuit breaker를 적용한다. 비멱등 요청을 무조건 재시도하지 않는다.

---

## 5. 데이터와 저장소 기준

### 5.1 적용 우선순위와 DB 계정 분리

- **실제 적용된 migration과 운영 DB가 현재 구조의 최종 기준**이다.
- DB 명세서는 목표 모델과 누락 사항을 확인하는 기준이지만 최신 migration을 뒤덮는 근거가 아니다.
- 이미 배포한 migration 파일을 수정하지 않고 새 migration을 추가한다.
- 고유 ID "이 테이블 셋"를 확정 기준으로 사용하지 않는다. 기능 추가에 migration으로 시간 따라 늘어날 수 있다.

특히 `db/033_drop_user_shoes_initial_distance.sql`에서 `shoe.user_shoes.initial_distance_m`을 제거했다. 이 컬럼을 복원하거나 `accumulated_distance_m >= initial_distance_m` 제약을 다시 만들지 않는다. 누적 거리는 0부터 관리한다.

**2026-07-29~30에 다음이 추가됐다(코드 레벨 MSA 경계 하드닝, §3.2/§4.1과 연동):**

- `db/039_running_record_outbox.sql`: `running_record.outbox_events` — running-record-service의 `RunCompleted` 발행을 DB 트랜잭션과 원자적으로 묶는 Outbox 테이블.
- `db/040_challenge_outbox.sql`: `challenge.outbox_events` — challenge-service의 `ChallengeCompleted` 발행용 Outbox 테이블.
- `db/041_service_db_roles.sql`: 12개 서비스 전용 최소권한 Postgres role(`auth_svc`, `course_svc`, `course_recommendation_svc`, `running_record_svc`, `crew_svc`, `coaching_svc`, `ai_assistant_svc`, `challenge_svc`, `shoe_svc`, `marathon_svc`, `media_svc`, `notification_svc`)과 GRANT.

이 세 migration과 `scripts/check-schema-boundaries.mjs`의 서비스별 접근 맵은 항상 같이 갱신한다.

### 5.2 주요 PostgreSQL 스키마와 테이블

#### `auth_user`

- `users`
- `user_identities`
- `auth_sessions`
- `user_running_preferences`
- `password_reset_codes`
- `user_id_migration_map`은 이관 전용이며 신규 API 조회에 쓰지 않는다.

#### `course`

- `courses`
- `course_waypoints`
- `course_likes`
- `course_reviews`
- `course_statistics`
- `courses_staging`, `course_waypoints_staging`은 검증·이관 전용이다.
- legacy 테이블을 신규 API의 Source of Truth로 쓰지 않는다.

#### `course_recommendation`

- `recommendation_runs`
- `recommendation_items`
- `recommendation_feedback`

#### `running_record`

- `runs`
- `run_samples`
- `outbox_events`(2026-07-29 추가, §5.1)
- 대량 증가 시 `recorded_at` 파티셔닝을 검토한다.

#### `crew`

- `crews`
- `crew_members`
- `crew_join_requests`
- `crew_battles`
- `crew_battle_votes`
- `crew_battle_chat_events`

#### `crew_chat`

- `chat_rooms`
- `chat_participant_states`
- 실제 채팅 메시지는 MongoDB `dai_run_chat.crew_chat_messages`에 저장한다.
- PostgreSQL과 MongoDB 양쪽에 동일 메시지를 이중 원본으로 두지 않는다.

#### `coaching`

- `daily_coaching_plans`

#### `support`

- `inquiries`
- 현재 migration은 `admin_reply`를 같은 행에 저장한다. 별도 reply 테이블을 추측해 추가하지 않는다.
- 관리자 판별은 `auth_user.users.is_admin`(2026-07-29 `db/038`에서 추가) 또는 `user_name === 'admin'` 하드코딩 중 실제 코드가 쓰는 쪽을 확인한다.

#### `ai_assistant`

- `chat_sessions`
- `chat_messages`

#### `challenge`

- `challenges`
- `challenge_rules`
- `challenge_series`
- `challenge_participations`
- `challenge_progress_events`
- `outbox_events`(2026-07-29 추가, §5.1)

#### `shoe`

- `shoe_catalog`
- `shoe_spec`
- `shoe_function`
- `shoe_function_map`
- `shoe_price`
- `shoe_likes`
- `user_shoe_preferences`
- `user_shoes`
- `shoe_wear_analyses`
- `shoe_life_snapshots`

#### `marathon`

- `marathon_race`
- `marathon_registration_windows`
- `marathon_reservations`

#### `media`

- `media_objects`

#### `notification`

- `notifications`

#### `environment`

- 조회용 정규화: `weather_hourly`, `air_quality_hourly`
- 수집·호환: `seoul_environment_daily`
- RAW: `airkorea_dust_seoul`, `airkorea_forecast_seoul`, `kma_warning_postgresql_seoul`, `seoul_forecast`

#### 문서화가 필요한 미문서 스키마

라이브 DB에 `posture_analysis`, `public.user_legacy`가 존재하지만 이 문서 어디에도 소유 서비스가 없다. `posture_analysis`는 제품 범위에서 명시적으로 제외한 기능(자세 교정)의 잔재로 추정된다. 정리(삭제 또는 정식 문서화)는 아직 하지 않았으니 신규 코드에서 참조하지 않는다.

### 5.3 공통 DB 규칙

- 동일 서비스 스키마 내부에서만 물리 FK를 사용한다.
- 코드값은 PostgreSQL ENUM보다 `VARCHAR + CHECK`를 기본으로 한다.
- 시간은 `TIMESTAMPTZ`와 UTC 저장을 기본으로 하고 화면·배치 기준 시간대를 별도 명시한다.
- UUID는 가능한 경우 `gen_random_uuid()`를 사용한다.
- 거리: meter, `*_m`
- 페이스: seconds per kilometer, `*_sec_per_km`
- 시간: second, `*_sec`
- 경사: percent, `*_slope_pct`
- 속도: meters per second, `*_mps`
- 삭제 복구가 필요한 데이터는 `deleted_at` 기반 소프트 삭제를 우선한다.
- `updated_at DEFAULT now()`만으로 자동 갱신되지 않는다. 애플리케이션 auditing 또는 trigger를 사용한다.
- N+1, 무제한 `findAll`, 한 건씩 GPS flush를 피한다.
- 대량 변경은 lock, WAL, 복구 시간을 고려해 batch로 처리한다.

### 5.4 PostGIS

- 좌표계는 WGS84, EPSG:4326이다.
- Point: `geometry(Point,4326)`
- Route: `geometry(LineString,4326)`
- DB·GeoJSON 좌표 순서는 `[longitude, latitude]`다.
- 화면 지도 라이브러리가 `[latitude, longitude]`를 요구하면 경계에서 명시적으로 변환한다.
- 코스 경로 원본은 `course.courses.route_geom`이다.
- 경유 지점은 `course.course_waypoints.location`과 `sequence_no`로 관리한다.
- 러닝 요약 경로는 `running_record.runs.route_geom`, 세부는 `running_record.run_samples.location`이다.
- 주변 검색은 `ST_DWithin`, 공간 인덱스는 GIST를 사용한다.
- Point/LineString, SRID, 유효 geometry, 거리 상한을 검증한다.
- LLM이 만든 좌표를 검증 없이 저장하지 않는다.
- `ST_MakeLine`은 도로를 따라가는 Routing Engine이 아니다.

### 5.5 MongoDB

- 현재 크루 채팅 메시지 저장소다.
- DB: `dai_run_chat`
- Collection: `crew_chat_messages`
- `room_id`는 현재 `crew_id`에 대응한다.
- 최적 인덱스는 `(room_id, created_at)`을 고려한다.
- ReplicaSet은 3 Member를 목표로 하지만 Sharding은 현재 데이터양과 분할 근거 없이 도입하지 않는다.
- MongoDB 장애가 회원·코스·러닝 원본 데이터까지 오염시키지 않게 경계를 유지한다.

### 5.6 Redis

- Source of Truth가 아니다.
- 세션 보조, rate limit, 추천·코스 캐시, 랭킹, 마라톤 대기열, 제한된 분산 락을 사용한다.
- TTL, eviction, 장애 fallback, lock timeout과 소유권 검증을 명시한다.
- 운영 코드에서 `KEYS`를 사용하지 않는다.

### 5.7 Elasticsearch

- 코스, 크루, 챌린지, 러닝화, 마라톤 검색용 복제본이다.
- PostgreSQL이 원본이다.
- 재색인 가능한 sync 경로와 index alias/version을 든다.
- 사용자 개인정보와 전체 GPS 경로를 불필요하게 색인하지 않는다.

### 5.8 MinIO

- 이미지·GPX 등 바이너리를 저장한다.
- PostgreSQL에는 `media.media_objects` 메타데이터만 저장한다.
- private bucket과 presigned URL을 기본으로 한다.
- MIME type, 크기, 픽셀 수, 소유권, 악성 파일을 검증한다.
- `PENDING → SCANNING → READY/REJECTED` 상태를 사용하고 `READY`만 도메인에서 참조한다.
- 보존 기간과 정리 정책을 명시한다.

### 5.9 상태 코드

| 도메인 | 허용값 |
|---|---|
| 사용자 상태 | `ACTIVE`, `SUSPENDED`, `WITHDRAWN` |
| 소셜 공급자 | `GOOGLE`, `KAKAO`, `NAVER` |
| 숙련도 | `BEGINNER`, `INTERMEDIATE`, `ADVANCED` |
| 러닝 목표 | `HEALTH`, `DIET`, `ENDURANCE`, `MARATHON` |
| 코스 출처 | `USER`, `ADMIN`, `PUBLIC_DATA`, `SNS`, `AI_GENERATED`, `MARATHON` |
| 코스 공개 | `PUBLIC`, `PRIVATE` |
| 코스 상태 | `ACTIVE`, `INACTIVE`, `DELETED` |
| 경유지 유형 | `START`, `VIA`, `END` |
| 추천 실행 | `PENDING`, `COMPLETED`, `FAILED` |
| 러닝 출처 | `APP`, `WATCH`, `MANUAL` |
| 러닝 상태 | `IN_PROGRESS`, `COMPLETED`, `CANCELLED` |
| 크루 입장 | `OPEN`, `APPROVAL` |
| 크루 상태 | `RECRUITING`, `FULL`, `CLOSED` |
| 크루 역할 | `LEADER`, `MANAGER`, `MEMBER` |
| 채팅 메시지 | `TEXT`, `IMAGE`, `SYSTEM` |
| 코칭 강도 | `LOW`, `MODERATE`, `HIGH` |
| 심박 구간 | `ZONE_1` ~ `ZONE_5` |
| AI 메시지 역할 | `USER`, `ASSISTANT`, `TOOL`, `SYSTEM` |
| 챌린지 유형 | `PERSONAL`, `PUBLIC`, `CREW` |
| 챌린지 지표 | `DISTANCE`, `COUNT`, `PACE`, `STREAK` |
| 사용자 러닝화 | `ACTIVE`, `RETIRED` |
| 마라톤 예약 | `PENDING`, `WAITING`, `CONFIRMED`, `REJECTED`, `CANCELLED` |
| 미디어 | `PENDING`, `SCANNING`, `READY`, `REJECTED` |
| 알림 | `UNREAD`, `READ`, `DELETED` |

실제 migration의 CHECK 값이 다르면 CURRENT는 migration을 따른다. 목표 상태에서는 DB CHECK, TypeScript union, Python Enum, 이벤트 스키마 문자열을 일치시킨다.

### 5.10 실제 제약과 인덱스

- `course_likes`: PK `(course_id, user_id)`
- `course_reviews`: 사용자당 코스 리뷰 하나 정책이면 UNIQUE `(course_id, user_id)`
- `course_waypoints`: UNIQUE `(course_id, sequence_no)`, GIST `location`
- `recommendation_items`: PK `(recommendation_id, course_id)`, UNIQUE `(recommendation_id, rank_no)`
- `run_samples`: 중복 방지 키인 `(run_id, recorded_at)` 인덱스
- `crew_members`: PK `(crew_id, user_id)`
- 채팅 메시지: UNIQUE `(room_id, sender_user_id, client_message_id)`
- `daily_coaching_plans`: UNIQUE `(user_id, plan_date)`
- `challenge_progress_events`: UNIQUE `(source_event_id, participation_id)`
- `running_record.outbox_events` / `challenge.outbox_events`: PK `event_id`, `published_at IS NULL` 부분 인덱스로 폴링
- `marathon_reservations`: UNIQUE `(race_id, user_id)`, UNIQUE `idempotency_key`
- `media_objects`: UNIQUE `(bucket_name, object_key)`

개별 컬럼 UNIQUE와 복합 UNIQUE를 혼동하지 않는다. 인덱스는 실제 쿼리의 `EXPLAIN (ANALYZE, BUFFERS)` 결과로 검증한다.

### 5.11 Migration

**Expand → Migrate → Contract** 순서를 따른다.

1. 하위 호환 가능한 컬럼·테이블 추가
2. 구·신 구조를 함께 읽거나 쓰는 호환 코드
3. 데이터 backfill과 검증
4. 읽기 경로 전환
5. 충분한 관찰 후 구 구조 제거

- 대량 UPDATE는 batch 처리한다.
- NOT NULL 적용 전 기존 데이터를 정리한다.
- 신규 인덱스는 lock과 `CONCURRENTLY` 가능 여부를 검토한다.
- migration 재실행 가능성과 실패 복구를 고려한다.
- legacy, staging, RAW 테이블은 일반 API Role에서 접근을 제한한다.

---

## 6. Kafka와 비동기 처리

### 6.1 현재 사용 중인 토픽

| 토픽 | Producer | Consumer | 현재 처리 |
|---|---|---|---|
| `course.like-events` | Next.js Course API(레거시, 도달 여부 확인 필요) | `course-stats-consumer` | `course.course_statistics.like_count` 갱신 |
| `crew.join-request-events` | crew-service(`publishCrewJoinRequestEvent`, `publishBattleDeclinedEvent`도 같은 토픽 재사용) | `crew-notification-consumer` | `notification.notifications` 적재 |
| `running.run-completed-events` | running-record-service(Outbox 경유, §6.2) | `challenge-service-consumer`, `crew-service-consumer`, `ai-assistant-service-consumer` (2026-07-29부터 네이티브 Consumer 3개로 대체, 기존 `run-completion-consumer`는 폐기) | 챌린지 진행도 갱신, 크루 배틀 갱신, AI 축하 메시지 생성 |
| `challenge.challenge-completed-events` | challenge-service(Outbox 경유) | `notification-service-consumer` | `notification.notifications`에 챌린지 달성 알림 적재 |

기존 토픽 이름을 임의로 바꾸지 않는다. 새 토픽은 소유 서비스, 이벤트 스키마, 파티션 키, 보존 기간, 재처리, DLQ를 확정한 뒤 추가한다.

### 6.2 Outbox 패턴 적용 현황

2026-07-29부터 running-record-service와 challenge-service는 이벤트 발행을 Outbox로 처리한다: 업무 데이터 UPDATE와 `outbox_events` INSERT를 같은 트랜잭션으로 묶고, 별도 컨테이너(`*-outbox-publisher` 또는 consumer 컨테이너 안의 폴링 루프)가 `published_at IS NULL` 행을 폴링해 실제 Kafka 발행을 담당한다. `FOR UPDATE SKIP LOCKED`로 폴러 다중 실행에도 안전하다.

다른 토픽(`course.like-events`, `crew.join-request-events`)은 아직 기존 방식(DB 저장 후 best-effort publish)이다. 이 경로의 이벤트 유실 가능성을 이미 해결된 것으로 오해하지 않는다. 새로 Outbox를 붙일 서비스는 `running_record.outbox_events`/`challenge.outbox_events`와 `*/src/lib/outbox.ts`, `*/src/lib/outboxPublisher.ts` 패턴을 그대로 재사용한다.

### 6.3 이벤트 계약

최소 필드:

- `eventId`
- `eventType`
- `occurredAt`
- `producer`
- `aggregateId`
- `schemaVersion`
- `traceId`
- `payload`

규칙:

- at-least-once 전달을 전제로 Consumer를 멱등하게 만든다.
- `eventId` 또는 `source_event_id` UNIQUE와 Inbox를 사용한다.
- 제한된 재시도 후 DLQ로 보낸다.
- payload에 바이너리·전체 GPS·민감정보를 넣지 않는다.
- 이벤트 스키마는 하위 호환성을 유지한다.
- `course-stats-consumer`는 단순 delta 반영이라 중복 전달 시 카운터가 부풀 수 있다. 이전 시 이벤트 ID 기반 멱등 처리를 보강한다.

### 6.4 K8s Kafka 목표

- Strimzi가 Kafka CR을 관리한다.
- Broker 3개를 `dir-worker1~3`에 하나씩 배치한다.
- 생성된 StatefulSet을 직접 수정하지 않는다.
- 토픽 생성은 `dir-kafka-topic-init` Job 또는 선언적 KafkaTopic으로 관리한다.
- 3 Broker 목표에서는 replication factor와 `min.insync.replicas`를 명시한다.
- 물리 PC가 2대뿐이므로 PC1 전체 장애 시 quorum을 보장하지 못한다.
- Docker 안의 `192.168.0.212:29092` 기본값을 K8s에서는 Service DNS로 교체한다.

### 6.5 Scheduler와 배치

- `dir-crew-stats-scheduler`: 매일 00:00 KST
- `dir-challenge-weekly-scheduler`: 매주 일요일 00:10 KST
- `dir-environment-ingester`: 매 5분
- `dir-course-recommendation-cache-warmup`: 매일 03:00 KST
- `dir-elasticsearch-sync`: 15분마다
- `dir-kube-bench-weekly`: 일요일 03:30
- `dir-k6-nightly-smoke`: 매일 02:00, 테스트 환경에서만

애플리케이션 내부의 무한 `setTimeout` scheduler(현재 `services/challenge-weekly-scheduler`, `services/crew-stats-scheduler`)를 K8s로 옮길 때 CronJob과 중복 실행하지 않는다. `timeZone: Asia/Seoul`, `concurrencyPolicy`, `startingDeadlineSeconds`, `backoffLimit`을 명시한다.

---

## 7. AI와 Bedrock

### 7.1 공통 구조

- 기본 API는 Amazon Bedrock Converse 또는 Knowledge Base 경로를 사용한다.
- Claude/Nova 차이는 `ProviderAdapter`로 감춘다.
- Tool schema는 명확한 JSON Schema로 정의한다.
- Tool 실행 전 인증·권한·세션 검증은 backend가 수행한다.
- 모델이 임의 endpoint, SQL, 객체 키를 만들게 하지 않는다.
- 도메인 서비스 API 또는 제한된 Query Tool을 사용한다.
- Guardrails와 prompt injection 방어를 적용한다.

권장 Tool:

- `getUserRunningPreferences`
- `getRecentRuns`
- `getCurrentWeather`
- `getAirQuality`
- `searchNearbyCourses`
- `getCourseDetail`
- `getActiveUserShoes`
- `getShoeLifePrediction`
- `searchMarathons`
- `getTodayCoachingPlan`

### 7.2 AI 코칭 순서

1. 사용자 목표와 선호 조회
2. 최근 7일 러닝 기록과 직전 운동 강도 조회
3. 현재 날씨·강수·기온·대기질 조회
4. Rule Engine으로 안전 제한과 권장 거리·강도 계산
5. PostGIS로 조건에 맞는 코스 후보 조회
6. AI가 계산 결과의 근거를 자연어로 설명

핵심 수치, 안전 제한, 대기열 순번은 프롬프트가 아니라 서버 코드가 결정한다.

### 7.3 보안과 비용

- 위치, 심박, 건강, 개인정보를 필요한 범위만 모델에 전달한다.
- 로그인 세션 전체 프롬프트에 건강·GPS 원문을 남기지 않는다.
- 의료 진단·치료 지시를 제공하지 않는다.
- 실패한 Tool을 성공한 것처럼 답하지 않는다.
- 모델명, input/output token, latency, 오류를 비식별 형태로 기록한다.
- 기본 모델은 비용 효율적인 모델을 사용하고 고성능 모델 전환 조건을 명시한다.
- 대화 이력을 무한 누적하지 않고 요약한다.

### 7.4 K8s 자격 증명과 네트워크

- Docker의 `$HOME/.aws` hostPath mount를 K8s Pod로 그대로 옮기지 않는다.
- 온프레미스는 최소 권한 AWS IAM 자격 증명을 Secret 또는 승인된 외부 Secret 방식으로 주입한다.
- AWS 이전 시 EKS Pod Identity 또는 IRSA로 전환한다.
- Bedrock은 외부 AWS API이므로 오프라인 환경에서는 동작하지 않는다.
- 현재 AI 경로는 Bedrock API 호출 중심이며 GPU 스케줄링을 요구하지 않는다.
- 오프라인 로컬 모델은 별도 성능·모델 크기·라이선스·이상비 검증 후 향후 검토한다.

### 7.5 외부 데이터

- 날씨·미세먼지는 기상청 단기예보·특보와 에어코리아 측정·예보를 우선한다.
- API 요청마다 외부 서비스를 직접 호출하지 않고 수집 주기, 캐시, 마지막 정상 데이터 fallback을 사용한다.
- 수집 시각, 발표 시각, 예보 대상 시각을 구분해 저장한다.
- 지도·행정동 API는 Adapter 뒤에 두고 주소→좌표, 좌표→행정동, 행정동 중심 좌표 산정을 분리한다.
- 지도 Provider의 저장 제한, 표시 의무, API Key 보호 규정을 지킨다.
- 마라톤·러닝화·코스 데이터는 공식 홈페이지와 공공데이터를 우선한다.
- 크롤링 전 robots.txt, 이용약관, 저작권, 요청 빈도를 확인하고 인증 우회나 차단 회피를 하지 않는다.
- 수집 데이터의 출처, 원본 URL, 수집 시각, 정규화 상태를 기록한다.
- SNS 유명 코스는 무단 또는 대량보다 수동 큐레이션을 우선한다.
- 고도는 승인된 Elevation API 또는 공공 지형 데이터를 사용하고 없는 경우 경사 계산 방식을 문서화한다.

---

## 8. 온프레미스 Kubernetes 기준

### 8.1 물리 환경

물리 PC 2대는 각각 다음 사양이다.

- CPU: Intel Core i7-10700F, 8 Core / 16 Thread
- RAM: 32GB
- Storage: 250GB SSD + 1TB SSD
- GPU: GTX 1060 3GB

### 8.2 VM 배치

| VM | 역할 | RAM | vCPU | IP | PC | OS 디스크 | 추가 디스크 | Longhorn 디스크 |
|---|---|---:|---:|---|---:|---:|---:|---:|
| `dir-master1` | Control Plane + stacked etcd | 6GB | 4 | `192.168.0.200` | 2 | 100GB | 30GB | 없음 |
| `dir-worker1` | App + Kafka/Mongo Replica A | 9GB | 4 | `192.168.0.201` | 1 | 100GB | 100GB | 100GB |
| `dir-worker2` | DB + Kafka/Mongo Replica B | 9GB | 4 | `192.168.0.202` | 1 | 100GB | 220GB | 120GB |
| `dir-worker3` | Observability + Replica C + 대피 | 12GB | 4 | `192.168.0.203` | 2 | 100GB | 320GB | 220GB |
| `cicd` | GitHub Actions Runner + SonarQube + Trivy + Build | 8GB | 4 | `192.168.0.211` | 1 | 100GB | 200GB | 없음 |
| `harbor` | Container Registry | 6GB | 2 | `192.168.0.210` | 2 | 100GB | 200GB | 없음 |

PC1에는 worker1, worker2, cicd가 있고 PC2에는 master1, worker3, harbor가 있다. Node가 3개여도 물리 장애 도메인은 2개다.

### 8.3 디스크 마운트

- master1 etcd: 추가 30GB를 `/var/lib/etcd`에 사용
- worker 추가 디스크: `/data/local`
- Longhorn 전용 디스크: `/mnt/longhorn`
- etcd 이동 시 사전 snapshot, kubelet/containerd 중지, rsync, 권한 `0700`, mount, static Pod 복구를 검증한다.
- `/var/lib/etcd` 빈 디렉터리 상태 파일시스템만 mount해 기존 데이터를 가리는 실수를 하지 않는다.

### 8.4 가용성 한계

- Control Plane과 stacked etcd가 1개이므로 master 장애 시 API Server와 scheduling이 중단된다.
- 기존 Pod는 일정 시간 동작할 수 있지만 신규 배포·복구·스케줄링은 제한된다.
- Kafka/Mongo 3 Replica가 3 Worker에 분산돼도 PC1 장애 시 2개가 동시에 사라져 quorum을 잃을 수 있다.
- worker3는 관측, Replica C, PostgreSQL 대비, 핵심 앱 대피를 겸하므로 자원 경합을 항상 확인한다.
- "Replica 수"와 "물리 호스트 HA"를 같은 의미로 설명하지 않는다.

---

## 9. Kubernetes 네이밍과 namespace

### 9.1 공통 네이밍

- 모든 DAI RUN 리소스는 `dir-` 접두사를 사용한다.
- DNS-1123 소문자, 숫자, 하이픈, 63자 이내를 지킨다.
- Deployment: `dir-<service>`
- StatefulSet: `dir-<data-component>`
- Service: `dir-<workload>-svc`, headless는 `-headless`
- ConfigMap: `dir-<workload>-config`
- Secret: `dir-<workload>-secret`, DB는 `-db-secret`(§4.1의 12개 서비스별 DB role 자격증명이 여기 들어간다)
- PVC: `dir-<workload>-<purpose>-pvc`
- HPA: `dir-<workload>-hpa`
- KEDA: `dir-<workload>-scaledobject`
- ServiceAccount: `dir-<workload>-sa`
- Image: `<harbor-domain>/dai-run/dir-<service>:<git-sha>`
- `latest`만으로 배포하지 않는다.
- 권장 라벨: `app.kubernetes.io/name`, `component`, `part-of=dai-run`, `instance`, `version`, `managed-by`

### 9.2 canonical namespace

- `dir-frontend-ns`
- `dir-backend-ns`
- `dir-ai-ns`
- `dir-db-ns`
- `dir-kafka-ns`
- `dir-search-ns`
- `dir-storage-ns`
- `dir-obsv-ns`
- `dir-argocd-ns`
- `dir-istio-system`
- `dir-metallb-system`
- `dir-longhorn-system`
- `dir-security-system`
- `dir-keda-system`
- `dir-backup-ns`
- `dir-test-ns`
- `kube-system`

`dir-fe-ns`, `dir-be-ns`, `dir-str-ns`, `dir-istio-ns`, `dir-metallib-ns` 같은 과거 축약·오타를 새 manifest에 쓰지 않는다.

---

## 10. 노드 라벨, Taint, 배치

### 10.1 필수 라벨

라벨 키는 `dairun.io/` prefix를 쓰고 zone은 표준 키를 사용한다.

| Node | 라벨 |
|---|---|
| `dir-master1` | `dairun.io/pool=control-plane`, `topology.kubernetes.io/zone=pc2` |
| `dir-worker1` | `dairun.io/pool=app`, `dairun.io/app-capable=true`, `dairun.io/data-replica=true`, `dairun.io/longhorn=true`, `topology.kubernetes.io/zone=pc1` |
| `dir-worker2` | `dairun.io/pool=data`, `dairun.io/data-capable=true`, `dairun.io/data-replica=true`, `dairun.io/postgres-capable=true`, `dairun.io/longhorn=true`, `topology.kubernetes.io/zone=pc1` |
| `dir-worker3` | `dairun.io/pool=observability`, `dairun.io/observability=true`, `dairun.io/app-capable=true`, `dairun.io/data-replica=true`, `dairun.io/postgres-capable=true`, `dairun.io/longhorn=true`, `topology.kubernetes.io/zone=pc2` |

주의:

- worker3에 `data-capable=true`를 붙이지 않는다.
- worker3의 `app-capable=true`는 핵심 앱의 PC2 장애 대비용이다. 모든 일반 앱이 worker3에 몰려도 된다는 의미가 아니다.
- worker2가 단일 데이터 서비스의 기본 노드다. worker3를 임의의 범용 DB fallback으로 만들지 않는다.
- 새 capability 라벨은 사용자 승인 없이 추가하지 않는다.

### 10.2 Taint

| Node | Taint | 목적 |
|---|---|---|
| `dir-master1` | 기본 Control Plane Taint | 일반 Pod 차단 |
| `dir-worker1` | 없음 | 앱·Replica 기본 수용 |
| `dir-worker2` | `dedicated=dairun-data:NoSchedule` | 일반 앱이 DB 노드에 진입 차단 |
| `dir-worker3` | `dedicated=dairun-observability:PreferNoSchedule` | 관측 우선, 필요 시 핵심 앱 대피 허용 |

Taint는 CPU와 메모리를 예약하지 않는다. requests/limits, PriorityClass, PDB로 실제 자원 안정성을 보장한다.

### 10.3 워크로드 배치

#### 핵심 앱 2 Replica

- 대상: frontend, auth-user, running-record, marathon 등 실제 트래픽의 분산 근거가 있는 서비스
- required node affinity: `dairun.io/app-capable=true`
- preferred: `dairun.io/pool=app`
- worker3 `PreferNoSchedule` toleration
- `topology.kubernetes.io/zone`과 `kubernetes.io/hostname` 기준 `maxSkew: 1`
- 2개가 PC1과 PC2에 하나씩 배치되게 한다.

#### 일반 앱 1 Replica

- required: `app-capable=true`
- preferred: `pool=app`
- `pool=app`을 required로 고정해 worker1 장애 시 대피를 막지 않는다.
- worker3 위상 보호가 필요한 서비스는 우선순위와 toleration을 검토한다.

#### Kafka 3 Broker와 MongoDB 3 Member

- required: `data-replica=true`
- hostname 기준 required Pod Anti-Affinity
- zone 기준 spread는 물리 PC가 2개뿐이므로 `ScheduleAnyway`
- worker2와 worker3 Taint toleration
- worker1, worker2, worker3에 하나씩 배치

#### PostgreSQL 2 Instance

- required: `postgres-capable=true`
- worker2와 worker3의 물리 PC별 하나씩 분산
- Primary 역할을 노드명에 영구 고정하지 않는다.
- StatefulSet만으로는 자동 failover가 일어나지 않는다. 승인된 Operator 또는 Patroni 구성이 필요하다.

#### 관측 스택

- worker3 `observability=true`를 preferred로 사용한다.
- local PV를 쓰는 Prometheus/Loki/Tempo는 실제로 worker3에 고정되므로 장애 시 이동 가능한 것으로 설명하지 않는다.
- Grafana처럼 Longhorn PVC를 쓰는 구성에서만 다른 노드 재배치를 기대할 수 있다.

#### 단일 데이터 서비스

- Redis와 Elasticsearch는 `data-capable=true`인 worker2가 기본 대상이다.
- worker3에는 `data-capable`이 없으므로 자동 fallback을 가정하지 않는다.
- 단일 인스턴스 장애 허용 범위, 백업, 재생성 시간을 별도로 명시한다.

#### Operator 관리 리소스

- Strimzi 등 Operator가 만든 StatefulSet을 직접 수정하지 않는다.
- affinity, toleration, topology spread, resource는 Custom Resource의 template에 작성한다.
- Reconcile로 되돌아가는 임의 수정을 금지한다.

---

## 11. 스토리지

### 11.1 현재 local PV 계획

| Node | local 데이터 | 논리 사용량 |
|---|---|---:|
| worker1 | MongoDB-0 20Gi, Kafka-0 30Gi | 50Gi / 100GB |
| worker2 | PostgreSQL-0 60Gi, MongoDB-1 20Gi, Kafka-1 30Gi, Elasticsearch 40Gi | 150Gi / 220GB |
| worker3 | PostgreSQL-1 60Gi, MongoDB-2 20Gi, Kafka-2 30Gi, Prometheus 40Gi, Loki 15Gi, Tempo 10Gi | 175Gi / 320GB |

local PV:

- `dir-postgresql-data-pvc-*`: 60Gi × 2
- `dir-mongodb-data-pvc-*`: 20Gi × 3
- `dir-kafka-data-pvc-*`: 30Gi × 3
- `dir-elasticsearch-data-pvc`: 40Gi
- `dir-prometheus-data-pvc`: 40Gi
- `dir-loki-wal-pvc`: 15Gi
- `dir-tempo-wal-pvc`: 10Gi
- StorageClass: `dir-local-retain`

local PV는 Node 장애 시 다른 노드로 자동 이동하지 않는다. PostgreSQL, MongoDB, Kafka는 애플리케이션 수준 복제로 대응하고, 단일 Elasticsearch와 관측 데이터는 백업·재구축 가능성을 명시한다.

### 11.2 현재 Longhorn 계획

- worker1: 100GB
- worker2: 120GB
- worker3: 220GB
- 기본 Replica Count: 2
- Node·Zone Replica Soft Anti-Affinity는 물리 PC 분리를 보장하도록 설정한다.
- 여유 공간 최소 비율을 유지한다.

Longhorn PVC:

- Redis 8Gi, Replica 2 → 물리 약 16Gi
- MinIO 60Gi, Replica 2 → 물리 약 120Gi
- Grafana 5Gi, Replica 2 → 물리 약 10Gi
- 합계 논리 73Gi, 물리 약 146Gi

StorageClass는 중요한 데이터에 `Retain`, 임시 데이터에 `Delete`를 구분한다. 물리 PC가 2대뿐인 환경에서 무조건 Replica 3을 사용하지 않는다.

### 11.3 백업

- etcd snapshot과 restore 절차를 정기 검증한다.
- PostgreSQL은 논리/물리 백업과 복구 테스트를 수행한다.
- MongoDB는 ReplicaSet만 백업으로 간주하지 않는다.
- Kafka는 재생성 가능한 토픽과 보존해야 할 이벤트를 구분한다.
- MinIO는 Longhorn 복제만 믿지 않고 별도 사본을 둔다.
- Velero는 Kubernetes object 백업이며 모든 DB 정합성 백업을 자동 보장하지 않는다.
- Longhorn backup target과 Velero object store의 자격 증명·보존 기간을 분리한다.

---

## 12. 네트워크와 진입점

### 12.1 외부·내부 통신

- 외부 트래픽의 단일 진입점은 Istio Ingress Gateway다.
- 일반 애플리케이션 Service는 `ClusterIP`다.
- 관리자 UI(Kiali, Argo CD, Grafana, Headlamp, Longhorn UI, Kafka UI)는 직접 NodePort로 열지 않는다.
- 관리자 인증, 허용 IP/VPN, TLS를 적용한다.
- 서비스 간 주소는 IP가 아니라 Kubernetes Service DNS를 사용한다.
- Docker 안의 `192.168.0.*`와 host port를 애플리케이션 기본값으로 남기지 않는다.

### 12.2 단일 Control Plane과 MetalLB

- Control Plane은 `dir-master1` 단일 노드이며 API Server endpoint는 `192.168.0.200`을 사용한다.
- **kube-vip는 사용하지 않는다.** kube-vip manifest, static Pod, DaemonSet, ARP 설정, VIP 문구를 새 구성에 추가하지 않는다.
- 외부 `LoadBalancer` Service는 MetalLB가 담당한다.
- MetalLB `IPAddressPool`은 `192.168.0.215-192.168.0.234`다.
- 실제 적용 전 DHCP 할당 범위와 고정 IP 사용 현황을 확인해 20개 주소가 모두 미사용인지 검증한다.
- 기본 광고 방식은 동일 L2 네트워크의 `L2Advertisement`다. BGP는 라우터 지원과 운영 합의가 확인될 때만 별도 승인한다.
- 일반 애플리케이션마다 LoadBalancer IP를 배정하지 않는다. 기본적으로 Istio Ingress Gateway 하나만 `LoadBalancer`로 노출하고 나머지는 `ClusterIP`를 사용한다.
- IP를 수동 지정할 때는 항상 예약을 중복되지 않게 관리하고, 주소를 문서·manifest·DNS와 함께 기록한다.

### 12.3 Istio

- Ingress, mTLS, AuthorizationPolicy, retry/timeout, traffic split, 관측을 담당한다.
- 비즈니스 인증·인가를 Istio만으로 대체하지 않는다.
- 현재 설치 방향은 **Istio 1.30.3 Ambient Mesh**다.
- 설치 구성은 `istio-base`, `istiod`, `istio-cni`, `ztunnel`을 기준으로 한다.
- 데이터 플레인은 노드별 `ztunnel`이 L4 mTLS와 기본 네트워크 처리를 담당한다. 애플리케이션 Pod에 Envoy sidecar가 있다고 가정하지 않는다.
- Ambient 적용 namespace에는 `istio.io/dataplane-mode=ambient` 라벨을 사용한다.
- 기존 `istio-injection=enabled` 라벨과 Ambient 라벨을 같은 namespace에 혼용하지 않는다.
- HTTP 경로·헤더 기반 정책, L7 트래픽 메트릭, 세밀한 AuthorizationPolicy가 필요한 서비스에만 Waypoint Proxy를 검토한다. 모든 namespace에 Waypoint를 일괄 배포하지 않는다.
- `ztunnel`은 DaemonSet, `istiod`와 Waypoint는 Deployment 성격이다. Istio CNI는 노드별 DaemonSet으로 동작한다.
- DB, Kafka, 관측 namespace를 Ambient에 편입할지는 프로토콜 호환성, 지연, NetworkPolicy, 운영 합의를 먼저 검증한다.
- Ambient 적용 전후 mTLS 상태, 서비스 DNS, ingress 경로, WebSocket, Kafka, OTLP gRPC를 실제로 테스트한다.
- Kiali는 Istio 상태 시각화 도구이며 모니터링 데이터 원본이 아니다.

### 12.4 NetworkPolicy

- namespace별 default-deny 후 필요한 통신만 허용한다.
- frontend → backend/Gateway
- backend → 자기 DB, Kafka, Redis, Elasticsearch, MinIO, 내부 AI
- AI → PostgreSQL, Bedrock HTTPS, 필요한 Tool API
- OTel/Alloy → 관측 backend
- 외부 API는 Environment, 지도, Bedrock 등 필요한 egress 443만 허용한다.
- DNS egress를 누락하지 않는다.

---

## 13. K8s 워크로드와 포트

### 13.1 애플리케이션 포트

| Namespace | Workload | Port |
|---|---|---:|
| `dir-frontend-ns` | `dir-frontend` | 3000 |
| `dir-backend-ns` | `dir-auth-user` | 8101 |
|  | `dir-course` | 8102 |
|  | `dir-running-record` | 8103 |
|  | `dir-crew` | 8104 |
|  | `dir-crew-chat` | 8105 |
|  | `dir-coaching` | 8106 |
|  | `dir-support` | 8107 |
|  | `dir-challenge` | 8108 |
|  | `dir-shoe` | 8109 |
|  | `dir-environment` | 8110 |
|  | `dir-marathon` | 8111 |
|  | `dir-notification` | 8112 |
|  | `dir-media` | 8113 |
| `dir-ai-ns` | `dir-course-recommendation` | 8201 |
|  | `dir-ai-assistant` | 8202 |
|  | `dir-shoe-life-ai` | 8204 |

포트는 Pod 간 충돌을 막기 위한 전역 번호가 아니다. 같은 포트를 쓰는 Pod가 다르면 가능하지만, 한 서비스군의 식별성과 Service targetPort 일관성을 위해 위 값을 유지한다.

### 13.2 데이터 포트

- PostgreSQL/PostGIS: 5432
- MongoDB: 27017
- Redis: 6379
- Kafka client/controller: 9092, 9093
- Kafka UI: 8088
- Elasticsearch: 9200, 9300
- MinIO API/Console: 9000, 9001

### 13.3 관측·플랫폼 포트

- OTel Gateway: 4317, 4318, 13133, 8888
- Grafana: 3300
- Prometheus: 9090
- Loki: 3100
- Tempo: 3200, 수집 포트는 실제 config의 Service와 동일하게 유지
- Alloy: 12345, 12346
- Node Exporter: 9100
- kube-state-metrics: 8082, 8083
- Headlamp: 4466
- Kiali: 20001
- Istio Ingress: 8080, 8443, 15021, 15090
- Istiod: 15010, 15012, 15014, 15017
- Argo CD Server/Repo/Application Controller: 8084, 8085, 8086

### 13.4 Workload 종류

- Stateless API/UI: Deployment
- PostgreSQL, MongoDB, Redis, Kafka, Elasticsearch, MinIO, Prometheus, Loki, Tempo: StatefulSet 또는 Operator CR
- Alloy, Node Exporter, Istio CNI, ztunnel, MetalLB Speaker, Longhorn Manager/CSI, Velero Node Agent, Chaos Daemon: DaemonSet
- DB migration, initial sync, topic init, bucket init, seed, k6 실행: Job
- 정기 수집·동기화·점검: CronJob
- k6는 상시 애플리케이션 Deployment로 운영하지 않는다. Operator의 TestRun 또는 Job을 사용한다.

---

## 14. 리소스, HPA, KEDA

### 14.0 값의 상태

- **INITIAL**: 초기 산정 값. 이후 성능을 보장하지 않는다.
- **MEASURED**: k6, Prometheus, 애플리케이션 메트릭으로 조건과 함께 측정한 값.
- **APPROVED**: 측정 결과를 바탕으로 팀이 운영 기준으로 승인한 값.

이 절 아래 HPA, KEDA, ResourceQuota, LimitRange, requests/limits는 별도 표시가 없으면 모두 **INITIAL**이다.

### 14.1 기본 원칙

- 모든 Pod의 CPU·memory requests/limits를 둔다.
- ResourceQuota는 예약이 아니라 namespace 상한이다.
- LimitRange 기본값만 믿지 말고 핵심 워크로드는 명시적으로 설정한다.
- Stateful DB는 메모리 OOM과 디스크 IOPS를 우선 관찰한다.
- HPA는 requests 대비 사용률이므로 requests를 먼저 현실적으로 보정한다.
- Ambient Mesh이므로 애플리케이션 Pod별 sidecar 요청량이 일괄 더해지지 않는다. 노드별 ztunnel과 필요한 Waypoint의 자원은 별도 계산한다.
- 같은 Deployment에 사용자가 의도하지 않은 HPA와 KEDA를 동시에 붙이지 않는다.
- KEDA가 생성하는 HPA를 수동 HPA와 중복 생성하지 않는다.
- VPA 자동 적용과 HPA CPU/Memory를 동시에 사용해 충돌시키지 않는다.
- API(HPA)와 Consumer/Worker(KEDA)는 같은 논리 서비스라도 별도 Deployment로 둔다(§3.2에서 이미 구현된 challenge/crew/ai-assistant/notification/running-record 컨슈머 분리 패턴을 그대로 따른다).

### 14.2 주요 HPA 초기값

| 대상 | min | max | 주요 신호 | 목표·주의 |
|---|---:|---:|---|---|
| frontend | 2 | 4 | CPU, memory | CPU 70%, memory 75% |
| auth-user | 2 | 5 | CPU/RPS, memory | CPU 60%, 로그인 spike |
| course | 1 | 4 | CPU, memory | CPU 65%, PostGIS latency |
| running-record | 2 | 5 | CPU/RPS, memory | CPU 60%, GPS batch |
| crew | 1 | 3 | CPU, memory | CPU 65% |
| crew-chat | 1 | 4 | active connection, memory | connection drain |
| coaching | 1 | 3 | CPU, memory | CPU 65% |
| support | 1 | 2 | CPU, memory | 70%/80% |
| challenge | 1 | 3 | CPU, memory | CPU 65% |
| shoe | 1 | 3 | CPU, memory | CPU 65% |
| environment | 1 | 3 | CPU, memory | 70%/75% |
| marathon | 2 | 8 | CPU/RPS, memory | CPU 65%, memory 70%, 접수일 min 4 |
| notification | 1 | 3 | CPU, memory | 70%/80% |
| media | 1 | 4 | CPU/RPS, memory | CPU 60% |
| Course Recommendation backend | 1 | 3 | CPU/in-flight, memory | 70%, memory 80% |
| AI assistant | 1 | 4 | in-flight, p95, memory | 8 in-flight/pod, memory 80% |
| Course Recommendation AI | 1 | 3 | CPU/in-flight, memory | 70%, memory 80% |
| Shoe Life AI | 1 | 3 | CPU/in-flight, memory | 70%, memory 80% |
| istiod | 2 | 3 | CPU, memory | 70%/80% |
| Istio Ingress | 2 | 6 | CPU/RPS, memory | CPU 60%, memory 75% |

`dir-course-recommendation-ai-hpa`를 누락하지 않는다. HPA 이름, target Deployment 이름, namespace가 실제 manifest와 정확히 일치해야 한다.

마라톤은 CPU 기준 65%를 사용한다. 55%보다 불필요한 조기 확장을 줄이면서도 70% 이상보다 여유가 있고, 접수일 사전 pre-scale과 RPS/queue 신호로 초기 폭주를 보완한다.

### 14.3 KEDA 초기값

| ScaledObject | min | max | Trigger |
|---|---:|---:|---|
| course stats consumer | 0 | 5 | Kafka lag 100/replica |
| challenge event consumer (challenge/crew/ai-assistant/notification) | 1 | 8 | Kafka lag 50/replica |
| crew notification consumer | 0 | 5 | Kafka lag 50/replica |
| notification worker | 0 | 10 | queue 100/replica |
| AI assistant worker | 0 | 8 | queue 5/replica |
| Shoe Life AI worker | 0 | 4 | queue 2/replica |

`challenge event consumer` 행은 2026-07-29에 만든 challenge-service-consumer/crew-service-consumer/ai-assistant-service-consumer/notification-service-consumer/running-record-service-outbox-publisher 다섯 개 워커 전부에 적용되는 시작값이다. 실제로는 워커별 Kafka lag 특성이 다르므로(예: running-record-service-outbox-publisher는 폴링 주기 기반이라 lag보다 outbox 미발행 행 수가 더 적합한 신호일 수 있다) 서비스별로 분리해 측정 후 조정한다.

Bedrock quota, DB connection pool, Kafka partition 수보다 많은 Replica를 만들면 처리량이 늘지 않을 수 있다. 외부 한도와 함께 확인한다.

### 14.4 ResourceQuota 검토

초안의 quota는 namespace별 상한이다. 여러 namespace의 quota 합이 물리 자원보다 커도 즉시 위험한 것은 아니지만, 실제 requests 합계와 system reserved를 기준으로 배포 가능성을 검증한다.

최소한 다음을 함께 점검한다.

- `kubectl describe node` Allocatable
- namespace별 requests/limits 합
- ztunnel·Istio CNI·Waypoint의 노드별 또는 namespace별 추가분
- Longhorn·Kafka·DB의 고정 요청량
- master/system reserved
- PC별 VM 메모리 합산
- HPA maxReplica에서의 최악 합계

#### ResourceQuota INITIAL

| Namespace | Pods | requests CPU/Mem | limits CPU/Mem | PVC | Storage | QoS 목표 |
|---|---:|---|---|---:|---:|---|
| `dir-frontend-ns` | 10 | 2 / 4Gi | 6 / 8Gi | 1 | 10Gi | Burstable |
| `dir-backend-ns` | 70 | 8 / 12Gi | 20 / 28Gi | 2 | 30Gi | Burstable |
| `dir-ai-ns` | 25 | 6 / 10Gi | 14 / 22Gi | 2 | 50Gi | Burstable |
| `dir-db-ns` | 20 | 6 / 16Gi | 14 / 30Gi | 8 | 220Gi | Guaranteed 권장 |
| `dir-kafka-ns` | 15 | 4 / 8Gi | 10 / 18Gi | 4 | 120Gi | Guaranteed 권장 |
| `dir-search-ns` | 8 | 2 / 4Gi | 6 / 10Gi | 2 | 60Gi | Guaranteed 권장 |
| `dir-storage-ns` | 8 | 2 / 4Gi | 6 / 10Gi | 2 | 80Gi | Guaranteed 권장 |
| `dir-obsv-ns` | 35 | 5 / 10Gi | 12 / 22Gi | 6 | 100Gi | Burstable |
| `dir-argocd-ns` | 20 | 3 / 5Gi | 8 / 12Gi | 2 | 20Gi | Burstable |
| `dir-istio-system` | 20 | 4 / 5Gi | 10 / 12Gi | 0 | 0Gi | Burstable |
| `dir-metallb-system` | 15 | 1 / 1Gi | 3 / 4Gi | 0 | 0Gi | Burstable |
| `dir-longhorn-system` | 40 | 4 / 8Gi | 10 / 20Gi | 0 | 0Gi | System |
| `dir-security-system` | 25 | 3 / 4Gi | 8 / 10Gi | 0 | 0Gi | Burstable |
| `dir-keda-system` | 12 | 1 / 2Gi | 4 / 6Gi | 0 | 0Gi | Burstable |
| `dir-backup-ns` | 12 | 1 / 2Gi | 4 / 6Gi | 0 | 0Gi | Burstable |
| `dir-test-ns` | 50 | 6 / 8Gi | 16 / 24Gi | 2 | 20Gi | Burstable/테스트 전용 |

Quota 합계는 물리 자원의 상한을 뜻하지 않지만 현재 클러스터 용량보다 크다. 모든 namespace가 동시에 최대치까지 사용할 수 있다는 뜻이 아니며 실제 requests 합과 Allocatable을 별도로 검증한다.

#### LimitRange INITIAL

| Namespace | max CPU/Mem | min CPU/Mem | default CPU/Mem | defaultRequest CPU/Mem |
|---|---|---|---|---|
| `dir-frontend-ns` | 2 / 2Gi | 50m / 64Mi | 500m / 768Mi | 100m / 256Mi |
| `dir-backend-ns` | 2 / 2Gi | 50m / 64Mi | 500m / 512Mi | 100m / 128Mi |
| `dir-ai-ns` | 4 / 4Gi | 100m / 128Mi | 1000m / 1Gi | 250m / 512Mi |
| `dir-db-ns` | 4 / 8Gi | 100m / 128Mi | 1000m / 2Gi | 500m / 1Gi |
| `dir-kafka-ns` | 4 / 8Gi | 100m / 128Mi | 1500m / 2Gi | 500m / 1Gi |
| `dir-search-ns` | 4 / 8Gi | 100m / 256Mi | 1000m / 2Gi | 500m / 1Gi |
| `dir-storage-ns` | 4 / 8Gi | 100m / 128Mi | 1000m / 2Gi | 500m / 1Gi |
| `dir-obsv-ns` | 4 / 8Gi | 25m / 32Mi | 500m / 512Mi | 100m / 128Mi |
| `dir-argocd-ns` | 4 / 4Gi | 25m / 64Mi | 500m / 512Mi | 100m / 128Mi |
| `dir-istio-system` | 4 / 4Gi | 25m / 64Mi | 500m / 512Mi | 100m / 128Mi |
| `dir-metallb-system` | 2 / 2Gi | 10m / 32Mi | 200m / 256Mi | 50m / 64Mi |
| `dir-longhorn-system` | 4 / 8Gi | 25m / 64Mi | 500m / 1Gi | 100m / 256Mi |
| `dir-security-system` | 4 / 4Gi | 25m / 64Mi | 500m / 512Mi | 100m / 128Mi |
| `dir-keda-system` | 2 / 2Gi | 25m / 64Mi | 500m / 512Mi | 100m / 128Mi |
| `dir-backup-ns` | 2 / 2Gi | 25m / 64Mi | 500m / 512Mi | 100m / 128Mi |
| `dir-test-ns` | 4 / 4Gi | 25m / 64Mi | 500m / 512Mi | 100m / 128Mi |

초안의 일부 LimitRange 대상 namespace 이름이 비어 있으면 이름을 기준으로 canonical namespace에 매핑한다. 실제 manifest에는 `metadata.namespace`를 명시한다.

### 14.5 주요 워크로드 requests/limits 초기값

| Workload | Replicas | CPU request/limit | Memory request/limit |
|---|---:|---|---|
| frontend | 2 | 100m / 500m | 256Mi / 768Mi |
| auth-user | 2 | 200m / 750m | 256Mi / 768Mi |
| course | 1 | 200m / 750m | 256Mi / 768Mi |
| course-recommendation backend | 1 | 150m / 500m | 256Mi / 512Mi |
| running-record | 2 | 250m / 1000m | 384Mi / 1Gi |
| crew | 1 | 150m / 500m | 256Mi / 512Mi |
| crew-chat | 1 | 250m / 1000m | 384Mi / 768Mi |
| coaching | 1 | 150m / 500m | 256Mi / 512Mi |
| AI assistant backend proxy | 1 | 150m / 500m | 256Mi / 512Mi |
| support | 1 | 100m / 300m | 128Mi / 384Mi |
| challenge | 1 | 150m / 500m | 256Mi / 512Mi |
| shoe | 1 | 150m / 500m | 256Mi / 768Mi |
| environment | 1 | 100m / 500m | 192Mi / 512Mi |
| marathon | 2 | 250m / 1500m | 384Mi / 1Gi |
| notification | 1 | 100m / 500m | 192Mi / 512Mi |
| media | 1 | 200m / 1000m | 384Mi / 1Gi |
| Course Recommendation AI | 1 | 300m / 1500m | 512Mi / 1536Mi |
| Shoe Life AI | 1 | 500m / 2000m | 1Gi / 2Gi |
| AI assistant worker | 0(KEDA) | 300m / 1500m | 512Mi / 1536Mi |
| OTel Gateway | 2 | 200m / 1000m | 256Mi / 1Gi |
| Grafana | 1 | 100m / 500m | 256Mi / 768Mi |
| Prometheus | 1 | 500m / 2000m | 1Gi / 3Gi |
| Loki | 1 | 250m / 1000m | 512Mi / 1536Mi |
| Tempo | 1 | 250m / 1000m | 512Mi / 1536Mi |
| PostgreSQL | 2 | 1000m / 2000m | 2Gi / 4Gi |
| MongoDB | 3 | 500m / 1000m | 1Gi / 2Gi |
| Kafka | 3 | 500m / 1500m | 1Gi / 2Gi |
| Elasticsearch | 1 | 750m / 2000m | 2Gi / 4Gi |
| MinIO | 1 | 500m / 2000m | 1Gi / 2Gi |

---

## 15. Probe와 배포 안전성

### 15.1 애플리케이션 Probe

- frontend: `/healthz`, port 3000
- backend 서비스: `/health/live`, `/health/ready`, 필요 시 `/health/startup`. services-msa의 각 서비스는 현재 `/health`만 구현돼 있으므로 K8s 이전 전 live/ready 분리를 추가한다.
- AI 서비스: 동일한 live/ready/startup 계약을 구현하고 model warm-up에 긴 startup 시간을 준다.
- liveness는 프로세스 생존만 확인한다.
- readiness는 실 트래픽을 받을 수 있는지 확인한다.
- 외부 Bedrock, 지도 API 등 일시 장애를 이유로 liveness를 실패시켜 Pod를 재시작하지 않는다.
- DB 연결을 liveness에 강하게 묶지 않는다.

권장 시작값:

- 일반 앱: liveness 15초, readiness 5초, timeout 2초, failure 3
- AI 앱: liveness 20초, readiness 5초, timeout 3초, startup 최대 150초
- chart 설치 구성에서는 chart 기본 endpoint를 확인하고 추측한 HTTP 경로를 넣지 않는다.

### 15.2 Stateful Probe

- PostgreSQL: `pg_isready`
- MongoDB: `mongosh` ping, ReplicaSet 선출 시간을 고려
- Redis: 인증을 포함한 `redis-cli ping`
- Kafka: startup TCP 9092, readiness broker API 확인
- Elasticsearch: live local cluster health, ready yellow 이상
- MinIO: `/minio/health/live`, `/minio/health/ready`
- Prometheus: `/-/healthy`, `/-/ready`
- Loki/Tempo: `/ready`

### 15.3 Rolling Update

- readiness 통과 전 트래픽을 보내지 않는다.
- 핵심 API는 `maxUnavailable: 0`을 검토한다.
- WebSocket은 preStop과 termination grace period로 drain한다.
- PodDisruptionBudget은 실제 Replica 수와 일치해야 한다.
- single replica에 `minAvailable: 1` PDB를 걸어 drain을 무기한 차단하지 않는다.
- DB migration과 애플리케이션 배포는 Expand → Migrate → Contract 순서를 따른다.

---

## 16. 플랫폼 구성요소

### 16.1 배포·운영

- GitHub Actions: 현재 CI(`.github/workflows/ci.yml`)
- self-hosted runner label: `cicd`
- Harbor: 이미지 Registry
- SonarQube: 품질 분석
- Trivy: 이미지 취약점 분석
- Argo CD: K8s GitOps 목표
- metrics-server: HPA CPU/Memory
- KEDA: Kafka/queue 기반 확장
- Strimzi: Kafka lifecycle
- Longhorn: 분산 블록 스토리지
- Velero: Kubernetes object backup

현재 CI는 `main` push 후 Docker Compose 배포 경로가 남아 있다(§16.4의 `deploy` job, `~/dai-run-deploy`). K8s 이전이 완료될 때까지 이를 현재 상태로 기록하되, 목표는 서비스별 immutable 이미지 → GitOps 저장소 변경 → Argo CD sync다. Docker Compose 배포와 Argo CD가 같은 환경을 동시에 수정하지 않게 한다.

### 16.2 보안

- cert-manager: 인증서
- Kyverno: 처음 audit, 검증 후 enforce
- kube-bench: 주기 점검
- RBAC: 최소 권한
- Pod Security: privileged, hostPath, hostNetwork 예외 최소화
- NetworkPolicy: default-deny + allowlist
- Secret: 평문 Git 저장 금지
- imagePullSecret: Harbor 전용
- ServiceAccount token 자동 mount는 필요할 때만 허용

### 16.3 테스트

- k6: 부하·smoke, 운영 피크와 동시에 실행하지 않음
- Chaos Mesh: 격리된 테스트 namespace에서만
- Headlamp: read-only 중심 관리자 UI
- 테스트 namespace에도 ResourceQuota와 LimitRange를 둔다.

### 16.4 CI/CD 실행 기준

CI 순서(목표):

1. 의존성 설치
2. lint와 type check
3. unit/integration test
4. build
5. SonarQube 분석
6. Trivy filesystem/image scan
7. immutable image build
8. Harbor push
9. digest 검증과 최소 SBOM 생성

**현재 `.github/workflows/ci.yml`은 위 목표와 다르다.** 실제로는 Docker version 확인 → SonarQube(main push에만) → 루트 Next.js Dockerfile 단일 이미지 build → Trivy scan(table/JSON 두 번) → Pushgateway로 취약점 수 전송 → tag → Harbor push/deploy 순이며, **services-msa의 12개 서비스는 build/test/lint 단계가 전혀 없다.** 2026-07-29에 `scripts/check-schema-boundaries.mjs` 스키마 경계 검사 한 단계만 추가했다. services-msa 서비스별 build/test 단계를 CI에 추가하는 일은 아직 하지 않았다.

CD 기준:

- Argo CD GitOps를 목표로 한다.
- manifest의 image tag 또는 digest를 갱신하고 sync와 health를 확인한다.
- RollingUpdate를 기본으로 하며 핵심 API에는 PDB와 topology spread를 적용한다.
- 실패 시 이전 immutable image로 rollback한다.
- `cicd` VM은 GitHub Runner, SonarQube, Trivy와 build 도구를 담당하고, `harbor` VM은 Registry를 담당한다.
- 같은 CI build workload를 Kubernetes에 임의로 중복 배치하지 않는다.
- 이미지는 multi-stage, non-root, capability drop을 기본으로 하고 가능한 경우 read-only root filesystem을 사용한다.
- `<git-sha>` 또는 digest를 사용하고 `latest` 단독 배포를 금지한다.

---

## 17. 관측성과 AI 운영 대시보드

### 17.1 MELT

- Metrics: Prometheus
- Events: Kubernetes Event, 배포·보안·비동기 이벤트
- Logs: Grafana Alloy → Loki
- Traces: OpenTelemetry/Alloy → Tempo
- Visualization: Grafana
- Service Mesh: Istio + Kiali

Grafana는 AI 기반 자체 운영 대시보드가 완성되기 전까지 사용한다. 자체 대시보드도 Prometheus, Loki, Tempo 등 표준 backend를 재사용하고 저장소를 중복 구현하지 않는다.

### 17.2 필수 로그 필드

- `timestamp`
- `level`
- `service`
- `environment`
- `traceId`
- `spanId`
- `requestId`
- `eventType` 또는 `operation`
- 오류 코드

토큰, 비밀번호, API key, 전체 GPS, 전체 건강 데이터, 전체 프롬프트, 불필요한 이메일을 로그에 남기지 않는다.

### 17.3 필수 메트릭

- HTTP count, latency, error rate
- Pod/Node CPU·memory·disk·network
- DB connection pool, query latency, replication state
- Redis hit ratio
- Kafka consumer lag, under-replicated partition, DLQ
- GPS sample ingest rate
- 추천 latency와 결과 없음 비율
- Bedrock token·latency·error·throttle
- AI in-flight와 queue depth
- MinIO capacity와 오류
- PVC usage와 inode
- HPA/KEDA desired/current replicas
- CI 취약점 수

Prometheus label에 `userId`, `runId`, `courseId`, 세션 ID 같은 고 cardinality 값을 넣지 않는다.

### 17.4 Predictive Autoscaling과 AI Alert

- 초기에는 HPA/KEDA의 정적 임계값을 Alert의 기준으로 사용한다.
- 부하, 시간대, Kafka lag, 응답 지연, 접수 일정 데이터를 충분히 축적한 뒤 예측 모델을 적용한다.
- AI 추천은 오퍼레이터가 확인할 수 있게 근거, 예상 영향, confidence를 제공한다.
- AI가 직접 Replica, quota, DB 설정을 무제한 변경하지 않는다.
- 자동 조치는 최대·최소, cooldown, rollback, audit log를 갖춘다.

---

## 18. 보안과 개인정보

- `.env`, DB 비밀번호, OAuth Secret, JWT Secret, AWS key, Bedrock 정보, 지도 API key를 커밋하지 않는다.
- 로컬에는 `.env.example`만 제공한다.
- `services-msa/.env`(서비스별 DB role 자격 증명, §4.1/§5.1)는 루트 `.env`와 별도 파일로 관리하며 두 파일 모두 `.gitignore`의 `.env`/`.env.*` 패턴에 걸려 있어야 한다.
- Request body의 `userId`를 권한 판단 근거로 사용하지 않는다.
- 인증 Principal의 사용자 ID와 객체 소유권을 검증한다.
- 크루장과 관리자는 자신에게 허용된 범위만 수정한다.
- IDOR, SQL Injection, XSS, SSRF, 파일 업로드 우회를 방지한다.
- 로그인, 추천, 채팅, 업로드, 마라톤 신청에 rate limit을 적용한다.
- 위치, 러닝 경로, 심박, 건강 정보는 민감 데이터로 취급한다.
- 최소 수집, 목적 제한, 동의, 보존 기간, 삭제, 접근 통제, 감사 기록을 설계한다.
- 공개 코스의 시작·종료점이 주거지를 드러낼 가능성을 고려한다.
- Refresh Token은 원문이 아니라 해시를 저장하고 rotation·재사용 탐지를 고려한다.

Kubernetes로 옮길 때 위 자격 증명은 평문 manifest가 아니라 `dir-<workload>-secret`/`dir-<workload>-db-secret`으로만 존재해야 한다(§9.1).

---

## 19. 구현 규칙

### 19.1 공통

- 작업 전 `git status`, `README`, `CLAUDE.md`, package/build 파일, migration, manifest를 확인한다.
- 요청과 직접 관련된 파일만 수정한다.
- 기존 패턴과 네이밍을 우선한다.
- 대규모 리팩터링과 기술 스택 교체를 임의로 수행하지 않는다.
- 생성 파일, `node_modules`, `.next`, build 결과, IDE 파일, 비밀값을 커밋하지 않는다.
- 임시 Mock은 운영 경로와 분리하고 제거 조건을 기록한다.
- 코드에 hardcoded IP·password·AWS account-specific 경로를 늘리지 않는다.
- 현재 코드에 남은 hardcoded Docker-era default는 K8s ConfigMap/Secret/Service DNS로 단계적으로 제거한다.
- **서비스 경계 검사**: `services-msa` 코드를 수정할 때는 `node scripts/check-schema-boundaries.mjs`를 실행해 자기 소유 스키마 밖 크로스 스키마 쓰기가 없는지 확인한다. 이 스크립트의 `ACCESS_MAP`과 `db/041_service_db_roles.sql`의 GRANT 목록은 항상 같이 갱신한다.

### 19.2 TypeScript/Next.js/Node.js

- strict TypeScript를 유지하고 `any`를 피한다.
- Route Handler에서 인증, 입력 검증, 응답 변환을 하고 핵심 로직은 `lib` 또는 application layer로 분리한다.
- DB Entity/row를 그대로 외부에 노출하지 않는다.
- API 오류, loading, empty, 권한 거부, 위치 권한 거부를 처리한다.
- pagination 없는 무제한 조회를 만들지 않는다.
- 서버 비밀값을 `NEXT_PUBLIC_*`로 노출하지 않는다.
- frontend/auth-web이 같은 빌드 산출물이라는 현재 제약을 이해하고(§3.1), Next.js `app/api/**`가 실제로는 도달 불가능한 죽은 코드라는 점을 감안해 신규 API 기능은 services-msa 쪽에 구현한다.

### 19.3 FastAPI/Python

- Pydantic request/response schema를 사용한다.
- async endpoint에서 blocking I/O를 그대로 실행하지 않는다.
- health, readiness, startup endpoint를 구현한다.
- 외부 API와 Bedrock에 timeout과 제한된 retry를 둔다.
- 사용자에게 내부 예외, AWS ARN, SQL, stack trace를 노출하지 않는다.
- 업로드는 streaming size limit, MIME, 이미지 decode, pixel limit을 검증한다.

### 19.4 API

- JSON은 `camelCase`, DB는 `snake_case`를 유지한다.
- 날짜·시각은 ISO-8601로 반환한다.
- 401 인증 실패와 403 권한 부족을 구분한다.
- field별 validation error를 제공한다.
- 위도 `-90~90`, 경도 `-180~180`, 거리·페이스 양수, 심박 `20~250`, 평점 `0~5`를 검증한다.
- 마라톤 신청, 러닝 완료, 알림, 외부 이벤트는 멱등성을 설계한다.
- 외부 API를 DB transaction 안에서 오래 호출하지 않는다.

### 19.5 Git

- feature branch와 Pull Request를 사용한다.
- `main` 직접 push를 피한다.
- 장기 feature branch는 정기적으로 main과 동기화한다.
- squash merge를 기본으로 한다.
- 한 커밋에는 하나의 논리 변경을 담는다.
- 같은 기능 영역을 여러 branch가 동시에 수정하는지 먼저 확인한다.

### 19.6 GitLab 접속

- 소스는 AWS 내부 GitLab(`dai-run/application`)에서 관리한다. 사내망/AWS VPC에 직접 연결된 경우 `http://10.20.0.253/dai-run/application`(`.git`)을 그대로 쓴다.
- 외부에서는 AWS SSM 포트포워딩이 필요하다. 새 터미널에서:

  ```bash
  aws ssm start-session \
    --profile dairun \
    --region ap-northeast-2 \
    --target i-011ea4856b3c2f4ce \
    --document-name AWS-StartPortForwardingSession \
    --parameters "portNumber=80,localPortNumber=8081"
  ```

  `Port 8081 opened / Waiting for connections...`가 뜨면 연결된 것이고, 이 세션은 계속 열어둔 채로 `http://127.0.0.1:8081/dai-run/application`(`.git`)을 사용한다.
- `Failed to connect to 127.0.0.1 port 8081`은 이 포트포워딩이 끊긴 상태다(터미널 종료, `Ctrl+C`, 절전/재부팅, 네트워크 변경, SSM 세션 종료 등으로 끊길 수 있다) — 위 명령을 다시 실행하면 된다. 자세한 절차와 GitLab 인증/토큰 안내는 `/home/kevin/cicd 현황.md` 참고(토큰 등 비밀값이 있으니 이 파일 자체를 커밋하거나 내용을 그대로 복사해 넣지 않는다).

---

## 20. 테스트와 검증

### 20.1 코드

- unit/integration test
- API 계약과 인증·권한 테스트
- DB migration 테스트
- Kafka 중복 전달 테스트
- Redis 장애 fallback
- 외부 API timeout·오류
- AI Tool Calling schema와 Guardrail
- lint, typecheck, build

### 20.2 DB/PostGIS

- 실제 PostgreSQL + PostGIS 또는 Testcontainers를 사용한다.
- 5km 반경 경계
- longitude/latitude 순서
- SRID 불일치
- 잘못된 LineString
- GIST 실행 계획
- waypoint 순서
- migration 재실행·rollback 가능 범위
- H2만으로 공간 동작을 대체하지 않는다.

### 20.3 K8s

- `kubectl apply --dry-run=server`
- Helm template 또는 Kustomize build
- schema validation
- image pull
- ConfigMap/Secret key 일치
- Service selector와 Pod label 일치
- Service port/targetPort 일치
- Probe 설정 응답
- PVC binding과 Node affinity
- taint/toleration
- topology spread와 anti-affinity
- requests 합과 Allocatable
- HPA/KEDA target 존재
- PDB와 Replica 수
- NetworkPolicy 통신
- 장애·복구와 백업 restore

### 20.4 성능 목표

아래 값은 **INITIAL 검증 목표**이며 측정값이 아니다.

- 동시 사용자 500명 이상
- 일반 API 평균 1초 이내
- 일반 API p95 2초 이내
- 일반 API 오류율 1% 이하
- 마라톤 spike 오류율 3% 이하
- 티켓팅 API 응답 3초 이내

측정 전 복잡한 분산 구조를 추가하지 않고, k6 결과·Prometheus 지표·DB/Kafka 병목과 테스트 조건을 함께 남긴 뒤 `MEASURED` 또는 `APPROVED`로 승격한다.

---

## 21. Kubernetes 마이그레이션 순서

1. 현재 Docker 컨테이너, 이미지, 환경변수, 포트, 볼륨, 외부 연결을 inventory한다.
2. PostgreSQL, MongoDB, Redis, Elasticsearch, MinIO, Kafka의 관측 데이터와 이관·재생성 여부를 분류한다.
3. etcd snapshot과 클러스터 복구 절차를 확보한다.
4. namespace, ResourceQuota, LimitRange, ServiceAccount, Secret/ConfigMap 기반을 만든다.
5. Longhorn과 local PV를 구성하고 binding·복구를 검증한다.
6. PostgreSQL/PostGIS, MongoDB, Kafka, Redis, Elasticsearch, MinIO를 순차 배포한다.
7. DB migration Job, topic init Job, bucket init Job을 실행하고 결과를 검증한다.
8. services-msa의 12개 API + 5개 Consumer/Worker, auth-web, frontend, AI 서비스를 Service DNS 기반으로 배포한다.
9. Consumer와 CronJob을 한 종류씩 중복 실행 여부를 확인한다.
10. Istio Ingress, TLS, 인증, NetworkPolicy를 적용한다.
11. OTel/Alloy/Prometheus/Loki/Tempo/Grafana/Kiali로 MELT를 검증한다.
12. HPA/KEDA는 metrics 수집과 부하 테스트 후 활성화한다.
13. 기존 Docker writer를 중지하고 최종 delta를 이관한 뒤 K8s로 전환한다.
14. rollback 조건과 이전 Docker 데이터 보존 기간을 명시한다.

데이터 복사 성공만으로 migration 완료로 보지 않는다. row/document/object 수, checksum 또는 표본, 최신 시각, 애플리케이션 읽기·쓰기, 복구 테스트를 확인한다.

---

## 22. AWS 이전을 위한 호환성

AWS는 현재 구현 우선순위가 아니라 다음 단계다. 다만 아래 경계를 유지한다.

| 온프레미스 | AWS 후보 | 현재 지침 |
|---|---|---|
| Kubernetes | EKS | 표준 manifest/Helm/Kustomize 유지 |
| local PV/Longhorn | EBS CSI, 필요 시 EFS | StorageClass 이름을 환경 overlay로 분리 |
| PostgreSQL/PostGIS | RDS/Aurora PostgreSQL | 지원 extension과 migration 검증 |
| Redis | ElastiCache | cache/queue 인터페이스 분리 |
| Elasticsearch | OpenSearch | 검색 adapter와 index mapping 분리 |
| MinIO | S3 | S3-compatible object adapter 사용 |
| Harbor | ECR 또는 Harbor 유지 | image repository를 환경 값으로 분리 |
| MetalLB | AWS Load Balancer Controller/NLB | 온프레미스 LB 설정을 cloud overlay에 넣지 않음 |
| Kubernetes Secret | Secrets Manager + External Secrets 후보 | 앱 코드에 secret provider를 결합하지 않음 |
| 정적 AWS key | EKS Pod Identity/IRSA | AWS 이전 시 장기 key 제거 |

AWS 전용 SDK를 도메인 로직 전체에 퍼뜨리지 않는다. AI, 객체 저장소, 검색, 알림, 외부 API는 port/adapter 경계를 둔다. 온프레미스 local path와 IP를 cloud manifest에 남기지 않는다.

---

## 23. AI 작업 완료 보고 형식

코드나 manifest를 수정한 AI는 다음을 보고한다.

### 변경 요약

- 구현·수정한 내용
- 현재 구현과 K8s 목표 중 어느 범위를 바꿨는지
- 영향 서비스와 namespace

### 변경 파일

- 주요 파일과 역할

### 검증

- 실행한 build/test/lint/manifest 검증
- 성공·실패 결과
- 실행하지 못한 검증과 이유

### 데이터 영향

- migration 유무
- 테이블·컬럼·인덱스·제약
- Kafka topic/event schema
- PVC·백업·복구 영향

### 운영 영향

- ConfigMap, Secret, Service DNS
- 배포 순서
- HPA/KEDA
- 캐시·재색인
- Consumer/CronJob 중복 실행
- rollback과 알려진 제한

추측한 부분이나 미실행 검증을 완료했다고 표현하지 않는다.

---

## 24. 절대 금지

- 사용자 승인 없이 서비스, 도구, 노드 라벨, DB 컬럼, 워크로드 추가
- `alphacar-*` 템플릿을 DAI RUN 리소스로 배포
- Jenkins 도입
- `dir-fe-ns`, `dir-be-ns` 등 비표준 namespace 재사용
- worker3에 `data-capable=true` 임의 추가
- 서비스 간 물리 FK와 직접 JOIN을 신규 표준으로 도입
- 제거된 `initial_distance_m` 복원
- LLM 좌표를 검증 없이 코스로 저장
- 이미지·파일 바이너리를 PostgreSQL에 저장
- Refresh Token 원문 저장
- Secret·개인정보·전체 GPS·전체 프롬프트 커밋 또는 로그 출력
- 브라우저 입력 `userId`를 권한 기준으로 신뢰
- 무제한 목록 조회와 외부 API 무제한 retry
- Kafka Consumer 비멱등 처리
- DB commit과 이벤트 발행의 실패 가능성을 숨김
- Operator 관리 StatefulSet 직접 수정
- local PV를 이동 가능한 HA storage로 설명
- Node Replica 수를 물리 PC HA로 과장
- 단일 마스터 설계에 kube-vip를 다시 추가
- Docker Compose와 Argo CD가 같은 운영 리소스를 동시에 관리
- 적용된 migration 파일 수정
- staging/legacy/RAW 테이블을 일반 API 원본으로 사용
- 테스트 실패 상태를 수행하지 않은 검증을 성공으로 보고
- 요청되지 않은 전면 재작성
- `services-msa`에서 자기 소유 스키마 밖에 새 크로스 스키마 쓰기를 만드는 것(§4.1, §19.1의 `check-schema-boundaries.mjs`가 CI에서 이를 막는다)

---

## 25. Definition of Done

- 요청 기능이 실제 코드의 실행 경로에 연결돼 있다.
- 현재 구현과 목표 설계를 구분해 설명한다.
- 서비스 경계와 데이터 소유권을 지켰다.
- 인증, 권한, 입력 검증, 멱등성을 적용한다.
- 필요한 migration, 인덱스, 이벤트 계약을 포함한다.
- ConfigMap/Secret/Service/Probe/requests/limits가 일치한다.
- HPA/KEDA target과 metrics가 실제로 존재한다.
- affinity, taint, topology spread, PVC 배치를 검증한다.
- 핵심 테스트가 통과한다.
- 로그·메트릭·트레이스에 필요한 정보가 있고 민감정보는 없다.
- 백업, 복구, 배포 순서, rollback과 현재 한계를 기록한다.
- Docker에서 K8s로의 이전 또는 기존 K8s 실행 경로를 깨뜨리지 않았다.

---

## 26. UI와 UX

- 상단 내비게이션과 AI 비서를 주요 페이지에서 일관되게 유지한다.
- 프로젝트 색상은 남색 계열을 중심으로 하고 불필요한 gradient와 과도한 장식을 임의로 추가하지 않는다.
- 접근 가능한 label, focus, keyboard navigation, contrast를 적용한다.
- 지도와 차트에는 loading, empty, error 상태가 있어야 한다.
- 위치 권한 거부 시 대신 지역 선택을 제공한다.
- 모바일에서 GPS 정확도, 배터리, background permission, 오프라인 버퍼를 고려한다.
- 인증 전 화면, 알림센터, 고객지원·문의 내역을 공통 사용자 흐름에 포함한다.
- 서버와 연결되지 않는 화면 기능을 UI만으로 완료됐다고 표현하지 않는다.

## 27. 문서·안방안 작성 규칙

- 사용자가 한 섹션의 수정을 요청하면 기존 항을 재정렬하지 않는다.
- 추가 항목은 사용자 승인 후 마지막에만 추가한다.
- `replicas`, `args/command`, `configmapRef`, `secretRef`, `imagePullSecret`, `claimName`, `requests`, `limits`, 배치 비고를 빈 자리 없이 채운다.
- 숫자 앞의 잘못된 표시 단위(`MB` 등)는 실제 숫자와 단위를 분리해 바로잡는다.
- namespace, Service port, Deployment port가 상호 다르면 canonical namespace, 실제 manifest, 최신 사용자 결정을 우선해 대조한다.
- 확정되지 않은 값은 `X`로 표시하고 결정된 값과 구분한다.
- ConfigMap과 Secret의 성격을 바꾸지 않는다.
- 과거 문서의 `dir-fe-ns`, `dir-be-ns`, `dir-str-ns`, `dir-istio-ns`, `dir-metallib-ns`는 canonical 이름으로 변환한다.
- `alphacar-*`, Jenkins 흔적, 다른 프로젝트 세팅값을 DAI RUN 기준으로 가져오지 않는다.
- 단순 삭제 대신 서비스·워크로드·HPA·ConfigMap·Secret·DB 항목을 복원하지 않는다.

---

## 부록 A. 외부 API 경로와 실제 처리 주체

> nginx(`nginx/locations.conf`)가 받는 `/api/**` 외부 계약 기준. 코드가 바뀌면 실제 파일을 다시 스캔한다.
> "처리" 열은 2026-07-30 기준 nginx가 실제로 라우팅하는 대상이다. `app/api/**` 경로 자체는 대부분 코드로 남아 있지만 **도달 불가능**하다(§3.1).

### `ai-assistant`

| Method | Path | 처리 |
|---|---|---|
| `POST` | `/api/ai-assistant/chat` | ai-assistant-service |
| `GET` | `/api/ai-assistant/messages` | ai-assistant-service |

### `ai-recommendations`

| Method | Path | 처리 |
|---|---|---|
| `POST` | `/api/ai-recommendations/feedback` | course-recommendation-service |

### `auth`

| Method | Path | 처리 |
|---|---|---|
| `GET/POST` | `/api/auth/[...nextauth]` | auth-web(Next.js) |
| `GET` | `/api/auth/check-nickname` | auth-service |
| `GET` | `/api/auth/check-username` | auth-service |
| `POST` | `/api/auth/complete-profile` | auth-service |
| `POST` | `/api/auth/find-username` | auth-service |
| `POST` | `/api/auth/password-reset/confirm` | auth-service |
| `POST` | `/api/auth/password-reset/request` | auth-service |
| `POST` | `/api/auth/revoke-session` | auth-service |
| `POST` | `/api/auth/signup` | auth-service |
| `GET/PATCH` | `/api/auth/update-profile` | auth-service |
| `GET/PATCH` | `/api/auth/weight` | auth-service(칼로리 재계산은 running-record-service 내부 API 호출, §4.1) |
| `POST` | `/api/auth/withdraw` | auth-service(크루 탈퇴는 crew-service 내부 API 호출, §4.1) |

### `challenges`

| Method | Path | 처리 |
|---|---|---|
| `POST` | `/api/challenges/[challengeId]/join` | challenge-service |
| `POST` | `/api/challenges/[challengeId]/leave` | challenge-service |
| `GET` | `/api/challenges/[challengeId]/participants` | challenge-service |
| `GET/DELETE` | `/api/challenges/[challengeId]` | challenge-service |
| `GET/POST` | `/api/challenges` | challenge-service |

### `courses`

| Method | Path | 처리 |
|---|---|---|
| `GET/POST` | `/api/courses/[courseId]/like` | course-service |
| `PATCH/DELETE` | `/api/courses/[courseId]/reviews/[reviewId]` | course-service |
| `GET/POST` | `/api/courses/[courseId]/reviews` | course-service |
| `GET` | `/api/courses/[courseId]/track-info` | course-service(내부적으로 running-record-service 호출) |
| `GET` | `/api/courses/nearby` | course-service |

### `crew`

| Method | Path | 처리 |
|---|---|---|
| `GET` | `/api/crew/[crewId]/battle/info` | crew-service |
| `POST` | `/api/crew/[crewId]/battle/leave` | crew-service |
| `POST` | `/api/crew/[crewId]/battle/propose` | crew-service |
| `GET` | `/api/crew/[crewId]/battle/view` | crew-service |
| `POST` | `/api/crew/[crewId]/chat/join` | crew-service |
| `GET/POST` | `/api/crew/[crewId]/chat/messages` | crew-service |
| `POST` | `/api/crew/[crewId]/join-request` | crew-service |
| `POST` | `/api/crew/[crewId]/leave` | crew-service |
| `GET` | `/api/crew/[crewId]/weekly-stats` | crew-service |
| `POST` | `/api/crew/battle/[battleId]/decide` | crew-service |
| `POST` | `/api/crew/battle/[battleId]/vote` | crew-service |
| `GET` | `/api/crew/battle/my-crew` | crew-service |
| `POST` | `/api/crew/join-requests/[requestId]/decision` | crew-service |
| `GET` | `/api/crew/my-chat` | crew-service |
| `GET/POST` | `/api/crew` | crew-service |

### `environment`와 위치

| Method | Path | 처리 |
|---|---|---|
| `GET` | `/api/dong/search` | course-service |
| `GET` | `/api/environment/weather` | coaching-service |
| `GET` | `/api/geo/dong-center` | course-service |
| `GET` | `/api/geo/reverse-dong` | course-service |

### `health`와 내부 API

| Method | Path | 처리 |
|---|---|---|
| `GET` | `/api/health` | auth-web(Next.js) |
| `POST` | `/api/internal/run-completed` | **폐기됨(2026-07-29).** nginx 라우팅 대상 없음. running-record-service/challenge-service/crew-service/ai-assistant-service 각자의 `/api/internal/**`가 대체(§3.2, §6.1~6.2). |

### `marathon`

| Method | Path | 처리 |
|---|---|---|
| `POST` | `/api/marathon/[raceId]/apply` | marathon-service |
| `POST` | `/api/marathon/[raceId]/cancel` | marathon-service |
| `GET` | `/api/marathon/[raceId]` | marathon-service |
| `GET` | `/api/marathon` | marathon-service |

### `mypage`와 알림

| Method | Path | 처리 |
|---|---|---|
| `GET` | `/api/mypage/running-stats` | running-record-service |
| `POST` | `/api/notifications/[notificationId]/read` | notification-service |
| `GET` | `/api/notifications` | notification-service |

### `runs`

| Method | Path | 처리 |
|---|---|---|
| `POST` | `/api/runs/[runId]/cancel` | running-record-service |
| `POST` | `/api/runs/[runId]/finish` | running-record-service(Outbox 트랜잭션, §6.2) |
| `POST` | `/api/runs/[runId]/samples` | running-record-service |
| `POST` | `/api/runs/start` | running-record-service |

### `shoes`

| Method | Path | 처리 |
|---|---|---|
| `GET/POST` | `/api/shoes/[shoeId]/like` | shoe-service |
| `GET` | `/api/shoes/catalog-search` | shoe-service |
| `GET` | `/api/shoes/filters` | shoe-service |
| `GET` | `/api/shoes/mine` | shoe-service |
| `GET/POST` | `/api/shoes/preferences` | shoe-service |
| `GET` | `/api/shoes/recommendations` | shoe-service |
| `GET` | `/api/shoes` | shoe-service |

### `support`

| Method | Path | 처리 |
|---|---|---|
| `POST` | `/api/support/[inquiryId]/reply` | notification-service |
| `GET` | `/api/support/[inquiryId]` | notification-service |
| `GET/POST` | `/api/support` | notification-service |

### `user-running-preferences`와 `user-shoes`

| Method | Path | 처리 |
|---|---|---|
| `GET/POST` | `/api/user-running-preferences` | auth-service |
| `POST` | `/api/user-shoes/[userShoeId]/retire` | shoe-service |
| `GET/PATCH` | `/api/user-shoes/[userShoeId]` | shoe-service |
| `GET` | `/api/user-shoes/[userShoeId]/thumbnail` | shoe-service |
| `GET` | `/api/user-shoes/[userShoeId]/wear-analysis/[wearAnalysisId]/photo` | shoe-service |
| `GET` | `/api/user-shoes/[userShoeId]/wear-analysis/[wearAnalysisId]` | shoe-service |
| `GET` | `/api/user-shoes/[userShoeId]/wear-analysis/latest` | shoe-service |
| `POST` | `/api/user-shoes/[userShoeId]/wear-analysis` | shoe-service |
| `GET` | `/api/user-shoes/active-options` | shoe-service |
| `POST` | `/api/user-shoes` | shoe-service |

## 부록 B. 주요 파일 위치

| 경로 | 책임 |
|---|---|
| `app/**` | Next.js 화면과 Route Handler — 대부분 도달 불가능한 죽은 코드(§3.1), `[...nextauth]`/`health`만 실제 사용 |
| `components/**` | UI 컴포넌트 |
| `lib/**` | Next.js 쪽 도메인 로직, DB, Kafka, 검색, 외부 연동(§3.1 기준 대부분 비활성) |
| `services-msa/**` | 실제 운영 백엔드. 12개 API 서비스 + 5개 Consumer/Worker(§3.2) |
| `services/**` | 레거시 Kafka Consumer와 Scheduler(§3.2) — `run-completion-consumer`는 삭제됨 |
| `ai/ai-rag-service/**` | AI 비서·RAG·추천 코칭 |
| `ai/ai-course-recommendation/**` | AI 코스 추천 |
| `ai/ai-shoe-life/**` | 러닝화 수명 분석 |
| `db/**` | SQL migration, seed, ETL. `039`~`041`이 2026-07-29 Outbox/DB role migration |
| `scripts/check-schema-boundaries.mjs` | 서비스별 스키마 경계 정적 검사(CI 연동, §19.1) |
| `.github/workflows/ci.yml` | CI(현재는 루트 Next.js 이미지 빌드 중심, §16.4) |
| `Dockerfile.frontend` | frontend 이미지(`APP_ROLE=frontend`) |
| `Dockerfile.auth-web` | auth-web 이미지(`APP_ROLE=backend`, 컨테이너명은 auth-web) |
| `docker-compose.yml` | 루트 Docker 구성(frontend, auth-web, mongo, 레거시 Consumer/Scheduler, nginx) |
| `services-msa/docker-compose.yml` | services-msa 12개 서비스 + 5개 Consumer/Worker 구성, 별도 compose project(`dai-run-msa`) |
| `services-msa/.env` | 서비스별 DB role 자격 증명(gitignored) |
| `nginx/default.conf`, `nginx/locations.conf` | 외부 라우팅 — 실제 현재 아키텍처를 확인하는 가장 빠른 파일 |
| `instrumentation.ts` | Next.js OTel |

## 부록 C. 구현 판단 Checklist

### API 변경

- [ ] 기존 route와 중복되지 않는가
- [ ] 인증·권한이 있는가
- [ ] 입력 검증이 있는가
- [ ] DB transaction 범위가 적절한가
- [ ] idempotency가 필요한가
- [ ] metric과 trace가 필요한가
- [ ] nginx `locations.conf`에 해당 경로가 이미 services-msa로 라우팅돼 있는가, 아니면 Next.js `app/api/**`의 죽은 코드를 고치려는 것은 아닌가

### DB 변경

- [ ] 자기 소유 스키마인가
- [ ] 서비스 간 FK가 없는가
- [ ] migration과 rollback 전략이 있는가
- [ ] 인덱스가 실제 query를 지원하는가
- [ ] 기존 데이터 backfill이 필요한가
- [ ] staging/legacy를 노출하지 않는가
- [ ] `db/041_service_db_roles.sql`의 해당 서비스 GRANT가 이 변경에 필요한 스키마 접근과 일치하는가

### Kafka 변경

- [ ] `eventId`가 있는가
- [ ] Consumer가 중복에 안전한가
- [ ] retry/DLQ가 있는가
- [ ] payload에 민감·대량 데이터가 없는가
- [ ] `schemaVersion`이 있는가
- [ ] Outbox를 쓰는 경우 업무 데이터 쓰기와 같은 트랜잭션에 있는가(§6.2)

### Kubernetes 변경

- [ ] namespace가 canonical 이름인가
- [ ] requests/limits가 있는가
- [ ] Probe가 올바른 port/path를 보는가
- [ ] affinity와 toleration이 노드 정책과 맞는가
- [ ] Replica가 물리 PC에 분산되는가
- [ ] HPA/KEDA metric과 request가 맞는가
- [ ] PVC/StorageClass가 현재 계획과 맞는가
- [ ] Secret이 평문이 아닌가
- [ ] Ambient namespace 라벨, ztunnel, 필요한 Waypoint를 검증하는가
- [ ] 외부 노출이 MetalLB 풀과 Istio Ingress Gateway 정책을 따르는가

### AI 변경

- [ ] 최신 데이터를 Tool로 조회하는가
- [ ] 핵심 수치는 Rule Engine에서 계산하는가
- [ ] Guardrail과 권한 검증이 있는가
- [ ] token·latency·error를 기록하는가
- [ ] 개인정보를 최소 전달하는가
- [ ] 실패 시 성공처럼 답하지 않는가
