# 🎯 Budget Coach

A lightweight, offline-first personal budgeting web app that helps you **plan your spending before your salary arrives** — not after.

Built with vanilla HTML, CSS, and JavaScript. No frameworks, no dependencies, no install required.

---

## ✨ Features

- 📅 **Monthly Planning** — Plan expected needs and wants month by month
- 🔁 **Recurring Items** — Save recurring expenses (rent, subscriptions) for quick reuse
- 🎯 **Savings Goal Tracking** — Set a savings % target and see if your plan hits it
- 🤖 **AI Coach** — Get personalised budget advice powered by Groq (Llama 3)
- 📖 **Plan History** — Review and compare past months at a glance
- 💰 **Funded Items** — Mark wants paid from saved-up money so they don't skew your projections
- 💾 **Auto-save** — Everything persists locally in your browser via `localStorage`

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
| AI | [Groq API](https://console.groq.com) — Llama 3.1 8B Instant |
| Hosting | GitHub Pages |
| CI/CD | GitHub Actions |

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

No build step needed. Just open the file:

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

---

## 📖 How to Use

1. **First launch** — Set your default monthly income and savings goal %
2. **Plan tab** — Enter expected income, then add your needs and wants for the month
3. **Recurring tab** — Pre-save fixed expenses to quickly add them each month
4. **Coach Me** — Hit the button to get AI-powered feedback on your plan
5. **History tab** — Browse and review all your past monthly plans
