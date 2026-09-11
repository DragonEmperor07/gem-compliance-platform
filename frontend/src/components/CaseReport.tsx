import { normalizeEvidence } from '../lib/evidence';
import type { EvidenceItem, GovernmentCheck } from '../lib/types';
import type { CaseRecord, OfficerDecision } from '../lib/workspace';
import { Badge, dateOnly, dateTime } from './ui';

function recordedTime(value?: string | null) {
  if (!value) return 'Not supplied by source';
  return Number.isNaN(new Date(value).getTime()) ? value : dateTime(value);
}

function providerTime(check: GovernmentCheck) {
  const value = [check.checked_at, check.record.checked_at, check.record.verified_at].find(value => typeof value === 'string' && value.trim());
  return recordedTime(typeof value === 'string' ? value : null);
}

function DecisionRecord({ decision }: { decision: OfficerDecision }) {
  return <div className="report-decision">
    <Badge state={decision.outcome} />
    <dl className="report-meta">
      <div><dt>Officer</dt><dd>{decision.officer}</dd></div>
      <div><dt>Recorded locally</dt><dd>{recordedTime(decision.recordedAt)}</dd></div>
    </dl>
    <h4>Reason for decision</h4>
    <p className="report-prose">{decision.reason}</p>
  </div>;
}

function CheckRecord({ item, index }: { item: EvidenceItem; index: number }) {
  return <article className="report-check">
    <div className="report-check-heading">
      <div><span className="eyebrow">Check {String(index + 1).padStart(2, '0')} · {item.kind === 'document' ? 'Document presence' : item.kind === 'unmapped' ? 'Unmapped criterion' : 'Criterion validation'}</span><h3>{item.label}</h3></div>
      <Badge state={item.state} />
    </div>
    <p className="metadata-note">{item.mandatory ? 'Required for this review' : 'Optional / conditional'} · System assessment</p>
    {item.kind === 'unmapped' && <p className="report-notice">This requirement has no document mapping and is excluded from the backend score. Officer review is required.</p>}
    <div className="report-evidence-grid">
      <div>
        <h4>Tender requirement</h4>
        <blockquote>{item.clauseText || 'No clause excerpt was returned for this check. Refer to the original tender.'}</blockquote>
        <p className="metadata-note">{item.sourcePage != null ? `Tender page ${item.sourcePage}` : 'Tender page reference not supplied'}</p>
      </div>
      <div>
        <h4>Submitted document</h4>
        <p className="report-prose">{item.documentNames.length ? item.documentNames.join('\n') : 'No matched document is referenced for this check.'}</p>
        {item.excerpt ? <blockquote>{item.excerpt}</blockquote> : <p className="muted">No submitted-document excerpt was returned.</p>}
        <p className="metadata-note">Submitted-document page number not supplied by the backend.</p>
      </div>
    </div>
    <h4>Source verification</h4>
    {item.sources.length > 0 ? item.sources.map((source, sourceIndex) => <dl className="report-meta report-source" key={sourceIndex}>
      <div><dt>Provider</dt><dd>{source.name}</dd></div>
      <div><dt>Environment</dt><dd>{source.environment || 'Not supplied'}</dd></div>
      <div><dt>Authority</dt><dd>{source.authoritative === true ? 'Declared authoritative by provider' : source.authoritative === false ? 'Non-authoritative' : 'Not supplied'}</dd></div>
      <div><dt>Response</dt><dd>{source.status?.replaceAll('_', ' ') || 'Not supplied'}</dd></div>
      <div><dt>Checked at</dt><dd>{recordedTime(source.checkedAt)}</dd></div>
      {source.service && <div><dt>Service</dt><dd>{source.service}</dd></div>}
      {source.identifier && <div><dt>Identifier</dt><dd className="mono">{source.identifier}</dd></div>}
      {source.entityMatch !== null && <div><dt>Entity match</dt><dd>{source.entityMatch ? 'Matched' : 'Not matched'}</dd></div>}
    </dl>) : <p className="muted">{item.kind === 'document' ? 'This check assesses document presence. It does not establish registry validity.' : 'No external registry response is attached to this criterion.'}</p>}
    <h4>System finding</h4>
    <p className="report-prose">{item.reason}</p>
    {item.checks.length > 0 && <div className="report-validation"><h4>Underlying validation evidence</h4>{item.checks.map((check, checkIndex) => <dl className="report-meta" key={checkIndex}>{Object.entries(check).map(([key, value]) => <div key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd className="report-prose">{value == null ? 'Not supplied' : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}</dd></div>)}</dl>)}</div>}
  </article>;
}

