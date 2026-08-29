# Environment ingest Lambda

기존 `db/ingest-environment.mjs`의 기상청·에어코리아 수집을 Lambda에서 실행하고 DynamoDB에 적재한다. Node.js 20 런타임, EventBridge 스케줄(기상청 발표 후 15분 이후)을 사용한다.

## DynamoDB

테이블 이름은 `ENVIRONMENT_TABLE_NAME` 환경 변수로 전달한다. 파티션 키는 `pk`(String), 정렬 키는 `sk`(String)이다.

- 날씨: `pk=WEATHER#강남구`, `sk=20260813#1400`
- 미세먼지: `pk=AIR#종로`, `sk=2026-08-13 14:00:00+09:00`

`entityType`은 각각 `weather_hourly`, `air_quality_hourly`이며 PostgreSQL의 `environment.weather_hourly`, `environment.air_quality_hourly` 필드명을 payload에 그대로 유지한다. EKS consumer는 `Query`로 `WEATHER#...` 또는 `AIR#...`를 읽어 기존 PostgreSQL UPSERT와 동일한 키로 저장하면 된다.

## 배포

`npm install --omit=dev` 후 이 디렉터리의 파일을 Lambda zip에 넣고, Lambda execution role에 `dynamodb:BatchWriteItem` 권한을 부여한다. 환경 변수는 `WEATHER_API_KEY`, `AIR_API_KEY`, `ENVIRONMENT_TABLE_NAME`이다. API 키는 평문 환경 변수 대신 Secrets Manager 참조 또는 Lambda extension을 권장한다.
