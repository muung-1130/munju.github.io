# OWASP ZAP staging Baseline 단계적 도입

작성일: 2026-08-18
대상 저장소: `dai-run/gitops`
작업 브랜치: `review/zap-staging-baseline-20260818`

## 1. 결론과 현재 상태

이 저장소에는 운영과 분리된 정식 `staging` 환경이 아직 없다. 따라서 최초
ZAP 대상은 운영 URL이 아니라 기존 수동 GitOps smoke-test 환경인
`dir-gitops-test-ns`의 내부 Frontend Service로 제한한다.

대상 URL:

```text
http://dai-run-frontend.dir-gitops-test-ns.svc.cluster.local
```

이번 변경은 다음 안전장치를 갖는다.

- ZAP Baseline 수동·수동형(passive) 검사만 사용한다.
- CronJob은 `suspend: true`이므로 병합이나 Argo CD Sync만으로 실행되지 않는다.
- `ZAP_REPORT_ONLY=true`이므로 최초 1~2회 결과는 배포를 차단하지 않는다.
- NetworkPolicy는 ZAP Pod가 DNS와 smoke-test Frontend에만 연결하도록 제한한다.
- ServiceAccount 토큰을 Pod에 넣지 않는다.
- 운영 Application 세 개와 운영 워크로드는 변경하지 않는다.

2026-08-18 ECR에서 `weekly-20260811-amd64` 태그와 Linux/amd64 OCI manifest를
확인했다. CronJob은 다음 digest로 고정되어 있어 나중에 태그가 변경되어도
검사 이미지가 바뀌지 않는다.

```text
970307871446.dkr.ecr.ap-northeast-2.amazonaws.com/dairun/owasp-zap@sha256:c922795adef068ec28f98bd8ccc7c90d026d40793c4c6b8061b8d03139ac71fb
```

남은 선행 조건은 GitLab 브랜치 Push·MR과 smoke-test Frontend 준비 상태 확인이다.

## 2. 변경 파일

| 파일 | 역할 |
|---|---|
| `environments/dev/configmap-zap-baseline.yaml` | 내부 검사 URL, spider 시간, 결과 수집 모드 설정 |
| `environments/dev/cronjob-zap-baseline.yaml` | 매주 월요일 03:00 KST 일정의 중지된 Baseline CronJob |
| `environments/dev/networkpolicy-zap-baseline.yaml` | DNS와 smoke-test Frontend로만 egress 허용 |
| `environments/dev/kustomization.yaml` | 위 리소스 세 개를 smoke-test 렌더링에 포함 |
| `argocd/projects/dai-run-dev.yaml` | dev 프로젝트에 CronJob·NetworkPolicy 종류 추가 허용 |

## 3. MR 전에 반드시 할 일

### 3.1 ECR 이미지 확인 — 완료

AWS 접근이 가능한 Windows PowerShell에서 실행한다.

```powershell
aws ecr describe-images `
  --profile dairun `
  --region ap-northeast-2 `
  --repository-name dairun/owasp-zap `
  --query "reverse(sort_by(imageDetails,&imagePushedAt))[].{Pushed:imagePushedAt,Tags:imageTags,Digest:imageDigest}" `
  --output table
```

확인 결과:

```text
태그: weekly-20260811-amd64
digest: sha256:c922795adef068ec28f98bd8ccc7c90d026d40793c4c6b8061b8d03139ac71fb
manifest: application/vnd.oci.image.manifest.v1+json
platform: linux/amd64
```

CronJob에는 다음과 같이 반영했다.

```text
970307871446.dkr.ecr.ap-northeast-2.amazonaws.com/dairun/owasp-zap@sha256:c922795adef068ec28f98bd8ccc7c90d026d40793c4c6b8061b8d03139ac71fb
```

태그만 확인하고 digest를 고정하지 않으면 동일 태그의 이미지가 나중에 바뀔 수
있으므로 GitOps 운영 기준으로는 digest 고정을 권장한다.

### 3.2 smoke-test Frontend 준비 상태 확인

```powershell
kubectl get deployment dai-run-frontend `
  -n dir-gitops-test-ns

kubectl get endpointslice `
  -n dir-gitops-test-ns `
  -l kubernetes.io/service-name=dai-run-frontend
```