export default function CaseReport({ record }: { record: CaseRecord }) {
  const result = record.result;
  const items = result ? normalizeEvidence(result) : [];
  const extraction = record.requirements ?? result?.requirements;
  const government = result?.government_verification;
  const exclusions = (record.exclusions ?? []).map(id => {
    const [, parentIndex, childIndex] = id.split(':');
    const parent = record.requirements?.requirements[Number(parentIndex)];
    return childIndex === undefined
      ? parent?.name || id
      : `${parent?.name || id} — ${parent?.sub_requirements[Number(childIndex)]?.name || id}`;
  });

  return <article className="case-report">
    <header className="report-header">
      <div className="eyebrow">Trust Setu</div>
      <h2>Case review record</h2>
      <p>{record.title}</p>
      <span className="mono">{record.tenderReference}</span>
    </header>

    <section className="report-section">
      <h3>Case particulars</h3>
      <dl className="report-meta">
        <div><dt>Bidder</dt><dd>{record.bidderName}</dd></div>
        <div><dt>Tender reference</dt><dd className="mono">{record.tenderReference}</dd></div>
        <div><dt>Closing date</dt><dd>{record.deadline ? `${dateOnly(record.deadline)} · officer-entered` : 'Not recorded'}</dd></div>
        <div><dt>Case status</dt><dd><Badge state={record.phase} /></dd></div>
        <div><dt>Opened</dt><dd>{recordedTime(record.createdAt)}</dd></div>
        <div><dt>Last saved locally</dt><dd>{recordedTime(record.updatedAt)}</dd></div>
        <div><dt>Tender file</dt><dd>{record.tenderFile?.name || 'Not attached'}</dd></div>
        <div><dt>Bidder submission</dt><dd>{record.submissionFile?.name || 'Not attached'}</dd></div>
        <div><dt>Local case ID</dt><dd className="mono">{record.id}</dd></div>
      </dl>
      <p className="report-notice">This record is saved in the current browser. It is not a signed or server-verified audit record. System findings and the officer's recorded decision are presented separately.</p>
    </section>

    <section className="report-section">
      <h3>Assessment summary</h3>
      {result ? <>
        <dl className="report-meta">
          <div><dt>{result.decision.score.is_final === true ? 'Validated criterion score' : 'Provisional criterion score'}</dt><dd className="report-score">{result.decision.score.percentage} / 100</dd></div>
          <div><dt>Score status</dt><dd>{result.decision.score.is_final === true ? 'Backend marks scored criteria as validated' : 'Backend has not confirmed a final score'}</dd></div>
          <div><dt>Scoring method</dt><dd>{result.decision.score.method}</dd></div>
          <div><dt>Document component</dt><dd>{result.decision.score.document_component ?? 'Not supplied'}</dd></div>
          <div><dt>Eligibility component</dt><dd>{result.decision.score.eligibility_component ?? 'Not supplied'}</dd></div>
          <div><dt>Bid responsiveness</dt><dd>{result.decision.bid_responsiveness.replaceAll('_', ' ')}</dd></div>
          <div><dt>Technical evaluation</dt><dd>{result.decision.technical_evaluation_status.replaceAll('_', ' ')}</dd></div>
          <div><dt>Human decision required by backend</dt><dd>{result.decision.human_decision_required ? 'Yes' : 'No'}</dd></div>
        </dl>
        <h4>System recommendation</h4>
        <p className="report-prose">{result.decision.recommendation}</p>
        <p className="metadata-note">The score applies to the backend's scored criteria. Unmapped requirements, exclusions and source limitations remain part of the officer's review.</p>
      </> : <p>No bidder assessment has been completed.</p>}
    </section>

    <section className="report-section">
      <h3>Requirement extraction and scope</h3>
      {extraction ? <>
        <dl className="report-meta">
          <div><dt>Original extraction method</dt><dd>{extraction.extraction_method.replaceAll('_', ' ')}</dd></div>
          <div><dt>Extracted requirement groups</dt><dd>{extraction.requirements.length}</dd></div>
          <div><dt>Reviewed requirement groups</dt><dd>{record.selectedRequirements?.requirements.length ?? 'Review not recorded'}</dd></div>
        </dl>
        {extraction.fallback_reason && <p className="report-prose"><strong>Extraction fallback: </strong>{extraction.fallback_reason}</p>}
        {extraction.warnings.map((warning, index) => <p className="report-notice" key={index}>{warning}</p>)}
        <h4>Excluded selections</h4>
        {exclusions.length > 0 ? <ul>{exclusions.map((name, index) => <li key={index}>{name}</li>)}</ul> : <p>No requirement exclusions recorded.</p>}
        {exclusions.length > 0 && <p className="metadata-note">The checklist review note is retained in the activity record below.</p>}
      </> : <p>Tender requirements have not yet been extracted.</p>}
    </section>

    <section className="report-section">
      <h3>Registry provenance</h3>
      {government ? <>
        <dl className="report-meta">
          <div><dt>Provider</dt><dd>{government.source}</dd></div>
          <div><dt>Environment</dt><dd>{government.environment}</dd></div>
          <div><dt>Overall response</dt><dd>{government.overall.replaceAll('_', ' ')}</dd></div>
          <div><dt>Authority</dt><dd>{government.authoritative ? 'Declared authoritative by provider' : 'Non-authoritative / unverified'}</dd></div>
          <div><dt>Checks returned</dt><dd>{government.checks.length}</dd></div>
        </dl>
        {government.message && <p>{government.message}</p>}
        {!government.authoritative && <p className="report-notice">These registry results do not establish authoritative verification.</p>}
        {government.checks.map((check, index) => <div className="report-source" key={`${check.service}:${check.identifier}:${index}`}>
          <h4>{check.service} · {check.identifier}</h4>
          <dl className="report-meta">
            <div><dt>Source</dt><dd>{check.source}</dd></div>
            <div><dt>Environment</dt><dd>{check.environment}</dd></div>
            <div><dt>Authority</dt><dd>{check.authoritative ? 'Declared authoritative by provider' : 'Non-authoritative'}</dd></div>
            <div><dt>Response</dt><dd>{check.status.replaceAll('_', ' ')}</dd></div>
            <div><dt>Checked at</dt><dd>{providerTime(check)}</dd></div>
            <div><dt>Source document</dt><dd>{check.source_file || 'Not supplied'}</dd></div>
            {typeof check.entity_match === 'boolean' && <div><dt>Entity match</dt><dd>{check.entity_match ? 'Matched' : 'Not matched'}</dd></div>}
          </dl>
          {check.evidence && <blockquote>{check.evidence}</blockquote>}
        </div>)}
      </> : <p>No registry assessment is available.</p>}
    </section>

    <section className="report-section">
      <h3>Evidence and system findings</h3>
      <p className="metadata-note">{items.length} document and criterion checks. Every result below is the backend's assessment; source references are shown only where supplied.</p>
      {items.map((item, index) => <CheckRecord item={item} index={index} key={`${item.kind}:${item.id}`} />)}
      {items.length === 0 && <p>No evidence checks have been returned.</p>}
    </section>

    {!!result?.findings.length && <section className="report-section">
      <h3>Assessment findings</h3>
      {result.findings.map((finding, index) => <div className="report-check" key={`${finding.id}:${index}`}><h4>{finding.title}</h4><Badge state={finding.state} /><p className="report-prose">{finding.explanation}</p></div>)}
    </section>}

    <section className="report-section">
      <h3>Officer decision</h3>
      {record.decision ? <DecisionRecord decision={record.decision} /> : <p>No officer decision has been recorded.</p>}
      {!!record.decisionHistory?.length && <div className="report-decision-history"><h4>Superseded decisions</h4>{record.decisionHistory.map((decision, index) => <DecisionRecord decision={decision} key={`${decision.recordedAt}:${index}`} />)}</div>}
    </section>

    <section className="report-section">
      <h3>Local activity record</h3>
      {record.events.length > 0 ? <ol className="report-activity">{record.events.map(event => <li key={event.id}><div className="report-activity-heading"><strong>{event.action}</strong><time dateTime={event.at}>{recordedTime(event.at)}</time></div><p className="report-prose">{event.detail}</p></li>)}</ol> : <p>No activity entries recorded.</p>}
    </section>

    <footer className="report-footer">Trust Setu · {record.tenderReference} · Local case record. Original file contents are not embedded in this report. Retain the source documents and evidence JSON with this review.</footer>
  </article>;
}
