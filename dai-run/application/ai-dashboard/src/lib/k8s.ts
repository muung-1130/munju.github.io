import { KubeConfig, AutoscalingV2Api, CustomObjectsApi } from "@kubernetes/client-node";

/**
 * Read-only cluster access for dir-ai-dashboard-sa. The RBAC grant behind
 * this (ClusterRole dir-ai-dashboard-read) covers exactly three resource
 * types — HPA, ScaledObject, ArgoCD Application — get/list/watch only, in
 * the namespaces this dashboard actually reads from. Anything else 403s.
 */

let kc: KubeConfig | null = null;

function getKubeConfig(): KubeConfig | null {
  if (kc) return kc;
  try {
    const c = new KubeConfig();
    c.loadFromCluster();
    kc = c;
    return kc;
  } catch {
    // Not running in-cluster (e.g. local dev) — callers fall back to mock data.
    return null;
  }
}

/**
 * Maps dashboard service ids to the real HPA backing them. Two services
 * (Community Feed, Payment Gateway) have no real K8s counterpart yet and
 * stay simulated — same gap noted in live.ts's LIVE_CONTAINER_MAP.
 */
export const LIVE_HPA_MAP: Record<string, { namespace: string; name: string }> = {
  "dir-marathon": { namespace: "dir-backend-ns", name: "dir-marathon-hpa" },
  "dir-running-record": { namespace: "dir-backend-ns", name: "dir-running-record-hpa" },
  "dir-ai-assistant": { namespace: "dir-ai-ns", name: "dir-ai-assistant-hpa" },
  "dir-course-recommendation-ai": { namespace: "dir-ai-ns", name: "dir-course-recommendation-hpa" },
  "dir-crew": { namespace: "dir-backend-ns", name: "dir-crew-hpa" },
  "dir-notification": { namespace: "dir-backend-ns", name: "dir-notification-hpa" },
};

export async function getLiveHpaStatus(serviceId: string): Promise<HpaStatus | null> {
  const ref = LIVE_HPA_MAP[serviceId];
  if (!ref) return null;
  return getHpaStatus(ref.namespace, ref.name);
}

export type HpaStatus = {
  currentReplicas: number;
  desiredReplicas: number;
  minReplicas: number;
  maxReplicas: number;
};

export async function getHpaStatus(namespace: string, name: string): Promise<HpaStatus | null> {
  const config = getKubeConfig();
  if (!config) return null;
  try {
    const api = config.makeApiClient(AutoscalingV2Api);
    const hpa = await api.readNamespacedHorizontalPodAutoscaler({ name, namespace });
    const status = hpa.status;
    const spec = hpa.spec;
    if (!status || !spec) return null;
    return {
      currentReplicas: status.currentReplicas ?? 0,
      desiredReplicas: status.desiredReplicas ?? status.currentReplicas ?? 0,
      minReplicas: spec.minReplicas ?? 1,
      maxReplicas: spec.maxReplicas,
    };
  } catch {
    return null;
  }
}

export type ScaledObjectStatus = {
  active: boolean;
  originalReplicas: number | null;
};

export async function getScaledObjectStatus(namespace: string, name: string): Promise<ScaledObjectStatus | null> {
  const config = getKubeConfig();
  if (!config) return null;
  try {
    const api = config.makeApiClient(CustomObjectsApi);
    const res = (await api.getNamespacedCustomObject({
      group: "keda.sh",
      version: "v1alpha1",
      namespace,
      plural: "scaledobjects",
      name,
    })) as { status?: { conditions?: { type: string; status: string }[]; originalReplicaCount?: number } };
    const conditions = res.status?.conditions ?? [];
    const activeCondition = conditions.find((c) => c.type === "Active");
    return {
      active: activeCondition?.status === "True",
      originalReplicas: res.status?.originalReplicaCount ?? null,
    };
  } catch {
    return null;
  }
}

export type ArgoAppSyncHistoryEntry = {
  revision: string;
  deployedAt: string;
  deployStartedAt: string;
};

export type ArgoAppStatus = {
  syncStatus: string;
  healthStatus: string;
  history: ArgoAppSyncHistoryEntry[];
};

export async function getArgoAppStatus(namespace: string, name: string): Promise<ArgoAppStatus | null> {
  const config = getKubeConfig();
  if (!config) return null;
  try {
    const api = config.makeApiClient(CustomObjectsApi);
    const res = (await api.getNamespacedCustomObject({
      group: "argoproj.io",
      version: "v1alpha1",
      namespace,
      plural: "applications",
      name,
    })) as {
      status?: {
        sync?: { status?: string };
        health?: { status?: string };
        history?: { revision?: string; deployedAt?: string; deployStartedAt?: string }[];
      };
    };
    const status = res.status;
    if (!status) return null;
    return {
      syncStatus: status.sync?.status ?? "Unknown",
      healthStatus: status.health?.status ?? "Unknown",
      history: (status.history ?? [])
        .filter((h): h is Required<typeof h> => Boolean(h.revision && h.deployedAt && h.deployStartedAt))
        .map((h) => ({ revision: h.revision, deployedAt: h.deployedAt, deployStartedAt: h.deployStartedAt })),
    };
  } catch {
    return null;
  }
}

/**
 * ArgoCD syncs a whole namespace's manifest bundle per Application, not one
 * microservice at a time — so unlike the HPA replica count, this can't slot
 * into the existing per-service ChangeEvent shape (which needs a specific
 * before/after metric window for one service). It's surfaced as its own
 * "real deploy history" list instead.
 */
export const LIVE_ARGO_APPS: { namespace: string; name: string; label: string }[] = [
  { namespace: "dir-argocd-ns", name: "dai-run-prod-frontend", label: "Frontend" },
  { namespace: "dir-argocd-ns", name: "dai-run-prod-backend", label: "Backend" },
  { namespace: "dir-argocd-ns", name: "dai-run-prod-ai", label: "AI" },
];

export type ArgoDeployHistoryItem = {
  app: string;
  appLabel: string;
  syncStatus: string;
  healthStatus: string;
  revision: string;
  minutesAgo: number;
};

export async function getLiveArgoDeployHistory(limit = 10): Promise<ArgoDeployHistoryItem[] | null> {
  const results = await Promise.all(LIVE_ARGO_APPS.map((a) => getArgoAppStatus(a.namespace, a.name)));
  if (results.every((r) => r === null)) return null;

  // Date.now() is read once here, at fetch time — not inside the page component's
  // render body, which this app's lint rules (react-hooks/purity) forbid.
  const now = Date.now();
  const items: (ArgoDeployHistoryItem & { deployedAtMs: number })[] = [];
  results.forEach((status, i) => {
    if (!status) return;
    const app = LIVE_ARGO_APPS[i];
    for (const h of status.history) {
      const deployedAtMs = new Date(h.deployedAt).getTime();
      items.push({
        app: app.name,
        appLabel: app.label,
        syncStatus: status.syncStatus,
        healthStatus: status.healthStatus,
        revision: h.revision.slice(0, 7),
        minutesAgo: Math.max(0, Math.round((now - deployedAtMs) / 60000)),
        deployedAtMs,
      });
    }
  });

  return items
    .sort((a, b) => b.deployedAtMs - a.deployedAtMs)
    .slice(0, limit)
    .map((item) => ({
      app: item.app,
      appLabel: item.appLabel,
      syncStatus: item.syncStatus,
      healthStatus: item.healthStatus,
      revision: item.revision,
      minutesAgo: item.minutesAgo,
    }));
}
