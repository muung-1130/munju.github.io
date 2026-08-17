# D.A.I. RUN AI Service

Spring Boot service for testing Amazon Bedrock Knowledge Base RAG calls.

## Required Environment

```bash
AWS_REGION=ap-northeast-2
BEDROCK_KNOWLEDGE_BASE_ID=CPDWCKU24Y
BEDROCK_MODEL_ARN=arn:aws:bedrock:ap-northeast-2:311233338510:inference-profile/global.anthropic.claude-haiku-4-5-20251001-v1:0
```

AWS credentials are loaded through the AWS SDK default credentials chain.
Use AWS CLI credentials locally, and an IAM role such as IRSA or Pod Identity in Kubernetes.

## Run

```bash
gradle bootRun
```

## Test

```bash
curl -X POST http://localhost:8080/api/v1/ai/chat \
  -H "Content-Type: application/json" \
  -d "{\"question\":\"LSD 훈련의 목적과 진행 방법을 알려줘\"}"
```
