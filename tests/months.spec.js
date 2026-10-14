import { test, expect, defaults, plan, seed, existingUser, item, THIS_MONTH, NEXT_MONTH, PREV_MONTH, USER_ID } from './fixtures/app.js';

test.describe('First-time setup', () => {
  test('new users are asked for defaults, then offered them for the current month', async ({ app, page }) => {
    await app.open();

    await expect(app.panel('setup-panel-overlay')).toHaveClass(/open/);
    await expect(page.locator('#setup-income')).toBeFocused();

    await page.locator('#setup-income').fill('6000');
    await page.locator('#setup-goal').fill('25');
    await page.locator('[data-action="save-setup"]').click();

    await expect.poll(() => app.db('user_defaults')).toEqual([
      expect.objectContaining({ user_id: USER_ID, income: 6000, savings_goal: 25 })
    ]);
    await expect(app.panel('defaults-prompt-overlay')).toHaveClass(/open/);
    await expect(page.locator('#defaults-prompt-values')).toHaveText('Income: RM 6,000.00 · Savings goal: 25%');

    await page.locator('[data-action="apply-defaults"]').click();
    await expect(page.locator('#income-display')).toHaveText('RM 6,000.00');
    await expect(page.locator('#goal-badge-text')).toHaveText('25% goal');

    const saved = await app.savedPlan();
    expect(saved).toMatchObject({ income: 6000, savings_goal: 25, items: [] });
  });

  test('skipping setup (or pressing Esc) asks for this month\'s income instead', async ({ app, page }) => {
    await app.open();

    await page.keyboard.press('Escape');
    await expect(app.panel('setup-panel-overlay')).not.toHaveClass(/open/);
    await expect(app.panel('income-panel-overlay')).toHaveClass(/open/);

    await page.locator('#panel-income').fill('4200');
    await page.keyboard.press('Enter');

    await expect(app.panel('goal-panel-overlay')).toHaveClass(/open/);
    await page.locator('#panel-goal').fill('15');
    await page.keyboard.press('Enter');

    await expect(page.locator('#income-display')).toHaveText('RM 4,200.00');
    expect(await app.savedPlan()).toMatchObject({ income: 4200, savings_goal: 15 });
    expect(await app.db('user_defaults')).toEqual([]);
  });

  test('setup rejects an invalid income', async ({ app, page }) => {
    await app.open();
    await page.locator('#setup-income').fill('-5');
    await page.locator('[data-action="save-setup"]').click();
    await expect(page.locator('#alert-modal-message')).toHaveText('Please enter a valid income amount.');
  });
});

test.describe('Month navigation', () => {
  test('shows the current month and its saved plan', async ({ app, page }) => {
    await app.open({ seed: existingUser({ income: 5000, items: [item('Rent', 1500)] }) });

    await expect(page.locator('#month-label')).toHaveText('October 2026');
    await expect(page.locator('#income-display')).toHaveText('RM 5,000.00');
    await expect(page.locator('#sum-needs')).toHaveText('RM 1,500.00');
    await expect(app.panel('defaults-prompt-overlay')).not.toHaveClass(/open/);
  });

  test('an empty month offers defaults; "Not now" leaves it empty without saving', async ({ app, page }) => {
    await app.open({ seed: existingUser() });

    await page.locator('[data-action="change-month"][data-dir="1"]').click();
    await expect(page.locator('#month-label')).toHaveText('November 2026');
    await expect(app.panel('defaults-prompt-overlay')).toHaveClass(/open/);

    await page.locator('#defaults-prompt-overlay [data-action="close-panel"]').click();
    await expect(app.panel('defaults-prompt-overlay')).not.toHaveClass(/open/);
    await expect(page.locator('#income-display')).toHaveText('—');
    await expect(page.locator('#income-hint')).toBeVisible();
    await expect(page.locator('#sum-needs')).toHaveText('RM 0.00');

    expect((await app.db('month_plans')).map(p => p.month_key)).toEqual([THIS_MONTH]);
  });

  test('"Enter my own values" opens the income panel', async ({ app, page }) => {
    await app.open({ seed: existingUser() });

    await page.locator('[data-action="change-month"][data-dir="-1"]').click();
    await page.locator('[data-action="enter-own-values"]').click();
    await expect(app.panel('income-panel-overlay')).toHaveClass(/open/);

    await page.locator('#panel-income').fill('3000');
    await page.locator('[data-action="save-income-panel"]').click();
    await page.locator('#panel-goal').fill('10');
    await page.locator('[data-action="save-goal-panel"]').click();

    expect(await app.savedPlan(PREV_MONTH)).toMatchObject({ income: 3000, savings_goal: 10 });
  });

  test('navigating across the year boundary and back to today', async ({ app, page }) => {
    await app.open({ seed: existingUser() });

    for (let i = 0; i < 3; i++) {
      await page.locator('[data-action="change-month"][data-dir="1"]').click();
      await page.keyboard.press('Escape');
    }
    await expect(page.locator('#month-label')).toHaveText('January 2027');

    await page.locator('#month-label').click();
    await expect(page.locator('#month-label')).toHaveText('October 2026');
    await expect(page.locator('#income-display')).toHaveText('RM 5,000.00');
  });

  test('edits are saved to the month they were made in, even when switching quickly', async ({ app, page }) => {
    await app.open({ seed: existingUser() });

    await app.addItem('needs', 'Groceries', 400);
    await page.locator('[data-action="change-month"][data-dir="1"]').click();

    const saved = await app.savedPlan(THIS_MONTH);
    await expect.poll(async () => (await app.savedPlan(THIS_MONTH)).items.length).toBe(1);
    expect(saved.month_key).toBe(THIS_MONTH);
    expect((await app.db('month_plans')).find(p => p.month_key === NEXT_MONTH)).toBeUndefined();
  });
});

