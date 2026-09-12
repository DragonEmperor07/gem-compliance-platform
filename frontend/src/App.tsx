import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, ArrowUpRight, BookOpen, Check, ChevronRight, CircleHelp, Download, FileClock, FolderOpen, HardDrive, ListFilter, LoaderCircle, Menu, Plus, RefreshCw, ShieldCheck, WifiOff, X } from 'lucide-react';
import { checkHealth, extractRequirements, runAssessment } from './lib/api';
import { appendEvent, buildReport, listCases, recordDecision, saveCase } from './lib/workspace';
import type { CaseRecord, OfficerDecision } from './lib/workspace';
import type { GovernmentCheck, RequirementsPayload } from './lib/types';
import Queue from './components/Queue';
import Intake from './components/Intake';
import type { IntakeValues } from './components/Intake';
import CaseView from './components/CaseView';
import CaseReport from './components/CaseReport';
import { Badge, dateTime, Empty, Mark, Notice, PageHead } from './components/ui';

function downloadReport(record: CaseRecord) {
  const blob = new Blob([JSON.stringify(buildReport(record), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `trust-setu-${record.tenderReference.replace(/[^a-zA-Z0-9_-]/g, '-')}-${record.id.slice(0, 8)}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Records({ cases }: { cases: CaseRecord[] }) {
  return <><PageHead label="Procurement workspace / Records" title="The review record" description="Decisions, supporting evidence, and the sequence of your review." /><Notice>These records are saved in this browser. Export them for retention; they are not signed or centrally stored audit logs.</Notice>{cases.length ? <div className="records-list">{cases.map(record => <article className="record-card" key={record.id}><div className="record-card-icon"><FileClock size={24} strokeWidth={1.3} /></div><div><span className="eyebrow">{record.tenderReference}</span><h2><a href={`#case/${record.id}`}>{record.bidderName}</a></h2><p>{record.title}</p><span className="metadata-note">{record.events.length} activity entries · Updated {dateTime(record.updatedAt)}</span></div><div className="record-card-actions"><Badge state={record.decision?.outcome || record.phase} /><button className="button secondary small" onClick={() => downloadReport(record)}><Download size={14} />Export record</button></div></article>)}</div> : <Empty title="A record follows every review." action={<a className="button primary" href="#new"><Plus size={15} />Open a case</a>}>Your cases, evidence, and officer decisions will appear here as you work.</Empty>}</>;
}

function ActivityLog({ cases }: { cases: CaseRecord[] }) {
  const events = cases.flatMap(record => record.events.map(event => ({ ...event, record }))).sort((a, b) => b.at.localeCompare(a.at));
  return <><PageHead label="Procurement workspace / Activity" title="A traceable sequence" description="From the original upload to the officer’s recorded reason." /><div className="section-topline"><h2>Workspace activity</h2><span className="mono muted">LOCAL BROWSER RECORD</span></div>{events.length ? <div className="activity-list">{events.map(event => <article className="activity-event" key={event.id}><div className="activity-pin" /><time>{dateTime(event.at)}</time><div><h3>{event.action}</h3><p>{event.detail}</p><a href={`#case/${event.record.id}`}>{event.record.bidderName}<span className="mono">{event.record.tenderReference}</span><ArrowUpRight size={13} /></a></div></article>)}</div> : <Empty title="The sequence starts with your first case.">Document intake, checklist review, assessment and decisions are recorded as you work.</Empty>}</>;
}

function sourceTimestamp(check: GovernmentCheck): string {
  return [check.checked_at, check.record?.checked_at, check.record?.verified_at]
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0) || 'Not supplied';
}

function Sources({ cases, online, onRefresh }: { cases: CaseRecord[]; online: boolean | null; onRefresh: () => void }) {
  const assessed = cases.filter(c => c.result);
  return <><PageHead label="Procurement workspace / Connections" title="Know the source." description="Availability and authority are different. Both belong in the review." action={<button className="button secondary" onClick={onRefresh}><RefreshCw size={15} />Check connection</button>} /><div className="connection-panel"><div className="connection-icon"><Activity size={24} /></div><div><span className="eyebrow">Analysis service</span><h2>GeM compliance backend</h2><p>Tender extraction, document matching and criterion validation</p></div><Badge state={online ? 'pass' : 'review'}>{online == null ? 'Checking connection' : online ? 'Connected' : 'Not reachable'}</Badge></div><div className="section-topline"><h2>Registry provenance by assessment</h2><span className="mono muted">AS REPORTED BY THE BACKEND</span></div>{assessed.length ? assessed.map(record => { const source = record.result!.government_verification; return <article className="source-assessment paper-panel" key={record.id}><div className="section-topline"><div><h3>{record.bidderName}</h3><p className="mono muted">{record.tenderReference}</p></div><a className="text-button" href={`#case/${record.id}`}>Open review<ArrowUpRight size={14} /></a></div><Notice tone={source.authoritative ? 'info' : 'warning'}><strong>{source.overall === 'NOT_CONFIGURED' ? 'Registry verification not configured' : source.authoritative ? 'Provider declares authoritative results' : 'Non-authoritative source'}</strong>{source.message && <p>{source.message}</p>}</Notice><dl className="source-overview"><div><dt>Provider</dt><dd>{source.source || 'Not supplied'}</dd></div><div><dt>Environment</dt><dd>{source.environment || 'Not supplied'}</dd></div><div><dt>Overall response</dt><dd>{source.overall.replaceAll('_', ' ')}</dd></div><div><dt>Check count</dt><dd>{source.checks.length}</dd></div></dl>{source.checks.length > 0 && <div className="fields-table"><table><thead><tr><th>Service / identifier</th><th>Response</th><th>Authority</th><th>Source timestamp</th></tr></thead><tbody>{source.checks.map((check, i) => <tr key={i}><td>{check.service}<span className="table-subtitle mono">{check.identifier}</span></td><td>{check.status.replaceAll('_', ' ')}</td><td>{check.authoritative ? 'Declared authoritative' : 'Not authoritative'}</td><td>{sourceTimestamp(check)}</td></tr>)}</tbody></table></div>}</article>; }) : <Empty title="Source responses appear after assessment.">The configured backend queries available providers. Each response keeps its own authority, status, and source timestamp when supplied.</Empty>}</>;
}

export default function App() {
  const [route, setRoute] = useState(window.location.hash.slice(1) || 'queue');
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [task, setTask] = useState('');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [seed, setSeed] = useState<CaseRecord>();
  const controller = useRef<AbortController | null>(null);
  const active = cases.find(c => route === `case/${c.id}`);
  const refreshHealth = useCallback(async () => { setOnline(null); const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 8000); try { setOnline(await checkHealth(ctl.signal)); } catch { setOnline(false); } finally { clearTimeout(timer); } }, []);
  useEffect(() => { listCases().then(setCases).catch(e => setError(e.message)).finally(() => setLoading(false)); void refreshHealth(); }, [refreshHealth]);
  useEffect(() => {
    const listener = () => { setRoute(window.location.hash.slice(1) || 'queue'); setMobileMenu(false); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', listener);
    return () => window.removeEventListener('hashchange', listener);
  }, []);
  useEffect(() => { if (loading) return; document.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true }); }, [route, loading]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 5000); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => {
    const shortcuts = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileMenu(false);
      if (e.key === '/' && !(e.target instanceof HTMLElement && (e.target.closest('input,textarea,select') || e.target.isContentEditable))) { const search = document.querySelector<HTMLInputElement>('[aria-label="Search cases"], [aria-label="Search evidence"]'); if (search) { e.preventDefault(); search.focus(); } }
    };
    window.addEventListener('keydown', shortcuts);
    return () => window.removeEventListener('keydown', shortcuts);
  }, []);
  useEffect(() => { const unload = (e: BeforeUnloadEvent) => { if (controller.current) { e.preventDefault(); e.returnValue = ''; } }; window.addEventListener('beforeunload', unload); return () => window.removeEventListener('beforeunload', unload); }, []);
  const persist = async (record: CaseRecord) => { const saved = await saveCase(record); setCases(old => [saved, ...old.filter(c => c.id !== saved.id)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))); return saved; };
  const perform = async (label: string, fn: (signal: AbortSignal) => Promise<void>) => {
    if (controller.current) return;
    const ctl = new AbortController(); controller.current = ctl; setTask(label); setError('');
    try { await fn(ctl.signal); setOnline(true); } catch (e) { if (e instanceof Error && e.name === 'AbortError') setToast('Request cancelled. The saved case is available to retry.'); else setError(e instanceof Error ? e.message : 'The request could not be completed. Please try again.'); } finally { controller.current = null; setTask(''); }
  };
  const extract = async (record: CaseRecord, signal: AbortSignal) => {
    if (!record.tenderFile) throw new Error('The original tender file is missing from this local case. Open a new case with the PDF.');
    const requirements = await extractRequirements(record.tenderFile, signal);
    await persist(appendEvent({ ...record, requirements, phase: 'requirements' }, { action: 'Tender requirements extracted', detail: `${requirements.requirements.length} requirement groups returned using ${requirements.extraction_method} extraction. Source clauses retained for officer review.` }));
    setToast('Tender requirements are ready for your review.');
  };
  const create = (values: IntakeValues) => perform('Reading tender requirements', async signal => {
    const now = new Date().toISOString();
    const record = await persist(appendEvent({ id: crypto.randomUUID(), ...values, createdAt: now, updatedAt: now, events: [], phase: 'draft' }, { action: 'Case opened', detail: `Tender ${values.tenderFile.name} attached${values.submissionFile ? ` with ${values.submissionFile.name}` : ''}. Case particulars entered by the officer.` }));
    window.location.hash = `case/${record.id}`; setSeed(undefined); await extract(record, signal);
  });
  const assess = (submissionFile: File, selectedRequirements: RequirementsPayload, exclusions: string[], note: string) => {
    if (!active?.tenderFile) return;
    void perform('Assessing bidder evidence', async signal => {
      const record = await persist(appendEvent({ ...active, submissionFile, selectedRequirements, exclusions }, { action: 'Requirement applicability reviewed', detail: `${selectedRequirements.requirements.length} groups included; ${exclusions.length} selections excluded. ${note ? `Officer note: ${note}` : 'All selected requirements confirmed as applicable.'}` }));
      const result = await runAssessment(record.tenderFile!, submissionFile, selectedRequirements, record.bidderName, signal);
      await persist(appendEvent({ ...record, result, phase: 'assessed' }, { action: 'Bidder assessment completed', detail: `${result.documents.length} documents processed. Criterion score ${result.decision.score.percentage}/100 (${result.decision.score.is_final ? 'validated' : 'provisional'}). Registry status: ${result.government_verification.overall}; authority: ${result.government_verification.authoritative ? 'declared by provider' : 'not authoritative'}.` }));
      window.location.hash = `case/${record.id}`; setToast('Assessment complete. Examine the evidence before recording a decision.');
    });
  };
  const decide = async (decision: Omit<OfficerDecision, 'recordedAt'>) => {
    if (!active) return;
    try { await persist(recordDecision(active, decision)); setToast('Officer decision recorded in this browser.'); } catch (e) { setError(e instanceof Error ? e.message : 'The decision could not be saved.'); }
  };
  const retryExtraction = (tenderFile?: File) => {
    if (!active) return;
    void perform('Reading tender requirements', async signal => {
      const record = tenderFile && tenderFile !== active.tenderFile
        ? await persist(appendEvent({ ...active, tenderFile }, { action: 'Tender file replaced', detail: `${tenderFile.name} attached before retrying extraction. Previous file: ${active.tenderFile?.name || 'none'}.` }))
        : active;
      await extract(record, signal);
    });
  };
  const nav = [{ id: 'queue', title: 'Verification queue', icon: ListFilter }, { id: 'records', title: 'Review records', icon: BookOpen }, { id: 'activity', title: 'Activity trail', icon: FileClock }, { id: 'sources', title: 'Source status', icon: ShieldCheck }];
  const activeNav = route.startsWith('case/') || route === 'new' ? 'queue' : route;
  return <><a href="#main" className="skip-link" onClick={e => { e.preventDefault(); document.getElementById('main')?.focus(); }}>Skip to content</a><div className="app-shell"><aside className={`sidebar ${mobileMenu ? 'mobile-open' : ''}`}><a href="#queue" className="brand"><Mark /><span>Trust Setu<small>COMPLIANCE WORKSTATION</small></span></a><div className="workspace-label"><span className="tiny-rule" />PROCUREMENT DESK</div><nav aria-label="Primary navigation">{nav.map(item => <a key={item.id} href={`#${item.id}`} className={activeNav === item.id ? 'active' : ''} aria-current={activeNav === item.id ? 'page' : undefined}><item.icon size={18} strokeWidth={1.6} /><span>{item.title}</span>{item.id === 'queue' && <small>{cases.filter(c => !c.decision).length}</small>}</a>)}</nav><div className="sidebar-notice"><FolderOpen size={18} strokeWidth={1.5} /><h3>One case.<br />A complete evidence trail.</h3><p>Read. Verify. Record.</p><span className="sidebar-rule" /></div><div className="sidebar-bottom"><div className="workspace-avatar">TS</div><div><strong>Local workspace</strong><span>Saved in this browser</span></div><HardDrive size={15} /></div></aside>{mobileMenu && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setMobileMenu(false)} />}
    <div className="main-shell"><header className="workspace-bar"><div className="workspace-breadcrumb"><button className="icon-button menu-toggle" aria-label="Toggle navigation" aria-expanded={mobileMenu} onClick={() => setMobileMenu(!mobileMenu)}>{mobileMenu ? <X size={19} /> : <Menu size={19} />}</button><span>Procurement desk</span><ChevronRight size={13} /><strong>{route === 'new' ? 'New case' : active ? 'Case review' : nav.find(n => n.id === route)?.title || 'Workspace'}</strong></div><div className="workspace-tools"><button className={`connection-indicator ${online === false ? 'offline' : ''}`} onClick={() => void refreshHealth()} title="Check backend connection">{online === null ? <LoaderCircle size={12} className="spin" /> : online ? <span className="status-dot green" /> : <WifiOff size={13} />}<span>{online === null ? 'Connecting' : online ? 'Analysis service connected' : 'Analysis service offline'}</span></button><span className="toolbar-divider" /><a className="icon-button" href="#sources" aria-label="About source verification"><CircleHelp size={18} strokeWidth={1.6} /></a></div></header>
    <main id="main" tabIndex={-1}><div className="workspace-topnote"><span>TRUST THROUGH TRACEABILITY</span><span>{new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date())}</span></div>{error && <div className="error-banner" role="alert"><div><strong>We couldn’t complete that step.</strong><p>{error}</p></div><button className="icon-button" aria-label="Dismiss error" onClick={() => setError('')}><X size={17} /></button></div>}
      {route === 'queue' && <Queue cases={cases} loading={loading} />}{route === 'new' && <Intake key={seed?.id || 'new'} initial={seed} onCreate={create} busy={!!task} />}{active && <CaseView key={active.id} record={active} busy={!!task} onAssess={assess} onRetry={retryExtraction} onRecord={decision => void decide(decision)} onExport={() => downloadReport(active)} onAnother={() => { setSeed(active); window.location.hash = 'new'; }} />}{route === 'records' && <Records cases={cases} />}{route === 'activity' && <ActivityLog cases={cases} />}{route === 'sources' && <Sources cases={cases} online={online} onRefresh={() => void refreshHealth()} />}{!['queue', 'new', 'records', 'activity', 'sources'].includes(route) && !active && !loading && <Empty title="This case isn’t in this workspace." action={<a className="button primary" href="#queue">Back to queue</a>}>Cases belong to the browser and address where they were created.</Empty>}
      <footer className="workspace-footer"><span><Mark small />TRUST SETU<span className="footer-divider">/</span>Evidence-led procurement</span><span>Officer judgement remains the final word.</span></footer></main></div></div>
    {task && <div className="task-status" role="status"><LoaderCircle className="spin" size={20} /><div><strong>{task}</strong><span>The backend is reading the clauses. If local inference reaches its configured limit, a conservative checklist will be returned for review.</span></div><button className="button secondary small" onClick={() => controller.current?.abort()}>Cancel request</button></div>}{toast && <div className="toast" role="status"><Check size={16} />{toast}<button aria-label="Dismiss notification" onClick={() => setToast('')}><X size={14} /></button></div>}{active && <div className="print-only"><CaseReport record={active} /></div>}</>;
}
