import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUpRight, Check, ChevronRight, ExternalLink, FileText, Search, Shield, ShieldCheck } from 'lucide-react';
import { normalizeEvidence } from '../lib/evidence';
import type { CaseRecord } from '../lib/workspace';
import type { EvidenceItem } from '../lib/types';
import { Badge, Notice } from './ui';

function present(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value == null) return 'Not supplied';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

function EvidenceDetail({ item, openTender }: { item: EvidenceItem; openTender: (page?: number) => void }) {
  return <div className="evidence-detail"><div className="evidence-detail-head"><div className="eyebrow">Evidence dossier / {item.kind === 'document' ? 'Document check' : item.kind === 'unmapped' ? 'Unmapped criterion' : 'Criterion validation'}</div><h3>{item.label}</h3><div className="detail-flags"><Badge state={item.state} /><span>{item.mandatory ? 'Required for this review' : 'Optional / conditional'}</span></div></div>
    <section className="evidence-section"><div className="evidence-section-title"><span>01</span><h4>Tender requirement</h4>{item.sourcePage && <button className="text-button" onClick={() => openTender(item.sourcePage!)}>Page {item.sourcePage}<ExternalLink size={12} /></button>}</div><blockquote>{item.clauseText || 'The backend did not return a clause excerpt for this check. Refer to the original tender.'}</blockquote>{!item.sourcePage && <span className="metadata-note">Tender page reference not supplied</span>}</section>
    <div className="evidence-connector"><ArrowDown size={13} /></div><section className="evidence-section"><div className="evidence-section-title"><span>02</span><h4>Submitted evidence</h4><span className="source-tag">BIDDER SUPPLIED</span></div>{item.documentNames.length ? item.documentNames.map(name => <div key={name} className="evidence-document"><FileText size={17} /><strong>{name}</strong></div>) : <p className="muted">No matched document is referenced for this check.</p>}{item.excerpt && <blockquote className="submitted-excerpt">{item.excerpt}</blockquote>}<span className="metadata-note">{item.excerpt ? 'Extracted passage' : 'No passage returned'} · Submitted-document page not supplied</span></section>
    <div className="evidence-connector"><ArrowDown size={13} /></div><section className="evidence-section"><div className="evidence-section-title"><span>03</span><h4>Source verification</h4><Shield size={15} /></div>{item.sources.length ? item.sources.map((source, i) => <div className="source-record" key={i}>
      <div className="source-status"><span className={`status-dot ${source.availability === 'authoritative' ? 'green' : 'amber'}`} /><strong>{source.availability === 'not_configured' ? 'Registry verification not configured' : source.availability === 'unavailable' ? 'Source unavailable' : source.authoritative ? 'Authoritative source' : 'Non-authoritative source'}</strong></div>
      <dl>
        <div><dt>Provider</dt><dd>{source.name}</dd></div>
        <div><dt>Environment</dt><dd>{source.environment || 'Not supplied by provider'}</dd></div>
        <div><dt>Response</dt><dd>{source.status?.replaceAll('_', ' ') || 'Not supplied'}</dd></div>
        <div><dt>Authority</dt><dd>{source.authoritative === true ? 'Declared authoritative by provider' : 'Not externally verified'}</dd></div>
        <div><dt>Entity match</dt><dd>{source.entityMatch === true ? 'Matches bidder' : source.entityMatch === false ? <strong>Mismatch — does not match bidder</strong> : 'Not supplied by provider'}</dd></div>
        <div><dt>Checked at</dt><dd>{source.checkedAt || 'Not supplied by provider'}</dd></div>
        {source.identifier && <div><dt>Identifier</dt><dd className="mono">{source.identifier}</dd></div>}
      </dl>
    </div>) : <p className="muted">{item.kind === 'document' ? 'This check assesses document presence. It does not establish registry validity.' : 'No external registry response is attached to this criterion.'}</p>}</section>
    <div className="evidence-connector"><ArrowDown size={13} /></div><section className={`evidence-section verdict-section verdict-${item.state}`}><div className="evidence-section-title"><span>04</span><h4>System finding</h4><Badge state={item.state} /></div><p>{item.reason}</p><span className="metadata-note">System assessment · Officer decision remains separate</span></section>
    {!!item.checks.length && <details className="validation-details"><summary>Inspect {item.checks.length} underlying validation check{item.checks.length > 1 ? 's' : ''}</summary>{item.checks.map((check, i) => <dl key={i}>{Object.entries(check).map(([key, value]) => <div key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd>{present(value)}</dd></div>)}</dl>)}</details>}</div>;
}

