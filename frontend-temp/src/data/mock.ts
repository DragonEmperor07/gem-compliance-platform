/**
 * Mock data for the Trust Setu officer console.
 *
 * Everything here is illustrative. It is shaped like real GeM / statutory data
 * (GSTIN, UDYAM, PAN, CIN formats) so the UI can be designed against realistic
 * density, but no value is retrieved from a live portal.
 */

export type Verdict = 'ok' | 'warn' | 'alert' | 'na' | 'pending';

export interface Check {
  id: string;
  portal: string;
  label: string;
  submitted: string;
  retrieved: string;
  verdict: Verdict;
  state: string;
  ts: string;
  evidence: string;
}

export interface CheckGroup {
  id: string;
  title: string;
  note: string;
  checks: Check[];
}

export const officer = {
  name: 'R. Nair',
  initials: 'RN',
  role: 'Procurement Officer',
  office: 'CPSE · Scientific Procurement Division',
  email: 'r.nair@nic.in',
};

export const tender = {
  id: 'GEM/2026/B/4471',
  title: 'Supply of laboratory equipment',
  category: 'Scientific instruments · Class-I local supplier preference',
  value: '₹ 4.82 Cr',
  bidders: 12,
  verified: 12,
  closes: '2 days',
  opened: '18 Aug 2026',
};

export interface Bidder {
  id: string;
  seq: string;
  ini: string;
  name: string;
  city: string;
  entity: string;
  msme: string;
  score: number;
  risk: 'Low' | 'Medium' | 'High';
  status: string;
  tone: Verdict;
  checksPassed: number;
  checksTotal: number;
  flags: number;
}

/* All twelve bidders on GEM/2026/B/4471, so the tender board can show the
   whole field rather than five rows under a header claiming twelve. The six
   that also appear in `queue` carry the same score and status in both. */
export const bidders: Bidder[] = [
  {
    id: 'b07', seq: '07', ini: 'SI', name: 'Saraswati Industrial Works Pvt Ltd',
    city: 'Nashik, MH', entity: 'Private Limited', msme: 'MSME · Small',
    score: 96, risk: 'Low', status: 'Qualified', tone: 'ok',
    checksPassed: 37, checksTotal: 38, flags: 1,
  },
  {
    id: 'b12', seq: '12', ini: 'PS', name: 'Prayag Scientific Works',
    city: 'Prayagraj, UP', entity: 'Partnership', msme: 'MSME · Small',
    score: 93, risk: 'Low', status: 'Qualified', tone: 'ok',
    checksPassed: 37, checksTotal: 38, flags: 1,
  },
  {
    id: 'b03', seq: '03', ini: 'MS', name: 'Meridian Scientific Instruments',
    city: 'Pune, MH', entity: 'Partnership', msme: 'MSME · Micro',
    score: 91, risk: 'Low', status: 'Qualified', tone: 'ok',
    checksPassed: 36, checksTotal: 38, flags: 2,
  },
  {
    id: 'b02', seq: '02', ini: 'KI', name: 'Konark Instruments Pvt Ltd',
    city: 'Bhubaneswar, OD', entity: 'Private Limited', msme: 'MSME · Small',
    score: 89, risk: 'Low', status: 'Qualified', tone: 'ok',
    checksPassed: 36, checksTotal: 38, flags: 2,
  },
  {
    id: 'b14', seq: '14', ini: 'VI', name: 'Vaigai Instruments Pvt Ltd',
    city: 'Madurai, TN', entity: 'Private Limited', msme: 'MSME · Small',
    score: 87, risk: 'Low', status: 'Qualified', tone: 'ok',
    checksPassed: 35, checksTotal: 38, flags: 3,
  },
  {
    id: 'b06', seq: '06', ini: 'CL', name: 'Chenab Lab Systems',
    city: 'Jammu, JK', entity: 'Proprietorship', msme: 'MSME · Micro',
    score: 85, risk: 'Low', status: 'Qualified', tone: 'ok',
    checksPassed: 35, checksTotal: 38, flags: 3,
  },
  {
    id: 'b04', seq: '04', ini: 'ME', name: 'Mahanadi Equipment Co',
    city: 'Cuttack, OD', entity: 'Partnership', msme: 'MSME · Small',
    score: 82, risk: 'Low', status: 'Qualified', tone: 'ok',
    checksPassed: 34, checksTotal: 38, flags: 4,
  },
  {
    id: 'b11', seq: '11', ini: 'NL', name: 'Nova Labtech Private Limited',
    city: 'Hyderabad, TS', entity: 'Private Limited', msme: 'Large enterprise',
    score: 78, risk: 'Medium', status: 'Awaiting decision', tone: 'warn',
    checksPassed: 32, checksTotal: 38, flags: 3,
  },
  {
    id: 'b08', seq: '08', ini: 'BA', name: 'Betwa Analytical Pvt Ltd',
    city: 'Bhopal, MP', entity: 'Private Limited', msme: 'MSME · Small',
    score: 69, risk: 'Medium', status: 'In review', tone: 'warn',
    checksPassed: 30, checksTotal: 38, flags: 5,
  },
  {
    id: 'b05', seq: '05', ini: 'KC', name: 'Kaveri Instruments & Company',
    city: 'Coimbatore, TN', entity: 'Proprietorship', msme: 'MSME · Small',
    score: 64, risk: 'Medium', status: 'In review', tone: 'warn',
    checksPassed: 29, checksTotal: 38, flags: 5,
  },
  {
    id: 'b10', seq: '10', ini: 'ST', name: 'Sharda Test Instruments',
    city: 'Ludhiana, PB', entity: 'Partnership', msme: 'MSME · Micro',
    score: 55, risk: 'High', status: 'Flagged', tone: 'alert',
    checksPassed: 24, checksTotal: 38, flags: 7,
  },
  {
    id: 'b09', seq: '09', ini: 'OS', name: 'Orion Supplies Company',
    city: 'Kanpur, UP', entity: 'Private Limited', msme: 'Large enterprise',
    score: 38, risk: 'High', status: 'Flagged', tone: 'alert',
    checksPassed: 19, checksTotal: 38, flags: 9,
  },
];

