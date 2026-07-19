# CLAUDE.md — D.A.I. RUN 개발 지침

> 이 파일은 저장소 루트에 두고 Claude Code가 모든 구현·수정 작업에서 우선 참고하도록 한다.  
> 프로젝트명: **D.A.I. RUN (데이런)**  
> 목표: 위치·날씨·러닝 기록을 기반으로 코스 추천부터 운동 코칭까지 제공하는 개인 맞춤형 AI 러닝 플랫폼

---

## 1. 작업 원칙

### 1.1 시작 전 반드시 확인할 것

작업을 시작하기 전에 다음 순서로 저장소를 확인한다.

1. 현재 디렉터리 구조와 변경 상태를 확인한다.
2. `README`, 기존 `CLAUDE.md`, `docs`, DB 마이그레이션, API 명세를 확인한다.
3. `package.json`, `build.gradle*`, `settings.gradle*`, `docker-compose*`, Kubernetes manifest를 확인한다.
4. 기존 구현 패턴과 네이밍을 우선 따른다.
5. 수정 범위와 영향 서비스를 먼저 정리한 뒤 구현한다.

저장소에 존재하지 않는 경로, 모듈, 라이브러리, 환경 변수, API를 추측해서 만들지 않는다.  
필요한 정보가 없으면 합리적인 가정을 명시하고, 가장 작은 변경으로 진행한다.

### 1.2 변경 범위

- 요청한 기능과 직접 관련된 파일만 수정한다.
- 대규모 리팩터링, 패키지 전체 이동, 기술 스택 교체를 임의로 수행하지 않는다.
- 기존 동작을 깨뜨리는 변경은 호환 계층 또는 단계적 마이그레이션을 우선한다.
- 생성 코드, `node_modules`, 빌드 결과물, IDE 파일, 비밀값은 커밋하지 않는다.
- 임시 Mock은 명확히 표시하고 운영 경로와 분리한다.

### 1.3 우선순위

현재 PoC/MVP 우선순위는 다음과 같다.

1. 현재 위치 반경 5km 내 러닝 코스 조회·추천
2. 날씨·미세먼지·사용자 선호·최근 기록 기반 오늘의 러닝 코칭
3. GPS 러닝 기록 트레이싱과 거리·시간·페이스 저장
4. AI 러닝 비서의 Tool Calling
5. 크루·챌린지·러닝화·마라톤 등 후속 기능

전체 기능 목록이 크더라도 요청되지 않은 기능까지 한 번에 구현하지 않는다.

---

## 2. 제품 핵심 요구사항

### 2.1 코스 추천

- GPS 기준 가까운 코스와 동일 행정동 코스를 우선한다.
- 기본 반경은 5km이며 MVP 최대 반경은 20km로 제한한다.
- 거리, 난이도, 노면, 경관, 경사도, 날씨를 고려한다.
- 서울 지역을 우선 지원한다.
- SNS 유명 코스, 관리자 코스, 사용자 코스, 공공데이터 코스, AI 생성 코스를 구분한다.
- 추천 결과에는 단순 순위뿐 아니라 추천 이유를 제공한다.
- 후보 검색은 PostGIS가 담당하고, LLM이 공간 검색을 대신하지 않는다.

### 2.2 러닝 기록

- 앱/워치: GPS, 시간, 거리, 페이스, 심박수, 걸음 수를 자동 수집할 수 있다.
- 웹: 수동 입력을 허용한다.
- 러닝 완료 이벤트는 챌린지 진행도와 활성 러닝화 누적 거리에 중복 없이 반영한다.

### 2.3 크루

- 지역, 목표 거리, 페이스, 주간 빈도, 정원을 조건으로 검색한다.
- 사용 조건에 맞는 크루를 기본 노출하고 전체 보기 옵션을 제공한다.
- 입장 방식은 `OPEN` 또는 `APPROVAL`이다.
- 크루별 채팅방은 하나이며 메시지 이력과 읽음 상태를 저장한다.

### 2.4 AI 러닝 비서

- 모든 페이지에서 접근 가능한 공통 비서다.
- 사용자 프로필, 러닝 선호, 최근 기록, 날씨, 미세먼지, 코스, 러닝화 정보를 Tool Calling으로 조회한다.
- 최신 서비스 데이터가 필요한 답변은 반드시 도구 결과를 사용한다.
- 건강 관련 결과는 진단이 아닌 운동 참고 정보로 표현한다.
- 데이터가 부족하면 임의 수치를 만들지 않고 부족한 입력을 알려준다.

### 2.5 향후 기능

러닝화 추천·수명 예측, 마라톤 정보·신청, 자세 교정, 심박 Zone, 다국어 오디오, 스마트워치 연동은 확장 대상으로 설계하되 MVP 구현을 과도하게 복잡하게 만들지 않는다.

---

## 3. 기술 스택과 운영 방향