export default function EvidenceReview({ record, openTender, onDecision }: { record: CaseRecord; openTender: (page?: number) => void; onDecision: () => void }) {
  const items = useMemo(() => normalizeEvidence(record.result!), [record.result]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const filtered = items.filter(item => (filter === 'all' || (filter === 'attention' && item.state !== 'pass') || (filter === 'pass' && item.state === 'pass')) && `${item.label} ${item.reason} ${item.documentName}`.toLowerCase().includes(search.toLowerCase()));
  const selected = filtered.find(item => `${item.kind}:${item.id}` === selectedId) || filtered.find(item => item.state !== 'pass') || filtered[0];
  const decision = record.result!.decision;
  const verification = record.result!.government_verification;
  const unavailable = verification.checks.some(c => ['UNAVAILABLE', 'ERROR', 'INVALID_RESPONSE'].includes(c.status));
  const unmapped = items.filter(i => i.kind === 'unmapped').length;
  const counts = { pass: items.filter(i => i.state === 'pass').length, review: items.filter(i => i.state === 'review').length, missing: items.filter(i => i.state === 'missing').length, fail: items.filter(i => i.state === 'fail').length };
  return <><div className="assessment-summary"><div className="assessment-score"><div className="eyebrow">{decision.score.is_final ? 'Validated criterion score' : 'Provisional criterion score'}</div><strong>{decision.score.percentage}<small>/ 100</small></strong><span>{decision.score.is_final ? 'Scored criteria validated' : 'Validation remains incomplete'}</span></div><div className="assessment-counts">{Object.entries(counts).map(([state, n]) => <div key={state}><Badge state={state} /><strong>{n}</strong></div>)}<p>Counts include document and criterion checks.</p></div><div className="assessment-action"><ShieldCheck size={22} strokeWidth={1.4} /><p>{decision.human_decision_required ? 'Ready for your judgement.' : 'Review the assessment.'}<span>A score supports the review; your reason completes the record.</span></p><button className="text-button" onClick={onDecision}>Go to decision<ArrowUpRight size={15} /></button></div></div>
    {unmapped > 0 && <Notice tone="warning">{unmapped} tender criterion{unmapped !== 1 ? 's are' : ' is'} not included in the backend score because no document mapping was found. Review {unmapped !== 1 ? 'them' : 'it'} below.</Notice>}
    {verification.overall === 'NOT_CONFIGURED' ? <Notice tone="warning">Registry verification is not configured. Extracted identifiers remain submitted and unverified.</Notice> : !verification.authoritative ? <Notice tone="warning"><strong>Registry results are non-authoritative.</strong> {unavailable ? 'One or more source checks are unavailable. ' : ''}Submitted identifiers remain unverified. Inspect each provider response in the evidence below.</Notice> : unavailable ? <Notice tone="warning"><strong>A registry source is unavailable.</strong> A provider’s declared authority does not establish a successful verification. Inspect the affected responses before deciding.</Notice> : null}
    <div className="section-topline evidence-heading"><h2>Evidence review</h2><span className="mono muted">REQUIREMENT → SOURCE → FINDING</span></div><div className="evidence-workbench"><aside className="finding-list"><div className="finding-search"><Search size={15} /><input aria-label="Search evidence" placeholder="Find a requirement…" value={search} onChange={e => setSearch(e.target.value)} /></div><div className="finding-filters">{[['all', 'All checks'], ['attention', 'Needs attention'], ['pass', 'Met']].map(([id, label]) => <button key={id} onClick={() => setFilter(id)} className={filter === id ? 'active' : ''} aria-pressed={filter === id}>{label}</button>)}</div><div className="finding-scroll">{filtered.map((item, i) => <button key={`${item.kind}:${item.id}`} className={`finding-button ${item === selected ? 'selected' : ''}`} onClick={() => setSelectedId(`${item.kind}:${item.id}`)} aria-pressed={item === selected}><span className="finding-number">{String(i + 1).padStart(2, '0')}</span><span className="finding-copy"><strong>{item.label}</strong><small>{item.kind === 'document' ? 'Document presence' : item.kind === 'unmapped' ? 'Unmapped · excluded from score' : 'Criterion validation'}</small><Badge state={item.state} /></span><ChevronRight size={15} /></button>)}{!filtered.length && <p className="no-findings">No checks match this filter.</p>}</div><div className="finding-list-footer"><Check size={13} />{filtered.length} checks in view</div></aside>{selected ? <EvidenceDetail item={selected} openTender={openTender} /> : <div className="no-evidence">Select another filter to view the evidence.</div>}</div></>;
}
