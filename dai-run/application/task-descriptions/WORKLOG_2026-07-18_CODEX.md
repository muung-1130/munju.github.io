# D.A.I. RUN Codex 작업일지

- 작업일: 2026-07-18 (KST)
- 작업 범위: GitHub Copilot 세션 인수인계, FastAPI RAG 서비스 DB 연동 교정, 보안 정리, 로컬 검증 및 AWS CLI 준비
- 저장소: `/home/kevin/dai-run-repo`
- 브랜치: `feature/frontend`
- 주의: Git commit, push 및 배포는 수행하지 않았다.

## 1. 작업 배경

GitHub Copilot을 Codex로 오인한 세션에서 진행하던 작업을 이어받았다. VS Code Server가 보관한 Copilot transcript를 확인하여 기존 문답, 실행 명령, 수정 내역 및 마지막 작업 지점을 파악했다.

별도의 대화 요약본을 생성하지 않고 실제 transcript와 현재 저장소 상태를 직접 대조하여 후속 작업을 진행했다.

## 2. Copilot 세션 확인

VS Code의 Copilot transcript가 로컬에 남아 있어 기존 대화 내용을 복원할 수 있음을 확인했다.

확인된 주요 대화 범위:

- D.A.I. RUN 프로젝트 현황 조사
- Windows 작업 결과물의 Ubuntu VM 이전
- `ai-service`, `ai-rag-service` 구조 확인
- 데모 채팅 UI 리스타일
- 가드레일 설명
- 챗봇의 DB 조회 가능 여부
- FastAPI와 PostgreSQL 연동 시도

Copilot transcript에는 과거에 입력된 DB 및 AWS 자격 증명이 평문으로 포함되어 있었다. 해당 값은 재사용하지 않고 폐기·교체해야 하는 노출 정보로 판단했다.

## 3. 보안 정리

다음 보안 문제를 수정했다.

- Python 설정 코드에 있던 Knowledge Base ID 및 모델 ARN 기본값 제거
- DB 연결 코드에 하드코딩된 계정과 비밀번호 제거
- `.env.example`에 포함된 실제 DB 연결정보 제거
- DB 연결을 환경 변수 기반으로 변경
- AI 서비스 소스에서 알려진 노출 자격 증명 패턴 재검색
- 비밀번호가 파일명에 포함된 Copilot 오작동 산출물 제거
- Uvicorn 로그, Python 캐시 및 Gradle 빌드 산출물 제거
- `.gitignore`에 Python 캐시, 가상환경, 로그 및 Gradle 빌드 결과 제외 규칙 추가

현재 DB 연결은 다음 중 하나를 사용한다.

- `DATABASE_URL`
- `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`

AWS 자격 증명은 소스나 프로젝트 `.env`에 직접 기록하지 않고 AWS 프로필, 임시 자격 증명 또는 IAM Role을 사용하는 방향으로 정리했다.

## 4. PostgreSQL 연동 교정

Copilot이 작성한 초기 DB 도구는 실제 스키마를 확인하지 않고 테이블과 컬럼을 추정한 상태였다. PostgreSQL의 `information_schema.columns`와 프로젝트 SQL/TypeScript 쿼리를 읽기 전용으로 확인하여 실제 구조에 맞게 수정했다.

교정한 조회 영역:

- `auth_user.users`: 사용자 기본 프로필
- `auth_user.user_running_preferences`: 러닝 난이도, 목표, 선호 거리, 목표 페이스, 주간 목표 거리
- `running_record.runs`: 최근 러닝 횟수, 거리, 평균 페이스, 최근 완료 시각
- `environment.weather_hourly`: 지역별 최신 예보
- `environment.air_quality_hourly`: 최신 측정소 대기질
- `course.courses`: PostGIS 기반 주변 코스
- `challenge.challenges`, `challenge.challenge_participations`: 진행 중인 챌린지

수정한 주요 파일:

- `ai-rag-service/app/config.py`
- `ai-rag-service/app/database.py`
- `ai-rag-service/app/tools.py`
- `ai-rag-service/app/bedrock_kb.py`
- `ai-rag-service/.env.example`
- `.gitignore`

## 5. DB 검증 결과

실제 PostgreSQL을 대상으로 읽기 전용 검증을 수행했다.

검증 항목:

- 사용자 프로필 조회
- 최근 러닝 기록 집계
- 최신 날씨 조회
- 최신 대기질 조회
- 서울 중심 좌표 기준 주변 코스 검색
- 진행 중인 챌린지 조회
- 조회 결과를 Bedrock 프롬프트용 문자열로 변환

