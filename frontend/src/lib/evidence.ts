import type {
  ChecklistCriterion,
  ComplianceCheck,
  EvidenceItem,
  EvidenceSource,
  GovernmentCheck,
  JsonRecord,
  PipelineResponse,
  Requirement,
  SubRequirement,
} from './types'

function record(value: unknown): JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {}
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function texts(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => Boolean(text(item))) : []
}

function unique(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
}

const services: Record<string, string> = {
  GST_CERTIFICATE: 'GST',
  PAN_CARD: 'PAN',
  TAN_CERTIFICATE: 'TAN',
  UDYAM_CERTIFICATE: 'UDYAM',
}

function providerSource(check: GovernmentCheck): EvidenceSource {
  const status = text(check.status)
  const unavailable = ['UNAVAILABLE', 'ERROR', 'INVALID_RESPONSE'].includes(status?.toUpperCase() ?? '')
  return {
    name: check.source,
    environment: text(check.environment),
    authoritative: check.authoritative,
    status,
    // A report generation time is not the time a registry was checked.
    checkedAt: text(check.checked_at) ?? text(check.record?.checked_at) ?? text(check.record?.verified_at),
    availability: unavailable ? 'unavailable' : check.authoritative ? 'authoritative' : 'non_authoritative',
    service: text(check.service),
    identifier: text(check.identifier),
    entityMatch: typeof check.entity_match === 'boolean' ? check.entity_match : null,
  }
}

function sourcesFor(
  check: ComplianceCheck,
  response: PipelineResponse,
  documentNames: string[],
  details: JsonRecord[],
): EvidenceSource[] {
  const documentId = check.id.split('::')[0]
  const service = check.id === 'EXTERNAL::BLACKLIST' ? 'BLACKLIST' : services[documentId]
  const identifiers = unique(details.map((item) => text(item.identifier) ?? text(item.value)))
  const matches = response.government_verification.checks.filter((providerCheck) => {
    if (!service || providerCheck.service !== service) return false
    if (service === 'BLACKLIST') return true
    if (identifiers.length > 0) return identifiers.includes(providerCheck.identifier)
    return Boolean(providerCheck.source_file && documentNames.includes(providerCheck.source_file))
  })
  if (matches.length > 0) return matches.map(providerSource)

  // Some criterion results carry provenance directly. Keep it even if the
  // top-level provider response omitted its corresponding check.
  const embedded = [check.evidence, ...details].filter((item) => text(item.provider))
  if (embedded.length > 0) {
    return embedded.map((item) => {
      const status = text(item.status)
      const authoritative = typeof item.authoritative === 'boolean' ? item.authoritative : null
      const unavailable = ['UNAVAILABLE', 'ERROR', 'INVALID_RESPONSE'].includes(status ?? '')
      return {
        name: text(item.provider)!,
        environment: text(item.environment),
        authoritative,
        status,
        checkedAt: text(item.checked_at) ?? text(record(item.record).checked_at),
        availability: unavailable ? 'unavailable' : authoritative === true ? 'authoritative'
          : authoritative === false ? 'non_authoritative' : 'unknown',
        service: service ?? null,
        identifier: text(item.identifier),
        entityMatch: typeof item.entity_match === 'boolean' ? item.entity_match : null,
      }
    })
  }

  if (service && (response.government_verification.overall === 'NOT_CONFIGURED' || service === 'TAN')) {
    return [{
      name: service === 'TAN' ? 'TAN verification is not connected' : 'No provider configured',
      environment: 'UNCONFIGURED',
      authoritative: false,
      status: 'NOT_CONFIGURED',
      checkedAt: null,
      availability: 'not_configured',
      service,
      identifier: identifiers[0] ?? null,
      entityMatch: null,
    }]
  }
  return []
}

