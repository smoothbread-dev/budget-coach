// Savings tab: savings categories, progress towards goals, manual adjustments.
import * as api from '../api.js';
import { store, sameId, findCategory, adjustmentsFor, sumAdjustments, categoryTotalSaved } from '../state.js';
import { $, escHtml, fmt, fmtDate, parseAmount } from '../utils.js';
import { CURRENCY } from '../config.js';
import { registerActions } from '../ui/actions.js';
import { openPanel, closePanel, showAlert, showConfirm } from '../ui/modals.js';
import { onTabShow } from '../ui/tabs.js';
import { persist } from '../ui/toast.js';

// ─────────────────────────────────────────
// RENDER
// ─────────────────────────────────────────

function monthsLeftHTML(pct, remaining, monthlyAmt) {
  if (pct >= 100)      return '<span class="months-left-value goal-reached">🎉 Goal reached!</span>';
  if (monthlyAmt <= 0) return '<span class="months-left-value">—</span>';

  const monthsLeft = remaining / monthlyAmt;
  const whole      = Math.ceil(monthsLeft);
  const now        = new Date();
  const estLabel   = new Date(now.getFullYear(), now.getMonth() + whole, 1)
    .toLocaleString(CURRENCY.locale, { month: 'long', year: 'numeric' });
  const display    = monthsLeft.toFixed(1);

  return `
    <span class="months-left-value">
      ${display} month${display === '1.0' ? '' : 's'} left
      <span class="months-left-est">(est. ${estLabel})</span>
    </span>`;
}

function adjustmentRowsHTML(cat) {
  const rows = adjustmentsFor(cat.id);
  if (rows.length === 0) return '<div class="savings-adj-empty">No adjustments yet.</div>';

  return rows.map(a => {
    const positive = Number(a.amount) >= 0;
    return `
      <div class="savings-adj-row">
        <span class="savings-adj-amount ${positive ? 'positive' : 'negative'}">${positive ? '+' : ''}${fmt(a.amount)}</span>
        <span class="savings-adj-note">${escHtml(a.note || '—')}</span>
        <span class="savings-adj-date">${fmtDate(a.created_at)}</span>
        <button type="button" class="item-action-btn del" data-action="delete-adjustment" data-id="${escHtml(a.id)}" aria-label="Delete adjustment">✕</button>
      </div>`;
  }).join('');
}

function categoryCardHTML(cat) {
  const totalSaved = categoryTotalSaved(cat);
  const goalAmount = Number(cat.goal_amount);
  const monthlyAmt = Number(cat.monthly_amount);
  const pct        = goalAmount > 0 ? Math.min(100, (totalSaved / goalAmount) * 100) : 0;
  const adjSum     = sumAdjustments(cat.id);
  const barClass   = pct >= 100 ? 'met' : pct >= 70 ? 'close' : 'under';
  const id         = escHtml(cat.id);
  const name       = escHtml(cat.name);

  return `
    <div class="savings-cat-card">
      <div class="savings-cat-header">
        <span class="savings-cat-name">${name}</span>
        <div class="item-actions">
          <button type="button" class="item-action-btn edit" data-action="edit-savings-category" data-id="${id}" aria-label="Edit ${name}">✎</button>
          <button type="button" class="item-action-btn del"  data-action="delete-savings-category" data-id="${id}" aria-label="Delete ${name}">✕</button>
        </div>
      </div>

      <div class="savings-cat-stats">
        <div class="savings-stat-item">
          <span class="savings-stat-label">Monthly</span>
          <span class="savings-stat-value">${fmt(monthlyAmt)}/mo</span>
        </div>
        <div class="savings-stat-item">
          <span class="savings-stat-label">Total Saved</span>
          <span class="savings-stat-value accent">${fmt(totalSaved)}</span>
        </div>
        <div class="savings-stat-item">
          <span class="savings-stat-label">Goal</span>
          <span class="savings-stat-value">${fmt(goalAmount)}</span>
        </div>
        ${adjSum !== 0 ? `
        <div class="savings-stat-item">
          <span class="savings-stat-label">Adjustments</span>
          <span class="savings-stat-value ${adjSum >= 0 ? 'positive' : 'negative'}">${adjSum >= 0 ? '+' : ''}${fmt(adjSum)}</span>
        </div>` : ''}
      </div>

      <div class="months-left-row">
        <span class="months-left-label">📅 Est. time to goal</span>
        ${monthsLeftHTML(pct, Math.max(0, goalAmount - totalSaved), monthlyAmt)}
      </div>

      <div class="savings-progress-wrap">
        <div class="savings-progress-labels">
          <span>${fmt(totalSaved)} saved</span>
          <span>${pct.toFixed(1)}% of ${fmt(goalAmount)}</span>
        </div>
        <div class="savings-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct.toFixed(0)}">
          <div class="savings-progress-fill ${barClass}" style="width:${pct}%"></div>
        </div>
      </div>

      <div class="savings-adj-section">
        <div class="savings-adj-header">
          <span class="savings-adj-title">📋 Adjustment Log</span>
          <button type="button" class="btn btn-primary btn-sm" data-action="add-adjustment" data-id="${id}">+ Add Adjustment</button>
        </div>
        <div class="savings-adj-list">${adjustmentRowsHTML(cat)}</div>
      </div>
    </div>`;
}

