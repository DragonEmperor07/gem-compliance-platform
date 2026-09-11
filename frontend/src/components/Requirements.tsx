import { useState } from 'react';
import { ArrowRight, ExternalLink, FileText } from 'lucide-react';
import type { CaseRecord } from '../lib/workspace';
import type { RequirementsPayload } from '../lib/types';
import { FileDrop } from './Intake';
import { Notice } from './ui';

export function reviewedPayload(payload: RequirementsPayload, exclusions: string[], requiredOverrides: Record<string, boolean> = {}): RequirementsPayload {
  return { ...payload, extraction_method: 'officer_reviewed', requirements: payload.requirements.flatMap((r, i) => {
    if (exclusions.includes(`r:${i}`)) return [];
    const children = r.sub_requirements.flatMap((child, j) => exclusions.includes(`r:${i}:${j}`)
      ? [] : [{ ...child, mandatory: requiredOverrides[`r:${i}:${j}`] ?? child.mandatory }]);
    // Removing every child must remove the group, not resurrect its parent as a criterion.
    if (r.sub_requirements.length && !children.length) return [];
    return [{ ...r, mandatory: requiredOverrides[`r:${i}`] ?? r.mandatory, sub_requirements: children }];
  }) };
}

function savedRequiredOverrides(record: CaseRecord): Record<string, boolean> {
  const overrides: Record<string, boolean> = {};
  record.requirements?.requirements.forEach((original, i) => {
    const selected = record.selectedRequirements?.requirements.find(r => r.name === original.name);
    if (!selected) return;
    if (selected.mandatory !== original.mandatory) overrides[`r:${i}`] = selected.mandatory;
    original.sub_requirements.forEach((child, j) => {
      const selectedChild = selected.sub_requirements.find(s => s.name === child.name);
      if (selectedChild && selectedChild.mandatory !== child.mandatory) overrides[`r:${i}:${j}`] = selectedChild.mandatory;
    });
  });
  return overrides;
}

