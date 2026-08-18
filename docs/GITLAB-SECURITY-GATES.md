# GitLab 배포 보안 게이트 운영 절차

작성일: 2026-08-18

## 적용 결과

Application 파이프라인은 다음 순서로 동작한다.

```text
변경 감지
  -> 단위 테스트
  -> SonarQube 분석 및 Quality Gate
  -> 서비스 이미지 빌드
  -> Trivy HIGH/CRITICAL JSON 보고서 생성
  -> 수정 가능한 CRITICAL 취약점 차단
  -> ECR Push
  -> GitOps digest 갱신
  -> Argo CD 배포
```

앞 단계가 실패하면 ECR Push와 GitOps 갱신은 실행되지 않는다.

## SonarQube 게이트

`sonarqube-check`는 다음 조건으로 강화했다.

- `allow_failure: false`
- `sonar.qualitygate.wait=true`
- 최대 600초 동안 Quality Gate 결과 대기
- deploy Job의 `needs`에 `sonarqube-check` 명시

따라서 분석 실패, 연결 실패, timeout 또는 Quality Gate 실패는 모두 배포를
차단한다. 이전 파이프라인에서는 SonarQube Job 실패 이력이 있으므로 이 변경을
병합하기 전에 review 브랜치 파이프라인이 성공하는지 먼저 확인해야 한다.

`ai-service/`는 Bedrock 호출을 검증하던 비운영 Spring Boot 실험 코드이며 현재
서비스 빌드·ECR·GitOps 대상이 아니다. 컴파일 산출물이 없는 이 디렉터리가 전체
분석을 중단하지 않도록 `sonar.exclusions`에 명시하고, 실제 운영 Node.js·Python
서비스와 나머지 소스는 계속 분석한다.

Sonar Job의 `after_script`는 마스킹된 기존 `SONAR_TOKEN`으로 프로젝트 상태를
조회하고 Gate 지표명·현재값·기준값만 로그에 출력한다. 토큰 값은 출력하거나
저장하지 않으며, 진단 API 조회 실패도 원래 분석 결과를 성공으로 바꾸지 않는다.

### 2026-08-18 MR !11 실제 검증

- Pipeline #44: 비운영 `ai-service/` Java 컴파일 산출물 오류로 중단
- Pipeline #45: Java 실험 코드 제외 후 전체 분석·보고서 업로드 성공, Quality Gate 실패
- Pipeline #46, #47: Gate 실패 조건과 New Code 설정을 재현·확인

확인된 실패 조건:

| 지표 | 현재값 | 기준 |
|---|---:|---:|
| New Coverage | 0.0% | 80% 이상 |
| New Duplicated Lines Density | 31.36582% | 3% 이하 |
| New Security Hotspots Reviewed | 0.0% | 100% |
| New Issues | 742 | 0 |

### 2026-08-19 기준선 적용 및 재검증

기존 저장소 전체가 New Code로 계산되는 문제를 해결하기 위해 다음 분석을
`SPECIFIC_ANALYSIS` 기준선으로 1회 지정했다.

- 분석 UUID: `8902a01b-65b6-4988-9548-104ba7c24996`
- Git revision: `cd7e0781ec914aef48b3fba7f90c958092c366a5`
- 적용 전: 상속형 `PREVIOUS_VERSION`
- 적용 후: 프로젝트별 `SPECIFIC_ANALYSIS`

기준 분석과 승인된 `main`(`e24641e`) 사이에는 애플리케이션 소스 변경이 없고,
CI 설정·검사 스크립트·문서·Sonar 제외 설정만 있다. 기존 742개 이슈는 Overall
Code에 계속 남으며, Quality Gate 임계값은 낮추지 않았다.

