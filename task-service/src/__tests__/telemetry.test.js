import { describe, it, expect, vi } from 'vitest'

import { createRunWithSpan } from '../telemetry.js'

describe('createRunWithSpan', () => {
  it('termine le span custom après une opération réussie', async () => {
    const span = { end: vi.fn() }
    const tracer = { startSpan: vi.fn(() => span) }
    const runWithSpan = createRunWithSpan(tracer)

    const result = await runWithSpan('publish.task.created', async () => 'ok')

    expect(result).toBe('ok')
    expect(tracer.startSpan).toHaveBeenCalledWith('publish.task.created')
    expect(span.end).toHaveBeenCalledTimes(1)
  })

  it('termine le span custom même si l’opération échoue', async () => {
    const span = { end: vi.fn() }
    const tracer = { startSpan: vi.fn(() => span) }
    const runWithSpan = createRunWithSpan(tracer)

    await expect(
      runWithSpan('publish.task.status_changed', async () => {
        throw new Error('publish failed')
      }),
    ).rejects.toThrow('publish failed')

    expect(tracer.startSpan).toHaveBeenCalledWith('publish.task.status_changed')
    expect(span.end).toHaveBeenCalledTimes(1)
  })
})
