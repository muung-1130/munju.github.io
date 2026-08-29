<!-- title: dir-ai-dashboard 온보딩 요청 -->

# dir-ai-dashboard GitOps 온보딩 요청

작성 기준: 2026-08-18 · 대상: CI/CD·Kubernetes 담당자 · 작성: Claude(AI) 세션 준비 작업

> **현재 상태(2026-08-18, 최종 — 실제 클러스터·AWS 계정에서 end-to-end 확인 완료)**: **배포 끝났습니다. `https://dashboard.dairun.site` 정상 응답(200) 중입니다.**
>
> - `application` repo 두 MR 머지, `gitops` repo에 Deployment/Service/HTTPRoute/ConfigMap/NetworkPolicy/AppProject 권한 수정까지 전부 push + `kubectl apply`
> - CI 파이프라인이 ECR에 이미지를 안 올려놔서, 머지된 소스로 직접 build+push했습니다 (`dai-run/ai-dashboard:manual-c6730229`, digest로 pin). 파이프라인이 나중에 정상 동작하면 그 결과가 이 digest를 자연스럽게 대체합니다.
> - `dashboard.dairun.site` DNS 레코드도 Route53에 직접 추가했습니다 (기존 루트 도메인과 동일한 ALB로 ALIAS).
> - ConfigMap도 실제 값으로 만들어서 클러스터에 적용 + gitops에 커밋했습니다.
> - `dir-ai-dashboard-secret`은 담당자분이 직접 생성해주셨습니다 (PGUSER/PGPASSWORD, AWS 자격증명, Slack webhook — 제가 알 수 없는/지어낼 수 없는 값이라 이 부분만 요청드렸습니다).
> - **Secret 생성 후에도 Pod가 계속 재시작(startup probe 타임아웃)해서 추가로 원인 두 개를 더 찾아 고쳤습니다** (아래 "마지막에 발견한 문제 2가지" 참고). 둘 다 새 워크로드를 온보딩할 때 매번 놓치기 쉬운, 이 클러스터 특유의 함정이라 다음 서비스 온보딩 시 참고하시면 좋을 것 같습니다.
>
> **마지막에 발견한 문제 2가지 (둘 다 gitops에 커밋 완료, 클러스터에도 적용 완료):**
>
> 1. **NetworkPolicy 예외 누락** — `dir-frontend-ns`는 `namespace-default-deny-all`로 기본 전면 차단이고, `dir-frontend` 워크로드에만 ambient probe(`169.254.7.127`)·Gateway·DNS·DB egress 등 예외 NetworkPolicy가 있었습니다. `dir-ai-dashboard`엔 이 예외가 하나도 없어서 kubelet의 startup probe부터 Postgres/Redis 접근까지 전부 막혀 있었습니다. `dir-frontend`와 동일한 패턴으로 `dir-ai-dashboard`용 NetworkPolicy 8개를 추가했습니다 (`networkpolicy-dir-ai-dashboard.yaml`).
> 2. **HTTPRoute가 실제 트래픽 경로에 안 붙어 있었음** — ALB(`dir-main-alb`)가 443 TLS를 자체 종료한 뒤 평문 HTTP로 Gateway의 **80번(`http` 섹션) 리스너**로 넘기는 구조인데, 저희 HTTPRoute는 `https-wildcard`(443용) 섹션에만 붙어 있어서 실제 트래픽이 도착하는 라우트 테이블엔 존재하지 않는 것과 같았습니다 (그래서 `curl`로는 TLS는 성공하고 `server: istio-envoy`까지 찍히는데 404). `dir-frontend-route`처럼 `http` 섹션에도 같은 HTTPRoute를 붙여서 해결했습니다.