export const bidderStats = {
  total: 12,
  qualified: 7,
  awaiting: 1,
  review: 2,
  flagged: 2,
  avgScore: 77,
};

/* ---------------------------------------------------------------
   Focus bidder — Nova Labtech. Chosen deliberately: it is neither a
   clean pass nor an obvious reject, so the screen has to show the
   engine reasoning and hand a real judgement to the officer.
   --------------------------------------------------------------- */

export const focus = {
  id: 'b11',
  name: 'Nova Labtech Private Limited',
  ini: 'NL',
  seq: 'Bidder 11',
  entity: 'Private Limited · Large enterprise',
  city: 'Hyderabad, Telangana',
  incorporated: '14 Jun 2011',
  turnover: '₹ 62.4 Cr (FY 2024-25)',
  contact: 'tenders@novalabtech.example',
  score: 78,
  risk: 'Medium' as const,
  status: 'Awaiting officer decision',
  checksPassed: 32,
  checksTotal: 38,
  ids: [
    { k: 'GSTIN', v: '36AACCN4521M1ZQ' },
    { k: 'PAN', v: 'AACCN4521M' },
    { k: 'CIN', v: 'U33112TG2011PTC076544' },
    { k: 'Udyam', v: 'Not registered' },
  ],
};

export const groups: CheckGroup[] = [
  {
    id: 'statutory',
    title: 'Statutory registrations',
    note: 'Identity and registration status, cross-checked against submitted values',
    checks: [
      {
        id: 'udyam', portal: 'Udyam', label: 'MSME registration',
        submitted: 'Not claimed', retrieved: 'No Udyam record',
        verdict: 'na', state: 'Not applicable', ts: '09:14:03',
        evidence: 'udyamregistration.gov.in',
      },
      {
        id: 'gst-reg', portal: 'GSTN', label: 'GST registration status',
        submitted: '36AACCN4521M1ZQ', retrieved: 'Active · regular taxpayer',
        verdict: 'ok', state: 'Matched', ts: '09:14:05',
        evidence: 'gst.gov.in',
      },
      {
        id: 'gst-ret', portal: 'GSTN', label: 'Return filing (GSTR-3B)',
        submitted: 'Declared current', retrieved: 'Filed to Nov 2025 · Dec pending',
        verdict: 'warn', state: 'Discrepancy', ts: '09:14:06',
        evidence: 'gst.gov.in',
      },
      {
        id: 'pan', portal: 'Income Tax', label: 'PAN validity',
        submitted: 'AACCN4521M', retrieved: 'Active · name matched',
        verdict: 'ok', state: 'Matched', ts: '09:14:07',
        evidence: 'incometax.gov.in',
      },
      {
        id: 'itr', portal: 'Income Tax', label: 'ITR filing (AY 2025-26)',
        submitted: 'Filed', retrieved: 'Filed 27 Sep 2025 · acknowledged',
        verdict: 'ok', state: 'Matched', ts: '09:14:07',
        evidence: 'incometax.gov.in',
      },
      {
        id: 'mca', portal: 'MCA21', label: 'Corporate status & charges',
        submitted: 'U33112TG2011PTC076544', retrieved: 'Active · no pending charges',
        verdict: 'ok', state: 'Matched', ts: '09:14:08',
        evidence: 'mca.gov.in',
      },
    ],
  },
  {
    id: 'labour',
    title: 'Labour compliance',
    note: 'Applicable because the bidder declares more than 20 employees',
    checks: [
      {
        id: 'epfo', portal: 'EPFO', label: 'Establishment status',
        submitted: 'TGHYD0045612000', retrieved: 'Active · ECR filed to Dec 2025',
        verdict: 'ok', state: 'Matched', ts: '09:14:09',
        evidence: 'epfindia.gov.in',
      },
      {
        id: 'epfo-count', portal: 'EPFO', label: 'Employee count reconciliation',
        submitted: '214 employees', retrieved: '207 members in Dec ECR',
        verdict: 'warn', state: 'Minor variance', ts: '09:14:09',
        evidence: 'epfindia.gov.in',
      },
      {
        id: 'esic', portal: 'ESIC', label: 'Insurance registration',
        submitted: '55000123450000999', retrieved: 'Active · contributions current',
        verdict: 'ok', state: 'Matched', ts: '09:14:10',
        evidence: 'esic.gov.in',
      },
    ],
  },
  {
    id: 'preference',
    title: 'Purchase preference & local content',
    note: 'Tender clause 7.2 requires Class-I local supplier status (min. 50% local content)',
    checks: [
      {
        id: 'mii', portal: 'Make in India', label: 'Local content declaration',
        submitted: '46% local content', retrieved: 'Below Class-I threshold of 50%',
        verdict: 'alert', state: 'Non-compliant', ts: '09:14:11',
        evidence: 'tender clause 7.2 · DPIIT order',
      },
      {
        id: 'bis', portal: 'BIS / DPIIT', label: 'Product certification',
        submitted: 'IS 13450 claimed', retrieved: 'Licence CM/L-7712345 valid',
        verdict: 'ok', state: 'Matched', ts: '09:14:11',
        evidence: 'bis.gov.in',
      },
      {
        id: 'startup', portal: 'Startup India', label: 'DPIIT recognition',
        submitted: 'Not claimed', retrieved: 'No recognition on record',
        verdict: 'na', state: 'Not applicable', ts: '09:14:12',
        evidence: 'startupindia.gov.in',
      },
      {
        id: 'nsic', portal: 'NSIC', label: 'Single-point registration',
        submitted: 'Not claimed', retrieved: 'No NSIC registration',
        verdict: 'na', state: 'Not applicable', ts: '09:14:12',
        evidence: 'nsic.co.in',
      },
    ],
  },
  {
    id: 'documents',
    title: 'Documents & authorisation',
    note: 'Fetched from DigiLocker where issuer-verified copies are available',
    checks: [
      {
        id: 'oem', portal: 'Uploaded', label: 'OEM authorisation letter',
        submitted: 'OEM-NLT-2026-118', retrieved: 'Valid to 31 Mar 2026 · signatory verified',
        verdict: 'ok', state: 'Verified', ts: '09:14:13',
        evidence: 'AI extraction · confidence 0.97',
      },
      {
        id: 'dl', portal: 'DigiLocker', label: 'Issuer-verified documents',
        submitted: '7 documents', retrieved: '6 of 7 issuer-verified',
        verdict: 'warn', state: 'Partial', ts: '09:14:13',
        evidence: 'digilocker.gov.in',
      },
      {
        id: 'incorp', portal: 'Uploaded', label: 'Certificate of incorporation',
        submitted: 'Manual upload (PDF)', retrieved: 'Matches MCA21 record',
        verdict: 'warn', state: 'Not issuer-verified', ts: '09:14:14',
        evidence: 'AI extraction · cross-checked with MCA21',
      },
    ],
  },
  {
    id: 'integrity',
    title: 'Integrity & debarment',
    note: 'Searched across central, GeM and state debarment registers',
    checks: [
      {
        id: 'debar', portal: 'Debarment', label: 'Blacklisting / debarment search',
        submitted: 'Nil declaration', retrieved: 'No records across 6 registers',
        verdict: 'ok', state: 'Clear', ts: '09:14:15',
        evidence: 'CPPP · GeM · 4 state registers',
      },
      {
        id: 'gem-perf', portal: 'GeM', label: 'Seller performance rating',
        submitted: '—', retrieved: '4.2 / 5 across 31 orders',
        verdict: 'ok', state: 'Satisfactory', ts: '09:14:15',
        evidence: 'gem.gov.in seller profile',
      },
    ],
  },
];