Deployment가 Available이고 EndpointSlice에 주소가 있어야 한다.

### 3.3 로컬 렌더링 검사

```powershell
kubectl kustomize .\environments\dev > $null
git diff --check
git diff
```

## 4. 병합 및 Argo CD 반영

1. 변경을 `review/zap-staging-baseline-20260818` 브랜치에 Push한다.
2. `main` 대상 MR을 만들고 이미지 digest, 내부 대상 URL, `suspend: true`,
   `ZAP_REPORT_ONLY=true`를 리뷰한다.
3. MR 병합 후 `dai-run-dev` AppProject 변경을 먼저 반영한다.
4. Argo CD의 `gitops-smoke-test` Application에서 Diff를 확인하고 수동 Sync한다.
5. Sync 후에도 CronJob은 중지 상태여야 한다.

확인 명령:

```powershell
kubectl get cronjob dai-run-zap-baseline `
  -n dir-gitops-test-ns `
  -o custom-columns="NAME:.metadata.name,SUSPEND:.spec.suspend,SCHEDULE:.spec.schedule"
```

정상값은 `SUSPEND=true`이다.

## 5. 최초 1~2회 결과 수집

중지된 CronJob에서 수동 Job 하나를 만든다.

```powershell
$run = "dai-run-zap-baseline-manual-" + (Get-Date -Format "yyyyMMddHHmmss")

kubectl create job `
  --from=cronjob/dai-run-zap-baseline `
  $run `
  -n dir-gitops-test-ns

kubectl wait `
  --for=condition=complete `
  "job/$run" `
  -n dir-gitops-test-ns `
  --timeout=35m

kubectl logs `
  "job/$run" `
  -n dir-gitops-test-ns
```

로그에서 다음을 보관한다.

- `ZAP_BASELINE_EXIT_CODE`
- `ZAP_JSON_REPORT_BEGIN`부터 `ZAP_JSON_REPORT_END`까지의 JSON
- High, Medium, Low, Informational 항목 수
- 실제 취약점, 오탐, 위험을 수용할 항목의 구분과 담당자

첫 실행이 정상이어도 바로 차단 모드로 바꾸지 말고, 같은 조건으로 한 번 더
실행해 결과가 안정적으로 재현되는지 확인한다.

## 6. 검사 게이트로 승격

ZAP Baseline은 일반적으로 High/Medium/Low/Informational 수준과 규칙별
결과를 제공한다. 따라서 무조건 모든 경고를 차단하면 기존 경고 때문에 배포가
계속 막힐 수 있다.

두 번의 결과를 검토한 뒤 별도 MR에서 다음 순서로 승격한다.

1. 규칙별 `FAIL`, `WARN`, `IGNORE` 기준 파일을 Git으로 관리한다.
2. 확정된 고위험 규칙만 먼저 `FAIL`로 지정한다.
3. CronJob의 `ZAP_REPORT_ONLY`를 `false`로 바꾼다.
4. 정기 실행이 필요하면 마지막에 `suspend: false`로 바꾼다.
5. GitLab 배포 차단은 CronJob 상태가 아니라, 별도의 GitLab DAST Job이 같은
   승인 규칙으로 성공해야 deploy Job이 시작되도록 `needs`를 연결한다.

중요: CronJob은 정기 점검 수단이다. CronJob을 추가하는 것만으로 GitLab
배포 파이프라인이 차단되지는 않는다.

## 7. 중단 및 복구

문제가 있으면 애플리케이션 Pod를 재시작할 필요가 없다.

```powershell
kubectl patch cronjob dai-run-zap-baseline `
  -n dir-gitops-test-ns `
  --type merge `
  -p '{"spec":{"suspend":true}}'
```

실행 중인 수동 Job만 중단해야 할 때는 정확한 Job 이름을 확인한 뒤 삭제한다.

```powershell
kubectl get jobs -n dir-gitops-test-ns
kubectl delete job <정확한-수동-Job-이름> -n dir-gitops-test-ns
```

GitOps의 최종 복구는 해당 MR을 revert하고 `gitops-smoke-test` Application을
수동 Sync하는 것이다. 운영 Application과 서비스 Deployment에는 롤백 작업이
필요하지 않다.
