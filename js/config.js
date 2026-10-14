// Central configuration. Placeholders are replaced at build time by .github/workflows/deploy.yml,
// and at serve time by tests/server.js (reading .env.local). Never put real values in this file.

export const SUPABASE_URL = 'SUPABASE_URL_PLACEHOLDER';
export const SUPABASE_KEY = 'SUPABASE_KEY_PLACEHOLDER';

// If you change this host, also update connect-src in the CSP <meta> tag in index.html.
export const AI_PROXY_URL   = 'https://groq-proxy.henryooi0077.workers.dev';
export const AI_MODEL       = 'openai/gpt-oss-20b';
export const AI_TEMPERATURE = 0.2;
export const AI_MAX_TOKENS  = 3000;
export const AI_TIMEOUT_MS  = 60_000;

export const CURRENCY = {
  symbol: 'RM',
  locale: 'en-MY',
  region: 'Malaysia'
};

// Works on GitHub Pages, forks and localhost. Must be listed in Supabase Auth > URL Configuration.
export const AUTH_REDIRECT_URL = window.location.origin + window.location.pathname;

export const SAVE_DEBOUNCE_MS = 600;
export const MIN_PASSWORD_LENGTH = 8;