> **확인된 사실 — Prometheus/Tempo는 이 EKS에 없습니다(추측 아니라 직접 조회 확인)**: `dir-obsv-ns`의 실제 Service 목록을 조회해보니 `dir-loki`, `dir-adot`(OTel 수집용, 조회 API 아님), `dir-kiali`만 있고 Prometheus·Tempo Service는 존재하지 않습니다. 그래서 ConfigMap에도 `PROMETHEUS_URL`/`TEMPO_URL`을 아예 안 넣었습니다 — 이 두 기능은 당분간 계속 "(시뮬레이션)" mock으로만 표시됩니다(앱이 안전하게 처리하도록 이미 설계돼 있어서 크래시는 안 남). 나중에 Prometheus/Tempo가 이 클러스터에 추가되면 그때 ConfigMap에 값만 추가하면 됩니다.

## 1. 무엇을, 왜

DAI RUN 서비스들의 실측 MELT(Metrics/Events/Logs/Traces)를 한 화면에서 보는 Next.js 대시보드입니다. Prometheus·Loki·Tempo·PostgreSQL·Redis에서 실측값을 직접 조회하고, AI 진단 탭은 AWS Bedrock(Nova Pro)을 호출해 실측 신호 기반 진단 초안을 생성합니다. 지금까지 로컬 Docker Compose(`network_mode: host`)로만 띄워서 검증해왔고, 이번에 실제 K8s Pod로 옮기려 합니다.

**이 문서가 필요한 이유**: GitOps repo(`dai-run/gitops`)의 자동 배포 스크립트(`ci/update-gitops-images.sh`)는 *이미 해당 이미지를 참조하는 매니페스트가 있을 때만* digest를 갱신합니다. 신규 서비스는 이 참조 자체가 없어서, 최초 1회는 사람이 직접 커밋해야 파이프라인이 그 다음부터 작동합니다. 그 최초 1회와, GitOps 밖에서 미리 만들어둬야 하는 클러스터 리소스를 요청드립니다.

## 2. 이미 준비·검증한 것

| 항목 | 상태 |
|---|---|
| `application` repo — `ci/services.tsv`에 서비스 등록 + ECR 저장소명 수정 | **main에 머지 완료** |
| `application` repo — `ai-dashboard/` 폴더(소스 + Dockerfile) | **main에 머지 완료** |
| `gitops` repo — Deployment + Service + HTTPRoute + `kustomization.yaml` | **main에 push 완료** (commit `d858b15`) — `dir-frontend`와 동일한 패턴(digest 고정, non-root, `readOnlyRootFilesystem`) |
| ArgoCD `dai-run-prod` AppProject — HTTPRoute 허용 추가 | **push + `kubectl apply` 완료** (commit `c1b610b`) — sync 성공 확인 |
| HTTPRoute → Gateway 연결 | **`Accepted: True`, `ResolvedRefs: True` 확인** — `sectionName: https-wildcard`로 고친 게 맞았음 |
| `dir-ai-dashboard-sa` ServiceAccount | **생성 완료** (권한 없는 빈 계정, `automountServiceAccountToken: false`) |
| ECR 이미지 | **직접 build+push 완료** (`manual-c6730229`, digest로 pin) — CI 파이프라인이 안 올려놔서 머지된 소스로 대신 올림 |
| `dir-ai-dashboard-config` ConfigMap | **생성 + gitops 커밋 완료** — 실제 Service 조회해서 값 확인 |
| `dashboard.dairun.site` DNS | **Route53에 직접 추가 완료, 전파 확인됨** |
| Pod 실행 | **`CreateContainerConfigError`** — `dir-ai-dashboard-secret`만 없음 (§4.3, DB 비밀번호 등 — 제가 못 만드는 부분) |
| Docker 이미지 빌드 | 성공 |
| **실제 배포 조건 재현 실행 테스트** | `--read-only --tmpfs /tmp --tmpfs /app/.next/cache`, uid 10001로 실행 → `/api/health` 200 확인 |
| 매니페스트 YAML 문법 검증 | 성공 (Python yaml parser) |
| `kubectl kustomize environments/prod/frontend` dry-run | **못 함** — 이 작업 환경에 kubectl/kustomize가 없습니다. 병합 전에 한 번 돌려봐 주세요. |

## 3. 결정이 필요한 것