export const findings = [
  {
    severity: 'high' as const,
    title: 'Local content below Class-I threshold',
    detail:
      'Declared local content is 46%. Tender clause 7.2 restricts this procurement to Class-I local suppliers (minimum 50%). On the declaration as submitted, the bidder does not meet the purchase-preference condition.',
    action: 'Officer decision required — clause 7.2 is a qualifying condition, not a scoring factor.',
    ref: 'mii',
  },
  {
    severity: 'medium' as const,
    title: 'GSTR-3B for December 2025 not filed',
    detail:
      'Returns are filed up to November 2025. The December return was not on record at the time of retrieval. The statutory due date had passed by 4 days.',
    action: 'Can be cured — request an updated filing status before award.',
    ref: 'gst-ret',
  },
  {
    severity: 'low' as const,
    title: 'Incorporation certificate not issuer-verified',
    detail:
      'One of seven documents was supplied as a manual upload rather than through DigiLocker. Extracted fields match the MCA21 record, so the content is corroborated, but the copy is not issuer-verified.',
    action: 'Advisory — corroborated against MCA21; no action strictly required.',
    ref: 'incorp',
  },
];

export const recommendation = {
  verdict: 'Do not qualify on clause 7.2',
  stance: 'alert' as const,
  confidence: 0.88,
  summary:
    'Statutory and labour compliance are substantially clean. The bidder fails a stated qualifying condition of this tender, which is not a matter of degree.',
  for: [
    'All statutory registrations (GST, PAN, MCA21) are active and matched.',
    'EPFO and ESIC are current; the employee-count variance is within normal payroll movement.',
    'No debarment record across six registers; GeM performance rating is satisfactory.',
  ],
  against: [
    'Local content of 46% is below the 50% Class-I threshold set by clause 7.2.',
    'December GSTR-3B was unfiled past its due date at the time of retrieval.',
  ],
  caveats: [
    'Local content is taken from the bidder’s own declaration; Trust Setu does not independently audit the computation.',
    'Portal data reflects retrieval at 09:14 on 8 Sep 2026 and may since have changed.',
  ],
};

