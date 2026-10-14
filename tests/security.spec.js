import { test, expect, existingUser } from './fixtures/app.js';
import { readFileSync, readdirSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');

function jsFiles(dir) {
  return readdirSync(new URL(dir, ROOT), { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? jsFiles(`${dir}${e.name}/`) : e.name.endsWith('.js') ? [`${dir}${e.name}`] : []);
}

test.describe('Security guards (static)', () => {
  const html = read('index.html');

  test('index.html has no inline event handlers or inline scripts', () => {
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
    const inlineScripts = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>/g)];
    expect(inlineScripts).toEqual([]);
  });

  test('a Content Security Policy forbids inline scripts', () => {
    const csp = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)?.[1] ?? '';
    const scriptSrc = csp.match(/script-src([^;]*)/)?.[1] ?? '';
    expect(scriptSrc).toContain("'self'");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
    expect(csp).toContain("object-src 'none'");
  });

  test('the AI proxy host is allowed by the CSP', () => {
    const proxy = read('js/config.js').match(/AI_PROXY_URL\s*=\s*'([^']+)'/)[1];
    expect(html).toContain(new URL(proxy).origin);
  });

  test('third-party scripts are version-pinned with Subresource Integrity', () => {
    const external = [...html.matchAll(/<script[^>]+src="(https:[^"]+)"[^>]*>/g)];
    expect(external.length).toBeGreaterThan(0);
    for (const [tag, src] of external) {
      expect(src, 'pin an exact version').toMatch(/@\d+\.\d+\.\d+\//);
      expect(tag).toMatch(/integrity="sha(256|384|512)-/);
      expect(tag).toContain('crossorigin="anonymous"');
    }
  });

  test('JS never builds inline handlers or uses eval', () => {
    for (const file of jsFiles('js/')) {
      const src = read(file);
      expect(src, file).not.toMatch(/\son(click|change|input|submit|error|load)\s*=\s*["'`]/i);
      expect(src, file).not.toMatch(/\beval\s*\(|new Function\s*\(/);
    }
  });

  test('no API keys are hardcoded in the source', () => {
    for (const file of jsFiles('js/')) expect(read(file), file).not.toMatch(/gsk_[A-Za-z0-9]{10,}/);
  });

  // Enforced in CI only, so you can put real values in js/config.js to test locally.
  test('config.js keeps Supabase placeholders (real values come from GitHub Secrets)', () => {
    test.skip(!process.env.CI, 'Local js/config.js may hold real values; do not commit them.');
    const config = read('js/config.js');
    expect(config).toContain("'SUPABASE_URL_PLACEHOLDER'");
    expect(config).toContain("'SUPABASE_KEY_PLACEHOLDER'");
  });
});

test.describe('Security guards (runtime)', () => {
  test('rendered DOM contains no inline handlers after using the app', async ({ app, page }) => {
    await app.open({ seed: existingUser() });
    await app.addItem('needs', 'Rent', 100);
    for (const tab of ['recurring', 'savings', 'history', 'defaults', 'planner']) await app.tab(tab);

    const withHandlers = await page.evaluate(() =>
      [...document.querySelectorAll('*')].filter(el => [...el.attributes].some(a => /^on/i.test(a.name))).length);
    expect(withHandlers).toBe(0);
  });

  test('escHtml escapes all HTML-significant characters', async ({ app, page }) => {
    await app.open({ signedIn: false });
    const escaped = await page.evaluate(async () => (await import('/js/utils.js')).escHtml(`<a href="x" title='y'>&</a>`));
    expect(escaped).toBe('&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
  });
});
