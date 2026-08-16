# DAI-RUN GitOps Repository

> AWS EKS prod 전환 사항은 [docs/EKS-GITOPS-HANDOFF.md](docs/EKS-GITOPS-HANDOFF.md)를 먼저 확인한다.
> Prod는 ECR, `workload=app`, HPA/KEDA desired state를 사용하며 아래 Harbor 설명은 dev legacy 흐름에 해당한다.

이 저장소는 DAI-RUN Kubernetes 개발 환경의 Desired State를 관리한다.
Jenkins는 검증을 통과한 프론트엔드 이미지의 digest를 Green Deployment에만
기록하고, Argo CD가 그 변경을 클러스터에 자동 동기화한다.

## 자동 배포 흐름

```text
dai-run main
  -> Jenkins Quality Gate
  -> BuildKit image build
  -> Harbor push and Trivy gate
  -> Green image digest update in this repository
  -> Argo CD Auto Sync
  -> Green Deployment rollout
```

Blue Service의 기본 트래픽과 HTTPRoute 가중치는 자동으로 변경하지 않는다.
Green 검증 후 Blue 승격 또는 Canary 비율 변경은 별도 승인 작업이다.

## 구조

```text
argocd/
├── applications/
│   └── gitops-smoke-test.yaml
└── projects/
    └── dai-run-dev.yaml
environments/
└── dev/
    ├── deployment.yaml                          # frontend blue
    ├── deployment-green.yaml                    # frontend green (Jenkins 자동 갱신)
    ├── service.yaml
    ├── service-green.yaml
    ├── deployment-<service>.yaml                 # 서비스별 blue (16개)
    ├── deployment-<service>-green.yaml           # 서비스별 green (Jenkins 자동 갱신)
    ├── service-<service>.yaml
    ├── service-<service>-green.yaml
    ├── httproute-canary.yaml                     # 서비스별 canary-header + weighted-split 규칙 쌍
    ├── configmap.yaml
    ├── namespace.yaml
    └── kustomization.yaml
```

`<service>`: `auth-service`, `auth-web`, `challenge-service`, `coaching-service`,
`course-recommendation-service`, `course-service`, `crew-service`,
`marathon-service`, `media-service`, `notification-service`,
`running-record-service`, `shoe-service`, `ai-assistant-service` (HTTPRoute 포함),
`ai-rag-service`, `ai-course-recommendation`, `ai-shoe-life` (내부 전용, HTTPRoute
없음 — 브라우저/nginx가 아닌 서비스 간 ClusterIP DNS로만 호출된다).

## 안전 정책

- Auto Sync: 활성
- Self Heal: 활성
- Prune: 비활성
- 허용 저장소: `dai-run/dai-run-gitops` 하나
- 허용 대상: `dir-gitops-test-ns` 하나
- 허용 리소스: Namespace, ConfigMap, Service, Deployment, HTTPRoute
- Jenkins 자동 변경 대상: 서비스별 `environments/dev/deployment-<service>-green.yaml`
  (frontend는 계속 `environments/dev/deployment-green.yaml`)

신규 서비스 17개(frontend 제외 16개)의 이미지는 아직 Jenkins 파이프라인이 빌드한
적이 없으므로 blue/green 모두 `harbor.dai-run.internal/dai-run/<service>:pending-first-build`
placeholder 태그를 참조한다. 첫 Jenkins 빌드가 성공해 실제 태그/digest로 교체되기
전에는 이 브랜치를 `main`에 병합하지 않는다 — 병합 시 Argo CD Auto Sync가 즉시
ImagePullBackOff 상태로 동기화를 시도한다.

Prune이 비활성화되어 Git에서 리소스를 지워도 클러스터 리소스가 자동으로
삭제되지는 않는다. 반대로 Self Heal이 활성화되어 클러스터에서 직접 수정한
관리 리소스는 Git 상태로 되돌아간다.

## 최초 1회 적용

Application과 AppProject는 `environments/dev` 밖에 있으므로 Git Push만으로
자기 자신이 갱신되지 않는다. 클러스터 관리자가 AppProject를 먼저 검증·적용하고
Application을 나중에 적용해야 한다.

```bash
kubectl apply --dry-run=server \
  -f argocd/projects/dai-run-dev.yaml

kubectl apply -f argocd/projects/dai-run-dev.yaml

kubectl apply --dry-run=server \
  -f argocd/applications/gitops-smoke-test.yaml

kubectl apply -f argocd/applications/gitops-smoke-test.yaml
```

## 확인

```bash
kubectl get applications.argoproj.io gitops-smoke-test \
  -n dir-argocd-ns \
  -o custom-columns='NAME:.metadata.name,SYNC:.status.sync.status,HEALTH:.status.health.status,REVISION:.status.sync.revision'

kubectl rollout status deployment/dai-run-frontend-green \
  -n dir-gitops-test-ns \
  --timeout=180s
```

## 롤백

Jenkins가 생성한 Green 이미지 갱신 커밋을 이 저장소에서 `git revert`하고
`main`에 반영한다. Argo CD가 이전 digest를 Green에 다시 동기화한다.
Blue 기본 트래픽은 이 과정에서 변경되지 않는다.
