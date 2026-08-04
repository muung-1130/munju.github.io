# 코스 탐색(`/courses`) 페이지 지연 — 원인 분석 및 조치 보고서

- 작성일: 2026-08-04 (KST)
- 대상: `/courses`(코스 탐색), `/`(홈) 페이지 — 두 페이지 모두 같은 원인 공유
- 신고 내용: "코스탐색 부분이 지연시간이 10초. 보안담당자는 자기 문제가 아니라고 함"
- 결론: **네트워크/보안 문제가 아니라 애플리케이션 코드 문제.** SSR 페이지 응답이 AI(Bedrock) 추천 코스 계산이 끝날 때까지 동기적으로 기다리도록 짜여 있었고, 그 호출에 timeout이 없었다.
- 저장소: `/home/kevin/dai-run-repo`

---

## 1. 요약

| 항목 | 내용 |
|---|---|
| 증상 | `/courses` 페이지 최초 로딩 시 10초가량 멈춤 |
| 발생 조건 | 로그인 사용자 또는 비로그인 방문자가 **그날(KST 03:00 기준) 처음** 홈 또는 코스 탐색 페이지에 진입할 때마다 매번 재현 |
| 근본 원인 | `course-recommendation-service`가 AI(Bedrock) 추천 코스를 계산하는 외부 호출(평균 3.8~5.1초, 상한 없음)을 **페이지 SSR 응답 안에서 `await`로 끝까지 기다린 뒤** 응답하고 있었음 |
| 보안팀 판단과의 관계 | 네트워크 지연이나 방화벽 문제가 아니라 애플리케이션 코드가 의도적으로 느린 외부 API를 기다리도록 짜여 있던 것 — "우리 문제 아니다"라는 판단은 맞았음 |
| 조치 | ① 외부 AI 호출에 6초 timeout 추가 ② 페이지 응답이 그 호출을 기다리지 않도록 비동기(백그라운드)로 전환 ③ 동시 중복 호출 방지 가드 추가 ④ (부수 발견) 코스 주변 검색 쿼리의 누락된 공간 인덱스 추가 |
| 검증 | 실제 서비스 재빌드·재기동 후 실측: 5.58초 → 0.099초(초기 응답), 전체 페이지 경로(nginx 경유) 0.49초 |

---

## 2. 재현·측정 과정

이 환경에는 실제 docker compose 스택(nginx, Next.js frontend, 12개 services-msa, PostgreSQL, AI FastAPI 서비스 등)이 이미 떠 있어서, 코드만 읽고 추측하지 않고 실제 요청을 흘려보내 원인을 좁혔다.

### 2.1 1차 의심 — DB 쿼리(코스 주변 검색)

`/api/courses/nearby`가 PostGIS `ST_DWithin`/`ST_Distance`를 쓰는데, 실제 DB(`course.course_waypoints`)에 공간 인덱스(GIST)가 없는 것을 확인했다(`db/` migration 어디에도 이 테이블 생성/인덱스 구문이 없어 애초에 라이브 DB와 Git migration 사이 drift였다).

```
Indexes:
    "course_waypoints_pkey" PRIMARY KEY, btree (waypoint_id)
    "uq_course_waypoints_sequence" UNIQUE CONSTRAINT, btree (course_id, sequence_no)
```

다만 `EXPLAIN ANALYZE`로 실제 실행 시간을 재보니:

```
Execution Time: 78.147 ms
```

현재 데이터량(코스 230개, waypoint 553개)에서는 인덱스 없이도 78ms — 10초 지연의 원인이 아니었다. (§4.4에서 별도로 고쳐둠 — 원인은 아니지만 실제 위반 사항이라 방치하지 않았다.)

### 2.2 2차 의심 — AI 추천 코스 계산이 페이지 로딩을 막고 있는지

`app/courses/page.tsx`, `app/page.tsx` 모두 SSR 중 `fetchAiRecoPanelCourses()`를 `Promise.all([...])`로 호출한다. 이 함수는 내부적으로 `course-recommendation-service`의 `/api/ai-recommendations/panel`을 호출하고, 그 라우트는 다음을 **`await`로 끝까지 기다린 뒤** 응답했다.

```ts
// (수정 전) src/lib/aiRecommendation.ts
await ensureTodaysRecommendation(userId, location).catch(() => {});
```

`ensureTodaysRecommendation`은 그날 첫 호출이면 `course-recommendation-service` → `ai-course-recommendation`(FastAPI) → **AWS Bedrock**까지 왕복하는 `fetch`를 하나 더 기다리는데, 이 `fetch`에는 **timeout이 전혀 없었다.**

