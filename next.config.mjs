/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  // instrumentation.ts의 register()가 서버 시작 시 호출되게 한다(OpenTelemetry 부트스트랩).
  // Next.js 15부터는 기본 활성화라 이 플래그가 사라지지만, 14.2에서는 아직 필요하다.
  experimental: {
    instrumentationHook: true,
    // OTel 패키지들을 webpack 번들링 대상에서 빼고 node_modules에서 그대로 require하게 한다 —
    // 안 그러면 webpack이 @grpc/grpc-js 등의 Node 전용 의존성(zlib 등 내장 모듈)까지 브라우저/엣지용으로
    // 번들링하려다 실패한다.
    serverComponentsExternalPackages: [
      '@opentelemetry/sdk-node',
      '@opentelemetry/auto-instrumentations-node',
      '@opentelemetry/exporter-trace-otlp-http',
      '@opentelemetry/exporter-metrics-otlp-http',
      '@opentelemetry/sdk-metrics',
      '@opentelemetry/resources',
      '@opentelemetry/semantic-conventions'
    ]
  }
};

export default nextConfig;