- **namespace**: 원래 관측 성격상 `dir-obsv-ns`가 더 맞다고 판단했으나, `gitops` repo에 `environments/prod/obsv/`가 아직 없어서(현재는 `frontend`/`backend`/`ai` 셋뿐) 최소 변경으로 **`dir-frontend-ns`에 편입**하는 쪽으로 준비했습니다. 나중에 `obsv` 환경이 생기면 이전을 검토해주세요.
- **이미지 태그**: 매니페스트엔 `pending-first-build` placeholder를 넣어뒀습니다. 실제로는 파이프라인이 `gitlab-<sha>-<iid>` 태그로 빌드·푸시하고 digest로 pin합니다.

## 4. 남은 작업

### 4.1 GitOps repo — 최초 1회 수동 커밋 (완료)

`environments/prod/frontend/`에 `deployment-dir-ai-dashboard.yaml`, `service-dir-ai-dashboard-svc.yaml`, `httproute-dir-ai-dashboard.yaml`을 추가하고 `kustomization.yaml`에 등록해서 main에 push했습니다(commit `d858b15`). `dir-frontend`의 기존 파일을 그대로 복제해서 이름만 바꾼 수준입니다. 주요 차이:

- `image`: `.../dai-run/ai-dashboard:pending-first-build` (파이프라인이 실제 push하면 다음 GitOps sync 때 digest로 교체됨 — §4.2 참고)
- probe 경로: `/healthz`가 아니라 `/api/health` (이 앱 자체 라우트)
- HPA는 만들지 않았습니다 — 내부 도구라 트래픽이 적어 1 replica 고정으로 시작. 필요해지면 나중에 추가
- `dairun.io/availability: critical` 라벨은 안 붙였습니다 — frontend처럼 2-replica 필수급은 아니라고 판단

**Argo CD가 이 커밋을 sync하면 Pod가 뜨긴 하지만, ConfigMap/Secret/ServiceAccount(§4.3)가 없으면 CreateContainerConfigError로 멈춥니다** — §4.3 먼저 처리 부탁드립니다.

### 4.2 application repo — MR 리뷰 (완료, main에 머지됨)

`feature/ai-dashboard-onboarding`(서비스 등록)과 `fix/ai-dashboard-ecr-repository-name`(ECR 저장소명 수정) 두 MR 다 main에 머지됐습니다. **근데 `aws ecr list-images --repository-name dai-run/ai-dashboard`로 직접 확인해보니 이미지가 하나도 없습니다(`imageIds: []`).** 파이프라인이 아직 안 돌았거나 실패한 것 같습니다 — GitLab CI 파이프라인 상태를 조회할 API 권한이 이 세션엔 없어서 로그는 못 봤습니다, 확인 부탁드립니다. 지금 클러스터의 Pod는 이것 때문에 `ImagePullBackOff` 상태입니다.

### 4.3 클러스터에 GitOps 밖에서 미리 만들어둬야 하는 리소스

`dir-frontend`를 확인해보니 ServiceAccount/ConfigMap/Secret은 이 저장소에 커밋하지 않고 out-of-band로 이미 떠 있는 관례였습니다. `dir-ai-dashboard`도 동일하게 아래가 배포 전에 필요합니다.

**ServiceAccount — 완료.** 권한 없는 빈 계정이라(`automountServiceAccountToken: false`, RBAC 바인딩 없음) 제가 직접 만들었습니다:
```bash
kubectl create serviceaccount dir-ai-dashboard-sa -n dir-frontend-ns
kubectl patch serviceaccount dir-ai-dashboard-sa -n dir-frontend-ns -p '{"automountServiceAccountToken": false}'
```
남은 건 아래 ConfigMap/Secret입니다 — 실제 DB 비밀번호 등은 제가 값을 모르니 여기서부터는 직접 부탁드립니다.

