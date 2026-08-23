import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // AWS SDK v3's package structure (deep, conditional "exports" maps, dynamic
  // requires inside its own credential-provider chain) trips up Next's
  // standalone output file tracer — it silently drops the package instead of
  // erroring, so `@aws-sdk/client-bedrock-runtime` was missing from every
  // production image and every Bedrock call failed at runtime with
  // MODULE_NOT_FOUND. Marking it external skips tracing and just copies the
  // package as-is, which is what actually needs to happen here.
  // Same class of tracing gap hits @kubernetes/client-node — HPA reads
  // (AutoscalingV2Api) happened to bundle fine, but ArgoCD Application reads
  // (CustomObjectsApi) in the same package didn't, so it needs the same fix.
  serverExternalPackages: ["@aws-sdk/client-bedrock-runtime", "@kubernetes/client-node"],
};

export default nextConfig;
