// Recurring tab: master list of recurring expenses used to pre-fill plan items.
import * as api from '../api.js';
import { store, sameId } from '../state.js';
import { $, escHtml, fmt, parseAmount } from '../utils.js';
import { registerActions } from '../ui/actions.js';
import { openPanel, closePanel, showAlert, showConfirm } from '../ui/modals.js';
import { onTabShow } from '../ui/tabs.js';
import { persist } from '../ui/toast.js';

let editingId = null;

function openRecurringPanel(id = null) {
  editingId = id;
  const item = id ? store.recurringItems.find(r => sameId(r.id, id)) : null;
  if (id && !item) return;

  $('panel-rec-name').value   = item?.name ?? '';
  $('panel-rec-amount').value = item?.amount ?? '';
  $('recurring-panel-title').textContent    = item ? 'Edit Recurring Item' : 'Add Recurring Item';
  $('recurring-panel-save-btn').textContent = item ? 'Save Changes' : 'Add';
  openPanel('recurring-panel-overlay', 'panel-rec-name');
}

async function saveRecurringPanel() {
  const name   = $('panel-rec-name').value.trim();
  const amount = parseAmount($('panel-rec-amount').value);
  if (!name)         { showAlert('Please enter an item name.', 'warning'); return; }
  if (!(amount > 0)) { showAlert('Please enter a valid amount.', 'warning'); return; }

  // Local state only changes after the database confirms the write.
  if (editingId) {
    const { ok } = await persist(() => api.updateRecurring(editingId, { name, amount }), 'Could not update the item.');
    if (!ok) return;
    const item = store.recurringItems.find(r => sameId(r.id, editingId));
    if (item) Object.assign(item, { name, amount });
  } else {
    const { ok, data } = await persist(() => api.insertRecurring({ name, amount }), 'Could not add the item.');
    if (!ok) return;
    store.recurringItems.push({ id: String(data.id), name: data.name, amount: Number(data.amount) });
  }

  closePanel('recurring-panel-overlay');
  renderRecurringList();
}

async function deleteRecurringItem(id) {
  const item = store.recurringItems.find(r => sameId(r.id, id));
  const name = item ? `"${item.name}"` : 'this item';
  if (!await showConfirm(`Remove ${name} from your recurring list? Existing plan items won't be affected.`, 'Remove')) return;

  const { ok } = await persist(() => api.deleteRecurring(id), 'Could not delete the item.');
  if (!ok) return;

  store.recurringItems = store.recurringItems.filter(r => !sameId(r.id, id));
  renderRecurringList();
}

export function renderRecurringList() {
  const el = $('recurring-master-list');

  if (store.recurringItems.length === 0) {
    el.innerHTML = '<div class="empty-subsection empty-centered">No recurring items yet. Add your first one!</div>';
    return;
  }

  el.innerHTML = store.recurringItems.map(item => {
    const id   = escHtml(item.id);
    const name = escHtml(item.name);
    return `
      <div class="recurring-list-item">
        <span class="recurring-item-name">${name}</span>
        <span class="recurring-item-amount">${fmt(item.amount)}</span>
        <div class="item-actions">
          <button type="button" class="item-action-btn edit" data-action="edit-recurring" data-id="${id}" aria-label="Edit ${name}">✎</button>
          <button type="button" class="item-action-btn del"  data-action="delete-recurring" data-id="${id}" aria-label="Delete ${name}">✕</button>
        </div>
      </div>`;
  }).join('');
}

registerActions({
  'add-recurring':    () => openRecurringPanel(),
  'edit-recurring':   el => openRecurringPanel(el.dataset.id),
  'delete-recurring': el => deleteRecurringItem(el.dataset.id),
  'save-recurring':   saveRecurringPanel
});

onTabShow('recurring', renderRecurringList);
