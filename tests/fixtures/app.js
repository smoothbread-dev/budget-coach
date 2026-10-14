import { test as base, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Read from the app's config so tests follow the real value.
const AI_PROXY_URL = readFileSync(new URL('../../js/config.js', import.meta.url), 'utf8')
  .match(/AI_PROXY_URL\s*=\s*'([^']+)'/)[1];

/** Fixed "today" so month-based assertions are deterministic. */
export const TODAY       = new Date('2026-10-15T09:00:00');
export const THIS_MONTH  = '2026-10';
export const NEXT_MONTH  = '2026-11';
export const PREV_MONTH  = '2026-09';
export const USER_ID     = 'user-1';

// ── Seed builders ──

export const defaults = (income = 5000, savingsGoal = 20) =>
  ({ user_defaults: [{ user_id: USER_ID, income, savings_goal: savingsGoal }] });

export const item = (name, amount, category = 'needs', type = 'oneoff', funded = false) =>
  ({ id: `item-${name}`, name, amount, category, type, funded });

export const plan = (month_key, { income = 5000, savings_goal = 20, items = [], ai_review = null } = {}) =>
  ({ user_id: USER_ID, month_key, income, savings_goal, items, ai_review });

export function seed(...parts) {
  const out = {};
  for (const part of parts) {
    for (const [table, rows] of Object.entries(part)) out[table] = [...(out[table] || []), ...rows];
  }
  return out;
}

/** A returning user: defaults set and a plan for the current month. */
export const existingUser = (planOptions = {}, ...extra) =>
  seed(defaults(), { month_plans: [plan(THIS_MONTH, planOptions)] }, ...extra);

// ── App driver ──

class App {
  constructor(page) {
    this.page = page;
    this.errorsAllowed = false;
  }

  /** Loads the app with the mock backend. Signed in by default and waits for data to load. */
  async open({ signedIn = true, seed: seedData = {}, waitForReady = signedIn } = {}) {
    await this.page.addInitScript(cfg => { window.__MOCK_CONFIG__ = cfg; }, { signedIn, seed: seedData });
    await this.page.goto('/');
    if (waitForReady) {
      await expect(this.page.locator('#app')).toBeVisible();
      await expect(this.page.locator('#toast-label')).toContainText('Ready');
    }
  }

  /** Expected console errors (e.g. simulated failures) won't fail the test. */
  allowErrors() { this.errorsAllowed = true; }

  // Backend
  db(table)                 { return this.page.evaluate(t => structuredClone(window.__mock.db[t]), table); }
  calls(table, op)          { return this.page.evaluate(([t, o]) => window.__mock.calls.filter(c => c.table === t && (!o || c.op === o)), [table, op]); }
  fail(table, op, times = 1) { return this.page.evaluate(([t, o, n]) => window.__mock.fail(t, o, n), [table, op, times]); }

  /** Mocks the AI proxy. handler(body) returns { status, json } or throws to simulate a network error. */
  async mockAI(handler = () => ({ status: 200, json: aiResponse('[HEADER: Overall Assessment]\nLooking good.') })) {
    const requests = [];
    await this.page.route(url => url.href.startsWith(AI_PROXY_URL), async route => {
      const cors = {
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      };
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });

      const body = route.request().postDataJSON();
      requests.push({ body, headers: route.request().headers() });
      try {
        const { status = 200, json = {} } = await handler(body);
        await route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(json) });
      } catch {
        await route.abort('failed');
      }
    });
    return requests;
  }

  // UI helpers
  tab(name)        { return this.page.locator(`[data-action="switch-tab"][data-tab="${name}"]`).click(); }
  panel(id)        { return this.page.locator(`#${id}`); }
  toast()          { return this.page.locator('#toast-label'); }
  confirm()        { return this.page.locator('#confirm-modal-ok').click(); }
  cancelConfirm()  { return this.page.locator('#confirm-modal-cancel').click(); }

  async addItem(cat, name, amount, { type = 'oneoff', funded = false } = {}) {
    await this.page.locator(`[data-action="toggle-add-form"][data-cat="${cat}"]`).first().click();
    if (type !== 'oneoff') await this.page.locator(`#${cat}-type`).selectOption(type);
    await this.page.locator(`#${cat}-name`).fill(name);
    await this.page.locator(`#${cat}-amount`).fill(String(amount));
    if (funded) await this.page.locator(`#${cat}-funded`).check();
    await this.page.locator(`[data-action="add-item"][data-cat="${cat}"]`).click();
  }

  /** Waits until the debounced month save has written to the mock DB. */
  async savedPlan(monthKey = THIS_MONTH) {
    let row;
    await expect.poll(async () => {
      row = (await this.db('month_plans')).find(p => p.month_key === monthKey);
      return !!row;
    }).toBe(true);
    return row;
  }
}

export const aiResponse = (content) => ({ choices: [{ message: { content } }] });

export const test = base.extend({
  app: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

    // Keep tests hermetic: only the local server and mocked routes are reachable.
    await page.route(url => !['127.0.0.1', 'localhost'].includes(url.hostname), route => route.abort('blockedbyclient'));
    await page.clock.setFixedTime(TODAY);

    const app = new App(page);
    await use(app);

    if (!app.errorsAllowed) expect(errors, 'Unexpected browser errors').toEqual([]);
  }
});

export { expect };
