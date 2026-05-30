import { describe, it, expect, vi } from 'vitest'
import express from 'express'
import request from 'supertest'

import { httpRequestsTotal, httpRequestDurationMs, recordHttpMetrics } from '../metrics.js'

describe('recordHttpMetrics', () => {
  it('incrémente le compteur et observe la durée HTTP avec les bons labels', async () => {
    const counterSpy = vi.spyOn(httpRequestsTotal, 'inc')
    const histogramSpy = vi.spyOn(httpRequestDurationMs, 'observe')

    const app = express()
    app.use(recordHttpMetrics)
    app.get('/health', (_req, res) => res.status(200).json({ ok: true }))

    await request(app).get('/health')

    expect(counterSpy).toHaveBeenCalledWith({
      method: 'GET',
      route: '/health',
      status: '200',
    })
    expect(histogramSpy).toHaveBeenCalledWith(
      {
        method: 'GET',
        route: '/health',
        status: '200',
      },
      expect.any(Number),
    )
  })
})