### 3.1 애플리케이션

- Web: Next.js, TypeScript
- Mobile: React Native
- Gateway: Nginx, Spring Cloud Gateway
- Backend: Spring Boot
- AI/ML Backend: FastAPI, Python
- AI: Amazon Bedrock Converse, Claude/Nova, Guardrails, Tool Calling
- ML: PyTorch, MediaPipe Pose, 필요 시 SageMaker Async Inference

### 3.2 데이터

- Primary DB: PostgreSQL + PostGIS
- Cache: Redis
- Event Streaming: Kafka
- Search: Elasticsearch
- Object Storage: MinIO
- AWS 이전 시: RDS/Aurora PostgreSQL, ElastiCache, OpenSearch, S3 등으로 어댑터 교체 가능하게 설계한다.

### 3.3 배포·운영

- 온프레미스 Docker/Kubernetes를 먼저 지원한다.
- 이후 AWS EKS 이전을 고려한다.
- CI: GitHub Actions
- CD: Argo CD
- Registry: Harbor
- Quality/Security: SonarQube, Trivy
- Observability: OpenTelemetry, Grafana Alloy, Prometheus, Loki, Tempo, Grafana

클라우드 전용 SDK를 도메인 로직에 직접 확산시키지 않는다.  
AI, 객체 저장소, 검색, 알림, 외부 API는 포트/어댑터 경계를 둔다.

---

## 4. 서비스 경계

확정 서비스명과 데이터 소유권은 다음과 같다.

| 서비스 | 소유 스키마 | 주요 책임 |
|---|---|---|
| Auth/User | `auth_user` | 회원, 소셜 로그인, 세션, 프로필, 러닝 선호 |
| Course | `course` | 코스, 경로, 경유지, 리뷰, 찜 |
| Course Recommendation | `course_recommendation` | 추천 실행, 결과 순위, 피드백 |
| Running Record | `running_record` | 러닝 세션, GPS·심박 시계열 |
| Crew | `crew` | 크루, 멤버, 가입 요청 |
| Crew Chat | `crew_chat` | 채팅방, 메시지, 읽음 상태 |
| Coaching | `coaching`, `environment` | 오늘의 코칭, 날씨·대기질 정규화 |
| AI Assistant | `ai_assistant` | 대화 세션, 메시지, Tool Calling 기록 |
| Posture Analysis | `posture_analysis` | 자세 분석 요청·결과 |
| Challenge | `challenge` | 챌린지, 참가, 진행 이벤트 |
| Shoe | `shoe` | 제품, 선호, 보유 신발, 마모·수명 |
| Marathon | `marathon` | 대회, 접수창, 예약 |
| Media | `media` | 객체 메타데이터, 업로드 상태 |
| Notification | `notification` | 인앱·푸시·이메일 알림 상태 |
| Points | `points` | 포인트 지갑과 거래 원장 |

### 4.1 서비스 간 통신

- 다른 서비스의 테이블을 JPA 관계로 직접 연결하지 않는다.
- 다른 서비스 데이터를 직접 `JOIN`하는 신규 쿼리를 만들지 않는다.
- 서비스 간 데이터는 API, 이벤트, 읽기 모델로 교환한다.
- 타 서비스 ID는 논리 참조로만 보관한다.
- 한 서비스 장애가 전체 장애로 확산되지 않도록 timeout, 제한된 retry, circuit breaker를 적용한다.
- retry는 멱등성이 보장되는 요청에만 적용한다.

---

## 5. DB 명세서 적용 규칙

최신 승인된 **DAIRUN DB 명세서 개정본**을 DB 구조의 Source of Truth로 사용한다.

### 5.1 핵심 원칙

- 총 16개 스키마, 53개 명세 테이블을 기준으로 한다.
- 동일 서비스 스키마 내부에는 물리 FK를 사용할 수 있다.
- 서비스 경계를 넘는 참조는 물리 FK를 금지하고 LR(Logical Reference)로 처리한다.
- 코드값은 PostgreSQL ENUM보다 `VARCHAR + CHECK`를 기본으로 한다.
- 시간은 `TIMESTAMPTZ`와 UTC 저장을 기본으로 한다.
- 금액, 거리, 페이스, 경사도, 심박수의 단위를 컬럼명과 DTO에서 명확히 한다.
- 거리: meter(`*_m`)
- 페이스: seconds per kilometer(`*_sec_per_km`)
- 경사: percent(`*_slope_pct`)
- UUID 기본값은 가능한 경우 `gen_random_uuid()`를 사용한다.
- 삭제 복구가 필요한 핵심 데이터는 `deleted_at` 기반 소프트 삭제를 우선한다.
- DB 스키마 변경은 Flyway 또는 저장소의 기존 migration 도구로만 수행한다.
- 애플리케이션 시작 시 임의 DDL 자동 생성에 의존하지 않는다.

### 5.2 전체 테이블 맵