export default function Requirements({ record, busy, onAssess, onRetry, openTender }: { record: CaseRecord; busy: boolean; onAssess: (submission: File, selected: RequirementsPayload, exclusions: string[], note: string) => void; onRetry: () => void; openTender: (page?: number) => void }) {
  const [exclusions, setExclusions] = useState<string[]>(record.exclusions || []);
  const [requiredOverrides, setRequiredOverrides] = useState<Record<string, boolean>>(() => savedRequiredOverrides(record));
  const [confirmed, setConfirmed] = useState(false);
  const [note, setNote] = useState('');
  const [submission, setSubmission] = useState(record.submissionFile);
  const toggle = (id: string) => { setConfirmed(false); setExclusions(old => old.includes(id) ? old.filter(x => x !== id) : [...old, id]); };
  const setRequired = (id: string, required: boolean, original: boolean) => {
    setConfirmed(false);
    setRequiredOverrides(old => {
      const next = { ...old };
      if (required === original) delete next[id];
      else next[id] = required;
      return next;
    });
  };
  if (!record.requirements) return <div className="paper-panel extraction-retry"><FileText size={34} strokeWidth={1.2} /><h2>Read the tender requirements</h2><p>Your case has been saved. Start or retry extraction to prepare the review checklist.</p><button className="button primary" disabled={busy} onClick={onRetry}>Read tender<ArrowRight size={15} /></button></div>;
  const payload = reviewedPayload(record.requirements, exclusions, requiredOverrides);
  const count = payload.requirements.reduce((n, r) => n + (r.sub_requirements.length || 1), 0);
  const requiredCount = payload.requirements.reduce((n, r) => n + (r.mandatory ? (r.sub_requirements.length ? r.sub_requirements.filter(s => s.mandatory).length : 1) : 0), 0);
  const changedCount = Object.keys(requiredOverrides).length;
  const noteRequired = exclusions.length > 0 || changedCount > 0;
  return <div className="requirements-layout"><section><div className="section-topline"><div><h2>Review tender requirements</h2><p className="muted">Confirm what applies before the bidder is scored.</p></div><span className="count-stamp">{count} INCLUDED</span></div>
    {record.requirements.extraction_method === 'heuristic' && <Notice tone="warning"><strong>Conservative extraction used.</strong> The requirement model was unavailable or returned invalid output. Review these clauses for completeness and applicability.</Notice>}
    {record.requirements.warnings.filter(w => !w.includes('conservative heuristic')).map((w, i) => <Notice key={i} tone="warning">{w}</Notice>)}
    <div className="requirements-list">{record.requirements.requirements.map((r, i) => <article key={i} className={`requirement ${exclusions.includes(`r:${i}`) ? 'excluded' : ''}`}><div className="requirement-head"><label className="check-label"><input type="checkbox" checked={!exclusions.includes(`r:${i}`)} onChange={() => toggle(`r:${i}`)} /><span><small className="mono">REQ. {String(i + 1).padStart(2, '0')}</small><strong>{r.name}</strong></span></label><label className="check-label requirement-priority"><input type="checkbox" aria-label={`Require ${r.name} for this bidder`} disabled={exclusions.includes(`r:${i}`)} checked={requiredOverrides[`r:${i}`] ?? r.mandatory} onChange={e => setRequired(`r:${i}`, e.target.checked, r.mandatory)} /><span>Required for this bidder</span></label></div><p>{r.description}</p>{r.condition && <p className="condition"><strong>Applicability</strong> {r.condition}</p>}{!(requiredOverrides[`r:${i}`] ?? r.mandatory) && !exclusions.includes(`r:${i}`) && <p className="form-hint">Included for review; optional criteria do not contribute to the required score. Mark this group required when it applies to this bidder.</p>}
      {!!r.thresholds.length && <div className="thresholds">{r.thresholds.map((t, ti) => <span key={ti}>{Object.values(t).join(' · ')}</span>)}</div>}
      {!!r.sub_requirements.length && <div className="subrequirements">{r.sub_requirements.map((s, j) => <div className="subrequirement" key={j}><label className="check-label"><input type="checkbox" disabled={exclusions.includes(`r:${i}`)} checked={!exclusions.includes(`r:${i}`) && !exclusions.includes(`r:${i}:${j}`)} onChange={() => toggle(`r:${i}:${j}`)} /><span><strong>{s.name}</strong><small>{s.description}</small><span className="evidence-tags">{s.evidence_types.join(' / ') || 'No document mapping supplied'}</span></span></label><label className="check-label requirement-priority"><input type="checkbox" aria-label={`Require ${r.name} — ${s.name} within this group`} disabled={exclusions.includes(`r:${i}`) || exclusions.includes(`r:${i}:${j}`)} checked={requiredOverrides[`r:${i}:${j}`] ?? s.mandatory} onChange={e => setRequired(`r:${i}:${j}`, e.target.checked, s.mandatory)} /><span>Required within this group</span></label>{s.condition && <p className="condition">{s.condition}</p>}{!!s.thresholds.length && <div className="thresholds">{s.thresholds.map((t, k) => <span key={k}>{Object.values(t).join(' · ')}</span>)}</div>}{s.source_text && s.source_text !== r.source_text && <details className="clause-details"><summary>Subrequirement source{s.source_page ? ` · page ${s.source_page}` : ''}</summary><blockquote>{s.source_text}</blockquote></details>}</div>)}</div>}
      <details className="clause-details"><summary><FileText size={13} />Original tender clause{r.source_page ? ` · page ${r.source_page}` : ' · page not supplied'}</summary><blockquote>{r.source_text || 'No clause excerpt was returned. Review the original tender PDF.'}</blockquote><button className="text-button" onClick={() => openTender(r.source_page || undefined)}>Open original tender<ExternalLink size={12} /></button></details></article>)}</div>
    {!record.requirements.requirements.length && <Notice tone="warning">The backend returned no requirements. Retry with a tender containing readable bidder obligations.</Notice>}</section>
    <aside className="review-controls"><div className="paper-panel"><div className="eyebrow">Review checkpoint</div><h3>From clause to checklist</h3><p>Keep applicable conditions and thresholds in scope. Both the group and its criterion must be marked required to contribute to required scoring.</p><div className="review-summary"><span>Requirement groups<strong>{payload.requirements.length}</strong></span><span>Included criteria<strong>{count}</strong></span><span>Required criteria<strong>{requiredCount}</strong></span><span>Excluded selections<strong>{exclusions.length}</strong></span>{changedCount > 0 && <span>Required-status changes<strong>{changedCount}</strong></span>}</div><label className="form-label">Checklist review note{noteRequired ? ' (required)' : ' (optional)'}<textarea value={note} onChange={e => setNote(e.target.value)} required={noteRequired} rows={3} placeholder={noteRequired ? 'Explain exclusions and any changes to what is required for this bidder.' : 'Record any applicability considerations.'} /></label></div><div className="paper-panel"><FileDrop label="Bidder submission (ZIP, optional)" accept=".zip" file={submission} onChange={setSubmission} compact /><label className="confirm-label"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /><span>I have reviewed the included requirements and their applicability.</span></label><button className="button primary full" disabled={busy || !confirmed || !submission || !count || (noteRequired && !note.trim())} onClick={() => onAssess(submission!, payload, exclusions, note.trim())}>Assess bidder<ArrowRight size={16} /></button><p className="form-hint">The assessment checks the reviewed criteria against the submitted files.</p></div></aside></div>;
}
