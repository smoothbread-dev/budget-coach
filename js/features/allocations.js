// Plan tab: allocate this month's projected savings to savings categories.
import * as api from '../api.js';
import { store, currentKey, calcTotals, findCategory, allocationsForMonth, totalAllocated, sameId } from '../state.js';
import { $, show, escHtml, fmt, parseAmount } from '../utils.js';
import { registerActions, registerChangeActions } from '../ui/actions.js';
import { openPanel, closePanel, showAlert, showConfirm } from '../ui/modals.js';
import { switchTab } from '../ui/tabs.js';
import { persist } from '../ui/toast.js';

const categoryLabel = (p) => findCategory(p.savings_category_id)?.name ?? p.category_name ?? 'Deleted category';

export function renderAllocations() {
  const listEl = $('plan-savings-list');
  if (!listEl) return;

  const allocations = allocationsForMonth();
  const allocated   = totalAllocated();
  const { savings } = calcTotals();
  const remaining   = savings - allocated;
  const isOver      = remaining < 0;

  $('plan-savings-total').textContent = fmt(allocated);
  show('plan-savings-warning', isOver && allocations.length > 0);
  show('plan-savings-summary', allocations.length > 0);

  if (allocations.length > 0) {
    $('plan-savings-summary-text').innerHTML = `
      <div class="plan-savings-summary-row">
        <span class="plan-savings-summary-item">
          <span class="plan-savings-summary-label">Allocated</span>
          <strong>${fmt(allocated)}</strong>
        </span>
        <span class="plan-savings-summary-item">
          <span class="plan-savings-summary-label">Projected Savings</span>
          <strong>${fmt(savings)}</strong>
        </span>
        <span class="plan-savings-summary-item ${isOver ? 'text-danger' : 'text-success'}">
          <span class="plan-savings-summary-label">${isOver ? '⚠️ Over by' : '✅ Remaining'}</span>
          <strong>${fmt(Math.abs(remaining))}</strong>
        </span>
      </div>`;
  }

  listEl.innerHTML = allocations.length === 0
    ? '<div class="empty-subsection">No savings allocated for this month yet.</div>'
    : allocations.map(p => {
        const id   = escHtml(p.id);
        const name = escHtml(categoryLabel(p));
        return `
          <div class="item-row">
            <span class="item-name">${name}</span>
            <span class="item-amount">${fmt(p.allocated_amount)}</span>
            <div class="item-actions">
              <button type="button" class="item-action-btn edit" data-action="edit-allocation" data-id="${id}" aria-label="Edit ${name} allocation">✎</button>
              <button type="button" class="item-action-btn del"  data-action="delete-allocation" data-id="${id}" aria-label="Remove ${name} allocation">✕</button>
            </div>
          </div>`;
      }).join('');
}

function toggleForm() {
  const form = $('plan-savings-form');
  if (!form.classList.contains('bc-hidden')) { show(form, false); return; }

  if (store.savingsCategories.length === 0) {
    showAlert("You haven't created any savings categories yet. Head to the Savings tab to add one!", 'info', {
      label:   '💰 Go to Savings',
      onClick: () => switchTab('savings')
    });
    return;
  }

  const allocatedIds = allocationsForMonth().map(p => String(p.savings_category_id));
  const available    = store.savingsCategories.filter(c => !allocatedIds.includes(String(c.id)));

  if (available.length === 0) {
    showAlert('All your savings categories are already allocated for this month. Edit or remove an existing allocation below.', 'info');
    return;
  }

  $('plan-savings-category-select').innerHTML = '<option value="">— Select a category —</option>' +
    available.map(c => `<option value="${escHtml(c.id)}">${escHtml(c.name)}</option>`).join('');
  $('plan-savings-amount').value       = '';
  $('plan-savings-monthly-hint').value = '';
  show(form, true);
  $('plan-savings-category-select').focus();
}

function onCategoryChange() {
  const cat = findCategory($('plan-savings-category-select').value);
  $('plan-savings-amount').value       = cat ? cat.monthly_amount : '';
  $('plan-savings-monthly-hint').value = cat ? fmt(cat.monthly_amount) : '';
}

async function addAllocation() {
  const categoryId = $('plan-savings-category-select').value;
  const amount     = parseAmount($('plan-savings-amount').value);
  if (!categoryId)    { showAlert('Please select a savings category.', 'warning'); return; }
  if (!(amount > 0))  { showAlert('Please enter a valid amount.', 'warning'); return; }

  const key = currentKey();
  if (allocationsForMonth(key).some(p => sameId(p.savings_category_id, categoryId))) {
    showAlert('This category is already allocated this month. Edit the existing allocation instead.', 'info');
    return;
  }

  const { ok, data } = await persist(
    () => api.insertPlanSavings({ key, categoryId, categoryName: findCategory(categoryId)?.name ?? null, amount }),
    'Could not save the allocation.'
  );
  if (!ok) return;

  store.planSavings.push(data);
  show('plan-savings-form', false);
  renderAllocations();
}

function openEditAllocation(id) {
  const row = store.planSavings.find(p => sameId(p.id, id));
  if (!row) return;
  const name = categoryLabel(row);

  $('edit-plan-savings-id').value       = row.id;
  $('edit-plan-savings-cat-name').value = name;
  $('edit-plan-savings-amount').value   = row.allocated_amount;
  $('edit-plan-savings-subtitle').textContent = `Updating allocation for "${name}" this month.`;
  openPanel('edit-plan-savings-panel-overlay', 'edit-plan-savings-amount');
}

async function saveEditAllocation() {
  const row    = store.planSavings.find(p => sameId(p.id, $('edit-plan-savings-id').value));
  const amount = parseAmount($('edit-plan-savings-amount').value);
  if (!row) return;
  if (!(amount > 0)) { showAlert('Please enter a valid amount.', 'warning'); return; }

  const { ok } = await persist(() => api.updatePlanSavingsAmount(row.id, amount), 'Could not update the allocation.');
  if (!ok) return;

  row.allocated_amount = amount;
  closePanel('edit-plan-savings-panel-overlay');
  renderAllocations();
}

async function deleteAllocation(id) {
  if (!await showConfirm('Remove this savings allocation for this month?', 'Remove')) return;

  const { ok } = await persist(() => api.deletePlanSavings(id), 'Could not remove the allocation.');
  if (!ok) return;

  store.planSavings = store.planSavings.filter(p => !sameId(p.id, id));
  renderAllocations();
}

registerActions({
  'toggle-allocation-form': toggleForm,
  'add-allocation':         addAllocation,
  'edit-allocation':        el => openEditAllocation(el.dataset.id),
  'save-edit-allocation':   saveEditAllocation,
  'delete-allocation':      el => deleteAllocation(el.dataset.id)
});

registerChangeActions({
  'allocation-category': onCategoryChange
});