#### `auth_user`

- `auth_sessions`
- `user_identities`
- `user_running_preferences`
- `users`
- `user_id_migration_map` — 마이그레이션 전용, 상시 API 조회 금지

#### `course`

- `course_likes`
- `course_reviews`
- `course_waypoints`
- `courses`
- `course_waypoints_staging` — API 조회 금지
- `courses_staging` — API 조회 금지
- `running_course_legacy` — 신규 API 조회 금지
- `running_course_point_legacy` — 신규 API 조회 금지

#### `course_recommendation`

- `recommendation_feedback`
- `recommendation_items`
- `recommendation_runs`

#### `running_record`

- `run_samples`
- `runs`

#### `crew`

- `crew_join_requests`
- `crew_members`
- `crews`

#### `crew_chat`

- `chat_rooms`
- `chat_messages`
- `chat_participant_states`

#### `coaching`

- `daily_coaching_plans`

#### `ai_assistant`

- `chat_messages`
- `chat_sessions`

#### `posture_analysis`

- `posture_analyses`

#### `challenge`

- `challenge_participations`
- `challenge_progress_events`
- `challenges`

#### `shoe`

- `shoe_catalog`
- `shoe_function`
- `shoe_function_map`
- `shoe_life_snapshots`
- `shoe_price`
- `shoe_spec`
- `shoe_wear_analyses`
- `user_shoe_preferences`
- `user_shoes`

#### `marathon`

- `marathon_race`
- `marathon_registration_windows`
- `marathon_reservations`

#### `media`

- `media_objects`

#### `notification`

- `notifications`

#### `environment`

- `air_quality_hourly` — 서비스 조회용 정규화 테이블
- `airkorea_dust_seoul` — RAW
- `airkorea_forecast_seoul` — RAW
- `kma_warning_postgresql_seoul` — RAW
- `seoul_forecast` — RAW
- `weather_hourly` — 서비스 조회용 정규화 테이블

#### `points`

- `point_transactions`
- `point_wallets`

### 5.3 우선 구현 테이블

P0 테이블을 먼저 구현한다. P1/P2를 이유 없이 선행 구현하지 않는다.

특히 다음 흐름을 우선한다.

- 사용자: `users`, `user_identities`, `auth_sessions`, `user_running_preferences`
- 코스: `courses`, `course_waypoints`, `course_reviews`, `course_likes`
- 러닝: `runs`, `run_samples`
- 크루: `crews`, `crew_members`, `crew_join_requests`
- 채팅: `chat_rooms`, `chat_messages`
- 코칭: `daily_coaching_plans`, `weather_hourly`, `air_quality_hourly`
- AI: `chat_sessions`, `chat_messages`
- 마라톤: `marathon_race`, `marathon_reservations`
- 미디어: `media_objects`
- 알림: `notifications`

### 5.4 중요 ID 정책

- 사용자 ID: `UUID`
- 코스 ID: MVP에서는 기존 `SEOUL_C001` 형식 호환을 위해 `VARCHAR(50)` 유지
- 장기적으로 코스는 UUID PK와 `external_course_code` UNIQUE 분리를 검토하되, 요청 없이 즉시 전환하지 않는다.
- 서비스 간 ID는 값만 전달하며 ORM 연관관계를 만들지 않는다.

### 5.5 상태·유형 코드

다음 값은 대문자로 통일한다.

- 사용자 상태: `ACTIVE`, `SUSPENDED`, `WITHDRAWN`
- 소셜 공급자: `GOOGLE`, `KAKAO`, `NAVER`
- 숙련도: `BEGINNER`, `INTERMEDIATE`, `ADVANCED`
- 러닝 목표: `HEALTH`, `DIET`, `ENDURANCE`, `MARATHON`
- 코스 원천: `USER`, `ADMIN`, `PUBLIC_DATA`, `SNS`, `AI_GENERATED`, `MARATHON`
- 코스 공개: `PUBLIC`, `PRIVATE`
- 코스 상태: `ACTIVE`, `INACTIVE`, `DELETED`
- 경유지 유형: `START`, `VIA`, `END`
- 추천 실행: `PENDING`, `COMPLETED`, `FAILED`
- 러닝 출처: `APP`, `WATCH`, `MANUAL`
- 러닝 상태: `IN_PROGRESS`, `COMPLETED`, `CANCELLED`
- 크루 입장 방식: `OPEN`, `APPROVAL`
- 크루 상태: `RECRUITING`, `FULL`, `CLOSED`
- 크루 역할: `LEADER`, `MANAGER`, `MEMBER`
- 채팅 메시지: `TEXT`, `IMAGE`, `SYSTEM`
- 코칭 강도: `LOW`, `MODERATE`, `HIGH`
- 심박 구간: `ZONE_1` ~ `ZONE_5`
- AI 메시지 역할: `USER`, `ASSISTANT`, `TOOL`, `SYSTEM`
- 자세 분석 상태: `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`
- 챌린지 유형: `PERSONAL`, `PUBLIC`, `CREW`
- 챌린지 지표: `DISTANCE`, `COUNT`, `PACE`, `STREAK`
- 사용자 러닝화 상태: `ACTIVE`, `RETIRED`
- 마라톤 예약: `PENDING`, `WAITING`, `CONFIRMED`, `REJECTED`, `CANCELLED`
- 미디어 상태: `PENDING`, `SCANNING`, `READY`, `REJECTED`
- 알림 상태: `UNREAD`, `READ`, `DELETED`

