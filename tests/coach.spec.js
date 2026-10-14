import { test, expect, existingUser, item, aiResponse } from './fixtures/app.js';

const coachMe = (page) => page.locator('#coach-me-btn').click();

test.describe('AI coach', () => {
  test('sends an authenticated request with the plan and renders formatted advice', async ({ app, page }) => {
    await app.open({ seed: existingUser({ income: 5000, savings_goal: 20, items: [item('Rent', 2000), item('Cinema', 100, 'wants')] }) });
    const requests = await app.mockAI(() => ({
      json: aiResponse('[HEADER: Overall Assessment]\nYou are on track.\n\n[HEADER: Coaching Tips]\n- Cook at home\n- Cancel unused subscriptions')
    }));

    await coachMe(page);

    await expect(page.locator('#ai-review-content .ai-section-header')).toHaveText(['Overall Assessment', 'Coaching Tips']);
    await expect(page.locator('#ai-review-content .ai-bullet')).toHaveCount(2);
    await expect(page.locator('#coach-me-btn')).toBeEnabled();

    expect(requests).toHaveLength(1);
    const { body, headers } = requests[0];
    expect(headers.authorization).toBe('Bearer test-token');
    expect(body.model).toBeTruthy();
    expect(body.max_tokens).toBeGreaterThan(0);
    const prompt = body.messages[0].content;
    expect(prompt).toContain('Expected Income: RM 5,000.00');
    expect(prompt).toContain('- Rent (needs, oneoff): RM 2,000.00');
    expect(prompt).toContain("savings goal is 20%");
    expect(prompt).not.toMatch(/actual spending/i);

    await expect.poll(async () => (await app.savedPlan()).ai_review).toContain('You are on track.');
  });

  test('includes custom questions (max 5) and clears them after success', async ({ app, page }) => {
    await app.open({ seed: existingUser() });
    const requests = await app.mockAI();

    await page.locator('.ai-question-textarea').first().fill('How do I build an emergency fund?');
    for (let i = 0; i < 4; i++) await page.locator('#ai-add-question-btn').click();
    await expect(page.locator('.ai-question-row')).toHaveCount(5);
    await expect(page.locator('#ai-add-question-btn')).toBeHidden();

    await page.locator('[data-action="remove-question"]').first().click();
    await expect(page.locator('#ai-add-question-btn')).toBeVisible();

    await coachMe(page);
    await expect(page.locator('#ai-review-content .ai-review-box')).toBeVisible();

    const prompt = requests[0].body.messages[0].content;
    expect(prompt).toContain('USER QUESTIONS TO ADDRESS:\n1. How do I build an emergency fund?');
    expect(prompt).toContain('[HEADER: Your Questions]');
    await expect(page.locator('.ai-question-row')).toHaveCount(1);
    await expect(page.locator('.ai-question-textarea')).toHaveValue('');
  });

  test('AI output is escaped', async ({ app, page }) => {
    await app.open({ seed: existingUser() });
    await app.mockAI(() => ({ json: aiResponse('Hello <img src=x onerror="window.__xss=1">') }));

    await coachMe(page);
    await expect(page.locator('#ai-review-content .ai-text')).toContainText('<img src=x');
    expect(await page.locator('#ai-review-content img').count()).toBe(0);
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  });

  test('rate limit, server and network errors show a retry option and keep questions', async ({ app, page }) => {
    app.allowErrors();
    await app.open({ seed: existingUser() });

    let mode = 429;
    await app.mockAI(() => {
      if (mode === 'network') throw new Error('offline');
      if (mode === 429) return { status: 429, json: {} };
      return { status: 500, json: { error: { message: 'Upstream exploded' } } };
    });

    await page.locator('.ai-question-textarea').fill('Keep me');
    await coachMe(page);
    await expect(page.locator('#ai-review-content [role="alert"]')).toContainText('usage limit');
    await expect(page.locator('.ai-question-textarea')).toHaveValue('Keep me');

    mode = 500;
    await page.locator('#ai-review-content [data-action="run-review"]').click();
    await expect(page.locator('#ai-review-content [role="alert"]')).toContainText('Upstream exploded');

    mode = 'network';
    await page.locator('#ai-review-content [data-action="run-review"]').click();
    await expect(page.locator('#ai-review-content [role="alert"]')).toContainText('Could not reach the AI coach');
  });

  test('requires income before coaching', async ({ app, page }) => {
    await app.open();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await coachMe(page);
    await expect(page.locator('#alert-modal-message')).toHaveText('Please set your expected income first.');
  });

  test('prompt preview shows the exact prompt', async ({ app, page }) => {
    await app.open({ seed: existingUser({ items: [item('Rent', 1200)] }) });

    await page.locator('[data-action="open-prompt-preview"]').click();
    await expect(app.panel('prompt-preview-overlay')).toHaveClass(/open/);
    await expect(page.locator('#prompt-preview-content')).toContainText('Rent (needs, oneoff): RM 1,200.00');
    await expect(page.locator('#prompt-preview-content')).toContainText('based in Malaysia');
  });

  test('saved advice is shown for the month; other months show the empty state', async ({ app, page }) => {
    await app.open({ seed: existingUser({ ai_review: '[HEADER: Final Note]\nKeep going!' }) });

    await expect(page.locator('#ai-review-content .ai-section-header')).toHaveText('Final Note');
    await page.locator('[data-action="change-month"][data-dir="1"]').click();
    await page.keyboard.press('Escape');
    await expect(page.locator('#ai-review-content')).toContainText('No advice yet');
  });

  test('the coach button only shows on the Plan tab', async ({ app, page }) => {
    await app.open({ seed: existingUser() });
    await expect(page.locator('#coach-me-btn')).toBeVisible();
    await app.tab('history');
    await expect(page.locator('#coach-me-btn')).toBeHidden();
    await app.tab('planner');
    await expect(page.locator('#coach-me-btn')).toBeVisible();
  });
});
