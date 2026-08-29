# DAI RUN 코스탐색 CI/CD 시연 가이드

## 목적

`https://dairun.site/courses`의 배경색을 이용해 다음 세 가지를 보여준다.

1. 수동 배포와 Configuration Drift
2. GitLab CI + GitOps + Argo CD 승인형 자동 배포
3. 동일 GitLab Runner의 Docker layer cache에 따른 빌드시간 차이

로컬 Windows PC에서는 코드 수정, Git Push, 브라우저 촬영만 한다. Docker build는 AWS의 `dir-cicd-gitlab-runner`에서 실행되고 EKS 명령은 `192.168.0.200` 관리 호스트에서 `keks`로 실행한다.

## 현재 확인 상태

- Runner 루트 디스크: 48GB 중 36GB 사용, 13GB 여유, 75%
- Docker 이미지: 61개, 약 31.8GB
- 프론트엔드 단일 cold/warm 빌드 각 1회는 가능
- 촬영 중 `FORCE_SERVICES=all`과 `docker builder prune -af`는 금지
- GitOps `stg` 브랜치가 없으면 파이프라인이 자동 생성하도록 최신 `main`에서 보완됨
- SonarQube는 현재 `allow_failure: true`
- 운영 서비스는 Argo Rollouts가 아닌 Kubernetes RollingUpdate 사용

## 선행 MR의 변경 내용

브랜치 `review/cicd-course-demo-20260819`에는 다음을 추가한다.

- `app/courses/page.tsx`: 파란색 기준 배경 scaffold
- `ci/demo-frontend-build.sh`: cold/warm 시간 측정, Trivy gate, ECR Push, digest 출력
- `.gitlab-ci.yml`: `CI_CD_DEMO=true`일 때만 나타나는 수동 cold/warm Job

이 MR을 먼저 검토·병합하고 생성되는 GitOps 배포 MR도 병합한다. 코스탐색 페이지가 파란색이고 Argo CD가 `Synced / Healthy`가 되면 촬영을 시작한다.

## 배경색 코드

수정 파일은 `app/courses/page.tsx`다. `courseDemoBackground` 값 한 줄만 변경한다.

```tsx
// 시작: 파란색
'linear-gradient(135deg, #EAF4FF 0%, #CFE9FF 100%)';

// 수동 배포: 주황색
'linear-gradient(135deg, #FFF3E6 0%, #FFB36B 100%)';

// 자동 배포: 초록색
'linear-gradient(135deg, #E8F8EC 0%, #75D68D 100%)';

// 선택 장면: 보라색
'linear-gradient(135deg, #F3E8FF 0%, #B98AFF 100%)';
```

`app/` 변경은 현재 탐지 규칙상 `frontend`와 `auth-web`을 함께 선택한다. 자동 Pipeline에서 두 이미지가 표시되는 것은 정상이다. 수동 캐시 비교 Job은 `frontend` 하나만 빌드한다.

## 촬영 전 상태 확인

EKS 관리 호스트에서 실행한다.

```bash
keks get application dai-run-prod-frontend \
  -n dir-argocd-ns \
  -o custom-columns='NAME:.metadata.name,SYNC:.status.sync.status,HEALTH:.status.health.status,REVISION:.status.sync.revision'

keks get deployment dir-frontend \
  -n dir-frontend-ns \
  -o custom-columns='NAME:.metadata.name,READY:.status.readyReplicas,AVAILABLE:.status.availableReplicas,IMAGE:.spec.template.spec.containers[0].image'

ORIGINAL_FRONTEND_IMAGE="$(keks get deployment dir-frontend \
  -n dir-frontend-ns \
  -o jsonpath='{.spec.template.spec.containers[0].image}')"
printf 'ORIGINAL_FRONTEND_IMAGE=%s\n' "$ORIGINAL_FRONTEND_IMAGE"
```

Windows PowerShell에서 배포 중 HTTP 상태를 관찰한다.

```powershell
while ($true) {
    $time = Get-Date -Format "HH:mm:ss.fff"
    $code = curl.exe -L -sS -o NUL -w "%{http_code}" `
      --max-time 5 https://dairun.site/courses
    Write-Host "$time HTTP $code"
    Start-Sleep -Milliseconds 500
}
```

색상 확인 때는 브라우저에서 `Ctrl+Shift+R`을 누른다.

## 시연 1: 수동 cold build와 수동 배포

### 1. 주황색 브랜치 생성

```bash
git switch main
git pull --ff-only origin main
git switch -c demo/course-manual-orange