Java/Python enum을 사용하더라도 DB에는 위 문자열과 CHECK 제약을 맞춘다.

---

## 6. PostGIS 규칙

### 6.1 좌표계

- 모든 사용자·코스 GPS 저장은 WGS84, EPSG:4326을 사용한다.
- Point: `geometry(Point, 4326)`
- Route: `geometry(LineString, 4326)`
- 좌표 순서는 반드시 **longitude, latitude**다.
- API 응답 GeoJSON도 `[longitude, latitude]` 순서를 따른다.

### 6.2 Source of Truth

- 코스 전체 경로의 Source of Truth는 `course.courses.route_geom`이다.
- 순서형 원본/경유 지점은 `course.course_waypoints.location`과 `sequence_no`로 관리한다.
- `latitude`, `longitude` 컬럼이 함께 존재하면 `location`과 불일치하지 않게 생성 컬럼 또는 애플리케이션 검증을 적용한다.
- 러닝 기록 전체 경로는 완료 시 `running_record.runs.route_geom`으로 요약한다.
- 세부 시계열은 `running_record.run_samples.location`에 저장한다.

### 6.3 공간 검색

- 주변 검색은 `ST_DWithin`을 사용한다.
- 거리 정렬은 필요 시 geography 변환 또는 적절한 투영을 사용해 meter 단위로 계산한다.
- `route_geom`, `location`, `request_location`, `meeting_point`에는 GIST 인덱스를 적용한다.
- geometry 컬럼을 함수로 감싸 인덱스를 무력화하는 쿼리를 피한다.
- 반경, 위도, 경도는 API와 DB 모두 범위를 검증한다.

### 6.4 AI 코스 생성

LLM은 최종 보행 경로의 모든 좌표를 생성하지 않는다.

권장 흐름:

1. 사용자 선호와 현재 위치를 조회한다.
2. Bedrock은 목표 거리, 방향성, 후보 시작점·경유지·종료점 또는 장소 조건을 구조화해 제안한다.
3. 지도 Routing API 또는 승인된 라우팅 엔진으로 실제 보행 가능 경로를 계산한다.
4. PostGIS로 반경, 거리, 중복, 폐곡선 여부, 유효 geometry를 검증한다.
5. 고도 API로 경사도를 계산한다.
6. 검증된 LineString만 DB에 저장한다.

`ST_MakeLine`은 주어진 점을 연결할 뿐 도로를 따라가는 경로를 생성하지 않는다는 점을 항상 고려한다.

---

## 7. API 설계 규칙

### 7.1 기본 규칙

- REST endpoint는 `/api/v1`을 기본 prefix로 한다.
- JSON 필드는 `camelCase`, DB 컬럼은 `snake_case`를 사용한다.
- 날짜·시각은 ISO-8601 형식으로 반환한다.
- 생성: `201 Created`
- 정상 조회·수정: `200 OK`
- 내용 없는 삭제: `204 No Content` 또는 기존 API 명세를 따른다.
- 인증 실패와 권한 부족은 각각 `401`, `403`으로 구분한다.
- 입력 검증 오류는 필드별 사유를 제공한다.
- 내부 예외 메시지, SQL, 스택 트레이스를 외부에 노출하지 않는다.

### 7.2 DTO와 검증

- Controller에 Entity를 직접 노출하지 않는다.
- Request/Response DTO를 분리한다.
- 위도 `-90~90`, 경도 `-180~180`
- 거리와 페이스는 양수
- 안정 시 심박수는 `20~250`
- 평점은 `0~5`
- 이미지·영상 크기, MIME type, 확장자를 검증한다.
- pagination은 무제한 조회를 허용하지 않는다.
- 리스트 API는 cursor pagination을 우선 검토한다.

### 7.3 멱등성

다음 작업은 멱등성을 설계한다.

- 마라톤 신청
- 결제 또는 예약 Mock
- 러닝 완료 이벤트 처리
- 챌린지 진행도 반영
- 포인트 거래
- 알림 Worker
- 외부 이벤트 Consumer

`marathon_reservations.idempotency_key`, `point_transactions.idempotency_key`, 이벤트 ID UNIQUE 제약을 적극 사용한다.

### 7.4 트랜잭션

