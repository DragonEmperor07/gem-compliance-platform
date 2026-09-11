import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import type { PipelineResponse, RequirementsPayload } from './types'
import { appendEvent, buildReport, getCase, listCases, recordDecision, saveCase, type CaseRecord } from './workspace'

function caseRecord(overrides: Partial<CaseRecord> = {}): CaseRecord {
  return {
    id: 'case-001',
    title: 'Medical equipment procurement',
    tenderReference: 'GEM/2026/B/001',
    bidderName: 'Example supplier',
    createdAt: '2026-09-01T09:00:00.000Z',
    updatedAt: '2026-09-01T09:00:00.000Z',
    phase: 'draft',
    events: [],
    ...overrides,
  }
}

beforeEach(async () => {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('trust-setu-workspace')
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('A prior test left the database open.'))
  })
})

describe('local workspace', () => {
  it('commits and reopens a case without mutating the supplied record', async () => {
    const original = caseRecord()
    const saved = await saveCase(original)
    expect(saved.updatedAt).not.toBe(original.updatedAt)
    expect(await getCase(original.id)).toEqual(saved)
    expect(original.updatedAt).toBe('2026-09-01T09:00:00.000Z')
    expect(await getCase('absent-case')).toBeUndefined()
  })

  it('updates a case by id instead of duplicating it', async () => {
    await saveCase(caseRecord())
    await saveCase(caseRecord({ title: 'Revised procurement' }))
    const records = await listCases()
    expect(records).toHaveLength(1)
    expect(records[0]?.title).toBe('Revised procurement')
  })

  it('returns an empty collection for a new workspace', async () => {
    expect(await listCases()).toEqual([])
  })

  it('adds activity without changing earlier entries or the original case', () => {
    const original = caseRecord()
    const next = appendEvent(original, { action: 'Tender uploaded', detail: 'tender.pdf', at: '2026-09-02T10:00:00.000Z' })
    expect(original.events).toHaveLength(0)
    expect(next.events[0]).toMatchObject({ action: 'Tender uploaded', detail: 'tender.pdf', at: '2026-09-02T10:00:00.000Z' })
    expect(next.events[0]?.id).toBeTruthy()
    expect(next.updatedAt).toBe('2026-09-02T10:00:00.000Z')
  })

  it('retains the reason and officer for every amended decision', async () => {
    const first = recordDecision(caseRecord({ phase: 'assessed' }), {
      outcome: 'clarification',
      reason: 'Request the missing certificate.',
      officer: 'A. Rao',
      recordedAt: '2026-09-02T10:00:00.000Z',
    })
    const amended = recordDecision(first, {
      outcome: 'qualify',
      reason: 'Certificate received and reviewed against clause 4.',
      officer: 'B. Singh',
      recordedAt: '2026-09-03T10:00:00.000Z',
    })
    await saveCase(amended)
    const restored = await getCase(amended.id)
    expect(restored?.decision?.outcome).toBe('qualify')
    expect(restored?.decisionHistory).toEqual([first.decision])
    expect(restored?.events).toHaveLength(2)
    expect(restored?.events[1]?.detail).toContain('Certificate received and reviewed against clause 4.')
    expect(first.decisionHistory).toEqual([])
    expect(first.events).toHaveLength(1)
  })

  it('requires a reason and officer for a recorded decision', () => {
    expect(() => recordDecision(caseRecord(), { outcome: 'reject', reason: ' ', officer: 'A. Rao' })).toThrow('reason')
    expect(() => recordDecision(caseRecord(), { outcome: 'qualify', reason: 'Evidence verified.', officer: ' ' })).toThrow('officer')
  })

  it('exports original evidence and decision history without including uploaded bytes', () => {
    // The export must preserve new backend provenance fields without filtering
    // them through a second frontend-specific evidence schema.
    const requirements = { requirements: [{ id: 'req-1', clause: '4.1', page: 3 }] } as unknown as RequirementsPayload
    const assessment = {
      government_verification: [{ source: 'mock-registry', authoritative: false, checked_at: '2026-09-02T10:00:00Z' }],
      evidence: [{ document: 'gst.pdf', page: 2 }],
    } as unknown as PipelineResponse
    const record = caseRecord({
      deadline: '2026-09-20',
      requirements,
      selectedRequirements: requirements,
      result: assessment,
      // Metadata is all the exporter may read; this also works in Node tests
      // where the File global may not be available.
      tenderFile: { name: 'tender.pdf', size: 24, type: 'application/pdf', lastModified: 123, secretBytes: 'NEVER EXPORT RAW FILE BYTES' } as unknown as File,
    })
    const report = buildReport(record)
    expect(report.recordScope).toBe('browser-local')
    expect(report.case.deadlineSource).toBe('officer-entered')
    expect(report.extractedRequirements).toEqual(requirements)
    expect(report.assessment).toEqual(assessment)
    expect(report.files.tender).toEqual({ name: 'tender.pdf', size: 24, type: 'application/pdf', lastModified: 123 })
    expect(JSON.stringify(report)).not.toContain('NEVER EXPORT RAW FILE BYTES')
    expect(report.files.contentsIncluded).toBe(false)
    expect(report.activity).toEqual(record.events)
  })
})
