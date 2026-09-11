import type { PipelineResponse, RequirementsPayload } from './types'

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status = 0) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function errorDetail(payload: unknown): string | null {
  if (!isRecord(payload)) return null
  if (typeof payload.detail === 'string') return payload.detail
  if (Array.isArray(payload.detail)) {
    const messages = payload.detail.flatMap((item: unknown) => {
      if (!isRecord(item) || typeof item.msg !== 'string') return []
      const location = Array.isArray(item.loc)
        ? item.loc.filter((part: unknown) => part !== 'body').join(' → ')
        : ''
      return [`${location ? `${location}: ` : ''}${item.msg}`]
    })
    return messages.length > 0 ? messages.join('; ') : null
  }
  return null
}

async function request(path: string, init: RequestInit): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(`/api/compliance${path}`, {
      ...init,
      headers: { Accept: 'application/json', ...init.headers },
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error
    throw new ApiError('Cannot reach the compliance service. Check the backend connection and try again.')
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new ApiError(
      response.ok
        ? 'The compliance service returned an unreadable response. Check that the API proxy points to the backend.'
        : `The compliance service could not complete the request (HTTP ${response.status}).`,
      response.status,
    )
  }
  if (!response.ok) {
    throw new ApiError(errorDetail(payload) ?? `Request failed (HTTP ${response.status}).`, response.status)
  }
  return payload
}

export async function extractRequirements(tender: File, signal?: AbortSignal): Promise<RequirementsPayload> {
  const form = new FormData()
  form.append('tender', tender)
  const payload = await request('/tenders/requirements', { method: 'POST', body: form, signal })
  if (!isRecord(payload) || !Array.isArray(payload.requirements)) {
    throw new ApiError('The service returned an invalid tender requirements response.')
  }
  return payload as unknown as RequirementsPayload
}

export async function runAssessment(
  tender: File,
  submission: File,
  requirements: RequirementsPayload,
  bidderName: string,
  signal?: AbortSignal,
): Promise<PipelineResponse> {
  const form = new FormData()
  form.append('tender', tender)
  form.append('submission', submission)
  // Send the reviewed hierarchy verbatim. The backend builds its checklist
  // from independent children and combines parent/child mandatory flags.
  form.append('requirements', JSON.stringify(requirements))
  form.append('checklist_name', 'Officer-reviewed tender checklist')
  form.append('use_ocr', 'true')
  if (bidderName.trim()) form.append('bidder_name', bidderName.trim())
  const payload = await request('/pipeline', { method: 'POST', body: form, signal })
  if (
    !isRecord(payload) || !isRecord(payload.decision) ||
    !isRecord(payload.decision.score) || !Array.isArray(payload.decision.document_checks) ||
    !Array.isArray(payload.decision.eligibility_checks) || !isRecord(payload.checklist) ||
    !isRecord(payload.requirements) || !Array.isArray(payload.documents) ||
    !isRecord(payload.government_verification)
  ) {
    throw new ApiError('The service returned an incomplete assessment. No decision has been recorded.')
  }
  return payload as unknown as PipelineResponse
}

/** Vite proxies /health to the existing backend's root endpoint. */
export async function checkHealth(signal?: AbortSignal): Promise<boolean> {
  try {
    const response = await fetch('/health', { headers: { Accept: 'application/json' }, signal })
    if (!response.ok) return false
    const payload: unknown = await response.json()
    return isRecord(payload) && typeof payload.message === 'string' && payload.message.startsWith('GeM Compliance Platform API')
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error
    return false
  }
}
