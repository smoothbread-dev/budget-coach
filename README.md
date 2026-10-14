# 🎯 Budget Coach

A personal budgeting web app that helps you **plan your spending before your salary arrives** — not after.

Built with vanilla HTML, CSS and JavaScript (ES modules). No framework and no build step. Data is stored in Supabase, so it's available on any device.

👉 **Live:** [smoothbread-dev.github.io/budget-coach](https://smoothbread-dev.github.io/budget-coach)

---

## ✨ Features

- 📅 **Monthly planning** — expected income, savings goal %, and needs/wants split into recurring and one-off items
- 🔁 **Recurring items** — a master list of fixed expenses to auto-fill each month
- 💰 **Funded items** — mark wants paid from saved-up money so they don't skew projections
- 🎯 **Savings goal tracking** — projected savings vs. your target with a progress bar
- 🏦 **Savings categories** — goals (e.g. Emergency Fund) with monthly contribution, total saved, estimated completion date and a deposit/withdrawal log
- 📊 **Savings allocation** — split each month's projected savings across your categories
- 🤖 **AI coach** — personalised feedback on your plan plus answers to up to 5 custom questions (Groq, `openai/gpt-oss-20b`); preview the exact prompt before sending
- 📖 **History** — browse past months and their saved coach advice
- ⚙️ **Defaults** — default income and savings goal offered when you open a new month
- 🗑️ **Delete month** — removes the month's plan *and* its savings allocations
- 🔐 **Accounts** — sign up with email confirmation, sign in, forgot/change password
- 💾 **Auto-save** — debounced saves with retry on failure and a warning before closing with unsaved changes

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| UI | HTML5, CSS3, vanilla JavaScript (ES modules) |
| Auth & database | [Supabase](https://supabase.com) (PostgreSQL + Auth, Row-Level Security) |
| AI | [Groq](https://console.groq.com) via a Cloudflare Worker proxy |
| Hosting | GitHub Pages (deployed by GitHub Actions) |

---

## 📁 Project Structure

```
index.html              Markup (no inline scripts), CSP, app <template>
style.css               All styles
js/
  config.js             ⚙️ All configuration constants (see below)
  main.js               Entry point — bootstraps the app after sign-in
  supabaseClient.js     Creates the Supabase client
  api.js                Every database query (throws on error)
  state.js              Shared in-memory store + calculations
  utils.js              Formatting, escaping, DOM helpers
  ui/
    actions.js          Delegated click/change handling (data-action / data-change)
    modals.js           Panels, alerts, confirms, focus trap, Esc/backdrop close
    tabs.js             Tab switching
    toast.js            Save-status toast + persist() helper
  features/
    auth.js             Sign in/up, password reset, change password, user menu
    planner.js          Plan tab rendering and needs/wants items
    month.js            Month navigation, income/goal panels, delete month
    allocations.js      Savings allocation on the Plan tab
    savings.js          Savings tab (categories + adjustments)
    recurring.js        Recurring tab
    history.js          History tab + detail modal
    defaults.js         Defaults tab + first-time setup
    coach.js            AI prompt, request and result formatting
    sync.js             Debounced month auto-save with retry
supabase/security.sql   RLS policies + foreign-key fixes (run once)
worker/                 Reference Cloudflare Worker for the AI proxy
tests/                  Playwright end-to-end tests (see Tests below)
.github/workflows/
  deploy.yml            Runs tests, then builds and deploys to GitHub Pages
  test.yml              Runs the Playwright suite on PRs and branch pushes
  keep-alive.yml        Pings Supabase every 3 days so the free tier doesn't pause
```

### Adding a button

Markup never uses `onclick`. Add a `data-action` attribute, then register the handler in the relevant feature module:

```html
<button type="button" data-action="do-thing" data-id="123">Do thing</button>
```

```js
registerActions({ 'do-thing': (el) => doThing(el.dataset.id) });
```

Async handlers block repeat clicks while they run.

---

## 🧪 Tests

End-to-end tests use [Playwright](https://playwright.dev) against an **in-memory mock of Supabase**, so they never touch your real project or the AI proxy.

```bash
npm install
npx playwright install chromium
npm test              # full suite (desktop + mobile)
npm run test:ui       # interactive runner
npm run test:report   # open the last HTML report
```

| File | Covers |
|---|---|
| `auth.spec.js` | Sign in/up, errors, resend, forgot/change password, sign out |
| `months.spec.js` | First-time setup, new-month prompt, navigation, delete month |
| `plan.spec.js` | Needs/wants items, totals, funded items, editing, auto-save retry, XSS |
| `recurring.spec.js` | Recurring list CRUD and failure handling |
| `savings.spec.js` | Savings categories, adjustments, allocations |
| `history.spec.js` | History grid and detail modal |
| `coach.spec.js` | AI request/prompt, questions, rendering, error states |
| `data.spec.js` | Data loading, retry, Defaults tab |
| `accessibility.spec.js` | Dialog focus/Esc/backdrop, tabs, accessible names |
| `security.spec.js` | CSP, no inline handlers, SRI pinning, escaping |

How the harness works:

- **`tests/server.js`** serves the repo and swaps the Supabase CDN script for **`tests/fixtures/mock-supabase.js`**.
- **`tests/fixtures/app.js`** provides the `app` fixture:
  - **Start:** `open({ seed })`, plus seed builders (`existingUser()`, `plan()`, `item()`).
  - **Inspect the mock database:** `db(table)`, `calls(...)`.
  - **Simulate failures:** `fail(table, op)`.
  - **AI:** `mockAI()`.
  - **Clock:** "today" is fixed to 15 Oct 2026.
- **Tests fail on any unexpected browser error.** Call `app.allowErrors()` in tests that simulate failures.

When you add a feature, add a spec (or extend one) using the same fixture. Tests run automatically on pull requests and pushes (`.github/workflows/test.yml`), and **deploys to GitHub Pages only happen if they pass**.

---

## ⚙️ Configuration — `js/config.js`

| Constant | Purpose |
|---|---|
| `SUPABASE_URL`, `SUPABASE_KEY` | Placeholders only. Replaced at deploy time from GitHub Secrets, and when serving locally from `.env.local`. |
| `AI_PROXY_URL` | Worker URL. **Also update `connect-src` in the CSP `<meta>` in `index.html`.** |
| `AI_MODEL`, `AI_TEMPERATURE`, `AI_MAX_TOKENS`, `AI_TIMEOUT_MS` | AI request settings. |
| `CURRENCY` | `symbol`, `locale` and `region`. Used for all money formatting, labels and the AI prompt. |
| `AUTH_REDIRECT_URL` | Built from the current page URL, so email links work on GitHub Pages, forks and localhost. |
| `SAVE_DEBOUNCE_MS`, `MIN_PASSWORD_LENGTH` | Behaviour tuning. |

---

## 🚀 Setup

### 1. Supabase

1. Create the tables: `user_defaults`, `recurring_items`, `month_plans`, `savings_categories`, `savings_adjustments`, `plan_savings`.
2. Run [`supabase/security.sql`](supabase/security.sql) in the SQL Editor. This:
   - enables Row-Level Security on every table, so each user can only access their own rows
   - deletes a category's adjustments when the category is deleted
   - keeps a deleted category's monthly allocations, but clears their category link
3. Under **Authentication → URL Configuration**, add every URL you serve the app from to **Redirect URLs**, e.g. `https://smoothbread-dev.github.io/budget-coach/` and `http://localhost:8080/`.
4. Recommended: under **Authentication → Providers → Email**, set the minimum password length to 8.

### 2. AI proxy (Cloudflare Worker)

The Groq key lives only in the Worker, never in the browser.

```bash
cd worker
npx wrangler secret put GROQ_API_KEY
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_KEY
npx wrangler deploy
```

The Worker:

- only accepts requests from `ALLOWED_ORIGINS`
- requires a valid Supabase session token
- rate-limits each user to 10 requests per minute
- only allows approved models and caps `max_tokens`

> ⚠️ Deploy the Worker **before** deploying this version of the site. The app now sends an `Authorization` header, which older proxies reject in CORS.

### 3. GitHub

Add the repository secrets `SUPABASE_URL` and `SUPABASE_KEY`. Pushing to `main` deploys the site. Only `index.html`, `style.css`, `js/` and `public/` are published.

`keep-alive.yml` runs automatically every 3 days. GitHub pauses scheduled workflows after 60 days without commits; re-enable it from the Actions tab if that happens.

---

## 🧑‍💻 Running Locally

ES modules need a web server; opening `index.html` directly from disk won't work.

```bash
git clone https://github.com/smoothbread-dev/budget-coach.git
cd budget-coach
npm install                      # also enables the pre-commit hook
copy .env.example .env.local     # then fill in SUPABASE_URL and SUPABASE_KEY
start-server.bat real            # or: start-server.bat  (mock backend, no account needed)
```

Open <http://localhost:8080>. For the AI coach to work locally, `http://localhost:8080` must be in the Worker's `ALLOWED_ORIGINS`.

**Your Supabase values never go in `js/config.js`.** That file always keeps its placeholders. The local server reads `.env.local` (git-ignored) and injects the values while serving, the same way the deploy workflow does from GitHub Secrets. Three layers stop real values being committed:

1. `.env.local` is git-ignored.
2. A pre-commit hook (`.githooks/pre-commit`) blocks commits where `js/config.js` has lost its placeholders, an `.env` file is staged, or the staged changes contain a Supabase key or URL or an API key.
3. CI fails if `js/config.js` has no placeholders, and deploys only run after tests pass.

---

## 🔐 Security

- **Row-Level Security** on all tables (`supabase/security.sql`)
- **Content Security Policy:** no inline scripts, and only Supabase and the AI proxy can be contacted
- **Pinned Supabase SDK** with Subresource Integrity
- **Escaping:** all user text is HTML-escaped before rendering, including quotes
- **AI proxy:** requires a session, is origin-restricted and rate-limited
- **No account enumeration:** sign-up and password reset messages don't reveal whether an email is registered
- **Minimal deploy:** only app files are published

---

## 📖 How to Use

1. **Sign up / sign in.**
2. **First launch:** set your default monthly income and savings goal %.
3. **Plan tab:**
   - Pick a month. Click the month name to jump back to the current month.
   - Use your defaults or enter this month's income.
   - Add needs and wants, and allocate savings.
4. **Recurring tab:** pre-save fixed expenses to reuse each month.
5. **Savings tab:** create savings goals and log deposits or withdrawals.
6. **Coach Me:** get AI feedback. You can add specific questions first.
7. **History tab:** review past months.

Keyboard: **Esc** closes dialogs and **Enter** submits the open form.
