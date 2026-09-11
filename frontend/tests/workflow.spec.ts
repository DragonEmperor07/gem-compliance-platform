import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '../..');
let files: { directory: string; tender: string; submission: string };

test.beforeAll(() => {
  const python = process.env.E2E_PYTHON || resolve(projectRoot, 'backend/.venv/bin/python');
  files = JSON.parse(execFileSync(python, [resolve(here, 'fixtures.py')], {
    cwd: projectRoot,
    encoding: 'utf8',
  }));
});

test.afterAll(() => {
  // Delete only the exact fixture directory returned by mkdtemp above.
  if (files && basename(files.directory).startsWith('trust-setu-e2e-')) {
    rmSync(files.directory, { recursive: true, force: true });
  }
});

test('real tender and bidder assessment preserve evidence and a reasoned officer decision', async ({ page }) => {
  const browserErrors: string[] = [];
  page.on('pageerror', error => browserErrors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'New case', exact: true }).click();
  await page.getByLabel('Tender title', { exact: true }).fill('Office equipment procurement');
  await page.getByLabel('Tender reference', { exact: true }).fill('TS-E2E-2026-001');
  await page.getByLabel('Bidder name', { exact: true }).fill('Civic Test Supplies Private Limited');
  await page.getByLabel('Closing date (optional)', { exact: true }).fill('2026-10-15');
  await page.getByLabel('Tender PDF', { exact: true }).setInputFiles(files.tender);
  await page.getByLabel('Bidder submission (ZIP, optional)', { exact: true }).setInputFiles(files.submission);

  // Observe the actual network requests; no route interception or API mocks.
  const requirementsResponse = page.waitForResponse(response =>
    response.url().endsWith('/api/compliance/tenders/requirements') &&
    response.request().method() === 'POST', { timeout: 180_000 });
  await page.getByRole('button', { name: 'Create & read tender', exact: true }).click();
  const extractionResponse = await requirementsResponse;
  expect(extractionResponse.ok(), await extractionResponse.text()).toBeTruthy();
  const extraction = await extractionResponse.json();
  expect(extraction.requirements.length).toBeGreaterThan(0);
  expect(['ollama', 'heuristic']).toContain(extraction.extraction_method);

  await expect(page.getByRole('heading', { name: 'Review tender requirements', exact: true })).toBeVisible();
  const assess = page.getByRole('button', { name: 'Assess bidder', exact: true });
  await expect(assess).toBeDisabled();
  await page.getByLabel('I have reviewed the included requirements and their applicability.', { exact: true }).check();

  const pipelineResponse = page.waitForResponse(response =>
    response.url().endsWith('/api/compliance/pipeline') &&
    response.request().method() === 'POST', { timeout: 180_000 });
  await assess.click();
  const assessmentResponse = await pipelineResponse;
  expect(assessmentResponse.ok(), await assessmentResponse.text()).toBeTruthy();
  const assessment = await assessmentResponse.json();
  expect(assessment.documents).toHaveLength(4);
  expect(assessment.decision.document_checks.length).toBeGreaterThan(0);
  expect(assessment.government_verification).toHaveProperty('authoritative');

  await expect(page.getByRole('heading', { name: 'Evidence review', exact: true })).toBeVisible();
  await expect(page.getByText('TS-E2E-2026-001', { exact: true }).first()).toBeVisible();
  // Provider configuration varies by developer environment. If the backend
  // cannot claim authority, the browser must keep that uncertainty visible.
  if (!assessment.government_verification.authoritative) {
    await expect(page.getByText(/not configured|non.authoritative|not authoritative|unverified/i).first()).toBeVisible();
  }

  await page.getByRole('button', { name: 'Officer decision', exact: true }).click();
  await page.getByLabel('Decision', { exact: true }).selectOption({ label: 'Request clarification' });
  await page.getByLabel('Officer name', { exact: true }).fill('Integration Test Officer');
  const record = page.getByRole('button', { name: 'Record decision', exact: true });
  await expect(record).toBeDisabled();
  const reason = 'Request clarification of the annual turnover evidence and confirm registry status with an authoritative source.';
  await page.getByLabel('Reason for decision', { exact: true }).fill(reason);
  await record.click();
  await expect(page.getByText(reason, { exact: true })).toBeVisible();

  // The backend is stateless. The locally recorded decision must survive
  // reload and the export must retain the original backend provenance.
  await page.reload();
  await page.getByRole('button', { name: 'Officer decision', exact: true }).click();
  await expect(page.getByText(reason, { exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export evidence JSON', exact: true }).click();
  const download = await downloadPromise;
  const downloadedFile = await download.path();
  expect(downloadedFile).not.toBeNull();
  const exported = JSON.parse(readFileSync(downloadedFile!, 'utf8'));
  expect(JSON.stringify(exported)).toContain(reason);
  expect(JSON.stringify(exported)).toContain('Integration Test Officer');
  expect(JSON.stringify(exported)).toContain('government_verification');
  expect(JSON.stringify(exported)).toContain('authoritative');
  expect(JSON.stringify(exported)).toContain('extraction_method');
  expect(JSON.stringify(exported)).toContain('source_page');
  expect(browserErrors).toEqual([]);
});

test('queue and case creation fit a narrow mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'New case', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.getByRole('button', { name: 'New case', exact: true }).click();
  await expect(page.getByLabel('Tender title', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});
