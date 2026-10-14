// Plan tab: summary, needs/wants item lists, add/edit/delete items, purpose banner.
import { CURRENCY } from '../config.js';
import { store, monthData, calcTotals, currentKey } from '../state.js';
import { $, show, escHtml, fmt, generateId, parseAmount } from '../utils.js';
import { registerActions, registerChangeActions } from '../ui/actions.js';
import { openPanel, closePanel, showAlert, showConfirm } from '../ui/modals.js';
import { onTabShow } from '../ui/tabs.js';
import { markDirty } from './sync.js';
import { renderAllocations } from './allocations.js';

const CATEGORIES = ['needs', 'wants'];
const TYPES      = ['recurring', 'oneoff'];

// ─────────────────────────────────────────
// RENDER
// ─────────────────────────────────────────

export function render() {
  const data   = monthData();
  const totals = calcTotals(data);
  const goal   = data.savingsGoal ?? 0;
  const hasIncome = totals.income > 0;

  $('income-display').textContent = hasIncome ? fmt(totals.income) : '—';
  show('income-hint', !hasIncome);

  show('goal-badge', goal > 0);
  $('goal-badge-text').textContent = `${goal}% goal`;

  $('sum-needs').textContent   = fmt(totals.needs);
  $('sum-wants').textContent   = fmt(totals.wants);
  $('sum-savings').textContent = fmt(totals.savings);

  renderTotalExpensesBar(totals);
  renderGoalBar(totals.savingsPct, goal, totals.income);

  CATEGORIES.forEach(cat => TYPES.forEach(type => renderItemList(data, cat, type)));
  $('needs-total').textContent = fmt(totals.needsAll);
  $('wants-total').textContent = fmt(totals.wantsAll);

  renderAllocations();

  const hasData = totals.income > 0 || data.savingsGoal > 0 || data.items.length > 0;
  $('month-delete-btn')?.classList.toggle('hidden', !hasData);
}

function renderTotalExpensesBar({ needs, wants, funded, gross, expensesPct, income }) {
  const hasItems = needs + wants + funded > 0;
  show('total-expenses-card', hasItems);
  if (!hasItems) return;

  const colourClass = expensesPct > 100 ? 'danger' : expensesPct > 80 ? 'warn' : 'safe';

  $('total-exp-main').textContent = fmt(needs + wants);

  const grossEl = $('total-exp-gross');
  show(grossEl, funded > 0);
  grossEl.textContent = funded > 0 ? `incl. funded: ${fmt(gross)}` : '';

  const pctEl = $('total-exp-pct');
  pctEl.textContent = income > 0 ? `${expensesPct.toFixed(1)}% of income` : 'No income set';
  pctEl.className   = `total-expenses-pct ${colourClass}`;

  const fill = $('expenses-bar-fill');
  fill.style.width = `${Math.min(100, expensesPct)}%`;
  fill.className   = `expenses-bar-fill ${colourClass}`;

  const parts = [`Needs ${fmt(needs)}`, `Wants ${fmt(wants)}`];
  if (funded > 0) parts.push(`Funded ${fmt(funded)}`);
  $('total-exp-breakdown').textContent    = parts.join(' · ');
  $('total-exp-income-label').textContent = income > 0 ? `of ${fmt(income)}` : '';
}

function renderGoalBar(savingsPct, goal, income) {
  const visible = goal > 0 && income > 0;
  show('goal-bar-wrap', visible);
  if (!visible) return;

  const diff   = savingsPct - goal;
  const fill   = $('goal-bar-fill');
  const status = $('goal-status-text');

  fill.style.width = `${Math.min(100, savingsPct)}%`;
  $('goal-marker').style.left = `${Math.min(99, goal)}%`;
  $('goal-bar-pct-label').textContent = `${savingsPct.toFixed(1)}% of ${goal}% goal`;

  const level = diff >= 0 ? 'met' : diff >= -3 ? 'close' : 'under';
  fill.className   = `goal-bar-fill ${level}`;
  status.className = `goal-status ${level}`;
  status.textContent = {
    met:   `🎉 Goal met! Projecting ${savingsPct.toFixed(1)}% savings — ${diff.toFixed(1)}% above target.`,
    close: `⚠️ Almost there! ${Math.abs(diff).toFixed(1)}% below your ${goal}% goal.`,
    under: `❌ ${Math.abs(diff).toFixed(1)}% below your ${goal}% goal. Consider trimming wants.`
  }[level];
}