export function renderSavingsCategories() {
  const container = $('savings-categories-list');
  if (!container) return;

  container.innerHTML = store.savingsCategories.length === 0
    ? '<div class="empty-subsection empty-centered">No savings categories yet. Add your first one!</div>'
    : store.savingsCategories.map(categoryCardHTML).join('');
}

// ─────────────────────────────────────────
// CATEGORY MODAL
// ─────────────────────────────────────────

function openCategoryModal(id = null) {
  const cat = id ? findCategory(id) : null;
  if (id && !cat) return;

  $('savings-category-modal-title').textContent = cat ? 'Edit Savings Category' : 'Add Savings Category';
  $('savings-category-id').value      = cat?.id ?? '';
  $('savings-category-name').value    = cat?.name ?? '';
  $('savings-category-monthly').value = cat?.monthly_amount ?? '';
  $('savings-category-goal').value    = cat?.goal_amount ?? '';
  openPanel('savings-category-modal', 'savings-category-name');
}

async function submitCategoryModal() {
  const id      = $('savings-category-id').value;
  const name    = $('savings-category-name').value.trim();
  const monthly = parseAmount($('savings-category-monthly').value);
  const goal    = parseAmount($('savings-category-goal').value);

  if (!name)                         { showAlert('Please enter a category name.', 'warning'); return; }
  if (Number.isNaN(monthly) || monthly < 0) { showAlert('Please enter a valid monthly amount.', 'warning'); return; }
  if (!(goal > 0))                   { showAlert('Please enter a valid goal amount.', 'warning'); return; }

  const fields = { name, monthly_amount: monthly, goal_amount: goal };

  if (id) {
    const { ok } = await persist(() => api.updateSavingsCategory(id, fields), 'Could not update the category.');
    if (!ok) return;
    Object.assign(findCategory(id) ?? {}, fields);
  } else {
    const { ok, data } = await persist(() => api.insertSavingsCategory(fields), 'Could not add the category.');
    if (!ok) return;
    store.savingsCategories.push(data);
  }

  closePanel('savings-category-modal');
  renderSavingsCategories();
}

async function deleteCategory(id) {
  const confirmed = await showConfirm(
    'Delete this savings category? Its adjustment log will also be removed. Monthly allocations already in your plans are kept.',
    'Delete'
  );
  if (!confirmed) return;

  const { ok } = await persist(() => api.deleteSavingsCategory(id), 'Could not delete the category.');
  if (!ok) return;

  const name = findCategory(id)?.name ?? null;
  store.savingsCategories  = store.savingsCategories.filter(c => !sameId(c.id, id));
  store.savingsAdjustments = store.savingsAdjustments.filter(a => !sameId(a.savings_category_id, id));
  // Mirrors the database ON DELETE SET NULL on plan_savings.savings_category_id.
  store.planSavings.forEach(p => {
    if (sameId(p.savings_category_id, id)) {
      p.savings_category_id = null;
      p.category_name ??= name;
    }
  });
  renderSavingsCategories();
}

// ─────────────────────────────────────────
// ADJUSTMENTS
// ─────────────────────────────────────────

function openAdjustmentModal(categoryId) {
  const cat = findCategory(categoryId);
  $('savings-adjustment-modal-title').textContent = cat ? `Add Adjustment — ${cat.name}` : 'Add Adjustment';
  $('savings-adjustment-category-id').value = categoryId;
  $('savings-adjustment-amount').value      = '';
  $('savings-adjustment-note').value        = '';
  openPanel('savings-adjustment-modal', 'savings-adjustment-amount');
}

async function submitAdjustment() {
  const categoryId = $('savings-adjustment-category-id').value;
  const amount     = parseAmount($('savings-adjustment-amount').value);
  const note       = $('savings-adjustment-note').value.trim();

  if (Number.isNaN(amount) || amount === 0) {
    showAlert('Please enter a non-zero amount. Use a negative number for withdrawals.', 'warning');
    return;
  }

  const { ok, data } = await persist(() => api.insertAdjustment({ categoryId, amount, note }), 'Could not save the adjustment.');
  if (!ok) return;

  store.savingsAdjustments.push(data);
  closePanel('savings-adjustment-modal');
  renderSavingsCategories();
}

async function deleteAdjustment(id) {
  if (!await showConfirm('Remove this adjustment entry?', 'Remove')) return;

  const { ok } = await persist(() => api.deleteAdjustment(id), 'Could not remove the adjustment.');
  if (!ok) return;

  store.savingsAdjustments = store.savingsAdjustments.filter(a => !sameId(a.id, id));
  renderSavingsCategories();
}

registerActions({
  'add-savings-category':    () => openCategoryModal(),
  'edit-savings-category':   el => openCategoryModal(el.dataset.id),
  'delete-savings-category': el => deleteCategory(el.dataset.id),
  'save-savings-category':   submitCategoryModal,
  'add-adjustment':          el => openAdjustmentModal(el.dataset.id),
  'save-adjustment':         submitAdjustment,
  'delete-adjustment':       el => deleteAdjustment(el.dataset.id)
});

onTabShow('savings', renderSavingsCategories);
