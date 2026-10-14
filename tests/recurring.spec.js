import { test, expect, existingUser, USER_ID } from './fixtures/app.js';

test.describe('Recurring tab', () => {
  test('add, edit and delete recurring items', async ({ app, page }) => {
    await app.open({ seed: existingUser() });
    await app.tab('recurring');
    await expect(page.locator('#recurring-master-list')).toContainText('No recurring items yet');

    await page.locator('[data-action="add-recurring"]').click();
    await page.locator('#panel-rec-name').fill('Spotify');
    await page.locator('#panel-rec-amount').fill('15.90');
    await page.keyboard.press('Enter');

    await expect(page.locator('#recurring-master-list')).toContainText('Spotify');
    await expect(page.locator('#recurring-master-list')).toContainText('RM 15.90');
    expect(await app.db('recurring_items')).toEqual([expect.objectContaining({ user_id: USER_ID, name: 'Spotify', amount: 15.9 })]);

    await page.locator('[data-action="edit-recurring"]').click();
    await expect(page.locator('#recurring-panel-title')).toHaveText('Edit Recurring Item');
    await page.locator('#panel-rec-amount').fill('17.90');
    await page.locator('[data-action="save-recurring"]').click();
    await expect(page.locator('#recurring-master-list')).toContainText('RM 17.90');
    expect((await app.db('recurring_items'))[0].amount).toBe(17.9);

    await page.locator('[data-action="delete-recurring"]').click();
    await expect(page.locator('#confirm-modal-message')).toContainText('"Spotify"');
    await app.confirm();
    await expect(page.locator('#recurring-master-list')).toContainText('No recurring items yet');
    expect(await app.db('recurring_items')).toEqual([]);
  });

  test('a failed insert keeps the panel open and does not add the item locally', async ({ app, page }) => {
    app.allowErrors();
    await app.open({ seed: existingUser() });
    await app.tab('recurring');
    await app.fail('recurring_items', 'insert');

    await page.locator('[data-action="add-recurring"]').click();
    await page.locator('#panel-rec-name').fill('Netflix');
    await page.locator('#panel-rec-amount').fill('55');
    await page.locator('[data-action="save-recurring"]').click();

    await expect(app.toast()).toContainText('Could not add the item.');
    await expect(app.panel('recurring-panel-overlay')).toHaveClass(/open/);
    await expect(page.locator('#recurring-master-list')).toContainText('No recurring items yet');

    // Retrying succeeds.
    await page.locator('[data-action="save-recurring"]').click();
    await expect(page.locator('#recurring-master-list')).toContainText('Netflix');
  });

  test('a failed delete keeps the item', async ({ app, page }) => {
    app.allowErrors();
    await app.open({ seed: existingUser({}, { recurring_items: [{ id: 'r1', user_id: USER_ID, name: 'Gym', amount: 99 }] }) });
    await app.tab('recurring');
    await app.fail('recurring_items', 'delete');

    await page.locator('[data-action="delete-recurring"]').click();
    await app.confirm();

    await expect(app.toast()).toContainText('Could not delete the item.');
    await expect(page.locator('#recurring-master-list')).toContainText('Gym');
  });
});
