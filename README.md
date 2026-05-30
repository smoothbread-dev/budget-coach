# 🎯 Budget Coach

A personal budgeting web app that helps you **plan your spending before your salary arrives** — not after.

Built with vanilla HTML, CSS, and JavaScript. No frameworks, no install required. Data is securely stored in the cloud via Supabase — accessible from any device.

---

## ✨ Features

- 📅 **Monthly Planning** — Plan expected needs and wants month by month
- 🔁 **Recurring Items** — Save recurring expenses (rent, subscriptions) for quick reuse
- 🎯 **Savings Goal Tracking** — Set a savings % target and see if your plan hits it
- 🤖 **AI Coach** — Get personalised budget advice powered by Groq (Llama 3.1)
- 📖 **Plan History** — Review and compare past months at a glance
- 💰 **Funded Items** — Mark wants paid from saved-up money so they don't skew your projections
- 🗑️ **Delete Month** — Remove accidental or unwanted month plans cleanly, snapping back to the current month automatically
- 🔐 **User Authentication** — Secure sign up / sign in via Supabase Auth
- ☁️ **Cloud Sync** — All data is stored in Supabase and tied to your account — no more browser-only storage
- 💾 **Auto-save** — Changes are debounced and saved to Supabase automatically

---

## 🚀 Live Demo

👉 [smoothbread-dev.github.io/budget-coach](https://smoothbread-dev.github.io/budget-coach)

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Markup | HTML5 |
| Styling | CSS3 (custom properties, grid, flexbox) |
| Logic | Vanilla JavaScript (ES6+) |
| Auth & Database | [Supabase](https://supabase.com) (PostgreSQL + Auth) |
| AI | [Groq API](https://console.groq.com) — Llama 3.1 8B Instant |
| Hosting | GitHub Pages |
| CI/CD | GitHub Actions |

---

## 🗄️ Database Schema

All data is stored in Supabase under the authenticated user's ID. Row-Level Security (RLS) ensures users can only access their own data.

| Table | Purpose |
|---|---|
| `user_defaults` | Default monthly income and savings goal % |
| `recurring_items` | Saved recurring expenses for quick reuse |
| `month_plans` | Full monthly plan per user (income, goal, items, AI review) |

---

## 🔐 API Key Security

The Groq API key is **never stored in source code**. It is:

1. Stored as an encrypted **GitHub Secret** (`GROQ_API_KEY`)
2. Injected into `app.js` at build time by GitHub Actions using `sed`
3. Never committed to the repository

The placeholder in source code is:
```javascript
const GROQ_API_KEY = 'GROQ_API_KEY_PLACEHOLDER';
```

---

## 🧑‍💻 Running Locally

No build step needed. Just clone and open:

```bash
git clone https://github.com/smoothbread-dev/budget-coach.git
cd budget-coach
```

Then either:
- Open `index.html` directly in your browser, **or**
- Serve it with any static server:

```bash
# Python
python -m http.server 8080

# Node (npx)
npx serve .
```

> ⚠️ For local AI features, replace `GROQ_API_KEY_PLACEHOLDER` in `app.js` with your own key from [console.groq.com](https://console.groq.com). **Never commit your real key.**

> ⚠️ For local Supabase features, ensure your `supabase.js` contains your own project URL and publishable key.

---

## 📖 How to Use

1. **Sign up / Sign in** — Create an account or log in to access your personal data
2. **First launch** — Set your default monthly income and savings goal %
3. **Plan tab** — Enter expected income, then add your needs and wants for the month
4. **Recurring tab** — Pre-save fixed expenses to quickly add them each month
5. **Coach Me** — Hit the button to get AI-powered feedback on your plan
6. **History tab** — Browse and review all your past monthly plans
7. **Delete a month** — Use the 🗑️ button to wipe accidental data from any month; the app returns you to the current month automatically

---

## 🔄 Auth Behaviour

- Toggling between **Sign In** and **Sign Up** clears all input fields
- Signing out clears all fields and resets the auth screen to **Sign In** mode
- Each user's data is fully isolated — no data leaks between accounts
