# EKS GitOps 전환 인계서

기준일: 2026-08-15  
대상: `dir-eks`, AWS 계정 `970307871446`, 리전 `ap-northeast-2`

## 이 패키지에 반영한 변경

1. Prod backend/frontend 이미지를 Harbor에서 ECR로 변경했다.
2. EKS에서 현재 실행 중인 immutable digest 또는 이관 태그를 desired state로 사용했다.
3. `dir-harbor-pull-secret`을 제거했다. EKS 노드는 Node IAM Role과 ECR VPC Endpoint로 이미지를 받는다.
4. 온프레미스 전용 `dairun.io/pool`, `dairun.io/app-capable` affinity와 observability toleration을 제거했다.
5. 모든 애플리케이션 Deployment에 Terraform node group 라벨 `workload: app`을 사용한다.
6. 기본 replica는 1로 맞추고 일반 HPA의 `minReplicas`도 1로 관리한다.
7. Marathon CPU request를 250m에서 50m로 낮추고 HPA를 `min=1`, `max=3`, CPU 75%, 빠른 scale-up/300초 scale-down으로 변경했다.
8. AI Assistant, Course Recommendation, Shoe Life AI CPU request를 각각 50m로 낮췄다. AI Assistant에는 CPU 70% HPA 지표를 추가했다.
9. 현재 backend/frontend HPA와 KEDA ScaledObject를 GitOps 리소스로 추가했다.
10. 이관 제외 대상인 `dir-backend-waypoint` Deployment/Service와 Kustomize 참조를 제거했다.
11. `dir-ai-ns`의 현재 Deployment, Service, HPA, KEDA ScaledObject, ServiceAccount, NetworkPolicy를 GitOps에 추가했다.
12. `dai-run-prod-ai` Argo CD Application과 AppProject 권한을 추가했다.

## CI/CD 파이프라인에서 반드시 바꿀 부분

기존 흐름의 `Harbor login -> Harbor push -> Harbor digest 기록`을 다음으로 변경한다.

```text
AWS OIDC AssumeRole
  -> ECR login
  -> 고유 태그로 build/push
  -> ECR에서 digest 조회
  -> prod Deployment의 image를 ECR@sha256:digest로 갱신
  -> Git commit/push
  -> Argo CD sync
```

ECR 저장소는 태그 변경 불가능이므로 동일 태그를 다시 push하지 않는다. 커밋 SHA 등 고유 태그를 사용하고, GitOps에는 최종적으로 digest를 기록하는 방식을 권장한다.

```bash
aws ecr get-login-password --region ap-northeast-2 \
  | docker login --username AWS --password-stdin \
    970307871446.dkr.ecr.ap-northeast-2.amazonaws.com

IMAGE=970307871446.dkr.ecr.ap-northeast-2.amazonaws.com/dai-run/<repository>:<git-sha>
docker build -t "$IMAGE" .
docker push "$IMAGE"

DIGEST=$(aws ecr describe-images \
  --region ap-northeast-2 \
  --repository-name dai-run/<repository> \
  --image-ids imageTag=<git-sha> \
  --query 'imageDetails[0].imageDigest' --output text)
```

CI가 수정할 prod 파일은 `environments/prod/**/deployment-*.yaml`이다. Dev의 Harbor blue/green 파일은 이번 EKS prod 전환 범위에서 변경하지 않았다.

## 적용 전에 반드시 해결할 외부 설정

### 1. 클러스터 DNS 도메인

온프레미스 ConfigMap에는 `.svc.dir-cluster` 주소가 많지만 EKS CoreDNS 도메인은 `cluster.local`이다. 다음과 같이 변경해야 한다.

```text
<service>.<namespace>.svc.dir-cluster
-> <service>.<namespace>.svc.cluster.local
```

현재 prod GitOps 저장소에는 ConfigMap과 Secret 원본이 없으므로 이 ZIP에 민감 ConfigMap을 복사하지 않았다. 특히 현재 ConfigMap 일부에는 자격 증명이 포함된 URI가 있어 그대로 Git에 커밋하면 안 된다.

권장 분리:

- 비민감 URL/포트: GitOps ConfigMap
- DB 비밀번호, URI 자격 증명, API Key: External Secrets Operator 또는 Sealed Secret
- 노출된 기존 자격 증명: 교체 후 AWS Secrets Manager에 저장

DB, Kafka, MongoDB, MinIO, Elasticsearch가 EKS에 없거나 접근 불가능하면 DNS 문자열만 바꿔도 Pod는 정상화되지 않는다. 각 의존 서비스의 AWS 주소 또는 Private DNS를 먼저 확정해야 한다.

### 2. 기존 Secret/ConfigMap

AI Deployment는 다음 리소스가 먼저 존재해야 한다.

- `dir-*-config` ConfigMap
- `dir-*-secret` Secret
- DB/외부 API 관련 Secret

이 ZIP은 Secret 값을 포함하지 않는다. Argo CD 최초 sync 전에 별도 비밀 관리 체계로 공급해야 한다.

### 3. 애드온 소유권

다음은 애플리케이션 GitOps가 아니라 플랫폼 애드온으로 계속 관리한다.

- Istio 1.30.3 Ambient, CNI, ztunnel, istiod
- Istio Gateway/고정 NodePort
- KEDA 컨트롤러
- Kiali
- Loki
- ADOT Collector
- Metrics Server
- EBS CSI, AWS CNI

현재 설치 스크립트는 `/home/yujin/eks-pod-migration`에 있다. 이 애플리케이션 GitOps 저장소에는 플랫폼 매니페스트를 포함하지 않는다. Istio ingress를 포함한 애드온은 별도 `platform-addons` 저장소 또는 설치 스크립트에서 관리한다. 애플리케이션 저장소에는 앱 동작에 직접 속한 HPA와 KEDA ScaledObject만 포함한다.

## Argo CD 적용 순서

현재 EKS에는 Argo CD `Application/AppProject` CRD가 확인되지 않았다. Argo CD를 먼저 설치하고 `dir-argocd-ns`를 준비한 뒤 아래 파일을 적용한다. 애플리케이션 Kustomize 리소스는 EKS server-side dry-run을 통과했지만 Argo CR 두 개는 CRD 설치 후 다시 dry-run해야 한다.


AppProject와 신규 AI Application은 기존 Application이 자기 자신을 관리하지 않으므로 최초 1회 관리자가 적용한다.

```bash
kubectl --context dir-eks apply --dry-run=server -f argocd/projects/dai-run-prod.yaml
kubectl --context dir-eks apply -f argocd/projects/dai-run-prod.yaml

kubectl --context dir-eks apply --dry-run=server -f argocd/applications/dai-run-prod-ai.yaml
kubectl --context dir-eks apply -f argocd/applications/dai-run-prod-ai.yaml
```

그 후 backend/frontend Application을 refresh/sync한다. 처음에는 diff를 검토한 뒤 sync하는 것을 권장한다.

## Waypoint 제거 주의

Argo CD Application의 `prune`이 `false`이므로 Git에서 waypoint 파일을 삭제해도 다른 클러스터에 이미 존재하는 waypoint는 자동 삭제되지 않는다.

```bash
kubectl --context dir-eks -n dir-backend-ns delete deployment,service dir-backend-waypoint --ignore-not-found
kubectl --context dir-eks label namespace dir-backend-ns istio.io/use-waypoint-
```

현재 EKS 이관 대상에서는 backend waypoint를 사용하지 않는다.

## HPA와 KEDA

- 일반 API/AI/Frontend HPA: `minReplicas: 1`
- KEDA Consumer: 현재 운영 설정을 따라 `minReplicaCount: 0`
- Marathon: `maxReplicas: 3`
- AI Assistant: CPU 70%와 메모리 80%

KEDA가 생성하는 HPA는 Git에 직접 넣지 않았다. GitOps에서는 ScaledObject만 관리한다.

## 검증

```bash
./scripts/validate-eks-prod.sh
kubectl --context dir-eks diff -k environments/prod/backend
kubectl --context dir-eks diff -k environments/prod/frontend
kubectl --context dir-eks diff -k environments/prod/ai
```

`kubectl diff`에는 ConfigMap/Secret과 현재 장애 상태가 별도로 나타날 수 있으므로 자동 sync 전에 반드시 검토한다.