test.describe('Delete month', () => {
  test('removes the plan and its savings allocations, then returns to the current month', async ({ app, page }) => {
    await app.open({
      seed: seed(
        defaults(),
        { month_plans: [plan(THIS_MONTH), plan(NEXT_MONTH, { income: 7000 })] },
        { savings_categories: [{ id: 'cat-1', user_id: USER_ID, name: 'Holiday', monthly_amount: 200, goal_amount: 2000 }] },
        { plan_savings: [
          { id: 'ps-1', user_id: USER_ID, month_key: NEXT_MONTH, savings_category_id: 'cat-1', allocated_amount: 200, category_name: 'Holiday' },
          { id: 'ps-2', user_id: USER_ID, month_key: THIS_MONTH, savings_category_id: 'cat-1', allocated_amount: 150, category_name: 'Holiday' }
        ] }
      )
    });

    await page.locator('[data-action="change-month"][data-dir="1"]').click();
    await expect(page.locator('#income-display')).toHaveText('RM 7,000.00');

    await page.locator('#month-delete-btn').click();
    await expect(page.locator('#confirm-modal-message')).toContainText('November 2026');
    await app.confirm();

    await expect(page.locator('#month-label')).toHaveText('October 2026');
    await expect.poll(async () => (await app.db('month_plans')).map(p => p.month_key)).toEqual([THIS_MONTH]);
    expect((await app.db('plan_savings')).map(p => p.id)).toEqual(['ps-2']);
  });

  test('cancelling keeps everything', async ({ app, page }) => {
    await app.open({ seed: existingUser() });

    await page.locator('#month-delete-btn').click();
    await app.cancelConfirm();

    await expect(page.locator('#income-display')).toHaveText('RM 5,000.00');
    expect(await app.db('month_plans')).toHaveLength(1);
  });

  test('a failed delete keeps local data and shows an error', async ({ app, page }) => {
    app.allowErrors();
    await app.open({ seed: existingUser() });
    await app.fail('plan_savings', 'delete');

    await page.locator('#month-delete-btn').click();
    await app.confirm();

    await expect(app.toast()).toContainText('Could not delete this month');
    await expect(page.locator('#income-display')).toHaveText('RM 5,000.00');
    expect(await app.db('month_plans')).toHaveLength(1);
  });

  test('the delete button is hidden for an empty month', async ({ app, page }) => {
    await app.open({ seed: existingUser() });
    await expect(page.locator('#month-delete-btn')).toBeVisible();

    await page.locator('[data-action="change-month"][data-dir="1"]').click();
    await page.keyboard.press('Escape');
    await expect(page.locator('#month-delete-btn')).toBeHidden();
  });
});