# courseDemoBackground를 주황색으로 수정

git add app/courses/page.tsx
git commit -m "demo: set course page theme to orange"
git push -u origin demo/course-manual-orange
```

이 브랜치는 `main`에 병합하지 않는다.

### 2. GitLab에서 cold build 실행

```text
dai-run/application
→ Build
→ Pipelines
→ New pipeline
→ Branch: demo/course-manual-orange
→ Variables 추가
   CI_CD_DEMO = true
   DEMO_THEME = orange
→ Run pipeline
→ demo-frontend-cold-build의 ▶ 버튼 클릭
```

로그에서 다음 결과를 기록한다.

```text
DEMO_BUILD_RESULT mode=cold service=frontend seconds=...
DEMO_IMAGE=970307871446.dkr.ecr.ap-northeast-2.amazonaws.com/dai-run/frontend@sha256:...
```

Job artifact의 `ci-output/demo/result.txt`에도 같은 값과 수동 배포 명령이 저장된다.

### 3. EKS에 직접 배포

Job 로그가 출력한 실제 digest를 사용한다.

```bash
DEMO_IMAGE='970307871446.dkr.ecr.ap-northeast-2.amazonaws.com/dai-run/frontend@sha256:실제_DIGEST'

keks set image deployment/dir-frontend \
  dir-frontend="$DEMO_IMAGE" \
  -n dir-frontend-ns

keks rollout status deployment/dir-frontend \
  -n dir-frontend-ns \
  --timeout=10m

keks get application dai-run-prod-frontend \
  -n dir-argocd-ns \
  -o custom-columns='NAME:.metadata.name,SYNC:.status.sync.status,HEALTH:.status.health.status'
```

촬영 장면:

- 코스탐색 페이지 주황색
- Argo CD `OutOfSync`
- 반복 요청 HTTP 상태
- cold build 초

대본:

> 먼저 GitLab Runner에서 캐시를 사용하지 않고 프론트엔드 이미지를 빌드했습니다. 검사를 통과한 이미지를 ECR에 올린 뒤 EKS Deployment에 직접 적용했습니다. 화면은 주황색으로 변경됐지만 GitOps 저장소에는 이 변경이 없기 때문에 Argo CD가 OutOfSync를 표시합니다. 이것이 수동 배포로 발생한 Configuration Drift입니다.

## 시연 2: 승인형 자동 배포

주황색 브랜치는 병합하지 않고 최신 `main`에서 초록색 브랜치를 만든다.

```bash
git switch main
git pull --ff-only origin main
git switch -c demo/course-auto-green

# courseDemoBackground를 초록색으로 수정

git add app/courses/page.tsx
git commit -m "demo: set course page theme to green"
git push -u origin demo/course-auto-green
```

GitLab에서 `demo/course-auto-green → main` MR을 생성하고 검토 후 Squash Merge한다.

확인 순서:

```text
Application MR Merge
→ detect-changed-services
→ unit-test-changed-services
→ sonarqube-check
→ build-push-and-update-gitops
→ ECR digest 생성
→ GitOps stg → main 배포 MR 생성
→ 배포 MR 검토·병합
→ Argo CD 자동 Sync
→ EKS RollingUpdate
```

EKS 확인:

```bash
keks get application dai-run-prod-frontend -n dir-argocd-ns -w
```

`Synced / Healthy`가 되면 `Ctrl+C`를 누른다.

대본:

> 이번에는 클러스터를 직접 수정하지 않습니다. Application MR을 병합하면 GitLab이 변경 서비스를 탐지하고 테스트와 SonarQube 분석을 실행합니다. 이미지를 빌드한 뒤 Trivy Critical 검사를 통과한 이미지가 ECR에 Push되고 확정 digest가 GitOps 배포 MR에 기록됩니다. 담당자가 이를 승인하면 Argo CD가 EKS에 자동 반영합니다. 화면은 초록색으로 바뀌고 상태도 Synced와 Healthy가 됐습니다.

## 시연 3: warm cache 비교

자동 초록색 배포가 끝난 직후 같은 commit에서 캐시용 브랜치를 만든다. 파일은 변경하지 않는다.

```bash
git switch main
git pull --ff-only origin main
git switch -c demo/course-cache-green
git push -u origin demo/course-cache-green
```

GitLab에서 실행한다.

```text
Build → Pipelines → New pipeline
Branch: demo/course-cache-green
Variables:
  CI_CD_DEMO = true
  DEMO_THEME = green