- 트랜잭션 경계는 Application Service에 둔다.
- 외부 API 호출을 DB 트랜잭션 안에서 오래 유지하지 않는다.
- DB 저장과 Kafka 발행을 동시에 보장해야 하는 경우 단순 dual write를 피하고 기존 Outbox 패턴이 있으면 사용한다.
- Consumer는 at-least-once 전달을 가정하고 중복 처리에 안전해야 한다.

---

## 8. Spring Boot 구현 규칙

기존 패키지 구조가 있으면 그 구조를 우선한다. 신규 모듈은 다음 책임을 분리한다.

- `controller` 또는 `api`: HTTP/WebSocket 경계
- `application`: 유스케이스, 트랜잭션
- `domain`: 핵심 규칙과 상태 전이
- `infrastructure`: JPA, Kafka, Redis, Elasticsearch, 외부 API
- `config`: 프레임워크 설정

### 8.1 금지 사항

- Controller에 비즈니스 로직 작성
- 다른 서비스 JPA Entity 참조
- Lazy 연관관계에 의존한 응답 직렬화
- Repository를 Controller에서 직접 호출
- 비밀번호, Refresh Token 원문, API Key 저장
- 모든 예외를 `500`으로 처리
- 무제한 `findAll()`

### 8.2 JPA와 쿼리

- N+1을 테스트하고 필요한 경우 fetch join, entity graph, projection을 사용한다.
- 공간 쿼리는 Hibernate Spatial 또는 명확한 native query를 사용한다.
- 대량 GPS 샘플은 한 건씩 flush하지 말고 batch insert를 고려한다.
- `run_samples`는 초기 일반 테이블로 시작하고 실제 데이터 증가 후 월 파티션을 적용한다.
- 인덱스는 실제 조회 조건과 정렬 순서에 맞춘다.
- 인덱스 추가 시 쓰기 비용과 cardinality를 함께 검토한다.

### 8.3 인증

- OAuth 공급자와 내부 사용자 계정을 분리한다.
- Refresh Token은 해시만 저장하고 rotation과 재사용 탐지를 고려한다.
- 권한은 최소 `USER`, `CREW_LEADER`, `ADMIN`으로 구분한다.
- 요청 사용자 ID는 신뢰할 수 있는 인증 Principal에서 획득한다.
- Request body의 `userId`를 권한 판단 근거로 사용하지 않는다.

---

## 9. Next.js / TypeScript / React Native 규칙

- TypeScript strict 설정을 유지한다.
- `any` 사용을 피하고 API 타입을 명시한다.
- 서버 상태와 UI 상태를 구분한다.
- API 오류, 로딩, 빈 상태, 위치 권한 거부 상태를 모두 처리한다.
- 브라우저 또는 앱에 서버 비밀값을 노출하지 않는다.
- 지도 컴포넌트는 렌더링 좌표 순서와 GeoJSON 좌표 순서를 혼동하지 않는다.
- GPS 트레이싱은 권한, 백그라운드 동작, 배터리 사용, 네트워크 단절을 고려한다.
- GPS 샘플은 로컬 버퍼 후 배치 전송할 수 있게 설계한다.
- 전 페이지 상단 네비게이션과 AI 강아지 비서 디자인을 일관되게 유지한다.
- 프로젝트 UI는 남색 계열 중심이며 불필요한 그라데이션을 추가하지 않는다.
- 접근성 있는 label, focus, keyboard navigation, 충분한 contrast를 적용한다.

---

## 10. AI Assistant / Bedrock 규칙

### 10.1 구조

- `ProviderAdapter` 인터페이스로 Claude/Nova 모델 차이를 감춘다.
- 기본 호출은 Bedrock Converse를 사용한다.
- Tool schema는 명확한 JSON Schema로 정의한다.
- Tool Calling 실행 권한은 백엔드가 검증한다.
- 모델이 임의 endpoint나 SQL을 만들게 하지 않는다.
- DB 직접 접근 도구보다 서비스 API 또는 제한된 Query Tool을 우선한다.

### 10.2 권장 Tool

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

도구 이름과 인자 형식은 실제 코드와 API 명세에 맞춘다.

### 10.3 답변 생성

AI 코칭 권장 순서:

1. 사용자 목표와 선호 조회
2. 최근 7일 러닝 기록과 직전 운동 강도 조회
3. 현재 날씨·강수·기온·대기질 조회
4. Rule Engine으로 안전 제한과 권장 거리·강도 계산
5. PostGIS로 조건에 맞는 코스 후보 조회
6. Bedrock은 계산 결과와 근거를 자연어로 설명

핵심 수치 계산과 안전 기준은 LLM 프롬프트가 아니라 규칙 엔진 또는 서버 코드에서 수행한다.

### 10.4 안전·개인정보

