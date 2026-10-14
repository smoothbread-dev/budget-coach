import { test, expect, defaults, plan, seed, item, THIS_MONTH, PREV_MONTH } from './fixtures/app.js';

test.describe('History tab', () => {
  test('lists months newest first with totals and goal status', async ({ app, page }) => {
    await app.open({
      seed: seed(defaults(), { month_plans: [
        plan(PREV_MONTH, { income: 4000, savings_goal: 50, items: [item('Rent', 3000)] }),
        plan(THIS_MONTH, { income: 5000, savings_goal: 20, items: [item('Rent', 1000), item('Movies', 200, 'wants')], ai_review: 'Nice work.' })
      ] })
    });
    await app.tab('history');

    const cards = page.locator('.history-card');
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0).locator('.history-month')).toHaveText('October 2026');
    await expect(cards.nth(1).locator('.history-month')).toHaveText('September 2026');

    await expect(cards.nth(0)).toContainText('RM 3,800.00');
    await expect(cards.nth(0)).toContainText('✓ 20%');
    await expect(cards.nth(0).locator('.ai-badge')).toBeVisible();
    await expect(cards.nth(1)).toContainText('✗ 50%');
  });

  test('empty state', async ({ app, page }) => {
    await app.open({ seed: defaults() });
    await page.keyboard.press('Escape');
    await app.tab('history');
    await expect(page.locator('.empty-history')).toContainText('No months planned yet');
  });

  test('detail modal shows items and formatted, escaped coach advice', async ({ app, page }) => {
    await app.open({
      seed: seed(defaults(), { month_plans: [
        plan(THIS_MONTH, {
          items: [item('Rent', 1000, 'needs', 'recurring'), item('Trip', 800, 'wants', 'oneoff', true)],
          ai_review: '[HEADER: Overall Assessment]\nSolid plan <script>window.__xss=1</script>\n\n- Cut dining'
        })
      ] })
    });
    await app.tab('history');
    await page.locator('.history-card').first().click();

    const modal = app.panel('history-modal');
    await expect(modal).toHaveClass(/open/);
    await expect(page.locator('#modal-month-title')).toHaveText('October 2026');
    await expect(page.locator('#modal-body')).toContainText('Rent');
    await expect(page.locator('#modal-body .item-badge.funded')).toHaveText('From Savings');

    const toggle = page.locator('[data-action="toggle-collapsible"]');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#modal-body .ai-section-header')).toHaveText('Overall Assessment');
    await expect(page.locator('#modal-body .ai-bullet')).toContainText('Cut dining');
    await expect(page.locator('#modal-body')).toContainText('<script>');
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();

    await page.keyboard.press('Escape');
    await expect(modal).not.toHaveClass(/open/);
  });
});
