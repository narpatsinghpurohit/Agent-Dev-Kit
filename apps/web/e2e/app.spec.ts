import { expect, test, type Page } from '@playwright/test';

/**
 * The demo's core journey, fully keyless (mock voice + mock model):
 * signup → register a patient → run a translated interview (typed turns)
 * → finish → edit the drafted record → copilot registers a patient through
 * the approval loop → logout.
 */
const email = `e2e-${Date.now()}@example.com`;
const password = 'playwright-pass-1';

test.describe.configure({ mode: 'serial' });

test('signup lands on an empty patient list', async ({ page }) => {
  await page.goto('/signup');
  await page.getByLabel('Name').fill('Playwright');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page).toHaveURL(/\/patients/);
  await expect(page.getByText(/No patients yet/)).toBeVisible();
});

test('registers a patient and runs a translated consultation', async ({ page }) => {
  await login(page);

  // Register a Hindi-speaking patient.
  await page.getByRole('link', { name: 'New patient' }).click();
  await page.getByLabel('Name').fill('Asha Devi');
  await page.getByLabel('Age', { exact: true }).fill('54');
  await page.getByRole('button', { name: 'Register patient' }).click();
  await expect(page.getByRole('heading', { name: 'Asha Devi' })).toBeVisible();
  await expect(page.getByText('Hindi — हिन्दी').first()).toBeVisible();

  // Start the interview (doctor asks in English).
  await page.getByRole('button', { name: 'Start consultation' }).click();
  await expect(page).toHaveURL(/\/consultations\//);

  // Doctor asks — the mock pipeline marks the translation with [hi-IN].
  await page.getByLabel('Doctor question').fill('Since when do you have the fever?');
  await page.getByRole('button', { name: /Ask/ }).click();
  const transcript = page.getByTestId('transcript');
  await expect(transcript.getByText('[hi-IN] Since when do you have the fever?')).toBeVisible();

  // Patient answers via the typed fallback — translated back with [en-IN].
  await page.getByLabel('Patient answer').fill('दो दिन से बुखार है।');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(transcript.getByText('[en-IN] दो दिन से बुखार है।')).toBeVisible();

  // Finish → the drafted record appears, and the interview inputs freeze.
  await page.getByRole('button', { name: 'Finish & summarize' }).click();
  const editor = page.getByTestId('summary-editor');
  await expect(editor).toBeVisible();
  await expect(page.getByText('Completed').first()).toBeVisible();
  await expect(page.getByLabel('Doctor question')).toHaveCount(0);

  // The doctor corrects the AI draft and saves.
  await editor.getByLabel(/Chief complaint/).fill('Fever, 2 days');
  await editor.getByLabel(/Symptoms/).fill('fever | 2 days | moderate');
  await editor.getByRole('button', { name: 'Save record' }).click();
  await expect(editor.getByText('Saved.')).toBeVisible();

  // The record shows on the patient page with the corrected complaint.
  await page
    .getByRole('link', { name: /Asha Devi/ })
    .first()
    .click();
  await expect(page.getByText('Fever, 2 days')).toBeVisible();
  await expect(page.getByText('Completed').first()).toBeVisible();
});

test('copilot registers a patient after in-chat approval', async ({ page }) => {
  await login(page);

  await page.getByRole('button', { name: 'Vedita' }).click();
  const panel = page.getByTestId('copilot-panel');
  await expect(panel).toBeVisible();

  await panel.getByRole('textbox').fill('Register a patient called Murugan Selvam, age 41');
  await panel.getByRole('button', { name: 'Send' }).click();

  // The mutating tool pauses for human approval.
  await panel.getByRole('button', { name: 'Approve' }).click();

  // The mock model confirms after the tool executes…
  await expect(panel.getByText(/Done!/)).toBeVisible({ timeout: 15_000 });

  // …and the patient genuinely exists in the list (onFinish invalidation).
  await expect(page.getByRole('link', { name: /Murugan Selvam/ })).toBeVisible({
    timeout: 10_000,
  });
});

test('logout ends the session', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/login/);

  // Guarded routes bounce back to login.
  await page.goto('/patients');
  await expect(page).toHaveURL(/\/login/);
});

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/patients/);
}