export const documents = [
  {
    name: 'GST registration certificate', type: 'REG-06', pages: 2,
    source: 'DigiLocker', status: 'ok' as const, confidence: 0.99,
    fields: [
      { k: 'GSTIN', v: '36AACCN4521M1ZQ', match: true },
      { k: 'Legal name', v: 'NOVA LABTECH PRIVATE LIMITED', match: true },
      { k: 'Registration date', v: '01 Jul 2017', match: true },
    ],
  },
  {
    name: 'Local content certificate', type: 'Self-declaration', pages: 1,
    source: 'Uploaded', status: 'alert' as const, confidence: 0.94,
    fields: [
      { k: 'Local content', v: '46%', match: false },
      { k: 'Certified by', v: 'Statutory auditor', match: true },
      { k: 'Date', v: '22 Aug 2026', match: true },
    ],
  },
  {
    name: 'OEM authorisation letter', type: 'OEM-AL', pages: 3,
    source: 'Uploaded', status: 'ok' as const, confidence: 0.97,
    fields: [
      { k: 'Reference', v: 'OEM-NLT-2026-118', match: true },
      { k: 'Valid until', v: '31 Mar 2026', match: true },
      { k: 'Signatory', v: 'Verified against OEM record', match: true },
    ],
  },
  {
    name: 'Certificate of incorporation', type: 'INC-11', pages: 1,
    source: 'Uploaded', status: 'warn' as const, confidence: 0.96,
    fields: [
      { k: 'CIN', v: 'U33112TG2011PTC076544', match: true },
      { k: 'Date', v: '14 Jun 2011', match: true },
      { k: 'Issuer verification', v: 'Not available', match: false },
    ],
  },
];

