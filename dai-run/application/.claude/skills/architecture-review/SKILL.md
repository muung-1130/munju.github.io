---
name: architecture-review
description: Reviews a DAI RUN feature or design for MSA boundaries, data ownership, coupling, scalability, security, observability, and on-premise to AWS portability.
argument-hint: "[design or feature to review]"
---

# DAI RUN Architecture Review

Review target:

$ARGUMENTS

## Review dimensions

### Domain ownership
- Which service owns the business rule?
- Which service owns the data?
- Is another service's database accessed directly?
- Is this truly an independent service or only an internal module?

### Communication
- Should communication be synchronous REST, WebSocket, or Kafka?
- Is eventual consistency acceptable?
- Are timeouts, retries, circuit breakers, and idempotency required?

### Data
- Is PostgreSQL the source of truth?
- Is Redis only temporary?
- Can Elasticsearch be rebuilt?
- Are media objects separated from metadata?
- Is PostGIS being used correctly?

### Scalability
- Is the workload request-based, queue-based, or scheduled?
- Should it use HPA or KEDA?
- Can it scale independently?
- What is the bottleneck: CPU, memory, database, network, or external API?

### Security
- Authentication and authorization
- health and GPS data minimization
- secret handling
- ServiceAccount and RBAC
- NetworkPolicy
- upload validation
- rate limiting

### Portability
- Does the design work in Docker and on-premise Kubernetes?
- Is AWS-specific logic hidden behind an adapter?
- Can MinIO be replaced by S3 without domain changes?

### Observability
- Required metrics
- structured logs
- trace boundaries
- alert conditions
- business KPIs

## Output format

Return a table containing:

| Area | Current design | Risk | Recommendation | Priority |

Then provide:

- recommended owning service
- proposed API or event flow
- database ownership
- deployment unit
- immediate MVP decision
- later production improvement
