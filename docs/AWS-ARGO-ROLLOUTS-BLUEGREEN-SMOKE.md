# AWS Argo Rollouts Blue/Green smoke test

## Scope

This package creates an isolated shadow Rollout in `dir-gitops-test-ns` on
`dir-main-eks`. It does not modify production Deployments, Services,
HTTPRoutes, or user traffic.

The smoke workload reuses the already running `dairun/application` image and
pins it by ECR digest. The active and preview Services are internal
`ClusterIP` Services.

## Bootstrap order

1. Merge this change to `main`.
2. Apply `argocd/projects/dai-run-dev.yaml` to allow the `Rollout` resource.
3. Apply `argocd/applications/dai-run-rollouts-smoke.yaml` to the AWS Argo CD
   namespace.
4. Refresh and manually sync `dai-run-rollouts-smoke`.
5. Confirm the initial Rollout, ReplicaSet, Pods, and both Services are healthy.

## Blue/Green transition test

For a later repeat test, change only
`spec.template.metadata.annotations.dairun.io/smoke-revision` from
`baseline-2` to a new value such as `baseline-3`. This creates a new preview
ReplicaSet without changing the application binary.

Verify that:

- the active Service still selects the stable ReplicaSet;
- the preview Service selects the new ReplicaSet;
- both Service endpoints return HTTP success;
- the Rollout pauses before promotion;
- promotion changes only the active Service selector;
- the previous ReplicaSet scales down after the configured delay.

## Verified result (2026-08-19)

- Initial stable hash: `558d77bf7f`
- Preview and promoted hash: `6bd4df7696`
- Active and preview HTTP checks: `200`
- Manual promotion: succeeded
- Active Service selector changed only after promotion
- Previous ReplicaSet scaled from 2 to 0 after the 30-second delay
- Final Rollout state: `Healthy`, 2 Ready Pods, no Warning events

## Rollback

Before production services use Argo Rollouts, rollback is limited to this
isolated test package. Abort an unpromoted preview and keep the active Service
on the stable ReplicaSet. To remove the smoke test later, delete the Argo
Application with an explicitly reviewed foreground cascade or delete its
namespaced resources first, then remove the bootstrap Application and Project
allow-list entry in a separate MR.

Never delete the cluster-wide Argo Rollouts CRDs while any `Rollout` resource
exists.