export const portals = [
  { name: 'Udyam / MSME', file: 'udyam.png', status: 'ok', latency: '820 ms', uptime: '99.4%', mode: 'API', last: '2 min ago' },
  { name: 'GSTN', file: null, glyph: 'gst', status: 'ok', latency: '1.2 s', uptime: '99.1%', mode: 'API', last: '2 min ago' },
  { name: 'Income Tax / PAN', file: 'pan.png', status: 'ok', latency: '940 ms', uptime: '98.8%', mode: 'API', last: '2 min ago' },
  { name: 'MCA21', file: 'mca21.svg', status: 'ok', latency: '1.6 s', uptime: '97.9%', mode: 'API', last: '3 min ago' },
  { name: 'EPFO', file: 'epfo.png', status: 'ok', latency: '2.1 s', uptime: '96.2%', mode: 'API', last: '4 min ago' },
  { name: 'ESIC', file: 'esic.png', status: 'degraded', latency: '6.4 s', uptime: '91.7%', mode: 'API', last: '11 min ago' },
  { name: 'Startup India', file: 'startup.png', status: 'ok', latency: '710 ms', uptime: '99.6%', mode: 'API', last: '2 min ago' },
  { name: 'NSIC', file: 'nsic.png', status: 'ok', latency: '1.1 s', uptime: '98.3%', mode: 'API', last: '5 min ago' },
  { name: 'DigiLocker', file: 'digilocker.png', status: 'ok', latency: '640 ms', uptime: '99.8%', mode: 'Consent', last: '1 min ago' },
  { name: 'Make in India / BIS', file: 'makeinindia.png', status: 'ok', latency: '1.4 s', uptime: '98.0%', mode: 'API', last: '6 min ago' },
  { name: 'Debarment registers', file: null, glyph: 'ban', status: 'ok', latency: '2.8 s', uptime: '97.1%', mode: 'Batch', last: '18 min ago' },
  { name: 'GeM seller profile', file: 'gem.svg', status: 'ok', latency: '530 ms', uptime: '99.9%', mode: 'API', last: '1 min ago' },
];

