// History tab: grid of past months and a read-only detail modal.
import { store, calcTotals } from '../state.js';
import { $, escHtml, fmt, labelFromKey } from '../utils.js';
import { registerActions } from '../ui/actions.js';
import { openPanel } from '../ui/modals.js';
import { onTabShow } from '../ui/tabs.js';
import { formatAIText } from './coach.js';

export function renderHistory() {
  const grid    = $('history-grid');
  const entries = Object.entries(store.months)
    .filter(([, d]) => d.income > 0)
    .sort(([a], [b]) => b.localeCompare(a));

  if (entries.length === 0) {
    grid.innerHTML = '<div class="empty-history">No months planned yet.<br>Start adding your expected income and expenses on the Plan tab.</div>';
    return;
  }

  grid.innerHTML = entries.map(([key, data]) => {
    const { needs, wants, savings, savingsPct } = calcTotals(data);
    const goal = data.savingsGoal ?? 0;
    const met  = savingsPct >= goal;

    return `
      <button type="button" class="history-card" data-action="open-history" data-key="${escHtml(key)}">
        <div class="history-month">${labelFromKey(key)}</div>
        <div class="history-stat"><span class="hl">Income</span><span class="hr">${fmt(data.income)}</span></div>
        <div class="history-stat"><span class="hl">Needs</span><span class="hr need">${fmt(needs)}</span></div>
        <div class="history-stat"><span class="hl">Wants</span><span class="hr want">${fmt(wants)}</span></div>
        <div class="history-stat">
          <span class="hl">Savings</span>
          <span class="hr save">${fmt(savings)} <span class="savings-pct">(${savingsPct.toFixed(1)}%)</span></span>
        </div>
        ${goal > 0 ? `
        <div class="history-stat history-goal">
          <span class="hl">Goal</span>
          <span class="hr ${met ? 'text-success' : 'text-danger'}">${met ? '✓' : '✗'} ${goal}%</span>
        </div>` : ''}
        ${data.aiReview ? '<div class="ai-badge">📝 Coach\'s Advice</div>' : ''}
      </button>`;
  }).join('');
}

function listHTML(items) {
  if (items.length === 0) return '<div class="empty-subsection">None</div>';
  return items.map(i => `
    <div class="item-row">
      <span class="item-name">${escHtml(i.name)}</span>
      ${i.funded ? '<span class="item-badge funded">From Savings</span>' : ''}
      <span class="item-amount">${fmt(i.amount)}</span>
    </div>`).join('');
}

function sectionHTML(title, items, cat) {
  const of = type => items.filter(i => i.category === cat && i.type === type);
  return `
    <div class="card-title bc-mb-10">${title}</div>
    <div class="subsection-label">🔁 Recurring</div>${listHTML(of('recurring'))}
    <div class="subsection-label bc-mt-10">📌 One-off</div>${listHTML(of('oneoff'))}`;
}

function openHistoryModal(key) {
  const data = store.months[key];
  if (!data) return;

  const { needs, wants, savings } = calcTotals(data);
  const items = data.items || [];

  $('modal-month-title').textContent = labelFromKey(key);
  $('modal-body').innerHTML = `
    <div class="history-summary-grid">
      <div class="summary-tile needs"><span class="label">Needs</span><span class="value">${fmt(needs)}</span></div>
      <div class="summary-tile wants"><span class="label">Wants</span><span class="value">${fmt(wants)}</span></div>
      <div class="summary-tile savings"><span class="label">Savings</span><span class="value">${fmt(savings)}</span></div>
    </div>
    ${sectionHTML('Expected Needs', items, 'needs')}
    <div class="divider"></div>
    ${sectionHTML('Expected Wants', items, 'wants')}
    ${data.aiReview ? `
      <button type="button" class="collapsible-header" data-action="toggle-collapsible" aria-expanded="false">
        <span class="collapsible-title">📝 Coach's Advice</span>
        <span class="collapsible-arrow">▼</span>
      </button>
      <div class="collapsible-body">
        <div class="ai-text">${formatAIText(data.aiReview)}</div>
      </div>` : ''}`;

  openPanel('history-modal');
}

function toggleCollapsible(header) {
  const open = header.nextElementSibling.classList.toggle('open');
  header.querySelector('.collapsible-arrow').classList.toggle('open', open);
  header.setAttribute('aria-expanded', String(open));
}

registerActions({
  'open-history':       el => openHistoryModal(el.dataset.key),
  'toggle-collapsible': toggleCollapsible
});

onTabShow('history', renderHistory);
