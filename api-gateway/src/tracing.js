const { NodeSDK } = require("@opentelemetry/sdk-node");
const { getNodeAutoInstrumentations } = require("@opentelemetry/auto-instrumentations-node");
const { OTLPTraceExporter } = require("@opentelemetry/exporter-trace-otlp-http");
const { OTLPMetricExporter } = require("@opentelemetry/exporter-metrics-otlp-http");
const { Resource } = require("@opentelemetry/resources");
const { SemanticResourceAttributes } = require("@opentelemetry/semantic-conventions");

// Create a resource to identify this service
const resource = Resource.default().merge(
  new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: "api-gateway",
    [SemanticResourceAttributes.SERVICE_VERSION]: "1.0.0",
  })
);

// Initialize OpenTelemetry SDK with auto-instrumentations
const sdk = new NodeSDK({
  resource,
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://otel-collector:4318",
  }),
  metricReader: new (require("@opentelemetry/sdk-metrics").PeriodicExportingMetricReader)({
    exporter: new OTLPMetricExporter({
      url: (process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://otel-collector:4318") + "/v1/metrics",
    }),
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();
console.log("OpenTelemetry tracing initialized for api-gateway");

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down gracefully");
  try {
    await sdk.shutdown();
    console.log("OpenTelemetry SDK shut down successfully");
    process.exit(0);
  } catch (error) {
    console.error("Error shutting down OpenTelemetry SDK:", error);
    process.exit(1);
  }
});

process.on("SIGINT", async () => {
  console.log("SIGINT received, shutting down gracefully");
  try {
    await sdk.shutdown();
    console.log("OpenTelemetry SDK shut down successfully");
    process.exit(0);
  } catch (error) {
    console.error("Error shutting down OpenTelemetry SDK:", error);
    process.exit(1);
  }
});