export const auditTrail = [
  { ts: '08 Sep · 09:14:02', actor: 'system', action: 'bid.received', detail: '14 documents ingested from GeM', tone: 'neutral' },
  { ts: '08 Sep · 09:14:03', actor: 'system', action: 'verification.started', detail: '38 checks queued across 12 sources', tone: 'neutral' },
  { ts: '08 Sep · 09:14:05', actor: 'GSTN', action: 'portal.response', detail: 'Registration active; GSTR-3B filed to Nov 2025', tone: 'warn' },
  { ts: '08 Sep · 09:14:08', actor: 'MCA21', action: 'portal.response', detail: 'Company active, no pending charges', tone: 'ok' },
  { ts: '08 Sep · 09:14:11', actor: 'engine', action: 'rule.evaluated', detail: 'Clause 7.2 — local content 46% < 50% threshold', tone: 'alert' },
  { ts: '08 Sep · 09:14:13', actor: 'engine', action: 'document.extracted', detail: 'OEM authorisation parsed, confidence 0.97', tone: 'ok' },
  { ts: '08 Sep · 09:14:15', actor: 'system', action: 'debarment.searched', detail: 'No records across 6 registers', tone: 'ok' },
  { ts: '08 Sep · 09:14:16', actor: 'engine', action: 'score.computed', detail: 'Compliance 78/100 · risk Medium', tone: 'neutral' },
  { ts: '08 Sep · 09:14:16', actor: 'engine', action: 'recommendation.issued', detail: 'Do not qualify on clause 7.2 · confidence 0.88', tone: 'alert' },
  { ts: '08 Sep · 09:31:47', actor: 'R. Nair', action: 'officer.note', detail: '“Seeking clarification on local content computation.”', tone: 'neutral' },
  { ts: '08 Sep · 09:32:02', actor: 'R. Nair', action: 'clarification.raised', detail: 'Query issued to bidder, due 11 Sep 2026', tone: 'warn' },
];

/* ---------------------------------------------------------------
   The overview queue. Every count on that screen (tabs, stat strip,
   row totals) is derived from this array — nothing is hard-coded in
   the page, so the numbers cannot drift apart from the table.
   `mins` exists so age sorts numerically rather than by its label.
   --------------------------------------------------------------- */

export type QueueStatus = 'awaiting' | 'flagged' | 'review' | 'qualified';

export interface QueueRow {
  id: string;
  name: string;
  tender: string;
  score: number;
  risk: 'Low' | 'Medium' | 'High';
  tone: 'ok' | 'warn' | 'alert';
  why: string;
  age: string;
  mins: number;
  status: QueueStatus;
  owner: string;
}