적용 후 Pipeline #47을 재시도해 성공했고, 최신 MR HEAD `12d0a9b`를 대상으로
생성한 Pipeline #53도 `runner-check`, 변경 감지, 단위 테스트, SonarQube Gate가
모두 성공했다. MR 단계에서는 ECR Push, GitOps 변경 및 운영 배포가 실행되지
않았다.

## 컨테이너 이미지 게이트

운영 서비스 이미지마다 Docker build 직후, ECR Push 전에 Trivy를 실행한다.

- Scanner: `public.ecr.aws/aquasecurity/trivy:0.72.0`
- HIGH와 CRITICAL 결과: JSON artifact로 14일 보관
- 차단 기준: 수정 버전이 존재하는 CRITICAL 취약점 1개 이상
- `--ignore-unfixed`: 수정 버전이 아직 없는 항목은 보고서에는 남지만 초기
  도입 단계에서 배포를 차단하지 않음
- Trivy DB: GitLab cache로 재사용

스캔 자체가 오류로 끝나거나 취약점 DB를 받을 수 없는 경우에도 Job이 실패한다.
즉 검사 장애를 성공으로 취급하지 않는다.

검사 통과 전에는 `docker push`가 실행되지 않으므로 취약한 신규 이미지가 ECR과
GitOps에 배포되는 것을 막는다.

## Amazon Inspector와의 역할 분리

Trivy는 빌드 시점의 동기 배포 게이트다. Amazon Inspector Enhanced Scanning은
ECR에 남아 있는 이미지에서 나중에 공개된 CVE까지 다시 찾아내는 지속 감시다.

목표 정책:

| 저장소 | Inspector 주기 |
|---|---|
| `dai-run/*` 실제 서비스 | `CONTINUOUS_SCAN` |
| `dairun/*` 인프라 미러 | `SCAN_ON_PUSH` |

두 검사는 중복이 아니라 다음처럼 역할이 다르다.

```text
Trivy: 빌드 직후 검사 -> 문제가 있으면 Push/배포 차단
Inspector: ECR 저장 이후 지속 검사 -> 새 CVE가 발표되면 다시 탐지
```

## 첫 적용 절차

1. review 브랜치를 GitLab에 Push하고 MR 파이프라인을 실행한다.
2. `sonarqube-check`가 실제로 성공하는지 확인한다.
3. SonarQube 실패 시 Quality Gate를 다시 끄지 말고 Job 로그에서 연결, 토큰,
   프로젝트 설정 또는 기존 Quality Gate 실패 원인을 수정한다.
4. MR 병합 후 첫 운영 검증은 서비스 한 개의 작은 변경으로 제한한다.
5. `ci-output/trivy/<service>.json` artifact를 확인한다.
6. CRITICAL이 있으면 이미지 수정 후 다시 빌드한다. 무근거 ignore는 추가하지 않는다.
7. 통과한 경우에만 ECR digest, GitOps 커밋, Argo CD 상태를 순서대로 확인한다.

## 필요한 네트워크

GitLab Runner가 다음 대상에 접근할 수 있어야 한다.

- SonarQube Server
- `public.ecr.aws`의 Trivy 이미지
- Trivy vulnerability DB registry
- Private ECR 및 AWS API
- 내부 GitLab의 GitOps 저장소

장기적으로 Trivy 실행 이미지와 vulnerability DB를 내부 ECR에 검증 후 미러하고
digest로 고정하는 것을 권장한다. 최초 검증 전에는 임의 digest를 기록하지 않는다.

## 롤백

문제가 생기면 이 변경 커밋을 Application 저장소에서 revert한다. 이미 배포된
애플리케이션을 재시작할 필요는 없다. 보안 게이트가 실패한 시점에는 ECR Push와
GitOps 갱신 전이므로 신규 이미지 롤백도 필요하지 않다.

긴급 우회가 필요하더라도 `allow_failure: true`를 main에 직접 넣지 않는다.
사유, 만료 시각, 대상 서비스와 승인자를 기록한 별도 MR로 최소 범위만 변경한다.
