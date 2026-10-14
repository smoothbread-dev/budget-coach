// Entry point: wires modules together and bootstraps the app after sign-in.
import * as api from './api.js';
import { CURRENCY } from './config.js';
import { store, resetStore, hasDefaults } from './state.js';
import { $, show } from './utils.js';
import { initActions } from './ui/actions.js';
import { initModals, closeAllPanels, showAlert } from './ui/modals.js';
import { switchTab } from './ui/tabs.js';
import { showToast } from './ui/toast.js';
import { initAuth, showAuthScreen, hideAuthScreen, setUserAvatar } from './features/auth.js';
import { initSync } from './features/sync.js';
import { updateMonthLabel, checkAndPromptMonth } from './features/month.js';
import { openSetup, renderDefaultsTab } from './features/defaults.js';
import { clearQuestions } from './features/coach.js';
// Imported for their action registrations.
import './features/planner.js';
import './features/allocations.js';
import './features/recurring.js';
import './features/savings.js';
import './features/history.js';

function mountApp() {
  const app = $('app');
  app.replaceChildren($('app-template').content.cloneNode(true));
  // Static markup uses "RM" as a placeholder; swap in the configured symbol.
  app.querySelectorAll('.currency-prefix, .panel-label, .form-label').forEach(el => {
    if (el.children.length === 0) el.textContent = el.textContent.replace(/\bRM\b/g, CURRENCY.symbol);
  });
  show(app, true);
}

function unmountApp() {
  closeAllPanels();
  const app = $('app');
  app.replaceChildren();
  show(app, false);
}

async function loadData() {
  const d = await api.loadAll();

  if (d.defaults) {
    store.defaults = {
      income:      Number(d.defaults.income) || 0,
      savingsGoal: Number(d.defaults.savings_goal) || 0
    };
  }

  store.recurringItems = (d.recurring || []).map(r => ({ id: String(r.id), name: r.name, amount: Number(r.amount) }));

  store.months = {};
  (d.plans || []).forEach(p => {
    store.months[p.month_key] = {
      income:      Number(p.income) || 0,
      savingsGoal: p.savings_goal ?? null,
      items:       Array.isArray(p.items) ? p.items : [],
      aiReview:    p.ai_review
    };
  });

  store.savingsCategories  = d.categories  || [];
  store.savingsAdjustments = d.adjustments || [];
  store.planSavings        = d.planSavings || [];
}

async function startApp(user) {
  resetStore(user);
  show('boot-splash', false);
  hideAuthScreen();
  mountApp();
  setUserAvatar(user.email);
  updateMonthLabel();
  clearQuestions();
  switchTab('planner');

  showToast('saving', 'Loading your data…');
  try {
    await loadData();
  } catch (err) {
    console.error('Initial load failed:', err);
    showToast('error', 'Could not load your data');
    showAlert("We couldn't load your budget data. Check your connection and try again.", 'error', {
      label:   '↻ Retry',
      onClick: () => startApp(user)
    });
    return;
  }
  showToast('saved', 'Ready');

  renderDefaultsTab();
  switchTab('planner');

  if (hasDefaults()) checkAndPromptMonth();
  else openSetup();
}

function stopApp() {
  show('boot-splash', false);
  unmountApp();
  resetStore();
  showAuthScreen();
}

/** Enter in a single-line field submits the surrounding panel or inline form. */
function initEnterToSubmit() {
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing) return;
    const field = e.target;
    if (!(field instanceof HTMLInputElement) || field.closest('#auth-form')) return;

    const scope   = field.closest('.panel-box, .add-form');
    const primary = scope?.querySelector('.panel-actions .btn-primary, .form-actions .btn-primary');
    if (primary && !primary.disabled) {
      e.preventDefault();
      primary.click();
    }
  });
}

initActions();
initModals();
initSync();
initEnterToSubmit();
initAuth({ onSignedIn: startApp, onSignedOut: stopApp });