모든 항목이 정상 결과를 반환했다. 스키마 확인용 SQL은 읽기 전용 트랜잭션에서 실행한 뒤 `ROLLBACK`했다.

현재 확인된 상태:

- FastAPI → PostgreSQL 연결: 완료
- PostgreSQL 조회 → 프롬프트 문맥 생성: 완료
- DB 문맥 → Bedrock 전송 → 최종 답변: 미검증

## 6. Python 실행 환경 구성

Ubuntu에 `python3.12-venv`가 없어 기본 `python3 -m venv`가 실패했다. 시스템 패키지를 임의로 변경하지 않고 PyPA의 `virtualenv.pyz`를 사용해 프로젝트 내부 가상환경을 생성했다.

생성 경로:

- `ai-rag-service/.venv`

`requirements.txt`의 다음 주요 의존성을 설치했다.

- FastAPI
- Uvicorn
- boto3
- SQLAlchemy
- psycopg2-binary
- python-dotenv
- Pydantic Settings

Python 문법 검사, 애플리케이션 import 및 SQLAlchemy DB 도구 호출을 확인했다.

## 7. FastAPI 로컬 테스트

FastAPI를 `127.0.0.1:8000`에서 임시 실행하여 다음을 검증했다.

- `GET /health`: HTTP 200
- `GET /demo`: HTTP 200
- 비밀정보 요청 가드레일: HTTP 200 및 차단 응답
- 일반 러닝 질문: Bedrock 설정 누락으로 HTTP 502

Bedrock 설정 검사를 클라이언트 생성 시점에 수행하면서 가드레일 요청까지 HTTP 500으로 실패하는 회귀를 발견했다. 설정 검사를 실제 Bedrock 호출 직전으로 이동하여, Bedrock 설정이 없어도 가드레일 차단이 독립적으로 정상 동작하도록 수정했다.

테스트가 끝난 뒤 Uvicorn 서버를 종료했다.

## 8. Bedrock 검증 상태

현재 다음 환경 변수가 설정되지 않아 실제 `RetrieveAndGenerate` 호출은 완료하지 못했다.

- `BEDROCK_KNOWLEDGE_BASE_ID`
- `BEDROCK_MODEL_ARN`

또한 과거 세션에 노출된 AWS Access Key는 재사용하면 안 된다. 새 자격 증명을 안전하게 설정한 후 일반 질문으로 Bedrock 연결을 먼저 확인해야 한다.

DB 개인화 테스트는 사용자 프로필과 러닝 기록이 외부 AWS Bedrock으로 전달될 수 있으므로 실행하지 않았다. 전용 테스트 계정과 비식별 데이터로 별도 검증해야 한다.

## 9. AWS CLI 준비

Ubuntu APT 저장소에서 `awscli` 설치 후보를 찾을 수 없어 AWS 공식 CLI v2 설치 파일을 사용하도록 안내했다.

사용자가 확인한 설치 버전:

- AWS CLI `2.36.2`

아직 확인이 필요한 사항:

- 새 AWS 프로필 생성
- STS 인증 성공 여부
- Bedrock Knowledge Base 및 모델 환경 변수 설정
- IAM의 `bedrock:Retrieve`, `bedrock:RetrieveAndGenerate` 권한
- 사용할 Foundation Model 접근 권한

## 10. 남은 작업

권장 순서:

1. 과거에 노출된 AWS Access Key와 비밀번호 폐기·교체 확인
2. `dai-run-bedrock` AWS 프로필에 새 자격 증명 설정
3. `AWS_PROFILE=dai-run-bedrock aws sts get-caller-identity` 성공 확인
4. `ai-rag-service/.env`에 Knowledge Base ID와 모델 ARN 설정
5. 개인정보 없는 일반 러닝 질문으로 Bedrock 호출 검증
6. 출처 URI와 세션 ID 반환 확인
7. 가드레일 허용·차단 회귀 테스트 추가
8. 전용 테스트 사용자와 비식별 DB 데이터로 개인화 통합 테스트
9. Pydantic alias 경고 정리
10. Docker 환경에서 동일 API 재검증

## 11. 작업 제한 준수

이번 작업에서는 다음을 수행하지 않았다.

- Git commit
- Git push
- 운영 배포
- AWS 리소스 생성·수정·삭제
- Bedrock Knowledge Base 동기화
- PostgreSQL 데이터 변경
- 실제 사용자 DB 정보를 Bedrock으로 전송

