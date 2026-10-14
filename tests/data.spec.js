import { test, expect, existingUser, defaults } from './fixtures/app.js';

test.describe('Data loading', () => {
  test('a loading failure shows an error with retry', async ({ app, page }) => {
    app.allowErrors();
    await page.addInitScript(() => {
      // Fail only the first load of month_plans.
      const wait = setInterval(() => { if (window.__mock) { window.__mock.fail('month_plans', 'select'); clearInterval(wait); } }, 0);
    });
    await app.open({ seed: existingUser(), waitForReady: false });

    await expect(page.locator('#alert-modal-message')).toContainText("couldn't load your budget data");
    await page.locator('#alert-modal-actions .btn-primary').click();
    await expect(page.locator('#income-display')).toHaveText('RM 5,000.00');
  });

  test('loads only the signed-in user\'s rows', async ({ app }) => {
    await app.open({ seed: existingUser() });
    const selects = (await app.page.evaluate(() => window.__mock.calls)).filter(c => c.op === 'select');
    expect(selects.length).toBeGreaterThanOrEqual(6);
    for (const call of selects) expect(call.filters).toContainEqual(['user_id', 'user-1']);
  });
});

test.describe('Defaults tab', () => {
  test('shows and saves default values', async ({ app, page }) => {
    await app.open({ seed: existingUser() });
    await app.tab('defaults');

    await expect(page.locator('#defaults-income-display')).toHaveText('RM 5,000.00');
    await page.locator('[data-action="open-default-goal"]').click();
    await page.locator('#panel-default-goal').fill('30');
    await page.keyboard.press('Enter');
    await expect(page.locator('#defaults-goal-display')).toHaveText('30%');
    expect((await app.db('user_defaults'))[0].savings_goal).toBe(30);
  });

  test('a failed save keeps the previous value', async ({ app, page }) => {
    app.allowErrors();
    await app.open({ seed: defaults(5000, 20) });
    await page.keyboard.press('Escape');
    await app.tab('defaults');
    await app.fail('user_defaults', 'upsert');

    await page.locator('[data-action="open-default-income"]').click();
    await page.locator('#panel-default-income').fill('9999');
    await page.keyboard.press('Enter');

    await expect(app.toast()).toContainText('Could not save your defaults.');
    await expect(page.locator('#defaults-income-display')).toHaveText('RM 5,000.00');
  });
});
