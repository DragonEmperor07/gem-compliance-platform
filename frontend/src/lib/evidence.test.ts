import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, checkHealth, extractRequirements, runAssessment } from './api'
import { normalizeEvidence } from './evidence'
import type { ComplianceCheck, GovernmentCheck, PipelineResponse, Requirement, RequirementsPayload } from './types'

const requirement: Requirement = {
  name: 'Tax registration',
  description: 'Submit tax registration evidence.',
  mandatory: true,
  domain: 'general',
  category: 'eligibility',
  requirement_type: 'evidence',
  evidence_types: ['GST certificate'],
  source_page: 2,
  source_text: 'Parent registration clause.',
  condition: null,
  thresholds: [],
  review_required: true,
  sub_requirements: [{
    name: 'GST registration', description: 'Submit a valid GST certificate.', mandatory: true,
    evidence_types: ['GST certificate'], source_page: 7, source_text: 'Clause 4.2: GST registration is required.',
    condition: null, thresholds: [], review_required: false,
  }],
}

const requirements: RequirementsPayload = {
  requirements: [requirement], extraction_method: 'officer_reviewed', warnings: [], fallback_reason: null,
}

function check(overrides: Partial<ComplianceCheck> = {}): ComplianceCheck {
  return {
    id: 'GST_CERTIFICATE::GST registration', name: 'GST registration',
    label: 'GST Certificate — GST registration', mandatory: true, state: 'review',
    reason: 'GSTIN format was extracted, but authoritative-source verification is not connected.',
    evidence: { file: 'gst.pdf', source_page: 7, checks: [{ field: 'GSTIN', value: '27ABCDE1234F1Z5', excerpt: 'GST registration 27ABCDE1234F1Z5' }] },
    ...overrides,
  }
}

function response(overrides: Partial<PipelineResponse> = {}): PipelineResponse {
  return {
    tender: { pages: [2, 7], page_count: 10 },
    requirements: structuredClone(requirements),
    checklist: {
      checklist_name: 'Tender document checklist',
      documents: [{
        id: 'GST_CERTIFICATE', label: 'GST Certificate', required: true, aliases: ['gst certificate'],
        requirements: ['Tax registration — GST registration'],
        criteria: [{ name: 'GST registration', parent_requirement: 'Tax registration', mandatory: true, source_page: 7 }],
      }],
      unmapped_requirements: [],
    },
    documents: [{ source_file: 'gst.pdf', status: 'ok', note: null, text_length: 100, fields: [] }],
    findings: [],
    decision: {
      score: { percentage: 80, document_component: 100, eligibility_component: 50, method: '60% mandatory-document validity + 40% eligibility criteria', is_final: false, label: 'Provisional criterion score' },
      bid_responsiveness: 'REVIEW_REQUIRED', technical_evaluation_status: 'PENDING_REVIEW',
      recommendation: 'Resolve review items.', human_decision_required: true, validation_complete: false,
      counts: {}, document_checks: [check({ id: 'GST_CERTIFICATE', name: undefined, label: 'GST Certificate', state: 'pass', reason: 'Submitted evidence was confidently classified and matched.', evidence: { files: ['gst.pdf'], confidence: 0.95 } })],
      eligibility_checks: [check()], findings: [],
    },
    government_verification: {
      source: 'NOT_CONFIGURED', environment: 'UNCONFIGURED', authoritative: false,
      overall: 'NOT_CONFIGURED', identifiers: {}, checks: [],
      summary: { checks: 0, verified: 0, reported_valid: 0, problems: 0 },
    },
    report: { generated_at: '2026-09-11T08:00:00Z' },
    ...overrides,
  }
}

function provider(overrides: Partial<GovernmentCheck> = {}): GovernmentCheck {
  return {
    service: 'GST', identifier: '27ABCDE1234F1Z5', source_file: 'gst.pdf',
    source: 'Registry sandbox', environment: 'DEMO', authoritative: false,
    status: 'ACTIVE', record: {}, ...overrides,
  }
}