- Guardrails를 적용한다.
- 사용자의 위치, 건강 정보, 대화 내용을 필요 이상으로 모델에 전달하지 않는다.
- 로그에 전체 프롬프트, GPS 원문, 건강 정보를 무조건 남기지 않는다.
- 응답에 의학적 진단이나 치료 지시를 포함하지 않는다.
- 위험 신호가 있으면 운동 중단과 전문가 상담을 안내하되 공포를 유발하지 않는다.
- Tool 결과가 없거나 실패하면 성공한 것처럼 답하지 않는다.

### 10.5 비용

- 기본 경로는 비용 효율적인 Claude/Nova 모델을 사용한다.
- 고성능 모델 사용은 명시적 조건이 있을 때만 허용한다.
- 입력 컨텍스트를 필요한 범위로 제한한다.
- 대화 세션에는 전체 이력을 무한 누적하지 말고 요약을 사용한다.
- 모델명, input/output token, latency, 오류를 기록하되 개인정보는 제거한다.

---

## 11. Kafka와 비동기 처리

### 11.1 이벤트 후보

- `user.registered`
- `user.profile.updated`
- `user.running-preferences.updated`
- `course.created`
- `course.updated`
- `course.liked`
- `course.unliked`
- `course.reviewed`
- `run.completed`
- `challenge.progress.updated`
- `shoe.distance.updated`
- `shoe.replacement.due`
- `marathon.reservation.requested`
- `marathon.reservation.confirmed`
- `media.ready`
- `posture.analysis.requested`
- `posture.analysis.completed`
- `notification.requested`

실제 저장소에 이미 정의된 이름이 있으면 기존 이름을 따른다.

### 11.2 이벤트 규칙

- 이벤트에는 `eventId`, `eventType`, `occurredAt`, `aggregateId`, `schemaVersion`, `traceId`를 포함한다.
- Consumer는 이벤트 ID로 중복을 방지한다.
- 실패는 제한된 재시도 후 DLQ로 보낸다.
- 메시지 payload에 영상 원본, 대형 바이너리, 민감 개인정보를 넣지 않는다.
- MinIO object key 또는 media ID만 전달한다.
- 이벤트 schema 변경은 하위 호환성을 유지한다.

---

## 12. Redis, Elasticsearch, MinIO

### 12.1 Redis

Redis는 Source of Truth가 아니다.

사용 후보:

- 세션 보조 데이터
- 사용자 프로필·선호 캐시
- 코스 상세·주변 코스 캐시
- 크루·챌린지 랭킹
- 티켓팅 대기열 또는 분산 락
- rate limit

규칙:

- TTL을 명시한다.
- DB 변경 후 cache eviction을 처리한다.
- `KEYS` 명령을 운영 코드에서 사용하지 않는다.
- 캐시 장애 시 핵심 기능이 완전히 중단되지 않도록 fallback을 고려한다.
- 락은 timeout과 소유권 검증 없이 사용하지 않는다.

### 12.2 Elasticsearch

검색·정렬·필터링용 보조 저장소다.

색인 후보:

- 코스
- 크루
- 챌린지
- 러닝화
- 마라톤

규칙:

- 원본 데이터는 PostgreSQL이 소유한다.
- 색인은 이벤트 기반 비동기 갱신을 우선한다.
- 검색 결과가 오래되었을 가능성을 고려한다.
- 인덱스 버전과 alias를 사용해 무중단 재색인을 고려한다.
- 사용자 개인정보와 GPS 원문을 불필요하게 색인하지 않는다.

### 12.3 MinIO

- DB에는 `media.media_objects` 메타데이터만 저장한다.
- 이미지·영상 바이너리를 PostgreSQL `BYTEA`로 저장하지 않는다.
- private bucket을 기본으로 한다.
- 업로드는 presigned URL을 우선한다.
- 업로드 완료 전 상태는 `PENDING`, 검사 중 `SCANNING`, 사용 가능 `READY`, 차단 `REJECTED`다.
- 도메인에서는 `READY` 객체만 참조한다.
- MIME type, 크기, 악성 파일 검사를 적용한다.
- 원본 영상 보존 기간을 명시하고 만료 데이터를 정리한다.

---

## 13. 외부 데이터

### 13.1 날씨·미세먼지

- 기상청과 에어코리아 원문은 RAW 테이블에 저장할 수 있다.
- 서비스 조회는 `environment.weather_hourly`, `environment.air_quality_hourly`를 우선한다.
- 외부 API 응답을 사용자 요청마다 그대로 재호출하지 말고 서버 캐시와 수집 주기를 사용한다.
- 수집 시각, 예보 기준 시각, 대상 시각을 구분한다.
- 외부 API 장애 시 마지막 정상 데이터와 데이터 시각을 함께 표시한다.

### 13.2 지도

- Kakao Maps/Local API 등 지도 제공자는 어댑터 뒤에 둔다.
- 주소→좌표, 좌표→행정동 변환 결과를 캐시할 수 있다.
- 외부 지도 약관과 저장 제한을 준수한다.
- 지도 API Key는 서버 Secret으로 관리한다.

