import { CURRENCY } from './config.js';

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => HTML_ESCAPES[ch]);
}

export function fmt(n) {
  return `${CURRENCY.symbol} ${Number(n || 0).toLocaleString(CURRENCY.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

export function fmtDate(isoString) {
  return new Date(isoString).toLocaleDateString(CURRENCY.locale, {
    day: '2-digit', month: 'short', year: 'numeric'
  });
}

export function monthKey(m, y)   { return `${y}-${String(m + 1).padStart(2, '0')}`; }
export function monthLabel(m, y) { return `${MONTHS[m]} ${y}`; }

export function labelFromKey(key) {
  const [y, m] = key.split('-').map(Number);
  return monthLabel(m - 1, y);
}

export function generateId() { return crypto.randomUUID(); }

/** Parses a user-entered amount, rounded to 2 decimals. Returns NaN when invalid. */
export function parseAmount(raw) {
  const n = parseFloat(String(raw).replace(/,/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}

export function clampPct(raw) {
  const n = parseFloat(raw);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
}

export function $(id) { return document.getElementById(id); }

export function show(el, visible = true) {
  if (typeof el === 'string') el = $(el);
  if (el) el.classList.toggle('bc-hidden', !visible);
}
