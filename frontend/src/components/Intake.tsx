import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Check, FileArchive, FileText, Upload, X } from 'lucide-react';
import { fileSize, Notice, PageHead } from './ui';
import type { CaseRecord } from '../lib/workspace';

export interface IntakeValues { title: string; tenderReference: string; bidderName: string; deadline: string; tenderFile: File; submissionFile?: File }

export function FileDrop({ label, accept, file, onChange, optional = false, compact = false }: { label: string; accept: '.pdf' | '.zip'; file?: File; onChange: (file?: File) => void; optional?: boolean; compact?: boolean }) {
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const pick = (picked?: File) => {
    if (!picked) return;
    if (!picked.name.toLowerCase().endsWith(accept)) { setError(`Choose a ${accept.slice(1).toUpperCase()} file.`); return; }
    if (!picked.size) { setError('This file is empty. Choose a file with content.'); return; }
    if (picked.size > (accept === '.pdf' ? 25 : 50) * 1024 * 1024) { setError(`The file exceeds the ${accept === '.pdf' ? '25' : '50'} MB upload limit.`); return; }
    setError(''); onChange(picked);
  };
  const Icon = accept === '.pdf' ? FileText : FileArchive;
  return <div className={`file-field ${compact ? 'compact' : ''}`}><div className="field-label">{label}{optional && <span>Optional</span>}</div><div className={`file-drop ${drag ? 'dragging' : ''} ${file ? 'has-file' : ''}`} onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}>
    <input ref={input} type="file" accept={accept} aria-label={label} onChange={e => { pick(e.target.files?.[0]); e.target.value = ''; }} className="file-input" />
    <div className="file-icon"><Icon size={26} strokeWidth={1.4} /></div>
    <div className="file-copy"><strong>{file ? file.name : `Drop your ${accept === '.pdf' ? 'tender document' : 'bidder submission'} here`}</strong><span>{file ? `${fileSize(file.size)} · Ready for analysis` : `${accept.slice(1).toUpperCase()} · up to ${accept === '.pdf' ? '25' : '50'} MB`}</span></div>
    {file ? <button type="button" className="icon-button" aria-label={`Remove ${label}`} onClick={() => onChange(undefined)}><X size={17} /></button> : <button type="button" className="button secondary small" onClick={() => input.current?.click()}><Upload size={14} />Browse files</button>}
  </div>{error && <p role="alert" className="field-error">{error}</p>}</div>;
}

export default function Intake({ onCreate, busy, initial }: { onCreate: (values: IntakeValues) => void; busy: boolean; initial?: CaseRecord }) {
  const [tenderFile, setTenderFile] = useState<File | undefined>(initial?.tenderFile);
  const [submissionFile, setSubmissionFile] = useState<File>();
  const [error, setError] = useState('');
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!tenderFile) { setError('Attach the tender PDF to start the review.'); return; }
    const data = new FormData(event.currentTarget);
    onCreate({ title: String(data.get('title')).trim(), tenderReference: String(data.get('reference')).trim(), bidderName: String(data.get('bidder')).trim(), deadline: String(data.get('deadline')), tenderFile, submissionFile });
  };
  return <><a className="back-link" href="#queue"><ArrowLeft size={15} />Verification queue</a><PageHead label="Case intake / 01" title="Every review starts with the source." description="Open a case with the tender document. You’ll review its requirements before any bidder is assessed." />
    <div className="intake-grid"><form onSubmit={submit} className="intake-form"><section className="paper-panel"><div className="section-heading"><span className="section-index">01</span><div><h2>Case particulars</h2><p>These details identify this review in your workspace.</p></div></div><div className="form-grid"><label className="span-two">Tender title<input name="title" defaultValue={initial?.title} required maxLength={180} placeholder="e.g. Supply of laboratory equipment" /></label><label>Tender reference<input name="reference" defaultValue={initial?.tenderReference} required maxLength={100} placeholder="e.g. GEM/2026/B/…" className="mono-input" /></label><label>Closing date (optional)<input name="deadline" defaultValue={initial?.deadline} type="date" /></label><label className="span-two">Bidder name<input name="bidder" required maxLength={180} placeholder="Registered name of the bidding entity" /></label></div></section>
    <section className="paper-panel"><div className="section-heading"><span className="section-index">02</span><div><h2>Source documents</h2><p>Original files provide the foundation for the assessment.</p></div></div><FileDrop label="Tender PDF" accept=".pdf" file={tenderFile} onChange={setTenderFile} /><FileDrop label="Bidder submission (ZIP, optional)" accept=".zip" file={submissionFile} onChange={setSubmissionFile} optional /><p className="form-hint">The ZIP can contain PDFs, images, Word documents and text files. You can also add it after reviewing the tender requirements.</p></section>
    {error && <Notice tone="error">{error}</Notice>}<div className="form-footer"><span><Check size={14} /> Original documents stay attached to this local case</span><button className="button primary" disabled={busy} type="submit">Create &amp; read tender<ArrowRight size={16} /></button></div></form>
    <aside className="intake-aside"><div className="eyebrow">The review path</div><ol className="path-list"><li><span>01</span><div><strong>Read the tender</strong><p>Extract requirements with their original clauses and page references.</p></div></li><li><span>02</span><div><strong>Review applicability</strong><p>Confirm which requirements and subrequirements apply to this bidder.</p></div></li><li><span>03</span><div><strong>Examine the evidence</strong><p>Compare submitted documents, validation checks and registry responses.</p></div></li><li><span>04</span><div><strong>Record your decision</strong><p>Keep the outcome, written reason and evidence together.</p></div></li></ol><div className="margin-note"><span className="eyebrow">A note on custody</span><p>Cases and documents are saved in this browser. Analysis runs on your configured backend. Export your review record for retention.</p></div></aside></div></>;
}