### 13.3 크롤링

- robots.txt, 이용약관, 저작권, 요청 빈도를 확인한다.
- 인증 우회나 차단 회피를 구현하지 않는다.
- 원문 출처, 수집 시각, 정규화 상태를 기록한다.
- SNS 코스는 무단 대량 수집보다 수동 큐레이션을 우선한다.

---

## 14. 보안과 개인정보

### 14.1 비밀값

- `.env`, DB 비밀번호, OAuth Secret, JWT Secret, Bedrock 자격 증명, API Key를 커밋하지 않는다.
- 로컬은 `.env.example`만 제공한다.
- Kubernetes Secret 또는 외부 Secret 관리 체계를 사용한다.
- 비밀값을 로그와 오류 메시지에 출력하지 않는다.

### 14.2 개인정보

위치, 러닝 경로, 심박수, 건강 정보, 영상은 민감 데이터로 취급한다.

- 최소 수집
- 목적 제한
- 사용자 동의
- 보존 기간
- 삭제 처리
- 접근 통제
- 감사 가능성

을 구현한다.

정확한 집 주소를 추론하거나 외부에 노출하지 않는다.  
공개 코스 등록 시 시작·종료점이 주거지를 드러내는 위험을 고려한다.

### 14.3 권한

- 본인 데이터 조회·수정 여부를 서버에서 검증한다.
- 크루장은 자신의 크루만 관리한다.
- 관리 기능은 ADMIN 권한을 요구한다.
- 객체 ID만 알면 접근 가능한 IDOR 취약점을 방지한다.
- 업로드 URL과 다운로드 URL은 만료 시간을 둔다.

### 14.4 입력 보안

- SQL Injection은 parameter binding으로 방지한다.
- 리뷰·채팅의 XSS를 방지한다.
- 파일명과 object key를 신뢰하지 않는다.
- 로그인, 코스 추천, 채팅, 미디어 업로드, 마라톤 신청에 rate limit을 고려한다.
- SSRF를 막기 위해 서버가 임의 URL을 가져오지 않게 한다.

---

## 15. 관측성

### 15.1 로그

구조화 로그를 사용하고 최소 다음 필드를 포함한다.

- `timestamp`
- `level`
- `service`
- `environment`
- `traceId`
- `spanId`
- `requestId`
- `eventType` 또는 `operation`
- 오류 코드

금지:

- access token
- refresh token
- 비밀번호
- API Key
- 전체 GPS 경로
- 전체 건강 데이터
- 전체 프롬프트 원문
- 불필요한 사용자 이메일

### 15.2 메트릭

- HTTP request count, latency, error rate
- JVM/Node/Python CPU·memory
- DB connection pool
- Redis hit ratio
- Kafka consumer lag
- DLQ count
- GPS sample ingest rate
- 추천 latency
- Bedrock token·latency·error
- 미디어 분석 queue depth

Prometheus label에 `userId`, `runId`, `courseId` 같은 고 cardinality 값을 넣지 않는다.

### 15.3 트레이싱

- Spring Boot, FastAPI, Gateway, Kafka producer/consumer에 trace context를 전달한다.
- 정상 요청은 샘플링할 수 있다.
- 오류, 예약 실패, 결제 실패, 비동기 분석 실패는 높은 비율로 수집한다.

---

## 16. 테스트 전략

### 16.1 필수 테스트

- 도메인 규칙 단위 테스트
- Controller/API 계약 테스트
- Repository 통합 테스트
- DB migration 테스트
- Kafka Consumer 중복 처리 테스트
- Redis 장애 fallback 테스트
- 권한·IDOR 테스트
- 외부 API timeout·오류 테스트
- AI Tool Calling schema 테스트

### 16.2 DB 테스트

가능하면 Testcontainers로 실제 PostgreSQL + PostGIS를 사용한다.

공간 테스트 예시:

- 5km 반경 안/밖 경계
- 위도·경도 순서 오류
- SRID 불일치
- 유효하지 않은 LineString
- GIST 인덱스를 사용하는 실행 계획
- 순서가 뒤섞인 waypoint 조립
- 순환 코스의 START/END 처리

H2만으로 PostGIS 동작을 대체하지 않는다.

### 16.3 성능 목표

PoC 목표:

- 동시 사용자 500명 이상
- 일반 API 평균 응답 1초 이내
- 일반 API p95 2초 이내
- 일반 API 오류율 1% 이하
- 마라톤 Spike 상황 오류율 3% 이하
- 티켓팅 API 응답 3초 이내

성능 최적화 전 측정 결과를 남기고, 추측만으로 복잡한 캐시·분산 구조를 추가하지 않는다.

---

## 17. Git, CI/CD, 배포

### 17.1 Git

