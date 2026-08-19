# 2026-08-19 dir-main-eks 외부 DNS 조회 불가 — 문제 분석 및 해결

기준일: 2026-08-19
대상: `dir-main-eks`, VPC `vpc-0ba44b1ba6a8c0446`, AWS 계정 `970307871446`, 리전 `ap-northeast-2`
상태: **DNS 문제 자체는 원인 확인 및 해결 완료(이 저장소 commit `c065a0d`).** Bedrock 연결은 별도 Terraform 작업 필요(미완료, 아래 참고).

## 요약

| 문제 | 원인 | 고치는 곳 | 상태 |
|---|---|---|---|
| 클러스터 전체 외부 DNS 조회 불가 | NetworkPolicy가 실제 kube-dns Service IP를 안 열어둠 | **Kubernetes 매니페스트** (이 gitops 저장소) | ✅ 완료 |
| Bedrock(챗봇/코스추천/러닝화AI) 연결 불가 | VPC에 Bedrock용 Endpoint가 없음 | **Terraform** (`dai-run-terraform-helm-added`) | ⏳ 코드는 대부분 있음, apply 필요 |

**애플리케이션 코드는 이번 두 문제 어느 쪽과도 무관하다.** `dai-run-aws`에서 고칠 게 없다.

## 문제 상황 분석

### 발견 경위

`dir-environment-dynamodb-consumer` 신규 배포 중 DynamoDB Scan이 계속 credential/DNS 에러로 실패해 추적하다가, 이 서비스 하나만의 문제가 아니라 **클러스터 전체가 `*.cluster.local` 밖의 도메인을 하나도 못 푸는 상태**라는 걸 발견했다.

### 증상

- `dir-backend-ns`, `dir-ai-ns`의 어떤 Pod에서든 외부 도메인(`dynamodb.ap-northeast-2.amazonaws.com`, `www.google.com` 등 AWS와 무관한 도메인 포함)은 전부 DNS 타임아웃.
- `*.svc.cluster.local` 내부 이름은 정상적으로 즉시 해석됨.
- CoreDNS Pod는 `1/1 Running`, 재시작 0회, 로그에 에러 없음 — 겉보기엔 멀쩡함(`INCIDENT-2026-08-18-db-connectivity.md`와 같은 패턴: liveness/readiness가 실제 기능 이상을 못 잡아냄).

### 진단 과정 (배제한 원인들)

다음은 전부 확인했고 문제 없었다:

- Security Group(`sg-0787e59e29b8b1d39`): egress 전체 허용
- NACL: inbound/outbound 기본 allow만 존재
- VPC 속성: `enableDnsSupport`/`enableDnsHostnames` 둘 다 `true`
- Route 53 Resolver DNS Firewall / 커스텀 Resolver Rule: 없음(기본 System Rule만 존재)
- kube-system(CoreDNS가 있는 namespace)엔 NetworkPolicy 자체가 없음
- VPC Flow Logs: 확인해봤지만 애초에 **AWS 예약 DNS 주소(`10.10.0.2`) 관련 트래픽은 하이퍼바이저 레벨에서 처리돼 Flow Log에 안 잡히는 게 정상**이라 여기선 단서를 못 얻음
- NAT Gateway가 VPC에 없는 것: 팀에서 확인 — **의도된 폐쇄망 설계**, 버그 아님. 외부 연결은 VPC Endpoint로 하는 구조이고, 실제로 S3/DynamoDB(Gateway) + EC2/STS/ECR/SQS/SNS/SecretsManager/SES/SSM 등(Interface, 전부 Private DNS 활성화) Endpoint가 이미 잘 갖춰져 있었음

### 근본 원인 (확정)

세 단계 비교 테스트로 좁혔다:

1. **노드 자체(hostNetwork Pod)에서 `10.10.0.2`로 질의** → 즉시 성공. VPC 예약 리졸버 자체는 멀쩡함(폐쇄망이어도 이 주소는 하이퍼바이저가 직접 응답하므로 NAT 불필요, 정상 동작).
2. **NetworkPolicy가 없는 namespace(`kube-system`)의 일반 Pod에서 `10.10.0.2`로 질의** → 즉시 성공. Pod 네트워킹/CNI 자체도 멀쩡함.
3. **같은 `kube-system` Pod가 CoreDNS Service(`172.20.0.10`)를 거쳐 외부 이름 조회** → 성공. **`dir-backend-ns`의 일반 Pod가 똑같이 `172.20.0.10`으로 조회** → 타임아웃.

같은 목적지, 같은 질의인데 namespace만 다른데 결과가 갈렸다 — **NetworkPolicy 문제로 확정.**

`dir-backend-baseline`(`dir-backend-ns` 전체에 적용)과 `dir-ai-baseline`(`dir-ai-ns`의 AI 서비스들에 적용)의 DNS egress 규칙이 **`169.254.25.10/32`(NodeLocal DNSCache 표준 주소)만 허용**하고 있었다. 그런데 **이 클러스터엔 NodeLocal DNSCache가 애초에 배포돼 있지 않다**(해당 DaemonSet이 존재하지 않음). 실제로 모든 Pod의 `/etc/resolv.conf`는 `172.20.0.10`(진짜 kube-dns Service ClusterIP)을 가리키는데, 이 주소가 두 baseline 정책 어디에도 없었던 것.

내부(`cluster.local`) 조회가 그동안 되던 이유: CoreDNS가 이런 이름은 자기 zone에서 **로컬로 즉시 답변**하기 때문에, 클라이언트→CoreDNS 첫 홉만 어떤 식으로든 허용되면 끝난다(AWS VPC CNI가 DNS 첫 홉엔 암묵적 관용을 두는 것으로 보임). 반면 `cluster.local`이 아닌 이름은 CoreDNS가 업스트림으로 **forward**해야 하는데, 이 왕복 전체가 성립하려면 클라이언트 Pod 자신의 egress가 실제 목적지(`172.20.0.10`)에 대해 허용돼 있어야 했고, 그게 빠져 있었다.

**검증**: 임시 NetworkPolicy로 `172.20.0.10/32`를 추가 허용하자 `dir-backend-ns`의 기존 Pod에서 `www.google.com`이 즉시 풀렸다. 이후 정식 수정을 커밋하고 임시 리소스는 정리했다.

## 해결 방법

### A. DNS 문제 — Kubernetes NetworkPolicy (완료)

**Terraform도, 애플리케이션 코드도 아니고, 순수 K8s 매니페스트(이 gitops 저장소) 문제였다.**

- `environments/prod/backend/networkpolicy-backend-baseline.yaml`(신규): `dir-backend-baseline`이 이 저장소에 **한 번도 git으로 추적된 적이 없었음**(다른 서비스들의 ServiceAccount처럼 `kubectl apply`로만 존재하던 리소스) — 라이브 스펙 그대로 가져와 처음으로 커밋하면서 DNS 규칙에 `172.20.0.10/32` 추가.
- `environments/prod/ai/networkpolicys.yaml`: `dir-ai-baseline`과 istio-waypoint용 정책 2곳에 동일하게 `172.20.0.10/32` 추가.
- `environments/prod/backend/kustomization.yaml`: 신규 파일 등록.
- Commit `c065a0d`, main에 push 완료. ArgoCD가 sync하면 자동 반영됨(수동 조치 불필요).

이 수정만으로 `dir-environment-dynamodb-consumer`의 DynamoDB 접근, 그리고 이론상 SQS/SNS/SecretsManager 등 이미 Endpoint가 있는 다른 backend/AI 서비스들의 외부 연결도 함께 풀린다.

### B. Bedrock 연결 — Terraform (미완료, 팀 조치 필요)

`dir-ai-assistant`/`dir-course-recommendation`/`dir-shoe-life-ai`가 Bedrock을 호출하려면 IAM(별도 조사에서 이미 확인된 문제: role 누락/권한 부족/모델 ARN이 다른 계정을 가리킴)과 별개로, **VPC에 Bedrock용 Interface Endpoint가 없다.** 폐쇄망(NAT 없음) 구조이므로 이건 선택이 아니라 필수다.

