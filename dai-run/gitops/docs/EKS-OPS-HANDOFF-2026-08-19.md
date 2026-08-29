# 2026-08-19 EKS 운영 인수인계 — 코드/매니페스트 push 이후 라이브에서 해야 할 일

기준일: 2026-08-19
대상: `dir-main-eks`, AWS 계정 `970307871446`, 리전 `ap-northeast-2`

이 문서는 오늘 `dai-run/application`과 `dai-run/gitops`에 커밋한 내용이 실제로 라이브에 반영되고 정상 동작하려면 **운영서버(EKS)에서 추가로 손대야 하는 것**만 모았다. 코드/매니페스트 자체는 이미 커밋했고(브랜치/커밋 목록은 맨 아래), git push는 GitLab 연결이 끊긴 상태라 별도로 진행해야 한다 — push 전이라면 아래 항목 대부분이 아직 라이브에 없다.

## 0. 전제 조건 — 커밋된 것들을 먼저 push

GitLab(`127.0.0.1:8081`) 연결이 이 세션 후반부 내내 끊겨 있었다. 연결되면:

```bash
cd dai-run-aws && git push origin main
cd dai-run-gitops && git push origin main
```

application 쪽은 지금까지의 세션 패턴상 feature/fix 브랜치 + MR 리뷰가 정상 흐름이지만, 이번엔 이미 로컬 `main`에 여러 커밋이 쌓여 있다(아래 "커밋 목록" 참고) — 그대로 push할지, 브랜치로 쪼갤지는 리뷰 방식에 맞춰 판단 필요.

## 1. 이미지 재빌드 필요 (application push 이후)

다음 서비스는 코드가 바뀌었으므로 CI가 새 이미지를 ECR에 push하고 gitops의 digest가 갱신돼야 한다(또는 CI가 여전히 안 돌면 `dir-environment-dynamodb-consumer` 때처럼 수동 build+push로 부트스트랩):

- `dir-crew` (`dai-run/crew-service`) — MongoDB→DynamoDB 마이그레이션
- `dir-shoe-life-ai` (`dai-run/ai-shoe-life`) — 버킷 env var 별칭 추가
- frontend(`dai-run/frontend`) — `AiRecoPanel.tsx` 3개 동시 표시

```bash
# 파이프라인이 여전히 안 도는지 먼저 확인
aws ecr describe-images --profile dairun --region ap-northeast-2 \
  --repository-name dai-run/crew-service --query "imageDetails[-1].{tag:imageTags,pushed:imagePushedAt}"
```

## 2. NetworkPolicy — gitops sync 확인 + 필요시 즉시 반영

오늘 gitops에 커밋한 NetworkPolicy 3건은 ArgoCD가 자동 sync하지만(`dai-run-prod-backend` Application의 `automated.enabled: true`), 확인이 필요하다:

```bash
kubectl get networkpolicy dir-backend-baseline dir-crew-dynamodb-egress dir-environment-dynamodb-consumer-egress -n dir-backend-ns
```

급하면 sync를 기다리지 않고 바로 적용 가능(파일이 실제 라이브 스펙과 100% 동일하므로 충돌 없음):

```bash
kubectl apply -f dai-run-gitops/environments/prod/backend/networkpolicy-backend-baseline.yaml
kubectl apply -f dai-run-gitops/environments/prod/backend/networkpolicy-dir-crew-dynamodb-egress.yaml
kubectl apply -f dai-run-gitops/environments/prod/ai/networkpolicys.yaml
```

**`dir-backend-baseline`이 이번에 처음 git 추적을 시작한 리소스**라는 점 주의 — ArgoCD가 이 리소스의 소유권을 가져가면서 예상 못한 필드 정리(prune)가 발생하는지 첫 sync 때 한 번 확인 권장.

## 3. crew-service 배포 확인

새 이미지가 뜨면:

```bash
kubectl -n dir-backend-ns rollout status deployment/dir-crew
kubectl -n dir-backend-ns logs deploy/dir-crew --tail=50 | grep -iE "error|dynamodb"
```

`ECONNREFUSED ::1:27017` 같은 로그가 더는 안 나오는지, 실제 채팅 GET/POST가 되는지 확인.

## 4. shoe-service — 재시작만 하면 되는 것 (이미지 재빌드 불필요)

`configmap-dir-shoe-config.yaml`의 `SHOE_LIFE_AI_SERVICE_URL`은 **이미 올바른 값**(`...svc.cluster.local:8204`)으로 gitops에 들어가 있는데, 라이브 Pod가 그 수정 이전에 뜬 채로 재시작이 안 돼서 옛날 값(`...svc.dir-cluster:8204`)을 계속 물고 있다. 코드/이미지 변경 없이 **롤아웃 재시작만** 하면 된다.