- feature branch에서 작업한다.
- Pull Request 기반으로 병합한다.
- 최종 병합은 squash merge를 기본으로 한다.
- 한 커밋에는 하나의 논리적 변경을 담는다.
- 커밋 메시지는 변경 목적이 드러나게 작성한다.
- `main` 직접 push를 피한다.

### 17.2 CI

PR에서 최소 다음을 수행한다.

- build
- unit/integration test
- lint/format
- SonarQube
- dependency 또는 image scan
- Trivy
- 필요 시 SBOM 생성

Critical/High 취약점이 있으면 무시하지 말고 영향과 예외 사유를 기록한다.

### 17.3 이미지

- multi-stage build를 사용한다.
- non-root user를 사용한다.
- 불필요한 패키지와 빌드 도구를 runtime image에 포함하지 않는다.
- `latest` 단독 배포를 피하고 immutable tag를 사용한다.
- Harbor에는 필요한 최근 이미지 위주로 보관한다.

### 17.4 Kubernetes

- readiness/liveness/startup probe를 구분한다.
- CPU·memory requests/limits를 설정한다.
- Secret을 manifest에 평문으로 넣지 않는다.
- rolling update를 기본으로 한다.
- NetworkPolicy, ServiceAccount, RBAC, Pod Security를 적용한다.
- 일반 API는 HPA, queue 기반 Worker는 KEDA를 고려한다.
- 온프레미스 자원 한계를 고려해 불필요한 replica와 sidecar를 늘리지 않는다.

---

## 18. 마이그레이션 규칙

DB 변경은 **Expand → Migrate → Contract** 순서를 따른다.

1. 새 컬럼·테이블을 하위 호환 방식으로 추가한다.
2. 애플리케이션이 구·신 구조를 안전하게 처리하게 한다.
3. 데이터를 이관하고 검증한다.
4. 읽기 경로를 신규 구조로 전환한다.
5. 충분한 검증 후 구 구조를 제거한다.

주의:

- staging/legacy 테이블을 신규 API에서 조회하지 않는다.
- 마이그레이션 스크립트는 재실행 가능성과 중단 복구를 고려한다.
- 대량 UPDATE는 lock과 WAL 증가를 고려해 batch 처리한다.
- NOT NULL 추가 전 기존 데이터 backfill을 수행한다.
- 인덱스 생성은 운영 영향과 concurrent 가능 여부를 검토한다.
- migration 파일을 이미 배포했다면 수정하지 말고 새 migration을 추가한다.

---

## 19. Claude Code 작업 완료 형식

코드 수정 후 다음 형식으로 보고한다.

### 변경 요약

- 무엇을 구현했는지
- 어떤 서비스와 스키마가 영향을 받는지

### 변경 파일

- 주요 변경 파일과 역할

### 검증

- 실행한 build/test/lint 명령
- 성공·실패 결과
- 실행하지 못한 검증과 이유

### DB 영향

- migration 유무
- 신규/변경 테이블·컬럼·인덱스·제약
- rollback 또는 호환성 주의사항

### 운영 주의사항

- 환경 변수
- Secret
- 배포 순서
- 캐시 삭제
- 재색인
- 이벤트 Consumer 순서
- 알려진 제한

사용자의 요청을 완료하지 못했거나 추정한 부분은 성공한 것처럼 표현하지 않는다.

---

## 20. 절대 금지

- 서비스 간 물리 FK 추가
- 타 서비스 테이블 직접 JOIN을 신규 표준으로 도입
- LLM이 생성한 좌표를 검증 없이 코스로 저장
- PostgreSQL에 이미지·영상 바이너리 저장
- Refresh Token 원문 저장
- Secret 또는 개인정보 커밋
- 사용자 입력을 신뢰한 권한 처리
- 무제한 목록 조회
- Kafka Consumer 비멱등 처리
- 외부 API 호출을 무제한 재시도
- migration 없이 운영 테이블 수동 변경
- RAW·staging·legacy 테이블을 일반 API의 Source of Truth로 사용
- 테스트 실패를 숨기거나 수행하지 않은 테스트를 성공했다고 보고
- 요청되지 않은 전면 재작성

---

## 21. Definition of Done

다음 조건을 만족해야 작업 완료로 본다.

- 요청 기능이 실제 코드 흐름에 연결되어 있다.
- 서비스 경계와 DB 소유권을 위반하지 않는다.
- 입력 검증과 권한 검사가 있다.
- 성공·실패 응답이 일관적이다.
- migration과 인덱스가 필요한 경우 포함되어 있다.
- 핵심 테스트가 추가되고 통과한다.
- 로그·메트릭·트레이스에 필요한 정보를 남긴다.
- Secret과 개인정보가 노출되지 않는다.
- Docker/Kubernetes 실행 경로를 깨뜨리지 않는다.
- 변경 파일, 검증 결과, 운영 주의사항을 설명한다.
