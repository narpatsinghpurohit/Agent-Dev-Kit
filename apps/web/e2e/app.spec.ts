import { expect, test, type Page } from '@playwright/test';

/**
 * The demo's core journey, fully keyless (mock voice + mock model):
 * signup → dashboard → patients via the nav rail → register a patient →
 * run a translated console consultation (typed turns) → finish → the EHR
 * pane auto-fills with confidences → generate the treatment plan → accept
 * a recommendation → sign to AHMIS → back to the dashboard → copilot
 * registers a patient through the approval loop → logout.
 */
const email = `e2e-${Date.now()}@example.com`;
const password = 'playwright-pass-1';

test.describe.configure({ mode: 'serial' });

test('signup lands on the dashboard with the nav rail', async ({ page }) => {
  await page.goto('/signup');
  await page.getByLabel('Name').fill('Playwright');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole('heading', { name: /Welcome back/ })).toBeVisible();

  // The shell is navbar + left rail; both must be present.
  const rail = page.getByRole('complementary').first();
  await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Patients' })).toBeVisible();
  await expect(rail).toBeVisible();

  // Fresh account → nothing scheduled yet.
  await expect(page.getByText('No appointments scheduled for today.')).toBeVisible();
});

test('registers a patient and runs a console consultation to AHMIS sign-off', async ({ page }) => {
  await login(page);

  // Dashboard → Patients via the nav rail.
  await page.getByRole('link', { name: 'Patients' }).click();
  await expect(page).toHaveURL(/\/patients/);
  await expect(page.getByText(/No patients yet/)).toBeVisible();

  // Register a Hindi-speaking patient.
  await page.getByRole('link', { name: 'New patient' }).click();
  await page.getByLabel('Name').fill('Asha Devi');
  await page.getByLabel('Age', { exact: true }).fill('54');
  await page.getByRole('button', { name: 'Register patient' }).click();
  await expect(page.getByRole('heading', { name: 'Asha Devi' })).toBeVisible();
  await expect(page.getByText('Hindi — हिन्दी').first()).toBeVisible();

  // Start the consultation (doctor asks in English) → the console opens.
  await page.getByRole('button', { name: 'Start consultation' }).click();
  await expect(page).toHaveURL(/\/consultations\//);

  // The console renders INSIDE the shell: navbar + rail persist around it.
  await expect(page.getByRole('link', { name: /vedita/i })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Patients' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
  await expect(page.getByText('AHMIS pending')).toBeVisible();

  // Doctor asks — the mock pipeline marks the translation with [hi-IN].
  await page.getByLabel('Doctor question').fill('Since when do you have the fever?');
  await page.getByRole('button', { name: 'Ask via Vedita' }).click();
  const transcript = page.getByTestId('transcript');
  await expect(transcript.getByText('[hi-IN] Since when do you have the fever?')).toBeVisible();

  // Patient answers via the typed fallback — translated back with [en-IN].
  await page.getByRole('button', { name: /Type the patient/ }).click();
  await page.getByRole('textbox', { name: 'Patient answer' }).fill('दो दिन से बुखार है।');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(transcript.getByText('[en-IN] दो दिन से बुखार है।')).toBeVisible();

  // Finish → the interview inputs freeze and the consultation completes.
  await page.getByRole('button', { name: 'Finish & summarize' }).click();
  await expect(page.getByText('Completed').first()).toBeVisible();
  await expect(page.getByLabel('Doctor question')).toHaveCount(0);

  // EHR pane: fields captured from the conversation, with mock confidences.
  await expect(page.getByText(/\d+ fields captured/)).toBeVisible();
  await expect(page.getByText('Chief complaint').first()).toBeVisible();
  await expect(page.getByText('0.60').first()).toBeVisible();

  // Treatment plan tab: finish auto-drafts the plan (mock model); the empty
  // state's Generate button is the retry path if that background step lost.
  await page.getByRole('tab', { name: 'Treatment plan' }).click();
  const generatePlan = page.getByRole('button', { name: 'Generate plan' });
  const acceptButtons = page.getByRole('button', { name: 'Accept' });
  await expect(generatePlan.or(acceptButtons.first())).toBeVisible();
  if (await generatePlan.isVisible()) await generatePlan.click();
  await expect(page.getByText('Herbal', { exact: true })).toBeVisible();
  await expect(page.getByText('Diet (Ahara)')).toBeVisible();
  await expect(page.getByText('Yoga & lifestyle (Vihara)')).toBeVisible();

  // Accept one recommendation → it flips into a persisted state chip.
  await acceptButtons.first().click();
  await expect(page.getByText('Accepted', { exact: true })).toBeVisible();

  // Sign to AHMIS from the EHR tab → button and context-strip badge flip.
  await page.getByRole('tab', { name: 'EHR draft' }).click();
  await page.getByRole('button', { name: 'Review & sign to AHMIS' }).click();
  await expect(page.getByRole('button', { name: 'Signed to AHMIS' })).toBeVisible();
  await expect(page.getByText('AHMIS synced')).toBeVisible();
  await expect(page.getByText('AHMIS pending')).toHaveCount(0);

  // Back to the dashboard via the rail — the queue-free overview loads.
  await page.getByRole('link', { name: 'Dashboard' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole('heading', { name: /Welcome back/ })).toBeVisible();
});

test('copilot registers a patient after in-chat approval', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'Patients' }).click();
  await expect(page).toHaveURL(/\/patients/);

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
  await expect(page).toHaveURL(/\/dashboard/);
}