function itemRowHTML(item) {
  const id   = escHtml(item.id);
  const name = escHtml(item.name);
  return `
    <div class="item-row">
      <span class="item-name">${name}</span>
      ${item.funded ? '<span class="item-badge funded">From Savings</span>' : ''}
      <span class="item-amount">${fmt(item.amount)}</span>
      <div class="item-actions">
        <button type="button" class="item-action-btn edit" data-action="edit-item" data-id="${id}" aria-label="Edit ${name}">✎</button>
        <button type="button" class="item-action-btn del"  data-action="delete-item" data-id="${id}" aria-label="Delete ${name}">✕</button>
      </div>
    </div>`;
}

function renderItemList(data, cat, type) {
  const items = data.items.filter(i => i.category === cat && i.type === type);
  $(`${cat}-${type}-list`).innerHTML = items.length
    ? items.map(itemRowHTML).join('')
    : `<div class="empty-subsection">No ${type === 'recurring' ? 'recurring' : 'one-off'} items yet.</div>`;
}

// ─────────────────────────────────────────
// ADD ITEM FORM
// ─────────────────────────────────────────

function toggleAddForm(cat) {
  const wrapper = $(`add-form-${cat}`);
  const opening = wrapper.classList.contains('bc-hidden');
  show(wrapper, opening);
  if (!opening) return;
  renderAddForm(cat);
  $(`${cat}-name`).focus();
}

function renderAddForm(cat) {
  const recurringOptions = store.recurringItems
    .map(r => `<option value="${escHtml(r.id)}">${escHtml(r.name)} — ${fmt(r.amount)}</option>`)
    .join('');

  $(`add-form-${cat}-inner`).innerHTML = `
    ${store.recurringItems.length ? '<div class="recurring-hint">💡 Pick a recurring item to auto-fill, or fill in manually below.</div>' : ''}
    <div class="form-row bc-mb-10">
      <div class="form-field">
        <label class="form-label" for="${cat}-type">Type</label>
        <select class="form-select" id="${cat}-type" data-change="item-type" data-cat="${cat}">
          <option value="oneoff">One-off</option>
          <option value="recurring">Recurring</option>
        </select>
      </div>
    </div>
    <div id="${cat}-recurring-picker" class="bc-hidden bc-mb-10">
      <div class="form-field">
        <label class="form-label" for="${cat}-recurring-select">Pick from Recurring List</label>
        <select class="form-select" id="${cat}-recurring-select" data-change="item-recurring-pick" data-cat="${cat}">
          <option value="">— Select a recurring item —</option>
          ${recurringOptions}
        </select>
      </div>
    </div>
    <div class="form-row two">
      <div class="form-field">
        <label class="form-label" for="${cat}-name">Item Name</label>
        <input class="form-input" id="${cat}-name" maxlength="100" placeholder="e.g. ${cat === 'needs' ? 'Rent' : 'Netflix'}" />
      </div>
      <div class="form-field">
        <label class="form-label" for="${cat}-amount">Amount (${CURRENCY.symbol})</label>
        <input class="form-input" id="${cat}-amount" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0.00" />
      </div>
    </div>
    <div id="${cat}-funded-wrap" class="bc-mb-10 ${cat === 'wants' ? '' : 'bc-hidden'}">
      <label class="funded-check-wrap">
        <input type="checkbox" id="${cat}-funded" />
        <span class="funded-check-label">💰 Funded from saved-up money (won't affect projected savings)</span>
      </label>
    </div>
    <div class="form-actions">
      <button type="button" class="btn btn-secondary btn-sm" data-action="toggle-add-form" data-cat="${cat}">Cancel</button>
      <button type="button" class="btn btn-primary btn-sm" data-action="add-item" data-cat="${cat}">Add</button>
    </div>`;
}

function handleTypeChange(cat) {
  const type      = $(`${cat}-type`).value;
  const showFund  = cat === 'wants' && type === 'oneoff';

  show(`${cat}-recurring-picker`, type === 'recurring' && store.recurringItems.length > 0);
  show(`${cat}-funded-wrap`, showFund);
  if (!showFund) $(`${cat}-funded`).checked = false;

  if (type === 'recurring') {
    $(`${cat}-name`).value   = '';
    $(`${cat}-amount`).value = '';
    $(`${cat}-recurring-select`).value = '';
  }
}

