# DAI RUN Project Instructions

## 1. Project Goal

DAI RUN은 위치, 날씨, 미세먼지, 러닝 기록과 사용자 목표를 바탕으로
오늘 어디에서 얼마나 안전하게 달릴지 추천하는 AI 러닝 플랫폼이다.

핵심 사용자 질문은 다음과 같다.

> 오늘 나는 어디에서, 어느 정도 강도로, 얼마나 달려야 하는가?

기능을 추가할 때는 단순히 기능 수를 늘리기보다
이 핵심 사용자 흐름을 개선하는지를 우선 판단한다.

## 2. Communication

- 설명과 문서는 기본적으로 한국어로 작성한다.
- 코드 식별자, API 필드, 클래스명, 테이블명은 영어로 작성한다.
- 구현 전 관련 기존 코드를 먼저 탐색한다.
- 존재하지 않는 명령어, 디렉터리, 환경변수를 추측해서 만들지 않는다.
- 불확실한 부분은 가정이라고 명시한다.
- 한 요청에서 불필요하게 여러 서비스를 동시에 수정하지 않는다.

## 3. Fixed Technology Stack

### Frontend
- Next.js
- TypeScript
- React Native

### Backend
- Spring Boot
- Spring Cloud Gateway
- FastAPI

### Data
- PostgreSQL
- PostGIS
- Redis
- Elasticsearch
- MinIO
- Kafka

### AI
- Amazon Bedrock Claude/Nova
- Bedrock Knowledge Bases
- PyTorch
- Google Colab for experimentation only

### Infrastructure
- Docker
- Kubernetes
- GitHub Actions or GitLab CI/CD
- Argo CD
- Harbor
- Terraform

### Observability
- OpenTelemetry
- Grafana Alloy
- Prometheus
- Loki
- Tempo
- Grafana

### Security
- Kubernetes Secret
- Pod Security Admission
- NetworkPolicy
- ServiceAccount
- RBAC

Do not introduce a new major framework, database, message broker,
API gateway, or cloud service without an explicit architecture decision.

## 4. Deployment Stages

1. On-premise Docker environment
2. On-premise Kubernetes environment
3. AWS migration

Current code must avoid unnecessary dependence on AWS-specific APIs.
Cloud-specific implementations should be placed behind adapters or interfaces.

Examples:
- MinIO and S3 use an ObjectStoragePort abstraction.
- Local secrets and AWS Secrets Manager use a SecretProvider abstraction.
- Local Kafka and managed Kafka use the same event contract.

## 5. Service Boundaries

The approved service names are:

1. Auth/User
2. Course
3. Course Recommendation
4. Running Record
5. Crew
6. Crew Chat
7. Coaching
8. AI Assistant
9. Posture Analysis
10. Challenge
11. Shoe
12. Marathon
13. Media
14. Notification
15. Points

Each service owns its domain logic and data.

Rules:

- A service must not directly read or update another service's tables.
- Synchronous data access uses a documented API.
- Asynchronous propagation uses Kafka domain events.
- Cross-service foreign keys are prohibited.
- IDs received from another service are stored as external references only.
- Shared DTO or entity libraries must not contain domain business logic.
- Course Recommendation may consume Course APIs or its own read model,
  but must not query Course tables directly.
- AI Assistant orchestrates tools and services but does not become the
  owner of every domain rule.
- Coaching owns deterministic weather, air-quality, workload, and safety rules.
- LLMs explain results; they do not replace deterministic safety calculations.

## 6. Database Rules

### PostgreSQL

- PostgreSQL is the source of truth for transactional business data.
- Each service uses its own schema or database ownership boundary.
- Schema changes must use versioned migrations.
- Destructive migrations require explicit approval.
- Monetary, point, reservation, and membership changes require transactions.
- Use optimistic locking, unique constraints, or idempotency keys where required.

### PostGIS

- Store GPS coordinates using SRID 4326.
- Use geography or an appropriate projected coordinate system for meter-based distance.
- Validate latitude and longitude ranges.
- Create GIST indexes for frequently searched geometry columns.
- Avoid calculating route distance from only start and end points.
- Preserve the ordered route geometry for running courses and records.

### Redis

Redis is not a source of truth.

Allowed uses:
- cache
- session
- rate limiting
- temporary distributed lock
- ranking
- short-lived recommendation result
- idempotency support

All critical data must be recoverable from PostgreSQL or event replay.

### Elasticsearch

- Elasticsearch is a search/read model.
- PostgreSQL remains the source of truth.
- Index updates must be recoverable through reindexing.
- Do not make business transactions depend exclusively on Elasticsearch writes.

