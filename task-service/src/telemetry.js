const { trace } = require("@opentelemetry/api");

const tracer = trace.getTracer("task-service");

function createRunWithSpan(activeTracer) {
  return async function runWithSpan(name, operation) {
    const span = activeTracer.startSpan(name);
    try {
      return await operation();
    } finally {
      span.end();
    }
  };
}

module.exports = {
  createRunWithSpan,
  runWithSpan: createRunWithSpan(tracer),
};
