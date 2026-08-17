---
name: k8s-deploy
description: Validates and deploys DAI RUN Kubernetes manifests to an explicitly specified environment.
argument-hint: "[dev|staging|production] [service or all]"
disable-model-invocation: true
---

# DAI RUN Kubernetes Deployment

Requested target:

$ARGUMENTS

## Safety rules

- Never infer the production environment.
- Never deploy without an explicit environment argument.
- Never print or expose Secret values.
- Never delete namespaces, PVCs, databases, or CRDs automatically.
- Never modify production data.
- Stop when the current Kubernetes context does not match the requested environment.
- Prefer GitOps through Argo CD when the repository is configured for it.

## Pre-deployment checks

1. Show the current Kubernetes context.
2. Confirm namespace and target service.
3. Inspect changed manifests.
4. Validate YAML.
5. Run Helm template or Kustomize build when applicable.
6. Run server-side dry-run when available.
7. Run `kubectl diff`.
8. Check image tag existence in Harbor.
9. Check resource requests and limits.
10. Check readiness and liveness probes.
11. Check ServiceAccount, RBAC, NetworkPolicy, and Secret references.
12. Check database migration compatibility.

## Deployment

Use the repository's existing deployment method.

Priority:

1. Argo CD sync through the established GitOps workflow
2. Existing Helm release process
3. Existing Kustomize process
4. Direct kubectl apply only when the project already uses it

Do not invent a new deployment method.

## Post-deployment verification

Verify:

- Deployment rollout status
- desired and available replicas
- Pod readiness
- Pod restart count
- Service endpoints
- Ingress or Gateway routing
- recent application errors
- Prometheus target health
- relevant API health endpoint
- database migration result

## Failure handling

When rollout fails:

1. Stop further rollout.
2. Capture events and relevant logs.
3. Identify whether the failure is image, configuration, Secret,
   probe, resource, network, or migration related.
4. Present a rollback plan.
5. Do not perform rollback without explicit approval unless the
   repository's documented process explicitly requires automatic rollback.

## Completion report

Report:

- environment
- Kubernetes context
- deployed service and image tag
- validation results
- rollout results
- health-check results
- detected risks
- rollback status