function requirementFor(
  criterion: ChecklistCriterion,
  requirements: Requirement[],
): { parent: Requirement; criterion: SubRequirement } | null {
  const parent = requirements.find((item) => item.name === criterion.parent_requirement)
    ?? requirements.find((item) => item.name === criterion.name)
  if (!parent) return null
  return {
    parent,
    criterion: parent.sub_requirements.find((item) => item.name === criterion.name) ?? parent,
  }
}

/** Resolve backend checks to their original tender clause and submitted
 * evidence, without recomputing verdicts, scores, or source authority. */
export function normalizeEvidence(response: PipelineResponse): EvidenceItem[] {
  const normalize = (check: ComplianceCheck, kind: 'document' | 'criterion'): EvidenceItem => {
    const documentId = check.id.split('::')[0]
    const checklistDocument = response.checklist.documents.find((item) => item.id === documentId)
    const criteria = (checklistDocument?.criteria ?? []).filter((item) =>
      kind === 'document' || item.name === check.name || check.id === `${documentId}::${item.name}`,
    )
    const references = criteria.flatMap((criterion) => {
      const reference = requirementFor(criterion, response.requirements.requirements)
      return reference ? [reference] : []
    })
    const clauseText = unique(references.map(({ parent, criterion }) =>
      text(criterion.source_text) ?? text(parent.source_text),
    )).join('\n\n') || null
    const evidence = record(check.evidence)
    const possibleMatch = record(evidence.possible_match)
    const documentNames = unique([
      text(evidence.file),
      ...texts(evidence.files),
      text(possibleMatch.file),
    ])
    const checks = Array.isArray(evidence.checks) ? evidence.checks.map(record) : []
    const excerpt = unique([
      text(evidence.excerpt),
      ...checks.map((item) => text(item.excerpt) ?? text(record(item.submitted_evidence).excerpt)),
    ]).join('\n\n') || null
    const sources = sourcesFor(check, response, documentNames, checks)
    const directPage = typeof evidence.source_page === 'number' ? evidence.source_page : null
    const criterionPage = criteria.find((criterion) => typeof criterion.source_page === 'number')?.source_page
    const referencePage = references.map(({ parent, criterion }) => criterion.source_page ?? parent.source_page)
      .find((page) => typeof page === 'number')
    return {
      id: check.id,
      label: check.label || check.name || check.id,
      state: check.state,
      reason: check.reason,
      mandatory: check.mandatory,
      kind,
      clauseText,
      sourcePage: directPage ?? criterionPage ?? referencePage ?? null,
      documentName: documentNames[0] ?? null,
      documentNames,
      excerpt,
      checks,
      source: sources[0] ?? null,
      sources,
      raw: check,
    }
  }

  const items = [
    ...response.decision.document_checks.map((check) => normalize(check, 'document')),
    ...response.decision.eligibility_checks.map((check) => normalize(check, 'criterion')),
  ]

  // The checklist builder preserves criteria it cannot map to a document,
  // but the scorer excludes them. Surface these as unresolved, unscored work.
  for (const [index, unmapped] of response.checklist.unmapped_requirements.entries()) {
    const parent = response.requirements.requirements.find((item) => item.name === unmapped.parent_requirement)
      ?? response.requirements.requirements.find((item) => item.name === unmapped.name)
    const criterion = parent?.sub_requirements.find((item) =>
      item.name === unmapped.name || `${parent.name} — ${item.name}` === unmapped.name,
    ) ?? parent
    const raw: ComplianceCheck = {
      id: `UNMAPPED::${index}::${unmapped.name}`,
      label: unmapped.name,
      state: 'review',
      mandatory: unmapped.mandatory,
      reason: 'This tender criterion could not be mapped to a document check. It is not included in the backend score and requires officer review.',
      evidence: {},
    }
    items.push({
      ...normalize(raw, 'criterion'),
      kind: 'unmapped',
      clauseText: text(criterion?.source_text) ?? text(parent?.source_text),
      sourcePage: criterion?.source_page ?? parent?.source_page ?? null,
    })
  }
  return items
}
