import { expect, test, type Page } from '@playwright/test';

/**
 * The kit's core journey: signup → tasks CRUD → copilot creates a task
 * through the approval loop (keyless mock model) → logout → login.
 */
const email = `e2e-${Date.now()}@example.com`;
const password = 'playwright-pass-1';

test.describe.configure({ mode: 'serial' });

test('signup lands on an empty task list', async ({ page }) => {
  await page.goto('/signup');
  await page.getByLabel('Name').fill('Playwright');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page).toHaveURL(/\/tasks/);
  await expect(page.getByText(/Nothing here yet/)).toBeVisible();
});

test('creates and updates a task through the UI', async ({ page }) => {
  await login(page);

  await page.getByRole('link', { name: 'New task' }).click();
  await page.getByLabel('Title').fill('Ship the starter kit');
  await page.getByRole('button', { name: 'Create task' }).click();

  // Create navigates to the detail screen.
  await expect(page.getByRole('heading', { name: 'Ship the starter kit' })).toBeVisible();
  await page.getByRole('button', { name: 'In progress' }).click();
  await expect(page.getByText('In progress').first()).toBeVisible();

  await page.getByRole('button', { name: '← Back to tasks' }).click();
  await expect(page.getByRole('link', { name: 'Ship the starter kit' })).toBeVisible();
});

test('copilot creates a task after in-chat approval', async ({ page }) => {
  await login(page);

  await page.getByRole('button', { name: '✦ Copilot' }).click();
  const panel = page.getByTestId('copilot-panel');
  await expect(panel).toBeVisible();

  await panel.getByRole('textbox').fill('Create a task called Copilot Made This');
  await panel.getByRole('button', { name: 'Send' }).click();

  // The mutating tool pauses for human approval.
  await panel.getByRole('button', { name: 'Approve' }).click();

  // The mock model confirms after the tool executes…
  await expect(panel.getByText(/Done!/)).toBeVisible({ timeout: 15_000 });

  // …and the task genuinely exists in the list (onFinish invalidation).
  await expect(page.getByRole('link', { name: 'Copilot Made This' })).toBeVisible({
    timeout: 10_000,
  });
});

test('logout ends the session', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/login/);

  // Guarded routes bounce back to login.
  await page.goto('/tasks');
  await expect(page).toHaveURL(/\/login/);
});

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/tasks/);
}