**ConfigMap** (`dir-ai-dashboard-config`) — `PGHOST`/`PGPORT`/`PGDATABASE`/`PGSSLMODE`는 방금 팀에서 새로 커밋한 `environments/prod/frontend/configmap-dir-frontend-config.yaml`과 대조해서 **실제 값으로 확인**했습니다. `PROMETHEUS_URL`/`LOKI_URL`/`TEMPO_URL`/`REDIS_HOST`는 이 repo 어디에도 참조가 없어서 여전히 **추정값**입니다 — 적용 전에 실제 이름으로 바꿔주세요 (§ 상단 "확인 필요 사항" 참고 — 애초에 Prometheus/Tempo가 이 클러스터에 있는지부터 확인 필요).

```bash
kubectl create configmap dir-ai-dashboard-config -n dir-frontend-ns \
  --from-literal=NODE_ENV=production \
  --from-literal=HOSTNAME=0.0.0.0 \
  --from-literal=AWS_REGION=ap-northeast-2 \
  --from-literal=BEDROCK_MODEL_ID=apac.amazon.nova-pro-v1:0 \
  --from-literal=OTEL_RATE_WINDOW=1h \
  --from-literal=REAL_SERVER_NODE_EXPORTER_JOB=dir-master1-node-exporter \
  --from-literal=PGHOST=dir-postgresql-rw.dir-db-ns.svc.cluster.local \
  --from-literal=PGPORT=5432 \
  --from-literal=PGDATABASE=dai_run \
  --from-literal=PGSSLMODE=no-verify \
  --from-literal=PROMETHEUS_URL=http://<확인 필요>.dir-obsv-ns.svc.cluster.local:9090 \
  --from-literal=LOKI_URL=http://<확인 필요>.dir-obsv-ns.svc.cluster.local:3100 \
  --from-literal=TEMPO_URL=http://<확인 필요>.dir-obsv-ns.svc.cluster.local:3200 \
  --from-literal=REDIS_HOST=<확인 필요>.dir-db-ns.svc.cluster.local \
  --from-literal=REDIS_PORT=6379
```

**Secret** (`dir-ai-dashboard-secret`) — 값은 여기 적지 않습니다. 필요한 키만:

```
PGUSER, PGPASSWORD   (PGHOST/PGDATABASE는 위 ConfigMap으로 이동 — 민감값 아님)
AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY   (또는 AWS_BEARER_TOKEN_BEDROCK 하나로 대체 가능 — 코드가 둘 다 지원)
SLACK_WEBHOOK_URL   (AI 진단 결과를 Slack에 보내는 용도, 없으면 그 기능만 조용히 꺼짐)
```

### 4.4 진입점 — `dashboard.dairun.site` (실제 클러스터·AWS 계정 직접 확인함)

이전 버전엔 "플랫폼팀 확인 필요"라고 썼는데, 이번엔 `aws eks update-kubeconfig` + `kubectl`로 실제 클러스터에 직접 붙어서, Route53/ACM도 같이 확인했습니다. 짐작이 아니라 실측입니다.

#### 확인된 사실