```ts
// (수정 전) src/lib/aiRecommendationOrchestrator.ts
const res = await fetch(`${AI_SERVICE_URL}/api/v1/ai-generated-courses`, {
  method: 'POST', headers: {...}, body: ..., cache: 'no-store'
}); // AbortController/timeout 없음
```

실측(직접 서비스 포트로 호출, 그날 첫 요청):

```
$ curl -o /dev/null -w "time_total=%{time_total}s" http://localhost:4003/api/ai-recommendations/panel
time_total=5.582114s

$ (같은 요청 재시도 — 그날 캐시된 결과 재사용)
time_total=0.016199s
```

그리고 DB에 실제 처리시간이 기록되고 있어(`course_recommendation.recommendation_runs.processing_time_ms`) 과거 기록도 함께 확인했다.

| 호출 시각(UTC) | 처리시간(ms) |
|---|---:|
| 2026-08-03 22:36 | 4772 |
| 2026-08-02 17:06 | 4267 |
| 2026-08-02 12:26 | 5144 |
| 2026-08-01 06:05 | 4464 |
| 2026-07-29 19:45 | 4638 |
| 2026-07-29 02:00 | 4790 |
| 2026-07-29 02:00 | 3844 |
| 2026-07-29 02:00 | 4410 |

평균 4.5초, 최대 5.1초. **timeout이 없으므로 Bedrock이 느린 날엔 이보다 더 길게 페이지가 멈출 수 있다** — 사용자가 체감한 "10초"는 이 상한 없는 대기가 그대로 노출된 결과로 설명된다.

### 2.3 왜 "보안 문제가 아니다"가 맞는 판단이었는지

지연의 실체는 다음과 같은 코드 구조 문제다.

1. **페이지 렌더링과 무관한 기능(AI 추천 카드 1개)이 페이지 전체(코스 탐색 지도·목록 포함)를 블로킹**하고 있었다.
2. 외부 LLM 호출에 **timeout이 없어** 장애/지연이 그대로 사용자에게 전파됐다.
3. 이 호출은 **사용자별·일자별로 하루 한 번**만 발생하도록 이미 캐시돼 있었지만(`hasTodaysRecommendation`), "그 한 번"이 하필 페이지 응답 경로 안에 박혀 있어 그 사용자의 그날 첫 방문마다 재현됐다.

방화벽, VPN, DNS, TLS, CDN 등 인프라 계층 문제가 아니라 애플리케이션이 스스로 만든 지연이므로 보안 담당자 판단은 정확했다.

---

## 3. 조치 내용

### 3.1 외부 AI 호출에 timeout 추가 — `services-msa/course-recommendation-service/src/lib/aiRecommendationOrchestrator.ts`

Bedrock 호출에 6초 예산을 두고, 넘으면 abort 후 기존에 이미 있던 폴백(무작위 코스)으로 조용히 넘어가게 했다(CLAUDE.md §7.4/§19.3의 "외부 API·Bedrock에 timeout을 둔다" 요구사항을 지금은 지키지 못하고 있었다).

```ts
const AI_SERVICE_TIMEOUT_MS = 6000;
...
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), AI_SERVICE_TIMEOUT_MS);
try {
  const res = await fetch(url, { ...opts, signal: controller.signal });
  ...
} catch { return; } finally { clearTimeout(timeoutId); }
```

### 3.2 페이지 응답이 AI 계산을 기다리지 않도록 변경 — `.../src/lib/aiRecommendation.ts` (핵심 수정)

`ensureTodaysRecommendation` / `ensureGuestDefaultRecommendation` 호출을 **`await` 제거**, 백그라운드로만 트리거한다. 페이지는 즉시 "이미 계산된 추천이 있으면 그것, 없으면 기존 폴백(무작위 코스)"으로 응답한다.

```ts
// (수정 후)
ensureTodaysRecommendation(userId, location).catch(() => {}); // await 없음
const recommended = await getActiveRecommendationsForUser(userId); // 이미 있는 것만 조회
```

백그라운드 계산은 그대로 진행되고, 완료되면 다음 조회(다음 페이지 이동, 또는 클라이언트의 위치 기반 재조회)에서 자연스럽게 실제 AI 추천으로 갱신된다.

### 3.3 동시 중복 호출 방지 — 같은 파일, `runRecommendationOnce`

