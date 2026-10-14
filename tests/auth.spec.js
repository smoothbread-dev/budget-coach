import { test, expect, defaults, seed, existingUser } from './fixtures/app.js';

test.describe('Authentication', () => {
  test('signed-out users see the sign-in form', async ({ app, page }) => {
    await app.open({ signedIn: false });

    await expect(page.locator('#auth-modal')).toBeVisible();
    await expect(page.locator('#auth-title')).toHaveText('Welcome Back');
    await expect(page.locator('#app')).toBeHidden();
    await expect(page.locator('#boot-splash')).toBeHidden();
  });

  test('signing in loads the app and Enter submits the form', async ({ app, page }) => {
    await app.open({ signedIn: false, seed: seed(defaults()) });

    await page.locator('#auth-email').fill('tester@example.com');
    await page.locator('#auth-password').fill('correct-horse');
    await page.locator('#auth-password').press('Enter');

    await expect(page.locator('#app')).toBeVisible();
    await expect(page.locator('#auth-modal')).toBeHidden();
    await expect(page.locator('#user-avatar-initial')).toHaveText('T');
  });

  test('requires email and password', async ({ app, page }) => {
    await app.open({ signedIn: false });

    await page.locator('#auth-submit-btn').click();
    await expect(page.locator('#auth-error')).toHaveText('Please enter both email and password.');
  });

  test('shows a generic message for wrong credentials', async ({ app, page }) => {
    await app.open({ signedIn: false });

    await page.locator('#auth-email').fill('tester@example.com');
    await page.locator('#auth-password').fill('wrong-password');
    await page.locator('#auth-submit-btn').click();

    await expect(page.locator('#auth-error')).toHaveText('Invalid email or password.');
    await expect(page.locator('#auth-submit-btn')).toBeEnabled();
  });

  test('offers to resend confirmation for unverified emails', async ({ app, page }) => {
    await app.open({ signedIn: false });

    await page.locator('#auth-email').fill('unconfirmed@example.com');
    await page.locator('#auth-password').fill('whatever123');
    await page.locator('#auth-submit-btn').click();

    await expect(page.locator('#auth-info-text')).toContainText("hasn't been verified");
    await page.locator('#resend-btn').click();
    await expect(page.locator('#resend-btn')).toContainText('Email sent');
    expect(await app.calls('auth', 'resend')).toHaveLength(1);
  });

  test('sign-up mode clears fields, enforces password length and avoids account enumeration', async ({ app, page }) => {
    await app.open({ signedIn: false });

    await page.locator('#auth-email').fill('someone@example.com');
    await page.locator('#auth-toggle-btn').click();

    await expect(page.locator('#auth-title')).toHaveText('Create Your Account');
    await expect(page.locator('#auth-email')).toHaveValue('');
    await expect(page.locator('#password-hint')).toBeVisible();
    await expect(page.locator('#forgot-password-wrap')).toBeHidden();

    await page.locator('#auth-email').fill('new@example.com');
    await page.locator('#auth-password').fill('short');
    await page.locator('#auth-submit-btn').click();
    await expect(page.locator('#auth-error')).toContainText('at least 8 characters');

    await page.locator('#auth-password').fill('long-enough-password');
    await page.locator('#auth-submit-btn').click();
    await expect(page.locator('#auth-info-text')).toContainText('If you already have an account');

    const [signUp] = await app.calls('auth', 'signUp');
    expect(signUp.payload.options.emailRedirectTo).toBe(new URL('/', page.url()).href);
  });

  test('password visibility toggle', async ({ app, page }) => {
    await app.open({ signedIn: false });
    const input = page.locator('#auth-password');

    await expect(input).toHaveAttribute('type', 'password');
    await page.locator('#toggle-password').click();
    await expect(input).toHaveAttribute('type', 'text');
    await expect(page.locator('#toggle-password')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#toggle-password').click();
    await expect(input).toHaveAttribute('type', 'password');
  });

  test('forgot password uses the current page as redirect', async ({ app, page }) => {
    await app.open({ signedIn: false });

    await page.locator('#forgot-password-btn').click();
    await expect(page.locator('#auth-error')).toHaveText('Please enter your email address first.');

    await page.locator('#auth-email').fill('tester@example.com');
    await page.locator('#forgot-password-btn').click();
    await expect(page.locator('#auth-info-text')).toContainText('If an account exists');

    const [reset] = await app.calls('auth', 'resetPassword');
    expect(reset.payload.options.redirectTo).toBe(new URL('/', page.url()).href);
  });

  test('sign out returns to the auth screen and clears the app', async ({ app, page }) => {
    await app.open({ seed: existingUser() });

    await page.locator('#user-avatar-btn').click();
    await expect(page.locator('#user-dropdown')).toHaveClass(/open/);
    await page.locator('[data-action="sign-out"]').click();

    await expect(page.locator('#auth-modal')).toBeVisible();
    await expect(page.locator('#auth-title')).toHaveText('Welcome Back');
    await expect(page.locator('#app')).toBeEmpty();
  });

  test('change password validates and updates', async ({ app, page }) => {
    await app.open({ seed: existingUser() });

    await page.locator('#user-avatar-btn').click();
    await page.locator('[data-action="open-change-password"]').click();
    await expect(app.panel('change-password-modal')).toHaveClass(/open/);

    await page.locator('#cp-new-password').fill('abc');
    await page.locator('[data-action="submit-change-password"]').click();
    await expect(page.locator('#cp-error')).toContainText('at least 8 characters');

    await page.locator('#cp-new-password').fill('new-password-1');
    await page.locator('#cp-confirm-password').fill('new-password-2');
    await page.locator('[data-action="submit-change-password"]').click();
    await expect(page.locator('#cp-error')).toHaveText('Passwords do not match.');

    await page.locator('#cp-confirm-password').fill('new-password-1');
    await page.locator('[data-action="submit-change-password"]').click();
    await expect(page.locator('#alert-modal-message')).toContainText('updated successfully');
    expect(await app.calls('auth', 'updateUser')).toHaveLength(1);
  });
});