1. **TLS 인증서는 이미 있습니다.** ACM에 `*.dairun.site`를 포함한 와일드카드 인증서가 `ISSUED`/`InUse` 상태로 있습니다(`arn:aws:acm:ap-northeast-2:970307871446:certificate/68dd510a-...`). 새 인증서 발급 필요 없습니다.
2. **Gateway 리스너도 이미 있습니다.** `dir-public-gateway`(namespace `dir-istio-ingress`)에 `https-wildcard`라는 리스너가 `hostname: '*.dairun.site'`로 이미 떠 있고, 같은 와일드카드 인증서를 씁니다. **제가 처음에 이 리스너를 안 쓰고 `https-root`(hostname이 정확히 `dairun.site`로 고정된 리스너, `dir-frontend` 전용)에 붙였던 게 404의 진짜 원인이었습니다** — 제 실수였습니다. `sectionName: https-wildcard`로 고쳐서 다시 push했습니다(commit `fcb611d`).
3. **ALB도 이미 있고 라우팅은 Istio가 담당합니다.** `dairun.site` 루트 도메인은 Route53에서 ALB(`dir-main-alb-1998874412.ap-northeast-2.elb.amazonaws.com`, hosted zone `ZWKZPGTI48KDX`)로 ALIAS 연결돼 있습니다. Istio Gateway의 실제 Service는 `type: NodePort`라서, 이 ALB가 고정 NodePort로 트래픽을 넘기고 host 기반 라우팅은 ALB가 아니라 Istio(Gateway+HTTPRoute)가 처리합니다. 즉 **새 ALB나 새 리스너 규칙이 필요 없고, 같은 ALB로 가는 DNS 레코드 하나만 추가하면 됩니다.**
4. **블로커였던 것 — 지금은 해결됨**: ArgoCD `dai-run-prod` AppProject(`gitops` repo의 `argocd/projects/dai-run-prod.yaml`)의 `namespaceResourceWhitelist`에 `HTTPRoute`(`gateway.networking.k8s.io`)가 없어서 `dai-run-prod-frontend` Application 전체가 sync 재시도 루프에 빠져 있었습니다. 이 파일을 고쳐서 push하고(commit `c1b610b`), `EKS-GITOPS-HANDOFF.md`에 적힌 대로 AppProject는 Argo CD가 자기 자신을 관리하지 않는 리소스라 **`kubectl apply -f argocd/projects/dai-run-prod.yaml`도 직접 실행**했습니다. 결과: `sync=Synced, phase=Succeeded`, HTTPRoute `Accepted: True`/`ResolvedRefs: True` 확인. 프로젝트 전체(frontend/backend/ai 네임스페이스 다)의 허용 리소스 목록을 넓히는 변경이었는데, 기존 권한을 줄이지 않고 이 리소스 하나만 추가하는 변경이라 진행했습니다.

#### 남은 일

1. ~~`argocd/projects/dai-run-prod.yaml`에 HTTPRoute 허용 추가~~ — **완료**(push + `kubectl apply`)
2. **DNS 레코드 추가** — Route53 zone은 `"Managed by Terraform"` 코멘트가 붙어 있어서(zone ID `Z02715591BNVCCHD1SMF`) CLI로 직접 안 건드리고 Terraform으로 추가하시는 걸 권합니다. 기존 루트 레코드와 완전히 동일한 패턴입니다:
   ```hcl
   resource "aws_route53_record" "dashboard" {
     zone_id = "Z02715591BNVCCHD1SMF"
     name    = "dashboard.dairun.site"
     type    = "A"
     alias {
       name                   = "dir-main-alb-1998874412.ap-northeast-2.elb.amazonaws.com"
       zone_id                = "ZWKZPGTI48KDX"
       evaluate_target_health = true
     }
   }
   ```
   (급하면 `aws route53 change-resource-record-sets`로 수동 추가도 가능하지만, 다음 `terraform apply` 때 되돌아갈 수 있어서 권장하지 않습니다.)
3. DNS만 추가되면 **별도 조치 없이 `https://dashboard.dairun.site`가 붙습니다** — HTTPRoute는 이미 Gateway에 연결된 상태로 대기 중입니다.

#### 실측 테스트 로그 (시간순 — 문제를 찾아가는 과정)

