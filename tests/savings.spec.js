import { test, expect, existingUser, USER_ID, THIS_MONTH, PREV_MONTH } from './fixtures/app.js';

const category = (overrides = {}) => ({
  id: 'cat-1', user_id: USER_ID, name: 'Emergency Fund', monthly_amount: 500, goal_amount: 6000,
  created_at: '2026-01-01T00:00:00Z', ...overrides
});
const allocation = (month_key, amount, overrides = {}) => ({
  id: `ps-${month_key}`, user_id: USER_ID, month_key, savings_category_id: 'cat-1',
  allocated_amount: amount, category_name: 'Emergency Fund', ...overrides
});
const adjustment = (amount, note = null) => ({
  id: `adj-${amount}`, user_id: USER_ID, savings_category_id: 'cat-1', amount, note, created_at: '2026-10-01T00:00:00Z'
});

test.describe('Savings tab', () => {
  test('create, edit and delete a category', async ({ app, page }) => {
    await app.open({ seed: existingUser() });
    await app.tab('savings');

    await page.locator('[data-action="add-savings-category"]').click();
    await page.locator('#savings-category-name').fill('New Car');
    await page.locator('#savings-category-monthly').fill('400');
    await page.locator('#savings-category-goal').fill('20000');
    await page.locator('[data-action="save-savings-category"]').click();

    const card = page.locator('.savings-cat-card');
    await expect(card).toContainText('New Car');
    await expect(card).toContainText('RM 400.00/mo');
    await expect(card).toContainText('50.0 months left');
    await expect(card).toContainText('(est. December 2030)');

    await page.locator('[data-action="edit-savings-category"]').click();
    await page.locator('#savings-category-name').fill('Car');
    await page.locator('[data-action="save-savings-category"]').click();
    await expect(card).toContainText('Car');
    expect((await app.db('savings_categories'))[0]).toMatchObject({ name: 'Car', monthly_amount: 400, goal_amount: 20000 });

    await page.locator('[data-action="delete-savings-category"]').click();
    await app.confirm();
    await expect(page.locator('#savings-categories-list')).toContainText('No savings categories yet');
  });

  test('validates category fields', async ({ app, page }) => {
    await app.open({ seed: existingUser() });
    await app.tab('savings');
    await page.locator('[data-action="add-savings-category"]').click();

    await page.locator('[data-action="save-savings-category"]').click();
    await expect(page.locator('#alert-modal-message')).toHaveText('Please enter a category name.');
    await page.keyboard.press('Escape');

    await page.locator('#savings-category-name').fill('Trip');
    await page.locator('#savings-category-monthly').fill('100');
    await page.locator('[data-action="save-savings-category"]').click();
    await expect(page.locator('#alert-modal-message')).toHaveText('Please enter a valid goal amount.');
  });

  test('total saved = all monthly allocations + adjustments', async ({ app, page }) => {
    await app.open({
      seed: existingUser({}, {
        savings_categories: [category()],
        plan_savings: [allocation(PREV_MONTH, 500), allocation(THIS_MONTH, 500)],
        savings_adjustments: [adjustment(1000, 'Bonus'), adjustment(-200, 'Car repair')]
      })
    });
    await app.tab('savings');

    const card = page.locator('.savings-cat-card');
    await expect(card.locator('.savings-stat-value.accent')).toHaveText('RM 1,800.00');
    await expect(card).toContainText('+RM 800.00');
    await expect(card).toContainText('30.0% of RM 6,000.00');
    await expect(card.locator('.savings-adj-row')).toHaveCount(2);
    await expect(card).toContainText('Car repair');
  });

  test('add and remove an adjustment', async ({ app, page }) => {
    await app.open({ seed: existingUser({}, { savings_categories: [category()] }) });
    await app.tab('savings');

    await page.locator('[data-action="add-adjustment"]').click();
    await expect(page.locator('#savings-adjustment-modal-title')).toHaveText('Add Adjustment — Emergency Fund');

    await page.locator('#savings-adjustment-amount').fill('0');
    await page.locator('[data-action="save-adjustment"]').click();
    await expect(page.locator('#alert-modal-message')).toContainText('non-zero amount');
    await page.keyboard.press('Escape');

    await page.locator('#savings-adjustment-amount').fill('-150');
    await page.locator('#savings-adjustment-note').fill('Withdrawal');
    await page.locator('[data-action="save-adjustment"]').click();
    await expect(page.locator('.savings-adj-amount.negative')).toContainText('RM -150.00');

    await page.locator('[data-action="delete-adjustment"]').click();
    await app.confirm();
    await expect(page.locator('.savings-adj-empty')).toBeVisible();
    expect(await app.db('savings_adjustments')).toEqual([]);
  });

  test('goal reached', async ({ app, page }) => {
    await app.open({
      seed: existingUser({}, { savings_categories: [category({ goal_amount: 500 })], plan_savings: [allocation(THIS_MONTH, 500)] })
    });
    await app.tab('savings');
    await expect(page.locator('.months-left-value')).toHaveText('🎉 Goal reached!');
  });

  test('deleting a category removes its adjustments but keeps past allocations', async ({ app, page }) => {
    await app.open({
      seed: existingUser({}, {
        savings_categories: [category()],
        plan_savings: [allocation(THIS_MONTH, 300)],
        savings_adjustments: [adjustment(100)]
      })
    });
    await app.tab('savings');

    await page.locator('[data-action="delete-savings-category"]').click();
    await app.confirm();

    await expect.poll(() => app.db('savings_categories')).toEqual([]);
    expect(await app.db('savings_adjustments')).toEqual([]);
    expect(await app.db('plan_savings')).toHaveLength(1);

    await app.tab('planner');
    await expect(page.locator('#plan-savings-list')).toContainText('Emergency Fund');
    await expect(page.locator('#plan-savings-list')).toContainText('RM 300.00');
  });
});

