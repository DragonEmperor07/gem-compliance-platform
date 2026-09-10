/**
 * Retrieval corpus for the console assistant.
 *
 * The assistant is a genuine retrieval system, not a canned script: the browser
 * scores this corpus against the officer's question (BM25-ish term weighting +
 * keyword and title boosts) and answers only from the passages it retrieves,
 * citing each one. Nothing is generated beyond the passage text.
 *
 * Every passage restates something already in `mock.ts`, the tender documents or
 * the platform's stated policy — so an answer can always be traced to a source
 * the officer can open. No figure appears here that is not somewhere on a screen.
 */

export interface Passage {
  id: string;
  /** short heading shown on the citation chip */
  title: string;
  /** where it came from — portal, record, or policy */
  source: string;
  /** page the citation links to, relative to BASE_URL */
  href?: string;
  /** the answer, stated directly */
  answer: string;
  /** supporting detail — also the retrieval body */
  text: string;
  /** synonyms and phrasings the body does not contain */
  keys: string[];
}

export const passages: Passage[] = [
  /* ---------------- platform & policy ---------------- */
  {
    id: 'what-is',
    title: 'What Trust Setu does',
    source: 'Platform',
    answer:
      'Trust Setu verifies a GeM bidder against eleven government portals and returns one scored, auditable compliance record. It recommends; the procurement officer decides.',
    text: 'Trust Setu is a bid compliance verification platform for the Government e-Marketplace. It queries Udyam, GSTN, PAN/Income Tax, MCA21, EPFO, ESIC, DigiLocker, NSIC, Startup India, Make in India BIS-DPIIT and debarment registers, cross-checks each submitted value against what the portal returns, and produces a compliance score, a risk level and a full evidence trail for the officer.',
    keys: ['what is trust-setu', 'purpose', 'overview', 'product', 'about', 'summary', 'explain'],
  },
  {
    id: 'decides',
    title: 'Who makes the decision',
    source: 'Policy',
    answer:
      'The procurement officer does. Trust Setu never awards or disqualifies — it verifies, scores and evidences, and records the officer’s reasoning alongside it.',
    text: 'Qualification stays a human decision. The platform produces a recommendation with a confidence figure and an explicit limits note, and the officer records the actual decision with a reason. Human in the loop by design. The AI does not approve bidders.',
    keys: ['who decides', 'decides whether', 'bidder qualifies', 'human in the loop', 'does ai decide', 'automatic', 'approve', 'authority', 'disqualify'],
  },
  {
    id: 'access',
    title: 'How portal data is accessed',
    source: 'Policy',
    answer:
      'Through authorised channels only — published government APIs where they exist, and consent-based retrieval via DigiLocker where they do not. Nothing is scraped.',
    text: 'Every retrieval is logged against the bidder record that triggered it. Access modes are shown per source on the portal status screen: API, Consent or Batch.',
    keys: ['api', 'scraping', 'scrape', 'consent', 'digilocker', 'integration', 'legal', 'authorised', 'access'],
  },
  {
    id: 'portal-down',
    title: 'When a portal is unavailable',
    source: 'Policy',
    href: 'app/portals',
    answer:
      'The check is marked pending — never passed and never failed. A missing source is always reported as missing, and the officer sees exactly which sources responded.',
    text: 'Trust Setu never infers compliance from an absent response. The portal status screen exists to make an unavailable or degraded source visible rather than silently absorbing it into a score.',
    keys: ['down', 'portal is down', 'what happens', 'offline', 'unavailable', 'outage', 'timeout', 'not responding', 'fails', 'missing source', 'pending'],
  },
  {
    id: 'retention',
    title: 'Data retention',
    source: 'Policy',
    answer:
      'Verification records are retained for the audit period the procuring entity specifies, because an award must remain reconstructible. Source documents are referenced rather than duplicated wherever the integration permits.',
    text: 'Retention exists so that an award can be reconstructed for internal audit or a vigilance enquiry long after the tender closes.',
    keys: ['retention', 'stored', 'privacy', 'how long', 'delete', 'keep data', 'gdpr'],
  },
  {
    id: 'traceable',
    title: 'Traceability of every check',
    source: 'Policy',
    href: 'app/audit',
    answer:
      'Yes — each retrieval, evaluation and officer action is timestamped and linked back to the source record that produced it.',
    text: 'The audit trail records bid receipt, verification start, each portal response, every rule evaluation, the computed score, the issued recommendation and every officer note or decision, with actor and timestamp.',
    keys: ['audit', 'trace', 'traceable', 'log', 'evidence chain', 'vigilance', 'reconstruct', 'provenance'],
  },
  {
    id: 'tender-clauses',
    title: 'Tender-specific eligibility',
    source: 'Platform',
    answer:
      'Yes. Alongside the statutory checks that apply to every bid, the engine evaluates the conditions written into the individual tender — turnover thresholds, local content, OEM authorisation, past performance and similar clauses.',
    text: 'For this tender, clause 7.2 restricts the procurement to Class-I local suppliers with a minimum of 50% local content.',
    keys: ['clause', 'eligibility', 'conditions', 'tender specific', 'criteria', 'turnover', 'custom rules'],
  },
  {
    id: 'score-meaning',
    title: 'What the compliance score means',
    source: 'Platform',
    href: 'app/bidder',
    answer:
      'The score is a review convenience, not the decision. A bidder can score well and still fail a single qualifying clause — which is exactly what happens here.',
    text: 'The compliance score aggregates the outcome of every check into a 0-100 figure with a risk band. Nova Labtech scores 78 with Medium risk, yet fails clause 7.2, a qualifying condition rather than a scoring factor.',
    keys: ['score', 'scoring', 'how is the score calculated', 'ranking', 'weight', 'risk level', 'means'],
  },
  {
    id: 'prototype',
    title: 'Prototype scope',
    source: 'Platform',
    answer:
      'This is a Smart India Hackathon 2026 prototype for problem statement SIH26100. The console is a working frontend — no live portal is queried and every value on screen is illustrative.',
    text: 'Formats are shaped like real GSTIN, UDYAM, PAN and CIN data so the interface can be designed against realistic density, but no value here was retrieved from a live government portal.',
    keys: ['prototype', 'demo', 'real data', 'sih', 'hackathon', 'fake', 'mock', 'backend', 'live'],
  },

  /* ---------------- the tender ---------------- */
  {
    id: 'tender',
    title: 'Tender GEM/2026/B/4471',
    source: 'Tender record',
    href: 'app/tender',
    answer:
      'GEM/2026/B/4471 — Supply of laboratory equipment, ₹ 4.82 Cr, 12 bidders, all 12 verified. It opened on 18 Aug 2026 and closes in 2 days.',
    text: 'Category: scientific instruments with Class-I local supplier preference. Bid comparison across all twelve bidders is on the tender board.',
    keys: ['tender', 'which tender', 'value', 'closes', 'tender close', 'closing', 'deadline', 'lab equipment', 'laboratory', 'bidders', 'how many bids'],
  },
  {
    id: 'clause72',
    title: 'Clause 7.2 — local content',
    source: 'Tender document',
    href: 'app/bidder',
    answer:
      'Clause 7.2 restricts this procurement to Class-I local suppliers, which requires a minimum of 50% local content. It is a qualifying condition, not a scoring factor.',
    text: 'Nova Labtech declares 46% local content, below the 50% threshold. On the declaration as submitted the bidder does not meet the purchase preference condition. The declaration is the bidder’s own, certified by a statutory auditor on 22 Aug 2026; Trust Setu does not independently audit the computation.',
    keys: ['7.2', 'clause 7.2', 'local content', 'class i', 'class-1', 'make in india', 'dpiit', 'threshold', '46', '50'],
  },
  {
    id: 'open-tenders',
    title: 'Open tenders',
    source: 'Console',
    href: 'app',
    answer:
      'Four tenders are open: GEM/2026/B/4471 (₹ 4.82 Cr, closes in 2 days), B/4398 (₹ 2.15 Cr, 5 days), B/4502 (₹ 88.6 L, 9 days) and B/4355 (₹ 1.34 Cr, closed).',
    text: 'Laboratory equipment, analytical instruments annual rate contract, laboratory consumables Q3, and calibration services three year.',
    keys: ['open tenders', 'all tenders', 'list tenders', 'how many tenders', 'active'],
  },

  /* ---------------- the focus bidder ---------------- */
  {
    id: 'focus',
    title: 'Nova Labtech — record summary',
    source: 'Bidder record',
    href: 'app/bidder',
    answer:
      'Nova Labtech Private Limited scores 78 out of 100 with Medium risk, 32 of 38 checks passed, and is awaiting an officer decision.',
    text: 'Private limited, large enterprise, Hyderabad Telangana, incorporated 14 Jun 2011, turnover ₹ 62.4 Cr for FY 2024-25. Bidder 11 on tender GEM/2026/B/4471. Three findings are open against the record.',
    keys: ['nova', 'labtech', 'bidder 11', 'b11', 'this bidder', 'summary', 'who is', 'score', 'risk', 'status', 'how many checks', 'checks passed', 'checks failed'],
  },
  {
    id: 'focus-ids',
    title: 'Nova Labtech — identifiers',
    source: 'Bidder record',
    href: 'app/bidder',
    answer:
      'GSTIN 36AACCN4521M1ZQ, PAN AACCN4521M, CIN U33112TG2011PTC076544. Not registered on Udyam.',
    text: 'The GSTIN and PAN both resolve to NOVA LABTECH PRIVATE LIMITED and the name matched at source. As a large enterprise it makes no MSME claim, so the Udyam check is not applicable rather than failed.',
    keys: ['gstin', 'gst number', 'pan', 'cin', 'udyam', 'registration number', 'identifier', 'msme number'],
  },
  {
    id: 'focus-why',
    title: 'Why Nova Labtech is flagged',
    source: 'Findings',
    href: 'app/bidder',
    answer:
      'Three findings: local content of 46% is below the clause 7.2 threshold of 50% (high), the December 2025 GSTR-3B was unfiled past its due date (medium), and the incorporation certificate is not issuer-verified (low).',
    text: 'Only the first is a qualifying failure. The GST return can be cured by requesting an updated filing status before award. The incorporation certificate is corroborated against MCA21, so no action is strictly required.',
    keys: ['why flagged', 'flagged', 'why medium', 'problems', 'issues', 'findings', 'what is wrong', 'concerns', 'red flags'],
  },
  {
    id: 'focus-good',
    title: 'What is clean on the record',
    source: 'Bidder record',
    href: 'app/bidder',
    answer:
      'GST registration, PAN, ITR, MCA21 corporate status, EPFO establishment, ESIC registration, BIS product certification, OEM authorisation, debarment search and GeM seller rating all matched.',
    text: 'Statutory and labour compliance are substantially clean. Thirty-two of thirty-eight checks passed.',
    keys: ['clean', 'passed', 'what matched', 'good', 'in order', 'compliant', 'positives'],
  },

  /* ---------------- individual checks ---------------- */
  {
    id: 'chk-gst-reg',
    title: 'GST registration status',
    source: 'GSTN · 09:14:05',
    href: 'app/bidder',
    answer: 'Matched. GSTIN 36AACCN4521M1ZQ is active as a regular taxpayer.',
    text: 'Retrieved from gst.gov.in at 09:14:05 on 8 Sep 2026 and matched against the submitted GSTIN.',
    keys: ['gst registration', 'gst status', 'gstin active', 'taxpayer', 'registered'],
  },
  {
    id: 'chk-gst-ret',
    title: 'GSTR-3B return filing',
    source: 'GSTN · 09:14:06',
    href: 'app/bidder',
    answer:
      'Discrepancy. The bidder declared returns current, but GSTN shows filings only to November 2025 — the December return was not on record, four days past its due date.',
    text: 'This is curable: request an updated filing status from the bidder before award. It is a medium-severity finding, not a qualifying failure.',
    keys: ['gstr', '3b', 'returns', 'filing', 'december', 'late', 'overdue', 'tax return'],
  },
  {
    id: 'chk-pan',
    title: 'PAN validity',
    source: 'Income Tax · 09:14:07',
    href: 'app/bidder',
    answer: 'Matched. PAN AACCN4521M is active and the name matched at source.',
    text: 'Retrieved from incometax.gov.in.',
    keys: ['pan valid', 'income tax', 'itd'],
  },
  {
    id: 'chk-itr',
    title: 'ITR filing AY 2025-26',
    source: 'Income Tax · 09:14:07',
    href: 'app/bidder',
    answer: 'Matched. The return for AY 2025-26 was filed on 27 Sep 2025 and acknowledged.',
    text: 'Retrieved from incometax.gov.in.',
    keys: ['itr', 'income tax return', 'assessment year', 'filed'],
  },
  {
    id: 'chk-mca',
    title: 'MCA21 corporate status',
    source: 'MCA21 · 09:14:08',
    href: 'app/bidder',
    answer: 'Matched. CIN U33112TG2011PTC076544 is active with no pending charges.',
    text: 'Retrieved from mca.gov.in. The incorporation date of 14 Jun 2011 on the uploaded certificate matches this record.',
    keys: ['mca', 'company status', 'charges', 'roc', 'incorporation', 'active company'],
  },
  {
    id: 'chk-epfo',
    title: 'EPFO establishment',
    source: 'EPFO · 09:14:09',
    href: 'app/bidder',
    answer: 'Matched. Establishment TGHYD0045612000 is active with ECR filed to December 2025.',
    text: 'Labour compliance checks apply because the bidder declares more than 20 employees.',
    keys: ['epfo', 'provident fund', 'pf', 'ecr', 'establishment'],
  },
  {
    id: 'chk-epfo-count',
    title: 'Employee count reconciliation',
    source: 'EPFO · 09:14:09',
    href: 'app/bidder',
    answer:
      'Minor variance. The bidder declared 214 employees; the December ECR shows 207 members — a seven-person difference within normal payroll movement.',
    text: 'Recorded as a variance rather than a discrepancy, and it does not affect qualification.',
    keys: ['employees', 'headcount', 'staff', '214', '207', 'variance', 'workforce'],
  },
  {
    id: 'chk-esic',
    title: 'ESIC registration',
    source: 'ESIC · 09:14:10',
    href: 'app/bidder',
    answer: 'Matched. ESIC 55000123450000999 is active with contributions current.',
    text: 'Note that the ESIC source itself is currently degraded on the portal status screen — 6.4 s latency, 91.7% uptime.',
    keys: ['esic', 'insurance', 'employee state insurance'],
  },
  {
    id: 'chk-bis',
    title: 'BIS product certification',
    source: 'BIS / DPIIT · 09:14:11',
    href: 'app/bidder',
    answer: 'Matched. Licence CM/L-7712345 against IS 13450 is valid.',
    text: 'The claimed standard was verified at bis.gov.in.',
    keys: ['bis', 'certification', 'is 13450', 'standard', 'licence', 'product cert'],
  },
  {
    id: 'chk-oem',
    title: 'OEM authorisation letter',
    source: 'Uploaded · 09:14:13',
    href: 'app/bidder',
    answer:
      'Verified. Reference OEM-NLT-2026-118, valid to 31 Mar 2026, signatory verified against the OEM record. Extraction confidence 0.97.',
    text: 'A three-page document read by the extraction engine and cross-checked against the OEM record.',
    keys: ['oem', 'authorisation', 'dealer', 'manufacturer', 'letter'],
  },
  {
    id: 'chk-dl',
    title: 'DigiLocker documents',
    source: 'DigiLocker · 09:14:13',
    href: 'app/bidder',
    answer: 'Partial. Six of seven submitted documents are issuer-verified through DigiLocker.',
    text: 'The seventh — the certificate of incorporation — came as a manual upload. Its extracted fields match the MCA21 record, so the content is corroborated even though the copy is not issuer-verified.',
    keys: ['digilocker', 'issuer verified', 'documents', 'seven', 'uploads'],
  },
  {
    id: 'chk-incorp',
    title: 'Certificate of incorporation',
    source: 'Uploaded · 09:14:14',
    href: 'app/bidder',
    answer:
      'Not issuer-verified. It was supplied as a manual PDF rather than through DigiLocker, though the extracted CIN and date match MCA21.',
    text: 'Low severity, advisory only. Extraction confidence 0.96.',
    keys: ['incorporation certificate', 'inc-11', 'manual upload', 'pdf'],
  },
  {
    id: 'chk-debar',
    title: 'Debarment search',
    source: 'Debarment registers · 09:14:15',
    href: 'app/bidder',
    answer: 'Clear. No records found across six registers — CPPP, GeM and four state registers.',
    text: 'The bidder filed a nil declaration, which the search corroborates.',
    keys: ['debarment', 'blacklist', 'blacklisted', 'banned', 'debarred', 'integrity', 'cppp'],
  },
  {
    id: 'chk-gem-perf',
    title: 'GeM seller performance',
    source: 'GeM · 09:14:15',
    href: 'app/bidder',
    answer: 'Satisfactory. 4.2 out of 5 across 31 orders on the GeM seller profile.',
    text: 'Past performance is retrieved from the seller profile at gem.gov.in.',
    keys: ['performance', 'rating', 'past orders', 'seller profile', 'reputation', 'track record'],
  },
  {
    id: 'chk-na',
    title: 'Checks marked not applicable',
    source: 'Bidder record',
    href: 'app/bidder',
    answer:
      'Udyam, Startup India DPIIT recognition and NSIC single-point registration are all Not applicable — the bidder is a large enterprise and claimed none of them.',
    text: 'Not applicable is distinct from pending and from failed. Nothing was claimed, so nothing was contradicted.',
    keys: ['not applicable', 'na', 'udyam', 'nsic', 'startup india', 'msme', 'why blank'],
  },

  /* ---------------- recommendation ---------------- */
  {
    id: 'rec',
    title: 'Engine recommendation',
    source: 'Verification engine · confidence 0.88',
    href: 'app/bidder',
    answer:
      'Do not qualify on clause 7.2, at 0.88 confidence. Statutory and labour compliance are substantially clean, but the bidder fails a stated qualifying condition, which is not a matter of degree.',
    text: 'For: registrations active and matched; EPFO and ESIC current with the count variance within normal movement; no debarment across six registers and a satisfactory GeM rating. Against: 46% local content below the 50% threshold; December GSTR-3B unfiled past due at retrieval.',
    keys: ['recommendation', 'recommend', 'verdict', 'should i', 'advice', 'suggest', 'confidence', 'ai says'],
  },
  {
    id: 'rec-limits',
    title: 'Limits on the recommendation',
    source: 'Verification engine',
    href: 'app/bidder',
    answer:
      'Two stated limits: local content is taken from the bidder’s own declaration and is not independently audited, and portal data reflects retrieval at 09:14 on 8 Sep 2026 and may since have changed.',
    text: 'The recommendation carries an explicit confidence figure and these caveats precisely so it is not read as a decision.',
    keys: ['limits', 'caveat', 'limitations', 'uncertainty', 'wrong', 'trust', 'reliable'],
  },
  {
    id: 'options',
    title: 'Decision options open to the officer',
    source: 'Console',
    href: 'app/bidder',
    answer:
      'Qualify, seek clarification, or do not qualify. Each is recorded against the bidder with a written reason and the officer’s name.',
    text: 'The current draft on this record is to seek clarification on the local content computation before deciding on clause 7.2.',
    keys: ['options', 'what can i do', 'next step', 'action', 'decide', 'qualify', 'reject', 'clarification'],
  },

  /* ---------------- other bidders ---------------- */
  {
    id: 'queue',
    title: 'Verification queue',
    source: 'Console',
    href: 'app',
    answer:
      'Three bidders await a decision: Nova Labtech (78, clause 7.2), Deccan Analytical (71, OEM authorisation expired) and Chandra Lab Solutions (69, turnover below the tender floor). Two more are flagged — Orion Supplies (38) and Vindhya Scientific (52).',
    text: 'Sixteen bidders are in the queue across four tenders: 3 awaiting a decision, 2 flagged, 3 in review and 8 qualified today, across 1,026 checks. Kaveri Instruments, Tapti Instruments and Sutlej Scientific are the three in review.',
    keys: ['queue', 'pending', 'awaiting', 'bidders are flagged', 'which bidders', 'in review', 'workload', 'today', 'how many bidders', 'to review'],
  },
  {
    id: 'orion',
    title: 'Orion Supplies Company',
    source: 'Bidder record',
    href: 'app/tender',
    answer:
      'Orion Supplies scores 38 with High risk and is flagged — a debarment record was found in a state register. 19 of 38 checks passed, 9 flags.',
    text: 'Kanpur UP, private limited, large enterprise. The lowest scoring bidder on this tender.',
    keys: ['orion', 'worst', 'lowest', 'high risk', 'debarred bidder', 'flagged'],
  },
  {
    id: 'kaveri',
    title: 'Kaveri Instruments & Company',
    source: 'Bidder record',
    href: 'app/tender',
    answer: 'Kaveri Instruments scores 64, Medium risk, in review — EPFO contributions are in arrears. 29 of 38 checks passed.',
    text: 'Coimbatore TN, proprietorship, MSME Small.',
    keys: ['kaveri', 'arrears', 'in review'],
  },
  {
    id: 'saraswati',
    title: 'Saraswati Industrial Works',
    source: 'Bidder record',
    href: 'app/tender',
    answer: 'Saraswati Industrial Works is the strongest bidder — 96 out of 100, Low risk, qualified, 37 of 38 checks passed.',
    text: 'Nashik MH, private limited, MSME Small. One item awaited officer review before qualification.',
    keys: ['saraswati', 'best', 'highest', 'top bidder', 'strongest', '96'],
  },
  {
    id: 'meridian',
    title: 'Meridian Scientific Instruments',
    source: 'Bidder record',
    href: 'app/tender',
    answer: 'Meridian Scientific scores 91, Low risk, qualified, with 36 of 38 checks passed and 2 flags.',
    text: 'Pune MH, partnership, MSME Micro.',
    keys: ['meridian', 'partnership', 'micro'],
  },
  {
    id: 'compare',
    title: 'Bidder ranking on this tender',
    source: 'Tender board',
    href: 'app/tender',
    answer:
      'Twelve bidders, mean score 77. The top of the field is Saraswati 96, Prayag 93, Meridian 91, Konark 89; the bottom is Sharda 55 and Orion 38. Ranking is a review convenience — the qualifying clauses decide, not the order.',
    text: 'Seven are qualified, one (Nova Labtech) awaits a decision, two are in review (Kaveri, Betwa) and two are flagged (Sharda, Orion). The full field with sort and filter is on the tender board.',
    keys: ['compare', 'ranking', 'rank', 'order', 'which bidder', 'best score', 'shortlist', 'l1'],
  },

  /* ---------------- portals ---------------- */
  {
    id: 'portal-health',
    title: 'Portal status',
    source: 'Portal status',
    href: 'app/portals',
    answer:
      'Eleven of twelve sources are healthy. ESIC is degraded — 6.4 s latency, 91.7% uptime, last response 11 minutes ago.',
    text: 'Fastest responses: GeM seller profile 530 ms, DigiLocker 640 ms, Startup India 710 ms. Slowest healthy source: EPFO at 2.1 s. Debarment registers run in batch mode at 2.8 s.',
    keys: ['portal status', 'health', 'uptime', 'latency', 'slow', 'degraded', 'esic down', 'sources live'],
  },
  {
    id: 'portal-modes',
    title: 'How each source is reached',
    source: 'Portal status',
    href: 'app/portals',
    answer:
      'Ten sources are reached by API, DigiLocker by consent, and the debarment registers by batch search.',
    text: 'The access mode is shown on each source card alongside latency, uptime and the time of the last response.',
    keys: ['mode', 'batch', 'consent', 'api', 'how reached', 'connection'],
  },

  /* ---------------- audit trail ---------------- */
  {
    id: 'timeline',
    title: 'What happened on this record',
    source: 'Audit trail',
    href: 'app/audit',
    answer:
      'The bid arrived at 09:14:02 with 14 documents; 38 checks ran across 12 sources in about 14 seconds; the engine flagged clause 7.2 at 09:14:11 and issued its recommendation at 09:14:16. At 09:32 the officer raised a clarification with the bidder, due 11 Sep 2026.',
    text: 'Every line carries an actor — system, a named portal, the engine, or R. Nair — and a timestamp.',
    keys: ['timeline', 'history', 'what happened', 'officer do', 'sequence', 'events', 'trail'],
  },
  {
    id: 'clarification',
    title: 'Open clarification',
    source: 'Audit trail · 09:32:02',
    href: 'app/audit',
    answer:
      'A clarification on the local content computation was issued to the bidder by R. Nair, due 11 Sep 2026. The record is held open until it is answered.',
    text: 'Officer note at 09:31:47: “Seeking clarification on local content computation.”',
    keys: ['clarification', 'query', 'raised', 'due', 'waiting', 'response from bidder'],
  },
  {
    id: 'officer',
    title: 'Signed-in officer',
    source: 'Console',
    answer: 'R. Nair, Procurement Officer, CPSE Scientific Procurement Division.',
    text: 'Decisions and notes on this console are recorded against this officer.',
    keys: ['who am i', 'officer', 'nair', 'user', 'account', 'logged in', 'me'],
  },

  /* ---------------- console how-to ---------------- */
  {
    id: 'how-extract',
    title: 'Upload & extract',
    source: 'Console',
    href: 'app/extract',
    answer:
      'Upload & extract reads bid documents, pulls the structured fields out of them and matches each field against the corresponding portal record before the checks run.',
    text: 'It shows per-document extraction confidence and marks any field that does not match its source. Documents arriving through DigiLocker are issuer-verified; manual uploads are not, and are labelled accordingly.',
    keys: ['upload', 'extract', 'extraction', 'ocr', 'read documents', 'parse', 'ingest', 'how to upload'],
  },
  {
    id: 'how-report',
    title: 'Generate report',
    source: 'Console',
    href: 'app/report',
    answer:
      'Generate report assembles the compliance record into a single signed document — score, findings, check-by-check evidence, the recommendation and the officer’s decision — for the tender file.',
    text: 'Sections can be included or excluded, and the report can be produced as PDF for the file, CSV for analysis or JSON for an integrating system.',
    keys: ['report', 'generate', 'export', 'pdf', 'download', 'print', 'summary document', 'file note'],
  },
  {
    id: 'how-assistant',
    title: 'This assistant',
    source: 'Console',
    answer:
      'It answers from the verification record only. Your question is matched against the retrieved evidence on these screens, and every answer cites the passage it came from.',
    text: 'If nothing in the record matches, it says so rather than guessing. It does not browse the internet and it holds no opinion the record does not support.',
    keys: ['assistant', 'rag', 'chatbot', 'how does this work', 'ask', 'retrieval', 'you'],
  },
];

/** shown as starter chips before the officer has asked anything */
export const suggested = [
  'Why is Nova Labtech flagged?',
  'What is clause 7.2?',
  'Should this bidder be qualified?',
  'Which portals are degraded?',
  'What happens if a portal is down?',
];
