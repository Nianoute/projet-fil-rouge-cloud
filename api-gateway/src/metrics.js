const client = require("prom-client");

const register = new client.Registry()
client.collectDefaultMetrics({ register })

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status']
})

const httpRequestDurationMs = new client.Histogram({
  name: 'http_request_duration_ms',
  help: 'HTTP request duration in ms',
  labelNames: ['method', 'route', 'status'],
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2000]
})

const upstreamErrorsTotal = new client.Counter({
  name: 'upstream_errors_total',
  help: 'Total number of upstream service errors (502)',
  labelNames: ['service']
})

function routeLabel(req) {
  return req.route?.path || req.baseUrl || req.path || 'unknown'
}

function recordHttpMetrics(req, res, next) {
  const start = process.hrtime.bigint()

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6
    const labels = {
      method: req.method,
      route: routeLabel(req),
      status: String(res.statusCode)
    }

    httpRequestsTotal.inc(labels)
    httpRequestDurationMs.observe(labels, durationMs)
  })

  next()
}

// Register metrics
register.registerMetric(httpRequestsTotal)
register.registerMetric(httpRequestDurationMs)
register.registerMetric(upstreamErrorsTotal)

module.exports = {
  register,
  httpRequestsTotal,
  httpRequestDurationMs,
  upstreamErrorsTotal,
  recordHttpMetrics
}
