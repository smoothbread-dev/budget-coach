import { test, expect, existingUser } from './fixtures/app.js';

test.describe('Dialogs and keyboard', () => {
  test('Esc closes, focus moves into the dialog and returns to the trigger', async ({ app, page }) => {
    await app.open({ seed: existingUser() });
    const trigger = page.locator('[data-action="open-goal-panel"]');

    await trigger.click();
    await expect(app.panel('goal-panel-overlay')).toHaveClass(/open/);
    await expect(page.locator('#panel-goal')).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(app.panel('goal-panel-overlay')).not.toHaveClass(/open/);
    await expect(trigger).toBeFocused();
  });

  test('Tab is trapped inside the open dialog', async ({ app, page }) => {
    await app.open({ seed: existingUser() });
    await page.locator('[data-action="add-recurring"]').evaluate(el => el.click());
    await expect(page.locator('#panel-rec-name')).toBeFocused();

    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => !!document.activeElement.closest('#recurring-panel-overlay'))).toBe(true);
    }
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Shift+Tab');
      expect(await page.evaluate(() => !!document.activeElement.closest('#recurring-panel-overlay'))).toBe(true);
    }
  });

  test('Tab pressed while focus is behind an open dialog pulls it back in', async ({ app, page }) => {
    await app.open({ seed: existingUser() });
    await page.locator('[data-action="add-recurring"]').evaluate(el => el.click());
    await expect(page.locator('#panel-rec-name')).toBeFocused();

    // Focus escaping the dialog (e.g. before it moved in on a slow machine).
    await page.evaluate(() => document.getElementById('tab-btn-planner').focus());
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement.closest('#recurring-panel-overlay'))).toBe(true);
    await page.evaluate(() => document.getElementById('tab-btn-planner').focus());
    await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate(() => !!document.activeElement.closest('#recurring-panel-overlay'))).toBe(true);
  });

  test('clicking the backdrop closes a dialog; clicking inside does not', async ({ app, page }) => {
    await app.open({ seed: existingUser() });
    await page.locator('[data-action="open-goal-panel"]').click();

    await page.locator('#goal-panel-overlay .panel-box').click();
    await expect(app.panel('goal-panel-overlay')).toHaveClass(/open/);

    await page.locator('#goal-panel-overlay').click({ position: { x: 5, y: 5 } });
    await expect(app.panel('goal-panel-overlay')).not.toHaveClass(/open/);
  });

  test('Esc on a confirm dialog cancels it', async ({ app, page }) => {
    await app.open({ seed: existingUser() });
    await page.locator('#month-delete-btn').click();
    await expect(page.locator('#confirm-modal-cancel')).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(app.panel('confirm-modal-overlay')).not.toHaveClass(/open/);
    expect(await app.db('month_plans')).toHaveLength(1);
  });

  test('closed dialogs are not reachable by keyboard', async ({ app, page }) => {
    await app.open({ seed: existingUser() });
    const hidden = await page.locator('.panel-overlay:not(.open), .modal-overlay:not(.open)').evaluateAll(
      els => els.every(el => getComputedStyle(el).visibility === 'hidden')
    );
    expect(hidden).toBe(true);
  });

  test('page scroll is locked only while a dialog is open', async ({ app, page }) => {
    await app.open({ seed: existingUser() });
    const overflow = () => page.evaluate(() => document.body.style.overflow);

    await page.locator('[data-action="open-goal-panel"]').click();
    expect(await overflow()).toBe('hidden');
    await page.keyboard.press('Escape');
    expect(await overflow()).toBe('');
  });

  test('user menu closes on outside click and Esc', async ({ app, page }) => {
    await app.open({ seed: existingUser() });
    const menu = page.locator('#user-dropdown');

    await page.locator('#user-avatar-btn').click();
    await expect(menu).toHaveClass(/open/);
    await expect(page.locator('#user-avatar-btn')).toHaveAttribute('aria-expanded', 'true');
    await page.locator('#month-label').click();
    await expect(menu).not.toHaveClass(/open/);

    await page.locator('#user-avatar-btn').click();
    await page.keyboard.press('Escape');
    await expect(menu).not.toHaveClass(/open/);
  });

  test('tabs update aria-selected and show one panel at a time', async ({ app, page }) => {
    await app.open({ seed: existingUser() });

    for (const tab of ['recurring', 'savings', 'history', 'defaults', 'planner']) {
      await app.tab(tab);
      await expect(page.locator(`#tab-btn-${tab}`)).toHaveAttribute('aria-selected', 'true');
      await expect(page.locator('[role="tabpanel"]:visible')).toHaveCount(1);
      await expect(page.locator(`#tab-${tab}`)).toBeVisible();
    }
  });

  test('icon-only buttons have accessible names', async ({ app, page }) => {
    await app.open({ seed: existingUser() });
    const unnamed = await page.locator('button:visible').evaluateAll(buttons =>
      buttons
        .filter(b => !/[a-z]/i.test(b.textContent) && !b.getAttribute('aria-label'))
        .map(b => b.outerHTML.slice(0, 80))
    );
    expect(unnamed).toEqual([]);
  });

  test('async buttons are disabled while running (no double submit)', async ({ app, page }) => {
    await app.open({ seed: existingUser() });
    await app.tab('recurring');
    await page.locator('[data-action="add-recurring"]').click();
    await page.locator('#panel-rec-name').fill('Phone');
    await page.locator('#panel-rec-amount').fill('50');

    const save = page.locator('[data-action="save-recurring"]');
    await save.evaluate(btn => { btn.click(); btn.click(); btn.click(); });

    await expect(page.locator('#recurring-master-list .recurring-list-item')).toHaveCount(1);
    expect(await app.db('recurring_items')).toHaveLength(1);
  });
});