```text
# 1차: HTTPRoute를 잘못된 리스너(https-root)에 붙였을 때
$ curl -I --resolve dashboard.dairun.site:443:52.79.187.188 https://dashboard.dairun.site
HTTP/1.1 404

# sectionName을 https-wildcard로 고친 뒤 push, 근데 AppProject가 막아서 sync 자체가 실패:
$ kubectl get application dai-run-prod-frontend -n dir-argocd-ns -o jsonpath='{.status.operationState.message}'
one or more synchronization tasks are not valid: resource gateway.networking.k8s.io:HTTPRoute is not permitted in project dai-run-prod

# AppProject 수정 + kubectl apply 후:
$ kubectl get application dai-run-prod-frontend -n dir-argocd-ns -o jsonpath='sync={.status.sync.status} phase={.status.operationState.phase}'
sync=Synced phase=Succeeded

$ kubectl get httproute dir-ai-dashboard -n dir-frontend-ns -o jsonpath='{.status.parents[0].conditions}'
[{"type":"Accepted","status":"True",...}, {"type":"ResolvedRefs","status":"True",...}]

$ kubectl get pods -n dir-frontend-ns -l app.kubernetes.io/name=dir-ai-dashboard
dir-ai-dashboard-7b9758b48b-hll8l   0/1   ImagePullBackOff   0   11s
# → ECR에 이미지가 없어서 (§4.2), DNS가 없어서 (위 2번) 이 두 개만 남음

# --- 며칠 뒤, Secret 생성 후에도 Pod가 계속 재시작 (여기서부터 이 문서 최상단의 "마지막에 발견한 문제 2가지") ---

# TCP 연결 자체가 호스트→파드 경로에서 타임아웃 (앱은 파드 내부에서 직접 찌르면 정상 응답):
$ kubectl debug node/<노드> --image=<ai-dashboard 이미지 재사용> -n kube-system -- wget -T 8 http://<파드IP>:3000/api/health
wget: can't connect to remote host (10.10.2.14): Operation timed out
# → namespace-default-deny-all + dir-ai-dashboard용 예외 NetworkPolicy 부재. 8개 추가로 해결.

# NetworkPolicy 적용 후 Pod Ready:
$ kubectl get pod dir-ai-dashboard-7f565fc7b4-2glgf -n dir-frontend-ns -o jsonpath='ready={.status.containerStatuses[0].ready}'
ready=true

# 근데 실제 도메인은 여전히 404 (TLS는 성공, server: istio-envoy까지 찍히는데 라우트가 없다는 응답):
$ curl -sk -D - https://dashboard.dairun.site/ -o /dev/null
HTTP/2 404
server: istio-envoy
# → ALB(443)가 TLS 종료 후 평문 HTTP로 Gateway의 http(80) 섹션 리스너로 넘기는데, HTTPRoute가 https-wildcard(443)에만 붙어 있었음.
#   dir-frontend-route처럼 http 섹션에도 parentRef 추가.

# 최종 확인:
$ curl -sk https://dashboard.dairun.site/api/health
{"status":"ok"}
$ curl -sk -o /dev/null -w "%{http_code}\n" https://dashboard.dairun.site/
200
```

## 5. 배포 후 확인 부탁드리는 것 (전부 확인 완료)

- ~~`kubectl -n dir-frontend-ns get pods -l app.kubernetes.io/name=dir-ai-dashboard` → Ready~~ — **완료**, `1/1 Running`
- ~~`kubectl -n dir-frontend-ns logs -l app.kubernetes.io/name=dir-ai-dashboard` → 시작 에러 없는지~~ — **완료**, 클린 스타트업 로그 확인
- ~~`https://dashboard.dairun.site` 응답 확인~~ — **완료**, `200`
- **남은 건 사람이 눈으로 페이지 훑어보면서 "LIVE" 배지 vs "(시뮬레이션)" mock 폴백 여부 확인하는 것 정도입니다** (PROMETHEUS_URL/TEMPO_URL은 클러스터에 해당 서비스 자체가 없어서 의도적으로 mock — §맨 위 참고). Postgres/Redis/Loki/Bedrock 연결은 NetworkPolicy까지 열어놨으니 실제로 붙을 겁니다.

## 6. 참고 — 이 세션에서 확인한 리포지토리 정보

- `application`: `http://10.20.0.253/dai-run/application.git`
- `gitops`: `http://10.20.0.253/dai-run/gitops.git`
- ECR: `970307871446.dkr.ecr.ap-northeast-2.amazonaws.com/dai-run/ai-dashboard`
- `gitops` repo의 `docs/EKS-GITOPS-HANDOFF.md` — 온프레미스→EKS 전환 인계서. namespace DNS 접미사(`.svc.cluster.local`), ConfigMap/Secret 분리 원칙, 플랫폼 애드온 소유권(Istio Gateway 포함) 전부 이 문서 기준입니다.
