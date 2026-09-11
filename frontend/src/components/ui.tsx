import { ArrowUpRight, Check, CircleHelp, FileText, Minus, ShieldCheck, TriangleAlert, X } from 'lucide-react';
import type { ReactNode } from 'react';

export function Mark({ small = false }: { small?: boolean }) {
  return <svg className={small ? 'brand-mark small' : 'brand-mark'} viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M9 35h30M12 34V19h24v15M10 19h28M16 19v-6h16v6M20 24v10m8-10v10M19 9l5-3 5 3" stroke="currentColor" strokeWidth="1.5" /><path d="M7 40h34" stroke="currentColor" strokeWidth="1.5" /></svg>;
}
export const dateTime = (date: string) => new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(date));
export const dateOnly = (date: string) => date ? new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(date + (date.length === 10 ? 'T12:00:00' : ''))) : 'Not recorded';
export const fileSize = (size: number) => size < 1024 * 1024 ? `${Math.round(size / 1024)} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;
export function Badge({ state, children }: { state: string; children?: ReactNode }) {
  const Icon = state === 'pass' || state === 'qualify' ? Check : state === 'fail' || state === 'reject' ? X : state === 'review' || state === 'clarification' ? CircleHelp : state === 'missing' ? Minus : FileText;
  const labels: Record<string, string> = { pass: 'Met', fail: 'Not met', missing: 'Missing', review: 'Needs review', qualify: 'Qualified', clarification: 'Clarification requested', reject: 'Not qualified', draft: 'Draft', requirements: 'Checklist review', assessed: 'Awaiting decision', decided: 'Decision recorded' };
  return <span className={`badge badge-${state}`}><Icon size={12} strokeWidth={1.8} />{children || labels[state] || state}</span>;
}
export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warning' | 'error' }) {
  return <div className={`notice notice-${tone}`} role={tone === 'error' ? 'alert' : undefined}>{tone === 'info' ? <ShieldCheck size={17} /> : <TriangleAlert size={17} />}<div>{children}</div></div>;
}
export function Empty({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return <div className="empty-state"><div className="docket-illustration" aria-hidden="true"><span className="docket-tab" /><span className="docket-number">TS / 01</span><div className="docket-line" /><div className="docket-line short" /><div className="docket-check"><Check size={18} /></div><div className="docket-line" /><div className="docket-line short" /></div><h2>{title}</h2><p>{children}</p>{action}</div>;
}
export function PageHead({ label, title, description, action }: { label: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="page-head"><div><div className="eyebrow">{label}</div><h1 tabIndex={-1}>{title}</h1>{description && <p>{description}</p>}</div>{action && <div className="page-actions">{action}</div>}</div>;
}
export function TextLink({ href, children }: { href: string; children: ReactNode }) { return <a className="text-link" href={href}>{children}<ArrowUpRight size={15} /></a>; }