Run pipeline
→ demo-frontend-warm-build의 ▶ 버튼 클릭
```

로그에서 `Using cache`와 다음 결과를 촬영한다.

```text
DEMO_BUILD_RESULT mode=warm service=frontend seconds=...
```

cold와 warm의 `seconds`만 같은 표에 표시한다. 전체 Pipeline 시간은 별도로 표시한다.

대본:

> 같은 소스와 같은 Dockerfile을 동일 Runner에서 다시 빌드했습니다. 변경되지 않은 의존성 설치와 Next.js 빌드 레이어가 재사용되면서 로그에 Using cache가 표시됩니다. 캐시는 이미지 빌드 구간을 줄이며, 같은 digest라면 불필요한 운영 재배포도 만들지 않습니다.

배경을 보라색으로 다시 변경하면 소스가 달라져 Next.js build는 다시 실행된다. 이 경우에는 “전체 캐시”가 아니라 “의존성 레이어 부분 캐시”라고 설명한다.

## 90초 대본

### 인트로

> 같은 코스탐색 화면을 대상으로 수동 배포, GitOps 기반 자동 배포, Docker 캐시 재사용의 차이를 보여드리겠습니다. 전체 배포 시간과 Docker build 시간은 구분해서 보겠습니다.

### 수동 배포

> 주황색 이미지를 직접 EKS에 적용했습니다. 서비스는 바뀌었지만 GitOps에는 기록되지 않아 Argo CD가 OutOfSync를 표시합니다. 이것이 Configuration Drift입니다.

### 자동 배포

> 초록색 변경은 MR과 Squash Merge로 시작합니다. GitLab이 테스트, SonarQube, Docker build, Trivy 검사를 수행하고 ECR digest를 GitOps 배포 MR에 기록합니다. 승인된 변경을 Argo CD가 반영하면서 화면과 선언 상태가 함께 변경됩니다.

### 캐시

> 같은 commit을 다시 빌드하자 변경되지 않은 Docker 레이어가 재사용됩니다. 로그의 Using cache와 build 시간을 통해 cold build와 warm build의 차이를 확인할 수 있습니다.

### 마무리

> 수동 배포는 즉시 변경할 수 있지만 이력과 실제 상태가 어긋날 수 있습니다. 승인형 GitOps 배포는 변경, 검사, 승인, 배포 이력을 연결하고 Docker 캐시는 반복 빌드 시간을 줄입니다. 현재 운영은 RollingUpdate이며 Argo Rollouts의 운영 Canary 전환은 다음 단계입니다.

## 촬영 후 복원

초록색을 원래 파란색으로 복원하는 MR을 만든다.

```bash
git switch main
git pull --ff-only origin main
git switch -c demo/restore-course-blue

# courseDemoBackground를 파란색으로 복원

git add app/courses/page.tsx
git commit -m "demo: restore course page theme"
git push -u origin demo/restore-course-blue
```

Application MR과 GitOps 배포 MR을 순서대로 병합한 뒤 확인한다.

```bash
keks get application dai-run-prod-frontend \
  -n dir-argocd-ns \
  -o custom-columns='NAME:.metadata.name,SYNC:.status.sync.status,HEALTH:.status.health.status'

keks rollout status deployment/dir-frontend \
  -n dir-frontend-ns \
  --timeout=10m
```

정상 종료 기준:

- 코스탐색 페이지 파란색
- Argo CD `Synced / Healthy`
- 모든 frontend Pod Ready
- HTTP 반복 요청에서 관찰된 실패 없음

## 주의사항

- 로컬 Windows C 드라이브에서는 Docker build를 실행하지 않는다.
- 촬영 중 전체 서비스 강제 빌드를 하지 않는다.
- cold와 warm 사이에 Docker 이미지나 cache를 정리하지 않는다.
- 공용 Runner에서 `docker builder prune -af`를 실행하지 않는다.
- 수동 Job도 운영과 동일하게 Trivy fixed Critical gate를 통과해야 ECR에 Push한다.
- 운영 자동 배포는 GitOps 배포 MR 승인이 포함된 승인형 자동 배포다.
- 촬영 종료 후 데모 이미지 정리는 별도 유지보수 시간에 대상 태그를 확인한 뒤 진행한다.