확인해보니 `dai-run-terraform-helm-added/terraform/variables.tf`의 `project_interface_endpoints`에 **`bedrock-runtime`이 이미 목록에 있다** — 즉 누군가 이미 이 필요성을 인지하고 코드에 넣어뒀지만, 실제 AWS 계정엔 반영이 안 된 상태(`aws ec2 describe-vpc-endpoints`로 확인, bedrock 관련 Endpoint 0개). 이 로컬 terraform 디렉터리 자체가 실제 배포 state와 연결된 backend가 없어서(`backend.s3.tf.example`만 있고 `backend.tf`는 없음), 코드에 있는 내용이 실제로 apply됐는지 이 자리에서 확신할 수 없다 — **먼저 올바른 state backend에 연결해서 `terraform plan`으로 현재 실제 상태와 코드의 차이(bedrock 포함, 다른 항목들도)를 확인한 뒤 apply해야 한다.**

추가로 필요한 것: `ai-rag-service`는 Bedrock **Knowledge Base**(Retrieve) API도 쓰는데, 현재 목록엔 `bedrock-runtime`만 있고 `bedrock-agent-runtime`이 없다. KB 조회 경로까지 살리려면 이것도 추가해야 한다.

```diff
 variable "project_interface_endpoints" {
   description = "Additional interface endpoints used by DAI RUN workloads"
   type        = set(string)
   default = [
     "bedrock-runtime",
+    "bedrock-agent-runtime",
     "kms",
     "monitoring",
     "secretsmanager",
     "sns",
     "sqs",
     "xray"
   ]
 }
```

Endpoint가 생긴 뒤에는 `dir-ai-ns`의 NetworkPolicy(`dir-ai-baseline` 등)에 해당 Endpoint ENI로의 egress 허용도 필요할 수 있다(다른 서비스들이 `<service>-sqs-egress` 식으로 전용 정책을 갖고 있는 것과 같은 패턴 — Bedrock 전용 egress 정책 신설을 검토).

## Terraform이냐 코드냐 — 정리

- **DNS 문제(오늘의 핵심 장애)**: 둘 다 아니고 **Kubernetes NetworkPolicy**. 이미 고쳤다(위 A).
- **Bedrock 연결**: **Terraform**. VPC Endpoint는 실제 AWS 리소스(ENI, Route 53 private hosted zone)라서 애플리케이션 코드나 K8s 매니페스트로는 만들 수 없다. 코드 초안은 이미 있고(`bedrock-runtime`), `bedrock-agent-runtime` 추가 + 실제 backend 연결 + apply만 남았다.
- **애플리케이션 코드(`dai-run-aws`)**: 이번 두 문제 어느 쪽도 코드 수정 대상이 아니다. (단, 별도로 진행 중인 crew 채팅 MongoDB→DynamoDB 마이그레이션이나 AI 서비스들의 IAM/모델 ARN 수정은 각각 코드/IAM 쪽 작업이 맞다 — 이건 이 DNS/Endpoint 이슈와는 완전히 별개 트랙.)

## 재현/검증 방법

```bash
aws eks update-kubeconfig --name dir-main-eks --region ap-northeast-2 --profile dairun

# 수정 전엔 타임아웃, ArgoCD sync 후엔 정상 응답이어야 함
kubectl exec -n dir-backend-ns <아무-pod> -- nslookup www.google.com
```

## 참고 — 오늘 함께 발견한 관련 이슈 (원인은 다름)

`dir-environment-dynamodb-consumer`는 이 DNS 문제 이전에 **자기 전용 NetworkPolicy 자체가 없어서** Pod Identity 자격증명 엔드포인트(`169.254.170.23:80`)에도 못 갔던 별도 문제가 있었다 — 이미 조치 완료(`networkpolicy-dir-environment-dynamodb-consumer-egress.yaml`, 다른 backend consumer들의 `<service>-sqs-egress` 패턴과 동일).
