/** Wire types for the existing FastAPI compliance service. */
export type CheckState = 'pass' | 'review' | 'fail' | 'missing'
export type JsonRecord = Record<string, unknown>

export interface SubRequirement {
  name: string
  description: string
  mandatory: boolean
  evidence_types: string[]
  source_page: number | null
  source_text: string
  condition: string | null
  thresholds: Record<string, string>[]
  review_required: boolean
}

export interface Requirement extends SubRequirement {
  domain: string
  category: string
  requirement_type: string
  sub_requirements: SubRequirement[]
}

export interface RequirementsPayload {
  requirements: Requirement[]
  extraction_method: 'ollama' | 'heuristic' | 'officer_reviewed' | 'provided'
  fallback_reason: string | null
  warnings: string[]
}

export interface ChecklistCriterion {
  name: string
  parent_requirement?: string
  mandatory: boolean
  condition?: string | null
  thresholds?: Record<string, string>[]
  source_page?: number | null
}

export interface ChecklistDocument {
  id: string
  label: string
  required: boolean
  aliases: string[]
  requirements: string[]
  criteria: ChecklistCriterion[]
}

export interface ChecklistPayload {
  checklist_name: string
  documents: ChecklistDocument[]
  unmapped_requirements: { name: string; parent_requirement?: string; mandatory: boolean }[]
}

export interface ComplianceCheck {
  id: string
  name?: string
  label: string
  mandatory: boolean
  state: CheckState
  severity?: string
  reason: string
  evidence: JsonRecord
}

export interface ComplianceFinding {
  id: string
  title: string
  state: CheckState
  severity: string
  explanation: string
  evidence: JsonRecord
}

export interface ComplianceDecision {
  score: {
    percentage: number
    document_component: number | null
    eligibility_component: number | null
    method: string
    is_final?: boolean
    label?: string
  }
  bid_responsiveness: string
  technical_evaluation_status: string
  recommendation: string
  human_decision_required: boolean
  validation_complete?: boolean
  counts: Record<string, number>
  coverage?: JsonRecord
  document_checks: ComplianceCheck[]
  eligibility_checks: ComplianceCheck[]
  findings: ComplianceFinding[]
}

export interface GovernmentCheck {
  service: string
  identifier: string
  source_file?: string
  evidence?: string
  source: string
  environment: string
  authoritative: boolean
  status: string
  entity_match?: boolean | null
  record: JsonRecord
  checked_at?: string
}

export interface GovernmentVerification {
  source: string
  environment: string
  authoritative: boolean
  overall: string
  message?: string
  identifiers: Record<string, { identifier: string; source_file: string; evidence: string }[]>
  checks: GovernmentCheck[]
  summary: { checks: number; verified: number; reported_valid: number; problems: number }
}

export interface ExtractedField {
  field: string
  value: string
  evidence: string
  source_file?: string
  [key: string]: unknown
}

export interface SubmissionDocument {
  source_file: string
  status: string
  note: string | null
  text_length: number
  fields: ExtractedField[]
}

export interface PipelineResponse {
  tender: { pages: number[]; page_count: number }
  requirements: RequirementsPayload
  checklist: ChecklistPayload
  documents: SubmissionDocument[]
  findings: ComplianceFinding[]
  decision: ComplianceDecision
  government_verification: GovernmentVerification
  report: JsonRecord
}

export interface EvidenceSource {
  name: string
  environment: string | null
  authoritative: boolean | null
  status: string | null
  /** Only an explicit timestamp returned by the source; never a browser time. */
  checkedAt: string | null
  availability: 'authoritative' | 'non_authoritative' | 'not_configured' | 'unavailable' | 'unknown'
  service: string | null
  identifier: string | null
  entityMatch: boolean | null
}

export interface EvidenceItem {
  id: string
  label: string
  state: CheckState
  reason: string
  mandatory: boolean
  kind: 'document' | 'criterion' | 'unmapped'
  clauseText: string | null
  /** Tender page. The API does not return submitted-document page numbers. */
  sourcePage: number | null
  documentName: string | null
  documentNames: string[]
  excerpt: string | null
  checks: JsonRecord[]
  source: EvidenceSource | null
  sources: EvidenceSource[]
  raw: ComplianceCheck
}