function fillFromRecurring(cat) {
  const item = store.recurringItems.find(r => r.id === $(`${cat}-recurring-select`).value);
  if (!item) return;
  $(`${cat}-name`).value   = item.name;
  $(`${cat}-amount`).value = item.amount;
}

function validateItem(name, amount) {
  if (!name)                   { showAlert('Please enter an item name.', 'warning'); return false; }
  if (!(amount > 0))           { showAlert('Please enter a valid amount.', 'warning'); return false; }
  return true;
}

function addItem(cat) {
  const name   = $(`${cat}-name`).value.trim();
  const amount = parseAmount($(`${cat}-amount`).value);
  const type   = $(`${cat}-type`).value;
  const funded = cat === 'wants' && type === 'oneoff' && $(`${cat}-funded`).checked;
  if (!validateItem(name, amount)) return;

  monthData().items.push({ id: generateId(), name, amount, category: cat, type, funded });
  show(`add-form-${cat}`, false);
  render();
  markDirty();
}

// ─────────────────────────────────────────
// EDIT / DELETE ITEM
// ─────────────────────────────────────────

async function deleteItem(id) {
  const key  = currentKey();
  const data = monthData(key);
  const item = data.items.find(i => i.id === id);
  if (!item) return;

  if (!await showConfirm(`Remove "${item.name}" from your plan?`, 'Remove')) return;

  data.items = data.items.filter(i => i.id !== id);
  render();
  markDirty(key);
}

function openEditItemPanel(id) {
  const item = monthData().items.find(i => i.id === id);
  if (!item) return;

  $('edit-item-id').value       = id;
  $('edit-item-name').value     = item.name;
  $('edit-item-amount').value   = item.amount;
  $('edit-item-category').value = item.category;
  $('edit-item-type').value     = item.type;
  $('edit-item-funded').checked = !!item.funded;

  toggleEditFundedField();
  openPanel('edit-item-panel-overlay', 'edit-item-name');
}

function toggleEditFundedField() {
  const visible = $('edit-item-category').value === 'wants' && $('edit-item-type').value === 'oneoff';
  show('edit-funded-wrap', visible);
  if (!visible) $('edit-item-funded').checked = false;
}

function saveEditItem() {
  const name     = $('edit-item-name').value.trim();
  const amount   = parseAmount($('edit-item-amount').value);
  const category = $('edit-item-category').value;
  const type     = $('edit-item-type').value;
  const funded   = category === 'wants' && type === 'oneoff' && $('edit-item-funded').checked;
  if (!validateItem(name, amount)) return;

  const item = monthData().items.find(i => i.id === $('edit-item-id').value);
  if (item) Object.assign(item, { name, amount, category, type, funded });

  closePanel('edit-item-panel-overlay');
  render();
  markDirty();
}

// ─────────────────────────────────────────
// PURPOSE BANNER (dismissal remembered per user on this device)
// ─────────────────────────────────────────

const bannerKey = () => `bc:banner-dismissed:${store.user?.id}`;

export function showBannerIfNeeded() {
  show('purpose-banner', localStorage.getItem(bannerKey()) !== '1');
}

function dismissBanner() {
  localStorage.setItem(bannerKey(), '1');
  const banner = $('purpose-banner');
  banner.classList.add('hiding');
  banner.addEventListener('animationend', () => show(banner, false), { once: true });
}

// ─────────────────────────────────────────
// WIRING
// ─────────────────────────────────────────

registerActions({
  'toggle-add-form': el => toggleAddForm(el.dataset.cat),
  'add-item':        el => addItem(el.dataset.cat),
  'edit-item':       el => openEditItemPanel(el.dataset.id),
  'delete-item':     el => deleteItem(el.dataset.id),
  'save-edit-item':  saveEditItem,
  'dismiss-banner':  dismissBanner
});

registerChangeActions({
  'item-type':           el => handleTypeChange(el.dataset.cat),
  'item-recurring-pick': el => fillFromRecurring(el.dataset.cat),
  'edit-item-funded':    toggleEditFundedField
});

onTabShow('planner', () => { showBannerIfNeeded(); render(); });
