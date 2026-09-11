import type { PipelineResponse, RequirementsPayload } from './types'

export interface AuditEvent {
  id: string
  at: string
  action: string
  detail: string
}

export interface OfficerDecision {
  outcome: 'qualify' | 'clarification' | 'reject'
  reason: string
  officer: string
  recordedAt: string
}

export interface CaseRecord {
  id: string
  title: string
  tenderReference: string
  deadline?: string
  bidderName: string
  createdAt: string
  updatedAt: string
  tenderFile?: File
  submissionFile?: File
  requirements?: RequirementsPayload
  selectedRequirements?: RequirementsPayload
  result?: PipelineResponse
  decision?: OfficerDecision
  /** Superseded decisions, in the order they were recorded. */
  decisionHistory?: OfficerDecision[]
  events: AuditEvent[]
  exclusions?: string[]
  phase: 'draft' | 'requirements' | 'assessed' | 'decided'
}

const DATABASE_NAME = 'trust-setu-workspace'
const DATABASE_VERSION = 1
const CASE_STORE = 'cases'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Local case storage is unavailable. Use a browser with IndexedDB enabled.'))
      return
    }

    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    let blocked = false
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(CASE_STORE)) {
        request.result.createObjectStore(CASE_STORE, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => {
      const database = request.result
      if (blocked) {
        database.close()
        return
      }
      database.onversionchange = () => database.close()
      resolve(database)
    }
    request.onerror = () => reject(request.error ?? new Error('Could not open local case storage.'))
    request.onblocked = () => {
      blocked = true
      reject(new Error('Close other Trust Setu tabs and reload to open local case storage.'))
    }
  })
}

async function transact<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    let transaction: IDBTransaction
    let request: IDBRequest<T>
    try {
      transaction = database.transaction(CASE_STORE, mode)
      request = operation(transaction.objectStore(CASE_STORE))
    } catch (error) {
      database.close()
      reject(error)
      return
    }

    // A request succeeding does not mean the transaction committed. In
    // particular, storage quotas can abort a write after its request succeeds.
    transaction.oncomplete = () => {
      database.close()
      resolve(request.result)
    }
    transaction.onabort = () => {
      database.close()
      reject(transaction.error ?? request.error ?? new Error('Local case storage could not complete the operation.'))
    }
    transaction.onerror = () => {
      // IndexedDB will abort this transaction; onabort provides the final error.
    }
  })
}

/** Cases belong to this browser profile, not a shared backend workspace. */
export async function listCases(): Promise<CaseRecord[]> {
  const records = await transact<CaseRecord[]>('readonly', (store) => store.getAll())
  return records.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

export function getCase(id: string): Promise<CaseRecord | undefined> {
  return transact<CaseRecord | undefined>('readonly', (store) => store.get(id))
}

/** Resolve only after the record and its source files have committed locally. */
export async function saveCase(record: CaseRecord): Promise<CaseRecord> {
  const saved = { ...record, updatedAt: new Date().toISOString() }
  await transact<IDBValidKey>('readwrite', (store) => store.put(saved))
  return saved
}

type EventInput = Pick<AuditEvent, 'action' | 'detail'> & Partial<Pick<AuditEvent, 'id' | 'at'>>

/** Return a new record; callers explicitly persist it with saveCase. */
export function appendEvent(
  record: CaseRecord,
  event: EventInput = { action: 'Case updated', detail: 'Local case record updated.' },
): CaseRecord {
  const at = event.at ?? new Date().toISOString()
  return {
    ...record,
    updatedAt: at,
    events: [...record.events, { ...event, id: event.id ?? crypto.randomUUID(), at }],
  }
}

/** An amended decision keeps both the prior decision and a new activity entry. */
export function recordDecision(
  record: CaseRecord,
  input: Omit<OfficerDecision, 'recordedAt'> & { recordedAt?: string },
): CaseRecord {
  const reason = input.reason.trim()
  const officer = input.officer.trim()
  if (!reason || !officer) {
    throw new Error('Enter the officer name and a reason before recording a decision.')
  }
  const decision: OfficerDecision = {
    ...input,
    officer,
    reason,
    recordedAt: input.recordedAt ?? new Date().toISOString(),
  }
  return appendEvent(
    {
      ...record,
      decision,
      decisionHistory: record.decision
        ? [...(record.decisionHistory ?? []), { ...record.decision }]
        : [...(record.decisionHistory ?? [])],
      phase: 'decided',
    },
    {
      at: decision.recordedAt,
      action: record.decision ? 'Officer decision amended' : 'Officer decision recorded',
      detail: `${officer} recorded ${decision.outcome}. Reason: ${reason}${record.decision ? ` Previous outcome: ${record.decision.outcome}.` : ''}`,
    },
  )
}

function fileMetadata(file?: File) {
  return file
    ? { name: file.name, size: file.size, type: file.type, lastModified: file.lastModified }
    : null
}

/**
 * Export the original API payloads intact so source authority, extraction
 * confidence, page references and timestamps remain inspectable. File contents
 * are deliberately excluded; export this as application/json, never as HTML.
 */
export function buildReport(record: CaseRecord) {
  return {
    schemaVersion: 1,
    reportType: 'trust-setu-case-record',
    exportedAt: new Date().toISOString(),
    recordScope: 'browser-local',
    recordNotice: 'This record is stored in the current browser. It is not a signed, tamper-proof or server-verified audit record. Source authority is described by the original assessment payload.',
    case: {
      id: record.id,
      title: record.title,
      tenderReference: record.tenderReference,
      bidderName: record.bidderName,
      deadline: record.deadline ?? null,
      deadlineSource: record.deadline ? 'officer-entered' : null,
      phase: record.phase,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    },
    files: {
      tender: fileMetadata(record.tenderFile),
      submission: fileMetadata(record.submissionFile),
      contentsIncluded: false,
    },
    extractedRequirements: record.requirements ?? null,
    reviewedRequirements: record.selectedRequirements ?? null,
    excludedRequirementIds: record.exclusions ?? [],
    assessment: record.result ?? null,
    officerDecision: record.decision ?? null,
    supersededDecisions: record.decisionHistory ?? [],
    activity: record.events,
  }
}