test.describe('Savings allocation (Plan tab)', () => {
  test('prompts to create a category when none exist', async ({ app, page }) => {
    await app.open({ seed: existingUser() });

    await page.locator('#plan-savings-add-btn').click();
    await expect(page.locator('#alert-modal-message')).toContainText("haven't created any savings categories");
    await page.locator('#alert-modal-actions .btn-primary').click();
    await expect(page.locator('#tab-savings')).toBeVisible();
  });

  test('allocate, edit and remove; over-allocation warns', async ({ app, page }) => {
    await app.open({ seed: existingUser({ income: 1000 }, { savings_categories: [category()] }) });

    await page.locator('#plan-savings-add-btn').click();
    await page.locator('#plan-savings-category-select').selectOption('cat-1');
    await expect(page.locator('#plan-savings-amount')).toHaveValue('500');
    await page.locator('[data-action="add-allocation"]').click();

    await expect(page.locator('#plan-savings-total')).toHaveText('RM 500.00');
    await expect(page.locator('#plan-savings-summary')).toContainText('Remaining');
    expect(await app.db('plan_savings')).toEqual([expect.objectContaining({ month_key: THIS_MONTH, allocated_amount: 500, category_name: 'Emergency Fund' })]);

    await page.locator('[data-action="edit-allocation"]').click();
    await expect(page.locator('#edit-plan-savings-cat-name')).toHaveValue('Emergency Fund');
    await page.locator('#edit-plan-savings-amount').fill('1200');
    await page.keyboard.press('Enter');
    await expect(page.locator('#plan-savings-warning')).toBeVisible();
    await expect(page.locator('#plan-savings-summary')).toContainText('Over by');

    await page.locator('[data-action="delete-allocation"]').click();
    await app.confirm();
    await expect(page.locator('#plan-savings-list')).toContainText('No savings allocated');
    expect(await app.db('plan_savings')).toEqual([]);
  });

  test('a category can only be allocated once per month', async ({ app, page }) => {
    await app.open({ seed: existingUser({}, { savings_categories: [category()], plan_savings: [allocation(THIS_MONTH, 100)] }) });

    await page.locator('#plan-savings-add-btn').click();
    await expect(page.locator('#alert-modal-message')).toContainText('already allocated');
  });

  test('allocations are per month', async ({ app, page }) => {
    await app.open({ seed: existingUser({}, { savings_categories: [category()], plan_savings: [allocation(THIS_MONTH, 100)] }) });
    await expect(page.locator('#plan-savings-list')).toContainText('RM 100.00');

    await page.locator('[data-action="change-month"][data-dir="-1"]').click();
    await page.keyboard.press('Escape');
    await expect(page.locator('#plan-savings-list')).toContainText('No savings allocated');
  });
});