```bash
kubectl -n dir-backend-ns rollout restart deployment/dir-shoe
kubectl -n dir-backend-ns rollout status deployment/dir-shoe
```

## 5. shoe-life-ai — ConfigMap에 키 2개 추가 필요

`configmap-dir-shoe-life-ai-config.yaml`에 다음이 없다:

- `PERSIST_ANALYSIS_RESULTS: "true"` — 없으면 기본값 `false`라 사진 저장 자체가 아예 안 됨(`app.py`의 `persistence_enabled()`)
- `BEDROCK_MODEL_ID` — 아예 없어서 분석 요청이 AWS 호출 전에 무조건 실패

값 자체(어떤 Bedrock 모델을 쓸지)는 코드/인프라 담당자 확인 필요 — 다른 두 AI 서비스가 쓰는 모델(§6)과 통일할지, Vision 특화 모델을 쓸지 결정 필요.

```bash
kubectl -n dir-backend-ns edit configmap dir-shoe-life-ai-config
# 또는 dai-run-gitops/environments/prod/backend/configmap-dir-shoe-life-ai-config.yaml 수정 후 커밋
```

수정 후:

```bash
kubectl -n dir-backend-ns rollout restart deployment/dir-shoe-life-ai
```

버킷(§0 코드 수정으로 이미 `SHOE_LIFE_BUCKET_NAME`도 인식하게 해뒀지만) 최종 확인:

```bash
kubectl -n dir-backend-ns exec deploy/dir-shoe-life-ai -- curl -s localhost:8204/health | python3 -m json.tool
# object_storage_configured, bedrock_model_configured 둘 다 true여야 함
```

## 6. AI 서비스 IAM — Pod Identity role 신규 생성 (챗봇/코스추천)

`dir-ai-assistant-sa`, `dir-course-recommendation-sa`는 IAM role 자체가 없다(`aws iam get-role` → `NoSuchEntity`). 오늘 `dir-environment-dynamodb-consumer-sa`에 했던 것과 **완전히 같은 패턴**으로 만들면 된다:

```bash
TRUST_POLICY='{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "pods.eks.amazonaws.com" },
    "Action": ["sts:AssumeRole", "sts:TagSession"]
  }]
}'

for SA in dir-ai-assistant-sa dir-course-recommendation-sa; do
  aws iam create-role --profile dairun --role-name "$SA" \
    --assume-role-policy-document "$TRUST_POLICY"
  aws iam put-role-policy --profile dairun --role-name "$SA" \
    --policy-name "${SA%-sa}-bedrock" \
    --policy-document '{
      "Version": "2012-10-17",
      "Statement": [{
        "Effect": "Allow",
        "Action": ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
        "Resource": "*"
      }]
    }'
  aws eks create-pod-identity-association --profile dairun --region ap-northeast-2 \
    --cluster-name dir-main-eks --namespace dir-ai-ns \
    --service-account "$SA" --role-arn "arn:aws:iam::970307871446:role/$SA"
done
```

`ai-rag-service`(챗봇)가 Knowledge Base `Retrieve`도 쓰면 `bedrock:Retrieve`/`bedrock:RetrieveAndGenerate`도 정책에 추가하고, 실제 KB ID로 `Resource`를 좁히는 걸 권장(여기선 `"*"`로 최소 예시만 둠 — 다른 서비스들처럼 리소스 스코프를 좁혀서 최소권한 원칙 지키기).

`dir-shoe-life-ai-sa`는 role은 있지만 S3 정책만 있고 Bedrock 권한이 없다 — 기존 role에 정책만 추가:

```bash
aws iam put-role-policy --profile dairun --role-name dir-shoe-life-ai-sa \
  --policy-name dir-shoe-life-ai-bedrock \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Action": ["bedrock:InvokeModel"],
      "Resource": "*"
    }]
  }'
```

## 7. course-recommendation — 잘못된 계정 ARN

`configmap-dir-course-recommendation-config.yaml`의 `BEDROCK_MODEL_ID`가 계정 `311233338510`(우리 계정 아님)의 inference-profile ARN을 가리키고 있다. 우리 계정(`970307871446`)에서 실제 쓸 수 있는 모델/inference-profile ARN으로 교체 필요 — 어떤 모델을 쓸지는 확인 후 결정.

```bash
aws bedrock list-inference-profiles --profile dairun --region ap-northeast-2 --query "inferenceProfileSummaries[].inferenceProfileArn"
```

## 8. Bedrock VPC Endpoint (Terraform, §6·7과 함께 필요)

IAM만 고쳐도 VPC에 Bedrock Endpoint가 없으면 나갈 길이 없다. 아래 리소스 2개면 된다 — 기존 VPC/Subnet/SecurityGroup은 새로 만들지 않고 `data` 소스로 조회만 한다(전부 2026-08-19에 `aws ec2 describe-*`로 실제 계정에서 확인한 ID).

