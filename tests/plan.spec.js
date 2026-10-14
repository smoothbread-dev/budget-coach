import { test, expect, existingUser, item, THIS_MONTH, USER_ID, seed } from './fixtures/app.js';

test.describe('Plan items', () => {
  test('adding needs and wants updates totals, savings and the goal bar', async ({ app, page }) => {
    await app.open({ seed: existingUser({ income: 5000, savings_goal: 20 }) });

    await app.addItem('needs', 'Rent', 2000);
    await app.addItem('wants', 'Dining out', 500);

    await expect(page.locator('#sum-needs')).toHaveText('RM 2,000.00');
    await expect(page.locator('#sum-wants')).toHaveText('RM 500.00');
    await expect(page.locator('#sum-savings')).toHaveText('RM 2,500.00');
    await expect(page.locator('#total-exp-pct')).toHaveText('50.0% of income');
    await expect(page.locator('#goal-bar-pct-label')).toHaveText('50.0% of 20% goal');
    await expect(page.locator('#goal-status-text')).toContainText('Goal met');

    await expect.poll(async () => (await app.savedPlan()).items.map(i => i.name)).toEqual(['Rent', 'Dining out']);
  });

  test('goal status reflects being under target', async ({ app, page }) => {
    await app.open({ seed: existingUser({ income: 1000, savings_goal: 50 }) });
    await app.addItem('needs', 'Rent', 900);
    await expect(page.locator('#goal-status-text')).toHaveClass(/under/);
    await expect(page.locator('#expenses-bar-fill')).toHaveClass(/warn/);
  });

  test('funded wants are excluded from projections', async ({ app, page }) => {
    await app.open({ seed: existingUser({ income: 5000 }) });

    await app.addItem('wants', 'Holiday', 3000, { funded: true });

    await expect(page.locator('#sum-wants')).toHaveText('RM 0.00');
    await expect(page.locator('#sum-savings')).toHaveText('RM 5,000.00');
    await expect(page.locator('#total-exp-gross')).toContainText('RM 3,000.00');
    await expect(page.locator('#wants-oneoff-list .item-badge.funded')).toHaveText('From Savings');
  });

  test('the funded option only applies to one-off wants', async ({ app, page }) => {
    await app.open({ seed: existingUser() });

    await page.locator('[data-action="toggle-add-form"][data-cat="needs"]').click();
    await expect(page.locator('#needs-funded-wrap')).toBeHidden();

    await page.locator('[data-action="toggle-add-form"][data-cat="wants"]').first().click();
    await expect(page.locator('#wants-funded-wrap')).toBeVisible();
    await page.locator('#wants-type').selectOption('recurring');
    await expect(page.locator('#wants-funded-wrap')).toBeHidden();
  });

  test('validation: name and a positive amount are required', async ({ app, page }) => {
    await app.open({ seed: existingUser() });

    await app.addItem('needs', '', 100);
    await expect(page.locator('#alert-modal-message')).toHaveText('Please enter an item name.');
    await page.keyboard.press('Escape');

    await page.locator('#needs-name').fill('Bills');
    await page.locator('#needs-amount').fill('0');
    await page.locator('[data-action="add-item"][data-cat="needs"]').click();
    await expect(page.locator('#alert-modal-message')).toHaveText('Please enter a valid amount.');
  });

  test('recurring items can be picked to auto-fill', async ({ app, page }) => {
    await app.open({ seed: existingUser({}, { recurring_items: [{ id: 'r1', user_id: USER_ID, name: 'Internet', amount: 129 }] }) });

    await page.locator('[data-action="toggle-add-form"][data-cat="needs"]').click();
    await page.locator('#needs-type').selectOption('recurring');
    await page.locator('#needs-recurring-select').selectOption('r1');
    await expect(page.locator('#needs-name')).toHaveValue('Internet');
    await expect(page.locator('#needs-amount')).toHaveValue('129');

    await page.locator('[data-action="add-item"][data-cat="needs"]').click();
    await expect(page.locator('#needs-recurring-list')).toContainText('Internet');
  });

  test('editing an item can move it between categories and clears "funded"', async ({ app, page }) => {
    await app.open({ seed: existingUser({ items: [item('Concert', 300, 'wants', 'oneoff', true)] }) });

    await page.locator('#wants-oneoff-list [data-action="edit-item"]').click();
    await expect(page.locator('#edit-item-name')).toHaveValue('Concert');
    await expect(page.locator('#edit-item-funded')).toBeChecked();

    await page.locator('#edit-item-category').selectOption('needs');
    await expect(page.locator('#edit-funded-wrap')).toBeHidden();
    await page.locator('#edit-item-amount').fill('350');
    await page.locator('[data-action="save-edit-item"]').click();

    await expect(page.locator('#needs-oneoff-list')).toContainText('RM 350.00');
    await expect(page.locator('#wants-oneoff-list')).toContainText('No one-off items yet.');
    await expect.poll(async () => (await app.savedPlan()).items[0])
      .toMatchObject({ category: 'needs', amount: 350, funded: false });
  });

  test('deleting an item asks for confirmation', async ({ app, page }) => {
    await app.open({ seed: existingUser({ items: [item('Gym', 150)] }) });

    await page.locator('#needs-oneoff-list [data-action="delete-item"]').click();
    await expect(page.locator('#confirm-modal-message')).toHaveText('Remove "Gym" from your plan?');
    await app.cancelConfirm();
    await expect(page.locator('#needs-oneoff-list')).toContainText('Gym');

    await page.locator('#needs-oneoff-list [data-action="delete-item"]').click();
    await app.confirm();
    await expect(page.locator('#needs-oneoff-list')).toContainText('No one-off items yet.');
    await expect.poll(async () => (await app.savedPlan()).items).toEqual([]);
  });

  test('user text is rendered as text, never as HTML', async ({ app, page }) => {
    const nasty = `<img src=x onerror="window.__xss=1">"'&`;
    await app.open({ seed: existingUser({ items: [item(nasty, 10)] }) });

    await expect(page.locator('#needs-oneoff-list .item-name')).toHaveText(nasty);
    expect(await page.locator('#needs-oneoff-list img').count()).toBe(0);
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  });

  test('a failed auto-save shows an error and is retried', async ({ app, page }) => {
    app.allowErrors();
    await app.open({ seed: existingUser() });
    await app.fail('month_plans', 'upsert');

    await app.addItem('needs', 'Water bill', 60);
    await expect(app.toast()).toContainText('Not saved');

    // Next change triggers another save, which succeeds.
    await app.addItem('needs', 'Electric', 120);
    await expect.poll(async () => (await app.savedPlan()).items.map(i => i.name))
      .toEqual(['Water bill', 'Electric']);
  });
});

