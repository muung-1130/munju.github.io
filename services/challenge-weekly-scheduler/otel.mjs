// 이 서비스의 traces/metrics를 이 호스트의 Grafana Alloy(OTLP 게이트웨이)로 내보낸다.
// index.mjs 맨 위에서 가장 먼저 import해야 그 뒤에 임포트되는 pg/kafkajs 등이 자동 계측된다.
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

if (endpoint) {
  const serviceName = process.env.OTEL_SERVICE_NAME ?? 'dai-run-service';
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: serviceName }),
    traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({ url: `${endpoint}/v1/metrics` }),
      exportIntervalMillis: 15000
    }),
    instrumentations: [getNodeAutoInstrumentations({ '@opentelemetry/instrumentation-fs': { enabled: false } })]
  });
  sdk.start();
  console.log(`[otel] started (service=${serviceName}, endpoint=${endpoint})`);
  process.on('SIGTERM', () => sdk.shutdown().finally(() => process.exit(0)));
} else {
  console.warn('[otel] OTEL_EXPORTER_OTLP_ENDPOINT가 없어서 OpenTelemetry를 켜지 않아요.');
}