export const queue: QueueRow[] = [
  { id: 'b11', name: 'Nova Labtech Private Limited',      tender: 'GEM/2026/B/4471', score: 78, risk: 'Medium', tone: 'warn',  why: 'Clause 7.2 — local content below threshold', age: '17 min', mins: 17,  status: 'awaiting',  owner: 'RN' },
  { id: 'b09', name: 'Orion Supplies Company',            tender: 'GEM/2026/B/4471', score: 38, risk: 'High',   tone: 'alert', why: 'Debarment record in state register',        age: '22 min', mins: 22,  status: 'flagged',   owner: 'RN' },
  { id: 'b05', name: 'Kaveri Instruments & Company',      tender: 'GEM/2026/B/4471', score: 64, risk: 'Medium', tone: 'warn',  why: 'EPFO contributions in arrears',             age: '1 h',    mins: 62,  status: 'review',    owner: 'AS' },
  { id: 'b21', name: 'Deccan Analytical Systems',         tender: 'GEM/2026/B/4398', score: 71, risk: 'Medium', tone: 'warn',  why: 'OEM authorisation expired',                 age: '3 h',    mins: 181, status: 'awaiting',  owner: 'RN' },
  { id: 'b33', name: 'Vindhya Scientific Traders',        tender: 'GEM/2026/B/4502', score: 52, risk: 'High',   tone: 'alert', why: 'GSTIN cancelled at source',                 age: '4 h',    mins: 243, status: 'flagged',   owner: 'AS' },
  { id: 'b24', name: 'Chandra Lab Solutions LLP',         tender: 'GEM/2026/B/4398', score: 69, risk: 'Medium', tone: 'warn',  why: 'Turnover below tender floor',               age: '5 h',    mins: 296, status: 'awaiting',  owner: 'RN' },
  { id: 'b07', name: 'Saraswati Industrial Works Pvt Ltd', tender: 'GEM/2026/B/4471', score: 96, risk: 'Low',   tone: 'ok',    why: '',                                          age: '6 h',    mins: 358, status: 'qualified', owner: 'RN' },
  { id: 'b03', name: 'Meridian Scientific Instruments',   tender: 'GEM/2026/B/4471', score: 91, risk: 'Low',    tone: 'ok',    why: '',                                          age: '6 h',    mins: 371, status: 'qualified', owner: 'AS' },
  { id: 'b02', name: 'Konark Instruments Pvt Ltd',        tender: 'GEM/2026/B/4471', score: 89, risk: 'Low',    tone: 'ok',    why: '',                                          age: '7 h',    mins: 402, status: 'qualified', owner: 'RN' },
  { id: 'b36', name: 'Gomti Scientific Supplies',         tender: 'GEM/2026/B/4502', score: 88, risk: 'Low',    tone: 'ok',    why: '',                                          age: '7 h',    mins: 419, status: 'qualified', owner: 'AS' },
  { id: 'b26', name: 'Anantha Test Systems',              tender: 'GEM/2026/B/4398', score: 86, risk: 'Low',    tone: 'ok',    why: '',                                          age: '8 h',    mins: 468, status: 'qualified', owner: 'RN' },
  { id: 'b31', name: 'Nilgiri Lab Equipment Co',          tender: 'GEM/2026/B/4502', score: 84, risk: 'Low',    tone: 'ok',    why: '',                                          age: '9 h',    mins: 521, status: 'qualified', owner: 'AS' },
  { id: 'b28', name: 'Bharat Precision Works',            tender: 'GEM/2026/B/4398', score: 83, risk: 'Low',    tone: 'ok',    why: '',                                          age: '9 h',    mins: 547, status: 'qualified', owner: 'RN' },
  { id: 'b39', name: 'Yamuna Analytical Pvt Ltd',         tender: 'GEM/2026/B/4502', score: 81, risk: 'Low',    tone: 'ok',    why: '',                                          age: '10 h',   mins: 603, status: 'qualified', owner: 'AS' },
  { id: 'b41', name: 'Tapti Instruments & Controls',      tender: 'GEM/2026/B/4502', score: 74, risk: 'Medium', tone: 'warn',  why: 'DigiLocker consent not granted',            age: '11 h',   mins: 664, status: 'review',    owner: 'RN' },
  { id: 'b18', name: 'Sutlej Scientific Pvt Ltd',         tender: 'GEM/2026/B/4355', score: 67, risk: 'Medium', tone: 'warn',  why: 'Past-performance rating below 3.5',         age: '12 h',   mins: 722, status: 'review',    owner: 'AS' },
];

export const queueCounts = {
  awaiting:  queue.filter((q) => q.status === 'awaiting').length,
  flagged:   queue.filter((q) => q.status === 'flagged').length,
  review:    queue.filter((q) => q.status === 'review').length,
  qualified: queue.filter((q) => q.status === 'qualified').length,
  all:       queue.length,
};

export const activeTenders = [
  { id: 'GEM/2026/B/4471', title: 'Supply of laboratory equipment', bidders: 12, verified: 12, pending: 3, closes: '2 days', value: '₹ 4.82 Cr' },
  { id: 'GEM/2026/B/4398', title: 'Analytical instruments — annual rate contract', bidders: 8, verified: 8, pending: 1, closes: '5 days', value: '₹ 2.15 Cr' },
  { id: 'GEM/2026/B/4502', title: 'Laboratory consumables (Q3)', bidders: 19, verified: 14, pending: 0, closes: '9 days', value: '₹ 88.6 L' },
  { id: 'GEM/2026/B/4355', title: 'Calibration services — 3 year', bidders: 6, verified: 6, pending: 0, closes: 'Closed', value: '₹ 1.34 Cr' },
];