test.describe('Purpose banner', () => {
  test('dismissal is remembered for the user', async ({ app, page }) => {
    await app.open({ seed: existingUser() });

    await expect(page.locator('#purpose-banner')).toBeVisible();
    await page.locator('[data-action="dismiss-banner"]').click();
    await expect(page.locator('#purpose-banner')).toBeHidden();

    await page.reload();
    await expect(page.locator('#toast-label')).toContainText('Ready');
    await expect(page.locator('#purpose-banner')).toBeHidden();
  });
});

test.describe('Income and goal panels', () => {
  test('rejects invalid values and saves valid ones', async ({ app, page }) => {
    await app.open({ seed: seed(existingUser()) });

    await page.locator('.income-actions [data-action="open-income-panel"]').click();
    await expect(page.locator('#panel-income')).toHaveValue('5000');
    await page.locator('#panel-income').fill('0');
    await page.locator('[data-action="save-income-panel"]').click();
    await expect(page.locator('#alert-modal-message')).toHaveText('Please enter a valid income amount.');
    await page.keyboard.press('Escape');

    await page.locator('#panel-income').fill('5500.50');
    await page.keyboard.press('Enter');
    await expect(page.locator('#income-display')).toHaveText('RM 5,500.50');

    await page.locator('[data-action="open-goal-panel"]').click();
    await page.locator('#panel-goal').fill('150');
    await page.keyboard.press('Enter');
    await expect(page.locator('#goal-badge-text')).toHaveText('100% goal');

    await expect.poll(async () => (await app.savedPlan(THIS_MONTH)).income).toBe(5500.5);
  });
});
