// Next.js가 서버 시작 시 자동으로 이 파일의 register()를 호출한다(next.config.mjs의
// experimental.instrumentationHook 참고). @vercel/otel은 Next.js 전용 플랫폼 SDK가 아니라,
// "OTel SDK를 Next.js의 webpack 번들링과 충돌 없이 부트스트랩해주는" 순수 오픈소스 헬퍼라
// self-host 환경(이 프로젝트)에서도 그대로 쓸 수 있다 — 표준 sdk-node를 직접 쓰면 gRPC exporter의
// Node 전용 의존성(zlib 등)을 webpack이 번들링하려다 빌드가 깨진다(실제로 겪은 문제).
// traces/metrics는 OTEL_EXPORTER_OTLP_ENDPOINT(이 호스트의 Grafana Alloy)로 OTLP HTTP 전송된다.
import { registerOTel } from '@vercel/otel';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';

export function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) {
    console.warn('[otel] OTEL_EXPORTER_OTLP_ENDPOINT가 없어서 OpenTelemetry를 켜지 않아요.');
    return;
  }

  const serviceName = process.env.OTEL_SERVICE_NAME ?? 'dai-run-next';
  registerOTel({
    serviceName,
    traceExporter: 'auto',
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({ url: `${endpoint}/v1/metrics` }),
        exportIntervalMillis: 15000
      })
    ]
  });
  console.log(`[otel] started (service=${serviceName})`);
}