3.2번 변경으로 "기다리지 않고 바로 응답"하게 되면서, 같은 사용자에 대해 짧은 시간 안에 여러 요청(예: SSR 최초 조회 + 브라우저가 GPS를 얻은 뒤의 재조회)이 겹치면 각자 Bedrock을 중복 호출할 수 있는 새로운 위험이 생긴다. 진행 중인 생성 Promise를 사용자 ID(게스트는 공용 ID) 기준으로 재사용하는 in-process 가드를 추가했다.

> **한계**: 이 가드는 프로세스 하나 안에서만 유효하다. `course-recommendation-service`의 K8s 목표 HPA는 최소 1~최대 3 replica라, 여러 Pod에 걸친 완전한 중복 방지가 필요하면 별도 DB advisory lock 등이 필요하다 — 지금 신고된 지연 문제와는 별개 사안이라 이번엔 손대지 않았다.

### 3.4 클라이언트에서 "업그레이드" 반영 — `components/AiRecoPanel.tsx`

서버가 더는 계산 완료를 기다리지 않으므로, 그날 첫 방문에서는 화면에 폴백(무작위 코스)이 먼저 보일 수 있다. 이미 있던 위치 기반 재조회 로직에 "폴백이면 6초 뒤 한 번만 다시 조회" 로직을 추가해, 새로고침 없이도 백그라운드 계산이 끝나면 실제 AI 추천으로 자연스럽게 바뀌도록 했다.

### 3.5 (부수 조치) 코스 주변 검색 공간 인덱스 추가 — `db/042_course_waypoints_location_gist_index.sql`

원인은 아니었지만 조사 중 발견한 실제 위반 사항이라 함께 고쳤다.

```sql
CREATE INDEX IF NOT EXISTS idx_course_waypoints_location ON course.course_waypoints USING GIST (location);
```

라이브 DB에 적용 완료. 현재 데이터량에서는 planner가 여전히 `course_id` 조인 경로를 더 싸다고 판단해 이 인덱스를 즉시 쓰진 않지만(정상 — 553행 규모에선 그게 맞는 선택), 코스 수가 늘어나면 필요해질 인덱스라 미리 넣어뒀다.

---

## 4. 검증

| 항목 | 결과 |
|---|---|
| `npx tsc --noEmit`(Next.js 전체) | 통과 |
| `npm run build`(Next.js 프로덕션 빌드) | 통과, `/courses` `/` 포함 전체 라우트 정상 컴파일 |
| 수정한 backend TS 2개 파일 esbuild 파싱 | 통과 |
| `course-recommendation-service` 재빌드·재기동 | 정상 기동, 에러 로그 없음 |
| 실사용 시나리오 재현(오늘자 캐시 삭제 후 재요청) | 초기 응답 **0.099초**(이전 5.58초), 백그라운드 계산 3.9초 후 완료(DB `status=COMPLETED`), 6초 뒤 재조회 시 실제 AI 추천으로 정상 반영(49ms) |
| 전체 경로 실측(nginx 경유, `https://localhost:8443/courses`) | **0.49초** |
| GIST 인덱스 적용 확인 | `\d course.course_waypoints`에 `idx_course_waypoints_location` 확인, `EXPLAIN ANALYZE` 정상 |

## 5. 변경 파일

- `services-msa/course-recommendation-service/src/lib/aiRecommendationOrchestrator.ts` — timeout, in-flight 중복 방지
- `services-msa/course-recommendation-service/src/lib/aiRecommendation.ts` — 페이지 응답이 AI 계산을 기다리지 않도록 변경(핵심 수정)
- `components/AiRecoPanel.tsx` — 폴백일 때 1회 재조회로 업그레이드 반영
- `db/042_course_waypoints_location_gist_index.sql` — 신규 migration, 라이브 DB 적용 완료

## 6. 남은 일 / 제안

- `course-recommendation-service` 컨테이너는 재빌드·재기동해 수정 사항이 이미 라이브에 반영됨. `frontend` 컨테이너는 `AiRecoPanel.tsx` 폴리시(업그레이드 재조회)를 위해 재빌드가 필요하지만, **오늘 신고된 "10초 지연" 자체는 backend 재기동만으로 이미 해결된 상태**다(위 4번 실측이 그 증거).
- 여러 Pod로 확장했을 때의 완전한 중복 생성 방지(DB advisory lock 등)는 이번 범위에 포함하지 않았다. 트래픽이 늘어 실제 중복 호출이 관측되면 후속 작업으로 제안한다.
- Bedrock 자체 응답 속도(평균 4.5초)를 줄이는 것은 이번 조치 범위가 아니다 — 지금은 "느려도 페이지를 막지 않는다"로 해결했다.