**실제 운영 Terraform 소스가 따로 있다면 이 두 `resource` 블록만 그 소스로 옮겨서 그쪽 state로 apply하는 걸 강력히 권장한다.** 아래처럼 standalone state로 그대로 apply하면 나중에 진짜 소스에 같은 리소스를 또 선언할 때 `EndpointAlreadyExists` 충돌이나 `terraform import`가 필요해진다.

```hcl
# main.tf
terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = "ap-northeast-2"
}

data "aws_vpc" "main" {
  id = "vpc-0ba44b1ba6a8c0446"
}

data "aws_security_group" "endpoints" {
  id = "sg-0422984f710c6a64f" # dir-main-endpoint-sg — 이미 sqs/sns/ecr 등 다른 interface endpoint가 쓰는 것
}

locals {
  endpoint_subnet_ids = [
    "subnet-04644407feeb578f3",
    "subnet-07c5270c5e81b6069",
  ]
}

resource "aws_vpc_endpoint" "bedrock_runtime" {
  vpc_id              = data.aws_vpc.main.id
  service_name        = "com.amazonaws.ap-northeast-2.bedrock-runtime"
  vpc_endpoint_type   = "Interface"
  private_dns_enabled = true
  subnet_ids          = local.endpoint_subnet_ids
  security_group_ids  = [data.aws_security_group.endpoints.id]
  tags = { Name = "dir-main-vpce-bedrock-runtime" }
}

resource "aws_vpc_endpoint" "bedrock_agent_runtime" {
  vpc_id              = data.aws_vpc.main.id
  service_name        = "com.amazonaws.ap-northeast-2.bedrock-agent-runtime"
  vpc_endpoint_type   = "Interface"
  private_dns_enabled = true
  subnet_ids          = local.endpoint_subnet_ids
  security_group_ids  = [data.aws_security_group.endpoints.id]
  tags = { Name = "dir-main-vpce-bedrock-agent-runtime" }
}
```

`dir-main-endpoint-sg`는 이미 VPC 전체 CIDR에서 443을 열어두고 있어서 별도 인바운드 규칙 추가는 필요 없다.

적용 후 확인:

```bash
aws ec2 describe-vpc-endpoints --region ap-northeast-2 \
  --filters "Name=vpc-id,Values=vpc-0ba44b1ba6a8c0446" "Name=service-name,Values=*bedrock*" \
  --query "VpcEndpoints[].{Service:ServiceName,State:State}"
```

Endpoint 생성 후, 실제 ENI IP로 `dir-ai-ns`에 Bedrock 전용 egress NetworkPolicy 추가 필요(다른 서비스들의 `<service>-sqs-egress` 패턴과 동일 — ENI IP는 Endpoint가 실제로 생기기 전엔 알 수 없어서 지금은 못 만들어둠).

## 9. 확인 순서 요약

1. git push (application, gitops) — §0
2. NetworkPolicy 3건 sync 확인 — §2
3. CI가 새 이미지 push했는지 확인, 안 되면 수동 build+push — §1
4. `dir-crew` 배포/로그 확인 — §3
5. `dir-shoe` 롤아웃 재시작 — §4
6. `dir-shoe-life-ai` configmap 키 추가 + 재시작 — §5
7. Bedrock VPC Endpoint apply — §8
8. `dir-ai-assistant-sa`/`dir-course-recommendation-sa` IAM role 신규 생성, `dir-shoe-life-ai-sa`에 Bedrock 정책 추가 — §6
9. `course-recommendation`의 `BEDROCK_MODEL_ID` 계정 ARN 수정 — §7
10. 세 AI 서비스 모두 재시작 후 실제 채팅/코스추천/러닝화분석 동작 확인

## 오늘 커밋된 것들 (push 대기 중)

**`dai-run-aws`** (main, 로컬):
- `b3492c6` — AI 추천 코스 3개 동시 표시 (`components/AiRecoPanel.tsx`)
- `8f05096` — crew 채팅 MongoDB→DynamoDB (`services-msa/crew-service/`)
- `3105216` — shoe-life-ai 버킷 env var 별칭 (`ai/ai-shoe-life/app.py`)
- (이전 세션) `ci/services.tsv` environment-dynamodb-consumer 등록 + ECR repo명 수정 — 이미 push/merge됨

**`dai-run-gitops`** (main, 로컬):
- `c065a0d` — DNS 근본 원인 수정 (`dir-backend-baseline` 신규 추적, `dir-ai-baseline` 등)
- `9bae5da` — DNS 인시던트 문서 최종화
- `c064b48` — `dir-crew` DynamoDB egress NetworkPolicy
- (이전 세션) `environment-dynamodb-consumer` 부트스트랩 매니페스트 전체 — 이미 push됨