describe('evidence traceability', () => {
  it('resolves independent child clauses and keeps document presence separate from validation', () => {
    const payload = response()
    const before = structuredClone(payload)
    const items = normalizeEvidence(payload)
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({ kind: 'document', state: 'pass', documentName: 'gst.pdf' })
    expect(items[1]).toMatchObject({
      kind: 'criterion', state: 'review', mandatory: true, sourcePage: 7,
      clauseText: 'Clause 4.2: GST registration is required.', excerpt: 'GST registration 27ABCDE1234F1Z5',
    })
    expect(payload).toEqual(before)
    expect(payload.decision.score.is_final).toBe(false)
  })

  it('labels an unconfigured provider and never uses report generation time as a registry timestamp', () => {
    const item = normalizeEvidence(response())[1]
    expect(item.source).toMatchObject({ availability: 'not_configured', authoritative: false, checkedAt: null })
  })

  it('preserves non-authoritative valid results without promoting them to verified facts', () => {
    const payload = response()
    payload.government_verification = {
      ...payload.government_verification, overall: 'REVIEW', source: 'Registry sandbox', checks: [provider()],
    }
    const item = normalizeEvidence(payload)[1]
    expect(item.state).toBe('review')
    expect(item.source).toMatchObject({ availability: 'non_authoritative', status: 'ACTIVE', authoritative: false })
  })

  it('distinguishes a provider outage from a demo result', () => {
    const payload = response()
    payload.government_verification.checks = [provider({ status: 'UNAVAILABLE', source: 'CONFIGURED_PROVIDER' })]
    expect(normalizeEvidence(payload)[1].source?.availability).toBe('unavailable')
  })

  it('uses the exact matching identifier and preserves source timestamps and identity mismatch', () => {
    const payload = response()
    payload.government_verification.checks = [
      provider({ identifier: 'OTHER-IDENTIFIER', source: 'Unrelated record' }),
      provider({ source: 'Registry', authoritative: true, entity_match: false, record: { checked_at: '2026-09-10T12:05:00Z' } }),
    ]
    expect(normalizeEvidence(payload)[1].source).toMatchObject({
      name: 'Registry', authoritative: true, entityMatch: false, checkedAt: '2026-09-10T12:05:00Z',
    })
  })

  it('retains tentative document matches while leaving their review state unresolved', () => {
    const payload = response()
    payload.decision.eligibility_checks = [check({ evidence: { possible_match: { file: 'uncertain.pdf', confidence: 0.52 } } })]
    expect(normalizeEvidence(payload)[1]).toMatchObject({ state: 'review', documentName: 'uncertain.pdf', excerpt: null })
  })

  it('surfaces unmapped clauses as unscored review work without changing the backend final score', () => {
    const payload = response()
    payload.checklist.unmapped_requirements = [{ name: 'Tax registration — GST registration', parent_requirement: 'Tax registration', mandatory: true }]
    payload.decision.score.is_final = true
    const item = normalizeEvidence(payload).at(-1)
    expect(item).toMatchObject({ kind: 'unmapped', state: 'review', sourcePage: 7, clauseText: 'Clause 4.2: GST registration is required.' })
    expect(item?.reason).toContain('not included in the backend score')
    expect(payload.decision.score.is_final).toBe(true)
  })

  it('does not fabricate clauses, pages, or providers for a cross-document check', () => {
    const payload = response()
    payload.decision.eligibility_checks = [check({ id: 'CROSS::PAN_GSTIN', name: 'PAN and GSTIN consistency', evidence: { pan: ['ABCDE1234F'], gstin: ['27ABCDE1234F1Z5'] } })]
    expect(normalizeEvidence(payload)[1]).toMatchObject({ clauseText: null, sourcePage: null, source: null, documentName: null })
  })
})

describe('existing API integration', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sends reviewed nested requirements intact using the backend multipart names', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(response())))
    vi.stubGlobal('fetch', fetchMock)
    const tender = new File(['%PDF-'], 'tender.pdf', { type: 'application/pdf' })
    const submission = new File(['archive'], 'bid.zip', { type: 'application/zip' })
    const signal = new AbortController().signal
    await runAssessment(tender, submission, requirements, '  Example Bidder  ', signal)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const form = init.body as FormData
    expect(url).toBe('/api/compliance/pipeline')
    expect(init.signal).toBe(signal)
    expect(form.get('tender')).toBe(tender)
    expect(form.get('submission')).toBe(submission)
    expect(JSON.parse(form.get('requirements') as string)).toEqual(requirements)
    expect(form.get('bidder_name')).toBe('Example Bidder')
    expect(form.get('use_ocr')).toBe('true')
    expect(new Headers(init.headers).has('Content-Type')).toBe(false)
  })

  it('returns extraction provenance and conservative fallback warnings unchanged', async () => {
    const extracted = { ...requirements, extraction_method: 'heuristic', fallback_reason: 'ConnectionError', warnings: ['Model unavailable. Review requirements.'] }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(extracted))))
    expect(await extractRequirements(new File(['%PDF-'], 'tender.pdf'))).toEqual(extracted)
  })

  it('exposes backend validation errors and preserves cancellation', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: [{ loc: ['body', 'tender'], msg: 'Field required' }] }), { status: 422 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(extractRequirements(new File([], 'tender.pdf'))).rejects.toMatchObject({ name: 'ApiError', status: 422, message: 'tender: Field required' })
    fetchMock.mockRejectedValue(new DOMException('Aborted', 'AbortError'))
    await expect(extractRequirements(new File([], 'tender.pdf'))).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('rejects an HTML proxy fallback and identifies the real backend health response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('<html>Frontend</html>'))
    vi.stubGlobal('fetch', fetchMock)
    await expect(extractRequirements(new File([], 'tender.pdf'))).rejects.toBeInstanceOf(ApiError)
    expect(await checkHealth()).toBe(false)
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ message: 'GeM Compliance Platform API', docs: '/docs' })))
    expect(await checkHealth()).toBe(true)
    expect(fetchMock.mock.lastCall?.[0]).toBe('/health')
  })
})
