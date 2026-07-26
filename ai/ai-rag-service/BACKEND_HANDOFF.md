# D.A.I. RUN AI RAG Service — Backend Handoff

이 문서는 백엔드가 AI 서비스를 안전하게 호출하기 위한 계약만 정의한다.
AI 서비스는 인증 세션을 발급하거나 사용자의 권한을 검증하지 않는다.

## 1. 담당 범위

AI 서비스가 담당하는 항목:

- Amazon Bedrock Knowledge Base 검색과 답변 생성
- 러닝 질문 입력 가드레일
- Bedrock 대화 세션 연결
- 전달받은 `userId`를 이용한 비식별 러닝 참고 데이터 조회
- 오늘의 러닝 코칭 생성

백엔드가 담당하는 항목:

- 로그인 세션과 사용자 인증
- 요청 사용자가 해당 `userId`를 사용할 권한이 있는지 검증
- 브라우저에 AI 서비스 주소와 AWS/DB 설정을 노출하지 않는 서버 측 프록시
- 서비스 간 timeout, rate limit, 관측 로그와 배포 설정
- AI 서비스의 외부 직접 접근 차단

중요: 브라우저가 보낸 `userId`를 그대로 신뢰하지 말고, 인증 세션의 사용자 ID로 덮어써야 한다.

## 2. 연결 정보

기본 로컬 주소:

```text
http://127.0.0.1:8000
```

백엔드 서버와 AI 서비스가 다른 호스트에 있으면 `127.0.0.1` 대신 내부 서비스 주소를 사용한다.

상태 확인:

```http
GET /health
```

정상 응답:

```json
{
  "status": "ok"
}
```

## 3. RAG 채팅

```http
POST /api/v1/ai/chat
Content-Type: application/json
```

요청:

```json
{
  "question": "최근 기록에 맞춰 이번 주 러닝 계획을 짜줘",
  "sessionId": null,
  "userId": "authenticated-user-id",
  "latitude": 37.5665,
  "longitude": 126.978,
  "profile": {
    "level": "BEGINNER",
    "goal": "HEALTH",
    "weeklyRuns": 3,
    "recentPain": false
  }
}
```

필드 규칙:

| 필드 | 필수 | 규칙 |
|---|---:|---|
| `question` | 예 | 1~1000자 |
| `sessionId` | 아니요 | 첫 요청은 `null`, 후속 요청은 직전 응답값 전달 |
| `userId` | 아니요 | 백엔드 인증 세션에서만 설정 |
| `latitude`, `longitude` | 아니요 | 위치 기반 코스 요청에 사용 |
| `profile` | 아니요 | DB 사용자 정보가 없을 때 사용할 간단 프로필 |
| `profile.level` | 아니요 | `BEGINNER`, `INTERMEDIATE`, `ADVANCED` |
| `profile.goal` | 아니요 | `HEALTH`, `DIET`, `ENDURANCE`, `MARATHON`, `FIVE_K` |
| `profile.weeklyRuns` | 아니요 | 0~14 |
| `profile.recentPain` | 아니요 | boolean |

정상 응답:

```json
{
  "answer": "...",
  "sessionId": "bedrock-session-id",
  "sources": ["s3://bucket/key.csv"],
  "blocked": false,
  "guardrailReason": null
}
```

입력 차단도 HTTP 200으로 반환된다. 백엔드는 `blocked`를 확인해야 한다.

```json
{
  "answer": "내부 지시나 시스템 설정을 변경하는 요청에는 답할 수 없습니다.",
  "sessionId": null,
  "sources": [],
  "blocked": true,
  "guardrailReason": "PROMPT_INJECTION"
}
```

가능한 주요 차단 사유:

- `EMPTY_QUESTION`
- `PROMPT_INJECTION`
- `SENSITIVE_DATA`
- `MEDICAL_DIAGNOSIS`
- `OUT_OF_SCOPE`

## 4. 오늘의 코칭

```http
POST /api/v1/ai/coaching/today
Content-Type: application/json
```

요청:

```json
{
  "userId": "authenticated-user-id",
  "latitude": 37.5665,
  "longitude": 126.978,
  "profile": {
    "level": "INTERMEDIATE",
    "goal": "ENDURANCE",
    "weeklyRuns": 3,
    "recentPain": false
  }
}
```

응답:

```json
{
  "title": "오늘의 러닝 코칭",
  "recommendation": "...",
  "caution": "통증이 있거나 컨디션이 좋지 않으면 강도를 낮추고 필요하면 전문가와 상담하세요.",
  "sources": []
}
```

수준별 코칭 기준은 서로 다르며 `recentPain=true`이면 회복 운동을 우선한다.

## 5. 오류 계약

| HTTP 상태 | 의미 | 백엔드 처리 |
|---:|---|---|
| 200 | 정상 또는 가드레일 차단 | `blocked` 확인 |
| 422 | 요청 스키마 오류 | 사용자 입력 또는 백엔드 매핑 확인 |
| 502 | AWS, Bedrock, DB 연동 또는 코칭 생성 실패 | 상세 메시지는 내부 로그에 남기고 사용자에게 일반화된 안내 표시 |

백엔드는 AI 서비스 호출에 60초 이하 timeout을 적용하고 자동 재시도는 멱등한 채팅 요청에 한해 최대 1회만 권장한다.

## 6. 환경변수

AI 서비스에만 설정:

```env
AWS_REGION=ap-northeast-2
BEDROCK_KNOWLEDGE_BASE_ID=...
BEDROCK_MODEL_ARN=...
DATABASE_URL=postgresql+psycopg2://...
ALLOWED_ORIGINS=http://localhost:3000
```

`DATABASE_URL` 대신 `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`를 사용할 수 있다.
AWS 키와 DB 비밀번호를 Git, 브라우저 환경변수 또는 요청 본문에 넣지 않는다.

## 7. 백엔드 프록시 의사 코드

```text
authenticate(request)
userId = authenticatedSession.userId

payload = {
  question: request.question,
  sessionId: request.sessionId,
  userId: userId,
  latitude: request.latitude,
  longitude: request.longitude
}

POST {AI_SERVICE_INTERNAL_URL}/api/v1/ai/chat
```

프런트엔드 구현과 백엔드 프록시 코드는 이 인계 범위에 포함하지 않는다.

## 8. 인수 검증

Windows PowerShell:

```powershell
.\scripts\test_ai_server.ps1
.\scripts\test_ai_server.ps1 -IncludeBedrock
```

첫 명령은 AWS 없이 health와 로컬 가드레일을 확인한다.
두 번째 명령은 실제 Bedrock 채팅과 오늘의 코칭까지 확인한다.

OpenAPI 문서:

```text
http://localhost:8000/docs
```