### MinIO

- Store images, videos, GPX files, model artifacts, and raw external files.
- Store object metadata and ownership in PostgreSQL.
- Do not store binary media directly in PostgreSQL unless explicitly required.

### Kafka

Every event must contain:

- eventId
- eventType
- occurredAt
- producer
- aggregateId
- schemaVersion
- traceId when available

Consumers must be idempotent.
Event names use past tense, for example:

- RunningRecordCompleted
- CourseHeartAdded
- CrewJoined
- ShoeReplacementDue
- MarathonRegistrationCompleted

## 7. API Rules

- Use REST for normal synchronous APIs.
- Use WebSocket only for Crew Chat or real-time status where required.
- Use nouns in endpoint paths.
- Use plural resource names.
- Use ISO-8601 timestamps.
- Validate all request DTOs.
- Never expose persistence entities directly.
- Return consistent error responses.
- Document authentication and authorization requirements.
- Do not return stack traces or internal exception messages.

Every API change must specify:

- owning service
- HTTP method
- endpoint
- authentication
- request body or parameters
- success response
- error responses
- database changes
- emitted or consumed events
- tests

## 8. AI and Safety Rules

- Use Tool Calling to retrieve user, running, weather, air-quality, and course data.
- Do not let the LLM invent current weather, health data, course distance, or user records.
- Apply deterministic Rule Engine results before LLM response generation.
- RAG sources must be identifiable and versioned.
- AI recommendations must distinguish facts, calculated results, and suggestions.
- Do not provide medical diagnosis.
- When data is insufficient or conditions are dangerous, recommend conservative activity.
- Posture Analysis should transmit pose landmarks instead of raw video when possible.
- Raw health, GPS, image, and video data must be minimized and access-controlled.

## 9. Security Rules

- Never commit API keys, passwords, tokens, certificates, or private keys.
- Never hardcode secrets in source code, Docker images, YAML, or documentation.
- Use environment variables locally and Kubernetes Secret in the cluster.
- Apply least-privilege ServiceAccount and RBAC.
- Apply default-deny NetworkPolicy where feasible.
- Validate uploaded content type, extension, size, and ownership.
- Sanitize user-generated text.
- Protect login, recommendation, upload, chat, and marathon APIs with rate limits.
- Do not log access tokens, refresh tokens, exact health data, or complete GPS traces.
- Use mock or anonymized data in tests.

## 10. Coding Rules

### Next.js and TypeScript

- TypeScript strict mode must remain enabled.
- Avoid `any`; define explicit types.
- Separate server and client components intentionally.
- Keep API calls in a dedicated client or service layer.
- Handle loading, empty, error, and permission states.
- Maintain the common top navigation and DAI RUN design system.

### Spring Boot

- Follow controller, application/service, domain, infrastructure separation.
- Controllers handle HTTP concerns only.
- Business rules belong in service or domain layers.
- Use request and response DTOs.
- Use Bean Validation.
- Use global exception handling.
- Mark transaction boundaries explicitly.
- Repository access must remain inside the owning service.

### FastAPI

- Use Python type hints and Pydantic models.
- Separate router, use-case/service, domain, and adapter code.
- Do not perform long-running inference in request threads.
- Use asynchronous queues for posture, media, and heavy AI analysis.
- Add timeouts and error handling to external model and API calls.

## 11. Work Process

Before modifying code:

1. Inspect the repository structure.
2. Locate similar implementations.
3. Identify the owning service.
4. Check existing API and database contracts.
5. Check whether the change affects events, cache, search, or media.
6. Present a short implementation plan for large changes.

While modifying code:

- Make the smallest coherent change.
- Preserve backward compatibility unless explicitly told otherwise.
- Do not rewrite unrelated files.
- Do not silently delete existing functionality.
- Add or update tests with the implementation.

After modifying code:

1. Run the existing formatter.
2. Run lint or static analysis.
3. Run relevant unit tests.
4. Run integration tests when database or API contracts changed.
5. Run build or type checking.
6. Summarize changed files and remaining risks.

Do not claim a command or test succeeded unless it was actually executed.

## 12. Git Rules

- Do not commit directly to main.
- Use feature branches.
- Keep commits focused.
- Do not commit generated build output.
- Do not commit `.env`, credentials, local IP settings, or private test data.
- Never push or deploy without an explicit user request.

## 13. Response Format

After code changes, report:

1. Summary
2. Changed files
3. Architecture impact
4. Database or event impact
5. Tests executed and results
6. Remaining risks or TODOs
