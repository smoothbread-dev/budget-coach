// ─────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────
const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

const DEBOUNCE_DELAY = 600;
const TOAST_TIMEOUT  = 1800;
const FOCUS_DELAY    = 100;

// ─────────────────────────────────────────
// STATE
// ─────────────────────────────────────────
let bannerDismissedThisSession = false;

let state = {
  defaults:       { income: 0, savingsGoal: 0 },
  recurringItems: [],
  currentMonth:   new Date().getMonth(),
  currentYear:    new Date().getFullYear(),
  months:         {}
};

let savingsCategories  = [];   // savings_categories rows
let savingsAdjustments = [];   // savings_adjustments rows (all for this user)
let planSavings        = [];   // plan_savings rows (all for this user)

// ─────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────

const TOAST_DURATIONS = {
  saving:  null,    // stays until next state
  saved:   1800,
  error:   3500,
  warning: 3000,
  info:    2500
};

const TOAST_CONFIG = {
  saving:  { icon: '',   label: 'Saving…',  spinner: true  },
  saved:   { icon: '✓',  label: 'Saved',    spinner: false },
  error:   { icon: '✕',  label: '',         spinner: false },
  warning: { icon: '⚠️', label: '',         spinner: false },
  info:    { icon: 'ℹ️', label: '',         spinner: false }
};

function showToast(status, message = '') {
  const toast   = document.getElementById('save-toast');
  const spinner = document.getElementById('toast-spinner');
  const label   = document.getElementById('toast-label');

  // Clear previous state classes
  toast.classList.remove('saved', 'toast-error', 'toast-warning', 'toast-info', 'visible');

  // Clear any existing auto-dismiss timer
  if (toast._dismissTimer) {
    clearTimeout(toast._dismissTimer);
    toast._dismissTimer = null;
  }

  const config   = TOAST_CONFIG[status] || TOAST_CONFIG.saved;
  spinner.style.display = config.spinner ? '' : 'none';

  if (status === 'saving') {
    label.textContent = 'Saving…';
    toast.classList.add('visible');
    return;
  }

  // Build label text
  const displayText = message
    ? `${config.icon} ${message}`.trim()
    : `${config.icon} ${config.label}`.trim();

  label.textContent = displayText;

  // Apply class
  if (status === 'saved')   toast.classList.add('saved');
  if (status === 'error')   toast.classList.add('toast-error');
  if (status === 'warning') toast.classList.add('toast-warning');
  if (status === 'info')    toast.classList.add('toast-info');

  toast.classList.add('visible');

  const duration = TOAST_DURATIONS[status];
  if (duration) {
    toast._dismissTimer = setTimeout(() => {
      toast.classList.remove('visible', 'saved', 'toast-error', 'toast-warning', 'toast-info');
    }, duration);
  }
}

// ─────────────────────────────────────────
// SHOW ALERT MODAL
// ─────────────────────────────────────────

const ALERT_CONFIG = {
  error:   { icon: '❌', title: 'Error',   cls: 'type-error'   },
  warning: { icon: '⚠️', title: 'Warning', cls: 'type-warning' },
  info:    { icon: 'ℹ️', title: 'Info',    cls: 'type-info'    },
  success: { icon: '✅', title: 'Success', cls: 'type-success' }
};

/**
 * Displays the alert modal with an optional action button.
 * @param {string} message - The message to display.
 * @param {string} type - 'error' | 'warning' | 'info' | 'success'
 * @param {{ label: string, onClick: function } | null} actionButton - Optional action button config.
 */
function showAlert(message, type = 'warning', actionButton = null) {
  const overlay  = document.getElementById('alert-modal-overlay');
  const title    = document.getElementById('alert-modal-title');
  const msg      = document.getElementById('alert-modal-message');
  const actions  = overlay.querySelector('.panel-actions');

  const titles = {
    error:   '❌ Error',
    warning: '⚠️ Warning',
    info:    'ℹ️ Info',
    success: '✅ Success'
  };

  title.textContent = titles[type] || '⚠️ Warning';
  msg.textContent   = message;

  // Rebuild action buttons
  actions.innerHTML = '';

  // OK / dismiss button — only shown when no custom action button is provided
  if (!actionButton) {
    const okBtn = document.createElement('button');
    okBtn.className   = 'btn btn-primary';
    okBtn.textContent = 'OK';
    okBtn.onclick     = closeAlert;
    actions.appendChild(okBtn);
  }

  // Optional action button (e.g. "Go to Savings")
  if (actionButton) {
    const actionBtn = document.createElement('button');
    actionBtn.className   = 'btn btn-primary';
    actionBtn.textContent = actionButton.label;
    actionBtn.onclick     = actionButton.onClick;
    actions.appendChild(actionBtn);
  }

  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeAlert() {
  document.getElementById('alert-modal-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

// ─────────────────────────────────────────
// SUPABASE — LOAD
// ─────────────────────────────────────────

async function loadFromSupabase() {
  state = {
    defaults:       { income: 0, savingsGoal: 0 },
    recurringItems: [],
    currentMonth:   new Date().getMonth(),
    currentYear:    new Date().getFullYear(),
    months:         {}
  };

  const userId = currentUser.id;

  // Defaults
  const { data: defaults } = await sb
    .from('user_defaults')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (defaults) {
    state.defaults.income      = defaults.income;
    state.defaults.savingsGoal = defaults.savings_goal;
  }

  // Recurring items
  const { data: recurring } = await sb
    .from('recurring_items')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (recurring) {
    state.recurringItems = recurring.map(r => ({
      id:     String(r.id),
      name:   r.name,
      amount: r.amount
    }));
  }

  // Month plans
  const { data: plans } = await sb
    .from('month_plans')
    .select('*')
    .eq('user_id', userId);

  if (plans) {
    plans.forEach(plan => {
      state.months[plan.month_key] = {
        income:      plan.income,
        savingsGoal: plan.savings_goal,
        items:       plan.items || [],
        aiReview:    plan.ai_review
      };
    });
  }

  // Savings categories
  const { data: savingsCats } = await sb
    .from('savings_categories')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (savingsCats) savingsCategories = savingsCats;

  // Savings adjustments (all for this user)
  const { data: adjustments } = await sb
    .from('savings_adjustments')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (adjustments) savingsAdjustments = adjustments;

  // Plan savings allocations (all for this user)
  const { data: planSav } = await sb
    .from('plan_savings')
    .select('*')
    .eq('user_id', userId);

  if (planSav) planSavings = planSav;
}

// ─────────────────────────────────────────
// SUPABASE — SAVE DEFAULTS
// ─────────────────────────────────────────

async function saveDefaults() {
  showToast('saving');

  const { error } = await sb
    .from('user_defaults')
    .upsert({
      user_id:      currentUser.id,
      income:       state.defaults.income,
      savings_goal: state.defaults.savingsGoal,
      updated_at:   new Date().toISOString()
    }, { onConflict: 'user_id' });

  if (error) console.error('saveDefaults error:', error);
  else showToast('saved');
}

// ─────────────────────────────────────────
// SUPABASE — SAVE RECURRING ITEMS
// ─────────────────────────────────────────

async function saveRecurringItem(item) {
  showToast('saving');

  if (item._isNew) {
    const { data, error } = await sb
      .from('recurring_items')
      .insert({ user_id: currentUser.id, name: item.name, amount: item.amount })
      .select()
      .single();

    if (error) { console.error('saveRecurringItem insert error:', error); return null; }
    showToast('saved');
    return data.id;
  } else {
    const { error } = await sb
      .from('recurring_items')
      .update({ name: item.name, amount: item.amount })
      .eq('id', item.id)
      .eq('user_id', currentUser.id);

    if (error) console.error('saveRecurringItem update error:', error);
    else showToast('saved');
    return item.id;
  }
}

async function deleteRecurringFromDB(id) {
  const { error } = await sb
    .from('recurring_items')
    .delete()
    .eq('id', id)
    .eq('user_id', currentUser.id);

  if (error) console.error('deleteRecurring error:', error);
}

// ─────────────────────────────────────────
// SUPABASE — SAVE MONTH PLAN
// ─────────────────────────────────────────

const triggerSave = (() => {
  let timer = null;
  return function () {
    showToast('saving');
    clearTimeout(timer);
    timer = setTimeout(() => saveCurrentMonth(), DEBOUNCE_DELAY);
  };
})();

async function saveCurrentMonth() {
  const key  = currentKey();
  const data = currentMonthData();

  const { error } = await sb
    .from('month_plans')
    .upsert({
      user_id:      currentUser.id,
      month_key:    key,
      income:       data.income,
      savings_goal: data.savingsGoal,
      items:        data.items || [],
      ai_review:    data.aiReview || null,
      updated_at:   new Date().toISOString()
    }, { onConflict: 'user_id,month_key' });

  if (error) console.error('saveCurrentMonth error:', error);
  else showToast('saved');
}

// ─────────────────────────────────────────
// SUPABASE — SAVINGS ADJUSTMENTS
// ─────────────────────────────────────────

/**
 * Inserts a new savings adjustment row and appends it to local state.
 */
async function insertSavingsAdjustment(categoryId, amount, note) {
  showToast('saving');

  const { data, error } = await sb
    .from('savings_adjustments')
    .insert({
      user_id:             currentUser.id,
      savings_category_id: categoryId,
      amount:              amount,
      note:                note || null
    })
    .select()
    .single();

  if (error) {
    console.error('insertSavingsAdjustment error:', error);
    showToast('saved');
    return null;
  }

  savingsAdjustments.push(data);
  showToast('saved');
  return data;
}

/**
 * Deletes a savings adjustment by ID from Supabase and local state.
 */
async function deleteSavingsAdjustmentFromDB(id) {
  const { error } = await sb
    .from('savings_adjustments')
    .delete()
    .eq('id', id)
    .eq('user_id', currentUser.id);

  if (error) {
    console.error('deleteSavingsAdjustment error:', error);
    return false;
  }

  savingsAdjustments = savingsAdjustments.filter(a => a.id !== id);
  return true;
}

/**
 * Returns all adjustments for a given savings category ID.
 */
function getAdjustmentsForCategory(categoryId) {
  return savingsAdjustments.filter(a => a.savings_category_id === categoryId);
}

/**
 * Sums all adjustment amounts for a given savings category.
 */
function sumAdjustments(categoryId) {
  return getAdjustmentsForCategory(categoryId)
    .reduce((sum, a) => sum + Number(a.amount), 0);
}

/**
 * Calculates the total saved for a category:
 * Sum of all plan_savings allocations for this category across all months,
 * plus the sum of any manual adjustments (deposits/withdrawals).
 */
function calcCategoryTotalSaved(cat) {
  const plannedTotal = planSavings
    .filter(p => String(p.savings_category_id) === String(cat.id))
    .reduce((sum, p) => sum + Number(p.allocated_amount), 0);
  return plannedTotal + sumAdjustments(cat.id);
}

// ─────────────────────────────────────────
// SUPABASE — PLAN SAVINGS
// ─────────────────────────────────────────

/**
 * Returns all plan_savings rows for the current month key.
 */
function getPlanSavingsForCurrentMonth() {
  return planSavings.filter(p =>
    p.month_key === currentKey()
  );
}

/**
 * Upserts a plan_savings allocation for the current month.
 */
async function upsertPlanSavings(categoryId, amount) {
  showToast('saving');

  categoryId = String(categoryId);

  const cat          = savingsCategories.find(c => String(c.id) === categoryId);
  const categoryName = cat ? cat.name : null;

  const existing = planSavings.find(p =>
    String(p.savings_category_id) === categoryId &&
    p.month_key === currentKey()
  );

  const payload = {
    user_id             : currentUser.id,
    month_key           : currentKey(),
    savings_category_id : categoryId,
    allocated_amount    : amount,
    category_name       : categoryName
  };

  if (existing) {
    const { error } = await sb
      .from('plan_savings')
      .update(payload)
      .eq('id', existing.id);

    if (error) {
      console.error('Error updating plan savings:', error);
      showToast('error');
      return false;
    }
    Object.assign(existing, payload);
    showToast('saved');
    return true;
  } else {
    const { data, error } = await sb
      .from('plan_savings')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('Error inserting plan savings:', error);
      showToast('error');
      return false;
    }
    planSavings.push(data);
    showToast('saved');
    return true;
  }
}

/**
 * Deletes a plan_savings allocation by its row ID.
 */
async function deletePlanSavingsFromDB(id) {
  const { error } = await sb
    .from('plan_savings')
    .delete()
    .eq('id', id)
    .eq('user_id', currentUser.id);

  if (error) {
    console.error('deletePlanSavings error:', error);
    return false;
  }

  planSavings = planSavings.filter(p => p.id !== id);
  return true;
}

/**
 * Returns the total allocated savings amount for the current month.
 */
function getTotalAllocatedForCurrentMonth() {
  return getPlanSavingsForCurrentMonth()
    .reduce((sum, p) => sum + Number(p.allocated_amount), 0);
}

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────

function monthKey(m, y)   { return `${y}-${String(m + 1).padStart(2, '0')}`; }
function monthLabel(m, y) { return `${MONTHS[m]} ${y}`; }
function currentKey()     { return monthKey(state.currentMonth, state.currentYear); }

function currentMonthData() {
  const key = currentKey();
  if (!state.months[key]) {
    state.months[key] = { income: 0, savingsGoal: null, items: [], aiReview: null };
  }
  return state.months[key];
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function fmt(n) {
  return `RM ${Number(n).toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function fmtDate(isoString) {
  const d = new Date(isoString);
  return d.toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' });
}

function generateId() { return crypto.randomUUID(); }

// ─────────────────────────────────────────
// BANNER
// ─────────────────────────────────────────

function dismissBanner() {
  bannerDismissedThisSession = true;
  const banner = document.getElementById('purpose-banner');
  banner.classList.add('hiding');
  banner.addEventListener('animationend', () => {
    banner.style.display = 'none';
  }, { once: true });
}

function showBannerIfNeeded() {
  const banner = document.getElementById('purpose-banner');
  if (bannerDismissedThisSession) {
    banner.style.display = 'none';
  } else {
    banner.style.display = 'flex';
    banner.classList.remove('hiding');
    banner.style.animation = 'none';
    void banner.offsetWidth;
    banner.style.animation = '';
  }
}

// ─────────────────────────────────────────
// INIT
// ─────────────────────────────────────────

async function initApp() {
  showToast('saving');
  document.getElementById('toast-label').textContent = 'Loading…';
  await loadFromSupabase();
  await loadActualsFromSupabase();

  showToast('saved');
  document.getElementById('toast-label').textContent = '✓ Ready';

  updateMonthLabel();

  const hasDefaults = state.defaults.income > 0 || state.defaults.savingsGoal > 0;
  if (!hasDefaults) {
    document.getElementById('setup-panel-overlay').classList.add('open');
    document.body.style.overflow = 'hidden';
    return;
  }

  checkAndPromptMonth();
  renderDefaultsTab();
  renderActualsPreview();
  updateActualsBadge();
}

// ─────────────────────────────────────────
// FIRST-TIME SETUP
// ─────────────────────────────────────────

async function saveSetup() {
  const income = parseFloat(document.getElementById('setup-income').value) || 0;
  const goal   = Math.min(100, Math.max(0, parseFloat(document.getElementById('setup-goal').value) || 0));

  state.defaults.income      = income;
  state.defaults.savingsGoal = goal;

  document.getElementById('setup-panel-overlay').classList.remove('open');

  await saveDefaults();
  checkAndPromptMonth();
  renderDefaultsTab();
}

function skipSetup() {
  document.getElementById('setup-panel-overlay').classList.remove('open');
  checkAndPromptMonth();
}

// ─────────────────────────────────────────
// MONTH PROMPT
// ─────────────────────────────────────────

function checkAndPromptMonth() {
  const data        = currentMonthData();
  const hasDefaults = state.defaults.income > 0 || state.defaults.savingsGoal > 0;

  if (!data.income && hasDefaults) {
    const label = monthLabel(state.currentMonth, state.currentYear);
    document.getElementById('defaults-prompt-title').textContent    = `📅 ${label}`;
    document.getElementById('defaults-prompt-subtitle').textContent =
      'This month has no plan yet. Would you like to start with your default values?';

    const parts = [];
    if (state.defaults.income > 0)      parts.push(`Income: ${fmt(state.defaults.income)}`);
    if (state.defaults.savingsGoal > 0) parts.push(`Savings goal: ${state.defaults.savingsGoal}%`);
    document.getElementById('defaults-prompt-values').textContent = parts.join(' · ');

    document.getElementById('defaults-prompt-overlay').classList.add('open');
    document.body.style.overflow = 'hidden';
  } else if (!data.income) {
    openIncomePanel();
  } else {
    render();
    if (data.aiReview) showAIResult(data.aiReview);
  }
}

function applyDefaults() {
  const data       = currentMonthData();
  data.income      = state.defaults.income;
  data.savingsGoal = state.defaults.savingsGoal;

  document.getElementById('defaults-prompt-overlay').classList.remove('open');
  document.body.style.overflow = '';

  if (!data.income || data.income <= 0) {
    openIncomePanel();
    return;
  }

  render();
  triggerSave();
}

function enterOwnValues() {
  document.getElementById('defaults-prompt-overlay').classList.remove('open');
  document.getElementById('panel-income').value = '';
  const overlay = document.getElementById('income-panel-overlay');
  overlay._fromNewMonthFlow = true;
  overlay.classList.add('open');
  setTimeout(() => document.getElementById('panel-income').focus(), FOCUS_DELAY);
}

// ─────────────────────────────────────────
// TABS
// ─────────────────────────────────────────

function switchTab(tab) {
  ['planner', 'recurring', 'history', 'defaults', 'savings'].forEach(t => {
    document.getElementById(`tab-${t}`).style.display     = t === tab ? '' : 'none';
    document.getElementById(`tab-btn-${t}`).classList.toggle('active', t === tab);
  });

  document.getElementById('coach-me-wrap').style.display = tab === 'planner' ? '' : 'none';

  if (tab === 'planner')   { showBannerIfNeeded(); render(); }
  if (tab === 'history')   renderHistory();
  if (tab === 'recurring') renderRecurringMasterList();
  if (tab === 'defaults')  renderDefaultsTab();
  if (tab === 'savings')   renderSavingsCategoriesList();
}

// ─────────────────────────────────────────
// MONTH NAVIGATION
// ─────────────────────────────────────────

function changeMonth(dir) {
  state.currentMonth += dir;
  if (state.currentMonth > 11) { state.currentMonth = 0;  state.currentYear++; }
  if (state.currentMonth < 0)  { state.currentMonth = 11; state.currentYear--; }
  updateMonthLabel();
  resetAIReviewUI();
  checkAndPromptMonth();
}

function updateMonthLabel() {
  document.getElementById('month-label').textContent =
    monthLabel(state.currentMonth, state.currentYear);
}

// ─────────────────────────────────────────
// DELETE MONTH
// ─────────────────────────────────────────

async function confirmDeleteMonth() {
  const label = document.getElementById('month-label').textContent.trim();
  const confirmed = await showConfirm(
    `This will permanently remove all income, savings goal, expenses and AI review for ${label}. This cannot be undone.`,
    'Delete Month'
  );
  if (confirmed) deleteCurrentMonth();
}

async function deleteCurrentMonth() {
  const key = currentKey();
  if (!currentUser) return;

  const realMonth = new Date().getMonth();
  const realYear  = new Date().getFullYear();
  const isDeletingCurrentMonth = (
    state.currentMonth === realMonth &&
    state.currentYear  === realYear
  );

  try {
    const btn = document.getElementById('month-delete-btn');
    if (btn) btn.textContent = '⏳';

    const { error } = await sb
      .from('month_plans')
      .delete()
      .eq('user_id', currentUser.id)
      .eq('month_key', key);

    if (error) throw error;

    delete state.months[key];

    // Also remove plan_savings for this month from local state
    planSavings = planSavings.filter(p => p.month_key !== key);

    if (btn) {
      btn.textContent = '🗑️';
      btn.classList.add('hidden');
    }

    if (isDeletingCurrentMonth) {
      checkAndPromptMonth();
    } else {
      state.currentMonth = realMonth;
      state.currentYear  = realYear;
      updateMonthLabel();
      resetAIReviewUI();
      checkAndPromptMonth();
    }

  } catch (err) {
    console.error('Failed to delete month:', err);
    showAlert('Something went wrong while deleting. Please try again.', 'error');
    const btn = document.getElementById('month-delete-btn');
    if (btn) btn.textContent = '🗑️';
  }
}

// ─────────────────────────────────────────
// PANEL HELPER
// ─────────────────────────────────────────

function openPanel(overlayId, focusId) {
  document.getElementById(overlayId).classList.add('open');
  document.body.style.overflow = 'hidden';
  if (focusId) {
    setTimeout(() => document.getElementById(focusId).focus(), FOCUS_DELAY);
  }
}

// ─────────────────────────────────────────
// INCOME PANEL
// ─────────────────────────────────────────

function openIncomePanel() {
  const data = currentMonthData();
  document.getElementById('panel-income').value = data.income || '';
  const overlay = document.getElementById('income-panel-overlay');
  overlay._fromNewMonthFlow = false;
  openPanel('income-panel-overlay', 'panel-income');
}

function saveIncomePanel() {
  const val = parseFloat(document.getElementById('panel-income').value);
  if (!val || val <= 0) { showAlert('Please enter a valid income amount.', 'warning'); return; }

  const data = currentMonthData();
  data.income = val;
  closePanel('income-panel-overlay');

  const goalNotSet = data.savingsGoal === null || data.savingsGoal === undefined;
  if (goalNotSet) {
    openGoalPanelMandatory();
  } else {
    render();
    triggerSave();
  }
}

function cancelIncomePanel() {
  const overlay = document.getElementById('income-panel-overlay');
  closePanel('income-panel-overlay');
  if (overlay._fromNewMonthFlow) {
    overlay._fromNewMonthFlow = false;
    checkAndPromptMonth();
  }
}

// ─────────────────────────────────────────
// GOAL PANEL
// ─────────────────────────────────────────

function openGoalPanelMandatory() {
  document.getElementById('panel-goal').value = '';

  const title    = document.getElementById('goal-panel-title');
  const subtitle = document.getElementById('goal-panel-subtitle');
  if (title)    title.textContent    = '🎯 Set Your Savings Goal';
  if (subtitle) subtitle.textContent = 'A savings goal is required to complete your monthly plan.';

  const cancelBtn = document.getElementById('goal-panel-cancel-btn');
  if (cancelBtn) cancelBtn.style.display = 'none';

  const overlay = document.getElementById('goal-panel-overlay');
  overlay._mandatory = true;

  openPanel('goal-panel-overlay', 'panel-goal');
}

function openGoalPanel() {
  const data = currentMonthData();
  document.getElementById('panel-goal').value = data.savingsGoal ?? '';
  openPanel('goal-panel-overlay', 'panel-goal');
}

function saveGoalPanel() {
  const val = Math.min(100, Math.max(0,
    parseFloat(document.getElementById('panel-goal').value) || 0));

  if (val <= 0) { showAlert('Please enter a savings goal between 1 and 100%.', 'warning'); return; }

  const data = currentMonthData();
  data.savingsGoal = val;

  const cancelBtn = document.getElementById('goal-panel-cancel-btn');
  if (cancelBtn) cancelBtn.style.display = '';

  const overlay = document.getElementById('goal-panel-overlay');
  overlay._mandatory = false;

  closePanel('goal-panel-overlay');
  render();
  triggerSave();
}

// ─────────────────────────────────────────
// DEFAULT INCOME PANEL
// ─────────────────────────────────────────

function openDefaultIncomePanel() {
  document.getElementById('panel-default-income').value = state.defaults.income || '';
  openPanel('default-income-panel-overlay', 'panel-default-income');
}

async function saveDefaultIncomePanel() {
  state.defaults.income = parseFloat(document.getElementById('panel-default-income').value) || 0;
  closePanel('default-income-panel-overlay');
  renderDefaultsTab();
  await saveDefaults();
}

// ─────────────────────────────────────────
// DEFAULT GOAL PANEL
// ─────────────────────────────────────────

function openDefaultGoalPanel() {
  document.getElementById('panel-default-goal').value = state.defaults.savingsGoal || '';
  openPanel('default-goal-panel-overlay', 'panel-default-goal');
}

async function saveDefaultGoalPanel() {
  state.defaults.savingsGoal = Math.min(100, Math.max(0,
    parseFloat(document.getElementById('panel-default-goal').value) || 0));
  closePanel('default-goal-panel-overlay');
  renderDefaultsTab();
  await saveDefaults();
}

// ─────────────────────────────────────────
// DEFAULTS TAB
// ─────────────────────────────────────────

function renderDefaultsTab() {
  document.getElementById('defaults-income-display').textContent =
    state.defaults.income > 0 ? fmt(state.defaults.income) : 'Not set';
  document.getElementById('defaults-goal-display').textContent =
    state.defaults.savingsGoal > 0 ? `${state.defaults.savingsGoal}%` : 'Not set';
}

// ─────────────────────────────────────────
// RECURRING MASTER LIST
// ─────────────────────────────────────────

let editingRecurringId = null;

function openRecurringPanel(id) {
  editingRecurringId = id || null;
  const title   = document.getElementById('recurring-panel-title');
  const saveBtn = document.getElementById('recurring-panel-save-btn');

  if (id) {
    const item = state.recurringItems.find(r => r.id == id);
    if (!item) return;
    document.getElementById('panel-rec-name').value   = item.name;
    document.getElementById('panel-rec-amount').value = item.amount;
    title.textContent   = 'Edit Recurring Item';
    saveBtn.textContent = 'Save Changes';
  } else {
    document.getElementById('panel-rec-name').value   = '';
    document.getElementById('panel-rec-amount').value = '';
    title.textContent   = 'Add Recurring Item';
    saveBtn.textContent = 'Add';
  }

  openPanel('recurring-panel-overlay', 'panel-rec-name');
}

async function saveRecurringPanel() {
  const name   = document.getElementById('panel-rec-name').value.trim();
  const amount = parseFloat(document.getElementById('panel-rec-amount').value);
  if (!name)                  { showAlert('Please enter an item name.', 'warning'); return; }
  if (!amount || amount <= 0) { showAlert('Please enter a valid amount.', 'warning'); return; }

  if (editingRecurringId) {
    const item = state.recurringItems.find(r => String(r.id) === String(editingRecurringId));
    if (item) { item.name = name; item.amount = amount; }
    await saveRecurringItem({ id: editingRecurringId, name, amount });
  } else {
    const realId = await saveRecurringItem({ name, amount, _isNew: true });
    if (realId) {
      state.recurringItems.push({ id: String(realId), name, amount });
    }
  }

  closePanel('recurring-panel-overlay');
  renderRecurringMasterList();
}

async function deleteRecurringItem(id) {
  const item = state.recurringItems.find(r => r.id == id);
  const name = item ? `"${item.name}"` : 'this item';

  const confirmed = await showConfirm(`Remove ${name} from your recurring list? Existing plan items won't be affected.`);
  if (!confirmed) return;

  state.recurringItems = state.recurringItems.filter(r => r.id != id);
  await deleteRecurringFromDB(id);
  renderRecurringMasterList();
}

function renderRecurringMasterList() {
  const el = document.getElementById('recurring-master-list');

  if (state.recurringItems.length === 0) {
    el.innerHTML = '<div class="empty-subsection" style="padding:20px 0;text-align:center">No recurring items yet. Add your first one!</div>';
    return;
  }

  el.innerHTML = state.recurringItems.map(item => `
    <div class="recurring-list-item">
      <span class="recurring-item-name">${escHtml(item.name)}</span>
      <span class="recurring-item-amount">${fmt(item.amount)}</span>
      <div class="item-actions">
        <button class="item-action-btn edit" onclick="openRecurringPanel('${item.id}')" title="Edit">✎</button>
        <button class="item-action-btn del"  onclick="deleteRecurringItem('${item.id}')" title="Delete">✕</button>
      </div>
    </div>
  `).join('');
}

// ─────────────────────────────────────────
// SAVINGS CATEGORIES
// ─────────────────────────────────────────

async function addSavingsCategory(name, monthlyAmount, goalAmount) {
  showToast('saving');

  const { data, error } = await sb
    .from('savings_categories')
    .insert([{
      user_id:        currentUser.id,
      name:           name.trim(),
      monthly_amount: parseFloat(monthlyAmount),
      goal_amount:    parseFloat(goalAmount)
    }])
    .select()
    .single();

  if (error) { console.error('Error adding savings category:', error); return; }

  savingsCategories.push(data);
  renderSavingsCategoriesList();
  showToast('saved');
}

async function updateSavingsCategory(id, name, monthlyAmount, goalAmount) {
  showToast('saving');

  const { error } = await sb
    .from('savings_categories')
    .update({
      name:           name.trim(),
      monthly_amount: parseFloat(monthlyAmount),
      goal_amount:    parseFloat(goalAmount)
    })
    .eq('id', id)
    .eq('user_id', currentUser.id);

  if (error) { console.error('Error updating savings category:', error); return; }

  const index = savingsCategories.findIndex(c => c.id === id);
  if (index !== -1) {
    savingsCategories[index] = {
      ...savingsCategories[index],
      name:           name.trim(),
      monthly_amount: parseFloat(monthlyAmount),
      goal_amount:    parseFloat(goalAmount)
    };
  }

  renderSavingsCategoriesList();
  showToast('saved');
}

async function deleteSavingsCategory(id) {
  const confirmed = await showConfirm(
    'Delete this savings category? All adjustment logs will also be removed. Existing monthly allocations in your plans won\'t be affected.',
    'Delete'
  );
  if (!confirmed) return;

  const { error } = await sb
    .from('savings_categories')
    .delete()
    .eq('id', id)
    .eq('user_id', currentUser.id);

  if (error) { console.error('Error deleting savings category:', error); return; }

  savingsCategories  = savingsCategories.filter(c => c.id !== id);
  savingsAdjustments = savingsAdjustments.filter(a => a.savings_category_id !== id);

  renderSavingsCategoriesList();
  showToast('saved');
}

// ─────────────────────────────────────────
// SAVINGS CATEGORIES — RENDER
// ─────────────────────────────────────────

function renderSavingsCategoriesList() {
  const container = document.getElementById('savings-categories-list');
  if (!container) return;

  if (savingsCategories.length === 0) {
    container.innerHTML = `
      <div class="empty-subsection" style="padding:20px 0;text-align:center">
        No savings categories yet. Add your first one!
      </div>`;
    return;
  }

  container.innerHTML = savingsCategories.map(cat => {
    const totalSaved  = calcCategoryTotalSaved(cat);
    const goalAmount  = Number(cat.goal_amount);
    const pct         = goalAmount > 0 ? Math.min(100, (totalSaved / goalAmount) * 100) : 0;
    const adjustments = getAdjustmentsForCategory(cat.id);
    const adjSum      = sumAdjustments(cat.id);

    // ── Months left calculation ──────────────────────────
    const monthlyAmt  = Number(cat.monthly_amount);
    const remaining   = Math.max(0, goalAmount - totalSaved);
    
    let monthsLeftHTML;
    if (pct >= 100) {
      monthsLeftHTML = `<span class="months-left-value goal-reached">🎉 Goal reached!</span>`;
    } else if (monthlyAmt <= 0) {
      monthsLeftHTML = `<span class="months-left-value">—</span>`;
    } else {
      const monthsLeft     = remaining / monthlyAmt;
      const monthsLeftDisp = monthsLeft.toFixed(1);
    
      // Calculate estimated completion month/year
      const now            = new Date();
      const totalMonths    = Math.floor(monthsLeft);
      const fracDays       = Math.round((monthsLeft - totalMonths) * 30);
      const estDate        = new Date(now.getFullYear(), now.getMonth() + totalMonths, now.getDate() + fracDays);
      const estLabel       = estDate.toLocaleString('default', { month: 'long', year: 'numeric' });
    
      monthsLeftHTML = `
        <span class="months-left-value">
          ${monthsLeftDisp} month${monthsLeftDisp === '1.0' ? '' : 's'} left
          <span class="months-left-est">(est. ${estLabel})</span>
        </span>`;
    }
    
    // ────────────────────────────────────────────────────
    // ────────────────────────────────────────────────────

    // Progress bar colour
    const barClass = pct >= 100 ? 'met' : pct >= 70 ? 'close' : 'under';

    // Adjustment log rows
    const adjRows = adjustments.length > 0
      ? adjustments.map(a => `
          <div class="savings-adj-row">
            <span class="savings-adj-amount ${Number(a.amount) >= 0 ? 'positive' : 'negative'}">
              ${Number(a.amount) >= 0 ? '+' : ''}${fmt(a.amount)}
            </span>
            <span class="savings-adj-note">${escHtml(a.note || '—')}</span>
            <span class="savings-adj-date">${fmtDate(a.created_at)}</span>
            <button class="item-action-btn del"
                    onclick="deleteSavingsAdjustment('${cat.id}', '${a.id}')"
                    title="Delete adjustment">✕</button>
          </div>
        `).join('')
      : '<div class="savings-adj-empty">No adjustments yet.</div>';

    return `
      <div class="savings-cat-card">

        <!-- Header row -->
        <div class="savings-cat-header">
          <span class="savings-cat-name">${escHtml(cat.name)}</span>
          <div class="item-actions">
            <button class="item-action-btn edit"
                    onclick="openEditSavingsCategoryModal('${cat.id}')" title="Edit">✎</button>
            <button class="item-action-btn del"
                    onclick="deleteSavingsCategory('${cat.id}')" title="Delete">✕</button>
          </div>
        </div>

        <!-- Stats row -->
        <div class="savings-cat-stats">
          <div class="savings-stat-item">
            <span class="savings-stat-label">Monthly</span>
            <span class="savings-stat-value">${fmt(cat.monthly_amount)}/mo</span>
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
            <span class="savings-stat-value ${adjSum >= 0 ? 'positive' : 'negative'}">
              ${adjSum >= 0 ? '+' : ''}${fmt(adjSum)}
            </span>
          </div>` : ''}
        </div>

        <!-- Months left line -->
        <div class="months-left-row">
          <span class="months-left-label">📅 Est. time to goal</span>
          ${monthsLeftHTML}
        </div>

        <!-- Progress bar -->
        <div class="savings-progress-wrap">
          <div class="savings-progress-labels">
            <span>${fmt(totalSaved)} saved</span>
            <span>${pct.toFixed(1)}% of ${fmt(goalAmount)}</span>
          </div>
          <div class="savings-progress-track">
            <div class="savings-progress-fill ${barClass}" style="width:${pct}%"></div>
          </div>
        </div>

        <!-- Adjustment log -->
        <div class="savings-adj-section">
          <div class="savings-adj-header">
            <span class="savings-adj-title">📋 Adjustment Log</span>
            <button class="btn btn-primary btn-sm"
                    onclick="openSavingsAdjustmentModal('${cat.id}')">+ Add Adjustment</button>
          </div>
          <div class="savings-adj-list">
            ${adjRows}
          </div>
        </div>

      </div>
    `;
  }).join('');
}

// ─────────────────────────────────────────
// SAVINGS CATEGORY MODAL
// ─────────────────────────────────────────

function openAddSavingsCategoryModal() {
  document.getElementById('savings-category-modal-title').textContent = 'Add Savings Category';
  document.getElementById('savings-category-id').value      = '';
  document.getElementById('savings-category-name').value    = '';
  document.getElementById('savings-category-monthly').value = '';
  document.getElementById('savings-category-goal').value    = '';
  openPanel('savings-category-modal', 'savings-category-name');
}

function openEditSavingsCategoryModal(id) {
  const cat = savingsCategories.find(c => c.id === id);
  if (!cat) return;

  document.getElementById('savings-category-modal-title').textContent = 'Edit Savings Category';
  document.getElementById('savings-category-id').value      = cat.id;
  document.getElementById('savings-category-name').value    = cat.name;
  document.getElementById('savings-category-monthly').value = cat.monthly_amount;
  document.getElementById('savings-category-goal').value    = cat.goal_amount;
  openPanel('savings-category-modal', 'savings-category-name');
}

function closeSavingsCategoryModal() {
  closePanel('savings-category-modal');
}

async function submitSavingsCategoryModal() {
  const id            = document.getElementById('savings-category-id').value;
  const name          = document.getElementById('savings-category-name').value.trim();
  const monthlyAmount = document.getElementById('savings-category-monthly').value;
  const goalAmount    = document.getElementById('savings-category-goal').value;

  if (!name) { showAlert('Please enter a category name.', 'warning'); return; }
  if (isNaN(parseFloat(monthlyAmount)) || parseFloat(monthlyAmount) < 0) {
    showAlert('Please enter a valid monthly amount.', 'warning'); return;
  }
  if (isNaN(parseFloat(goalAmount)) || parseFloat(goalAmount) <= 0) {
    showAlert('Please enter a valid goal amount.', 'warning'); return;
  }

  if (id) await updateSavingsCategory(id, name, monthlyAmount, goalAmount);
  else    await addSavingsCategory(name, monthlyAmount, goalAmount);

  closeSavingsCategoryModal();
}

// ─────────────────────────────────────────
// SAVINGS ADJUSTMENTS — MODAL
// ─────────────────────────────────────────

function openSavingsAdjustmentModal(categoryId) {
  const cat = savingsCategories.find(c => c.id === categoryId);
  document.getElementById('savings-adjustment-modal-title').textContent =
    cat ? `Add Adjustment — ${cat.name}` : 'Add Adjustment';
  document.getElementById('savings-adjustment-category-id').value = categoryId;
  document.getElementById('savings-adjustment-amount').value      = '';
  document.getElementById('savings-adjustment-note').value        = '';
  openPanel('savings-adjustment-modal', 'savings-adjustment-amount');
}

async function submitSavingsAdjustment() {
  const categoryId = document.getElementById('savings-adjustment-category-id').value;
  const amountRaw  = document.getElementById('savings-adjustment-amount').value;
  const note       = document.getElementById('savings-adjustment-note').value.trim();
  const amount     = parseFloat(amountRaw);

  if (isNaN(amount) || amount === 0) {
    showAlert('Please enter a non-zero amount. Use a negative number for withdrawals.', 'warning');
    return;
  }

  const result = await insertSavingsAdjustment(categoryId, amount, note);
  if (result) {
    closePanel('savings-adjustment-modal');
    renderSavingsCategoriesList();
  }
}

async function deleteSavingsAdjustment(categoryId, adjustmentId) {
  const confirmed = await showConfirm('Remove this adjustment entry?', 'Remove');
  if (!confirmed) return;

  const ok = await deleteSavingsAdjustmentFromDB(adjustmentId);
  if (ok) renderSavingsCategoriesList();
}

// ─────────────────────────────────────────
// PLAN SAVINGS — ALLOCATION SECTION
// ─────────────────────────────────────────

/**
 * Toggles the savings allocation form in the Plan tab.
 * Populates the category dropdown with unallocated categories for this month.
 */
function togglePlanSavingsForm() {
  const form = document.getElementById('plan-savings-form');
  const isVisible = form.style.display !== 'none';

  if (isVisible) {
    form.style.display = 'none';
    return;
  }

  const allocated = getPlanSavingsForCurrentMonth()
    .map(p => String(p.savings_category_id));
  const available = savingsCategories.filter(c =>
    !allocated.includes(String(c.id))
  );

  const select      = document.getElementById('plan-savings-category-select');
  const amountInput = document.getElementById('plan-savings-amount');
  const hintInput   = document.getElementById('plan-savings-monthly-hint');

  // Scenario A — No savings categories exist at all
  if (savingsCategories.length === 0) {
    showAlert(
      "You haven't created any savings categories yet. Head to the Savings tab to add one!",
      'info',
      {
        label: '💰 Go to Savings',
        onClick: () => {
          closeAlert();
          closePanel('edit-plan-savings-panel-overlay');
          document.getElementById('plan-savings-form').style.display = 'none';
          switchTab('savings');
        }
      }
    );
    return;
  }

  // Scenario B — Categories exist but all already allocated this month
  if (available.length === 0) {
    showAlert(
      'All your savings categories are already allocated for this month. Edit or remove an existing allocation below.',
      'info'
    );
    return;
  }

  select.innerHTML = `<option value="">— Select a category —</option>` +
    available.map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('');

  amountInput.value = '';
  hintInput.value   = '';
  form.style.display = '';
}

/**
 * Auto-fills the amount field with the category's monthly_amount when selected.
 */
function onPlanSavingsCategoryChange() {
  const select     = document.getElementById('plan-savings-category-select');
  const amountInput = document.getElementById('plan-savings-amount');
  const hintInput  = document.getElementById('plan-savings-monthly-hint');
  const cat        = savingsCategories.find(c => c.id === select.value);

  if (cat) {
    amountInput.value = cat.monthly_amount;
    hintInput.value   = fmt(cat.monthly_amount);
  } else {
    amountInput.value = '';
    hintInput.value   = '';
  }
}

/**
 * Validates and saves a new savings allocation for the current month.
 */
async function addPlanSavingsAllocation() {
  const select      = document.getElementById('plan-savings-category-select');
  const amountInput = document.getElementById('plan-savings-amount');
  const categoryId  = String(select.value);
  const amount      = parseFloat(amountInput.value);

  if (!categoryId) { showAlert('Please select a savings category.', 'warning'); return; }
  if (isNaN(amount) || amount <= 0) { showAlert('Please enter a valid amount.', 'warning'); return; }

  await upsertPlanSavings(categoryId, amount);

  document.getElementById('plan-savings-form').style.display = 'none';
  renderPlanSavingsSection();
}

/**
 * Deletes a plan savings allocation row.
 */
async function deletePlanSavingsAllocation(id) {
  const confirmed = await showConfirm('Remove this savings allocation for this month?', 'Remove');
  if (!confirmed) return;

  const ok = await deletePlanSavingsFromDB(id);
  if (ok) renderPlanSavingsSection();
}

/**
 * Opens the edit panel for a plan savings allocation.
 */
function editPlanSavingsAllocation(id) {
  const row = planSavings.find(p => p.id === id);
  if (!row) return;

  const cat     = savingsCategories.find(c => c.id === row.savings_category_id);
  const catName = cat ? cat.name : '⚠️ Deleted Category';

  document.getElementById('edit-plan-savings-id').value        = id;
  document.getElementById('edit-plan-savings-cat-name').value  = catName;
  document.getElementById('edit-plan-savings-amount').value    = row.allocated_amount;
  document.getElementById('edit-plan-savings-subtitle').textContent =
    `Updating allocation for "${catName}" this month.`;

  openPanel('edit-plan-savings-panel-overlay', 'edit-plan-savings-amount');
}

/**
 * Saves the edited plan savings allocation amount.
 */
async function saveEditPlanSavingsAllocation() {
  const id     = document.getElementById('edit-plan-savings-id').value;
  const amount = parseFloat(document.getElementById('edit-plan-savings-amount').value);

  if (isNaN(amount) || amount <= 0) {
    showAlert('Please enter a valid amount.', 'warning');
    return;
  }

  const row = planSavings.find(p => p.id === id);
  if (!row) return;

  closePanel('edit-plan-savings-panel-overlay');
  await upsertPlanSavings(row.savings_category_id, amount);
  renderPlanSavingsSection();
}

/**
 * Renders the savings allocation section in the Plan tab.
 * Shows current allocations, a summary row, and a warning if over-allocated.
 */
function renderPlanSavingsSection() {
  const listEl      = document.getElementById('plan-savings-list');
  const totalEl     = document.getElementById('plan-savings-total');
  const warningEl   = document.getElementById('plan-savings-warning');
  const summaryEl   = document.getElementById('plan-savings-summary');
  const summaryText = document.getElementById('plan-savings-summary-text');

  if (!listEl) return;

  const allocations    = getPlanSavingsForCurrentMonth();
  const totalAllocated = getTotalAllocatedForCurrentMonth();
  const { savings }    = calcTotals();

  totalEl.textContent = fmt(totalAllocated);

  // Warning banner
  if (totalAllocated > savings && savings > 0) {
    warningEl.style.display = '';
  } else {
    warningEl.style.display = 'none';
  }

  // Summary row
  if (allocations.length > 0) {
    summaryEl.style.display = '';
    const remaining = savings - totalAllocated;
    const isOver    = remaining < 0;
    summaryText.innerHTML = `
      <div class="plan-savings-summary-row">
        <span class="plan-savings-summary-item">
          <span class="plan-savings-summary-label">Allocated</span>
          <strong>${fmt(totalAllocated)}</strong>
        </span>
        <span class="plan-savings-summary-item">
          <span class="plan-savings-summary-label">Projected Savings</span>
          <strong>${fmt(savings)}</strong>
        </span>
        <span class="plan-savings-summary-item" style="color:${isOver ? 'var(--danger)' : 'var(--accent2)'}">
          <span class="plan-savings-summary-label">${isOver ? '⚠️ Over by' : '✅ Remaining'}</span>
          <strong>${fmt(Math.abs(remaining))}</strong>
        </span>
      </div>
    `;
  } else {
    summaryEl.style.display = 'none';
  }

  // Allocation rows
  if (allocations.length === 0) {
    listEl.innerHTML = '<div class="empty-subsection">No savings allocated for this month yet.</div>';
    return;
  }

  listEl.innerHTML = allocations.map(p => {
    const cat = savingsCategories.find(c =>
      String(c.id) === String(p.savings_category_id)
    );
    const catName = escHtml(cat?.name ?? p.category_name ?? 'Unknown Category');
    return `
      <div class="item-row">
        <span class="item-name">${catName}</span>
        <span class="item-amount">${fmt(p.allocated_amount)}</span>
        <div class="item-actions">
          <button class="item-action-btn edit"
                  onclick="editPlanSavingsAllocation('${p.id}')" title="Edit">✎</button>
          <button class="item-action-btn del"
                  onclick="deletePlanSavingsAllocation('${p.id}')" title="Remove">✕</button>
        </div>
      </div>
    `;
  }).join('');
}

// ─────────────────────────────────────────
// ADD ITEM FORM
// ─────────────────────────────────────────

function toggleAddForm(cat) {
  const wrapper = document.getElementById(`add-form-${cat}`);
  const visible = wrapper.style.display !== 'none';
  if (visible) { wrapper.style.display = 'none'; return; }
  wrapper.style.display = '';
  renderAddForm(cat);
}

function renderAddForm(cat) {
  const inner            = document.getElementById(`add-form-${cat}-inner`);
  const hasRecurring     = state.recurringItems.length > 0;
  const recurringOptions = state.recurringItems
    .map(r => `<option value="${r.id}">${escHtml(r.name)} — ${fmt(r.amount)}</option>`)
    .join('');
  const showFundedInitially = cat === 'wants';

  inner.innerHTML = `
    ${hasRecurring ? `<div class="recurring-hint">💡 Pick a recurring item to auto-fill, or fill in manually below.</div>` : ''}
    <div class="form-row" style="margin-bottom:10px">
      <div class="form-field">
        <label class="form-label">Type</label>
        <select class="form-select" id="${cat}-type" onchange="handleTypeChange('${cat}')">
          <option value="oneoff">One-off</option>
          <option value="recurring">Recurring</option>
        </select>
      </div>
    </div>
    <div id="${cat}-recurring-picker" style="display:none; margin-bottom:10px">
      <div class="form-field">
        <label class="form-label">Pick from Recurring List</label>
        <select class="form-select" id="${cat}-recurring-select" onchange="fillFromRecurring('${cat}')">
          <option value="">— Select a recurring item —</option>
          ${recurringOptions}
        </select>
      </div>
    </div>
    <div class="form-row two">
      <div class="form-field">
        <label class="form-label">Item Name</label>
        <input class="form-input" id="${cat}-name"
               placeholder="e.g. ${cat === 'needs' ? 'Rent' : 'Netflix'}" />
      </div>
      <div class="form-field">
        <label class="form-label">Amount (RM)</label>
        <input class="form-input" id="${cat}-amount" type="number" placeholder="0.00" />
      </div>
    </div>
    <div id="${cat}-funded-wrap" style="display:${showFundedInitially ? '' : 'none'}; margin-bottom:10px">
      <label class="funded-check-wrap">
        <input type="checkbox" id="${cat}-funded" />
        <span class="funded-check-label">💰 Funded from saved-up money (won't affect projected savings)</span>
      </label>
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary btn-sm" onclick="toggleAddForm('${cat}')">Cancel</button>
      <button class="btn btn-primary btn-sm"   onclick="addItem('${cat}')">Add</button>
    </div>
  `;
}

function handleTypeChange(cat) {
  const type       = document.getElementById(`${cat}-type`).value;
  const picker     = document.getElementById(`${cat}-recurring-picker`);
  const fundedWrap = document.getElementById(`${cat}-funded-wrap`);
  const hasRec     = state.recurringItems.length > 0;

  picker.style.display = (type === 'recurring' && hasRec) ? '' : 'none';

  if (cat === 'wants') {
    fundedWrap.style.display = type === 'oneoff' ? '' : 'none';
  } else {
    fundedWrap.style.display = 'none';
  }

  if (fundedWrap.style.display === 'none') {
    const fc = document.getElementById(`${cat}-funded`);
    if (fc) fc.checked = false;
  }

  if (type === 'recurring') {
    document.getElementById(`${cat}-name`).value   = '';
    document.getElementById(`${cat}-amount`).value = '';
    const sel = document.getElementById(`${cat}-recurring-select`);
    if (sel) sel.value = '';
  }
}

function fillFromRecurring(cat) {
  const sel  = document.getElementById(`${cat}-recurring-select`);
  const id   = sel.value;
  if (!id) return;
  const item = state.recurringItems.find(r => r.id === id);
  if (!item) return;
  document.getElementById(`${cat}-name`).value   = item.name;
  document.getElementById(`${cat}-amount`).value = item.amount;
}

function addItem(cat) {
  const name     = document.getElementById(`${cat}-name`).value.trim();
  const amount   = parseFloat(document.getElementById(`${cat}-amount`).value);
  const type     = document.getElementById(`${cat}-type`).value;
  const fundedEl = document.getElementById(`${cat}-funded`);
  const funded   = (cat === 'wants' && type === 'oneoff' && fundedEl) ? fundedEl.checked : false;

  if (!name)                  { showAlert('Please enter an item name.', 'warning'); return; }
  if (!amount || amount <= 0) { showAlert('Please enter a valid amount.', 'warning'); return; }

  const data = currentMonthData();
  data.items.push({ id: generateId(), name, amount, category: cat, type, funded });

  document.getElementById(`add-form-${cat}`).style.display = 'none';
  render();
  triggerSave();
}

// ─────────────────────────────────────────
// DELETE ITEM
// ─────────────────────────────────────────

async function deleteItem(id) {
  const data = currentMonthData();
  const item = data.items.find(i => i.id === id);
  if (!item) return;

  const confirmed = await showConfirm(`Remove "${item.name}" from your plan?`);
  if (!confirmed) return;

  data.items = data.items.filter(i => i.id !== id);
  render();
  triggerSave();
}

// ─────────────────────────────────────────
// EDIT ITEM PANEL
// ─────────────────────────────────────────

function openEditItemPanel(id) {
  const data = currentMonthData();
  const item = data.items.find(i => i.id === id);
  if (!item) return;

  document.getElementById('edit-item-id').value       = id;
  document.getElementById('edit-item-name').value     = item.name;
  document.getElementById('edit-item-amount').value   = item.amount;
  document.getElementById('edit-item-category').value = item.category;
  document.getElementById('edit-item-type').value     = item.type;
  document.getElementById('edit-item-funded').checked = item.funded || false;

  toggleEditFundedField();
  openPanel('edit-item-panel-overlay', 'edit-item-name');
}

function toggleEditFundedField() {
  const cat  = document.getElementById('edit-item-category').value;
  const type = document.getElementById('edit-item-type').value;
  const show = cat === 'wants' && type === 'oneoff';
  document.getElementById('edit-funded-wrap').style.display = show ? '' : 'none';
  if (!show) document.getElementById('edit-item-funded').checked = false;
}

function saveEditItem() {
  const id     = document.getElementById('edit-item-id').value;
  const name   = document.getElementById('edit-item-name').value.trim();
  const amount = parseFloat(document.getElementById('edit-item-amount').value);
  const cat    = document.getElementById('edit-item-category').value;
  const type   = document.getElementById('edit-item-type').value;
  const funded = (cat === 'wants' && type === 'oneoff')
    ? document.getElementById('edit-item-funded').checked : false;

  if (!name)                  { showAlert('Please enter an item name.', 'warning'); return; }
  if (!amount || amount <= 0) { showAlert('Please enter a valid amount.', 'warning'); return; }

  const data = currentMonthData();
  const item = data.items.find(i => i.id === id);
  if (item) {
    item.name     = name;
    item.amount   = amount;
    item.category = cat;
    item.type     = type;
    item.funded   = funded;
  }

  closePanel('edit-item-panel-overlay');
  render();
  triggerSave();
}

// ─────────────────────────────────────────
// CALCULATIONS
// ─────────────────────────────────────────

function calcTotals() {
  const data  = currentMonthData();
  const items = data.items || [];

  const needs  = items.filter(i => i.category === 'needs' && !i.funded).reduce((s, i) => s + i.amount, 0);
  const wants  = items.filter(i => i.category === 'wants' && !i.funded).reduce((s, i) => s + i.amount, 0);
  const funded = items.filter(i => i.funded).reduce((s, i) => s + i.amount, 0);
  const gross  = needs + wants + funded;

  const savings     = Math.max(0, data.income - needs - wants);
  const savingsPct  = data.income > 0 ? (savings / data.income) * 100 : 0;
  const expensesPct = data.income > 0 ? ((needs + wants) / data.income) * 100 : 0;

  return { needs, wants, funded, gross, savings, savingsPct, expensesPct, income: data.income };
}

// ─────────────────────────────────────────
// RENDER — PLAN TAB
// ─────────────────────────────────────────

function buildItemRowHTML(item) {
  return `
    <div class="item-row">
      <span class="item-name">${escHtml(item.name)}</span>
      ${item.funded ? '<span class="item-badge funded">From Savings</span>' : ''}
      <span class="item-amount">${fmt(item.amount)}</span>
      <div class="item-actions">
        <button class="item-action-btn edit" onclick="openEditItemPanel('${item.id}')" title="Edit">✎</button>
        <button class="item-action-btn del"  onclick="deleteItem('${item.id}')" title="Delete">✕</button>
      </div>
    </div>
  `;
}

function render() {
  const data = currentMonthData();

  if (!data.income) {
    document.getElementById('income-display').textContent = '—';
    document.getElementById('total-expenses-card').style.display = 'none';
    return;
  }

  const { needs, wants, funded, gross, savings, savingsPct, expensesPct } = calcTotals();
  const goal = data.savingsGoal ?? 0;

  document.getElementById('income-display').textContent = fmt(data.income);

  const goalBadge = document.getElementById('goal-badge');
  if (goal > 0) {
    goalBadge.style.display = 'flex';
    document.getElementById('goal-badge-text').textContent = `${goal}% goal`;
  } else {
    goalBadge.style.display = 'none';
  }

  document.getElementById('sum-needs').textContent   = fmt(needs);
  document.getElementById('sum-wants').textContent   = fmt(wants);
  document.getElementById('sum-savings').textContent = fmt(savings);

  renderTotalExpensesBar(needs, wants, funded, gross, expensesPct, data.income);
  renderGoalBar(savingsPct, goal, data.income);

  renderItemList('needs', 'recurring');
  renderItemList('needs', 'oneoff');
  renderItemList('wants', 'recurring');
  renderItemList('wants', 'oneoff');

  const items      = data.items || [];
  const needsTotal = items.filter(i => i.category === 'needs').reduce((s, i) => s + i.amount, 0);
  const wantsTotal = items.filter(i => i.category === 'wants').reduce((s, i) => s + i.amount, 0);
  document.getElementById('needs-total').textContent = fmt(needsTotal);
  document.getElementById('wants-total').textContent = fmt(wantsTotal);

  // Render savings allocation section
  renderPlanSavingsSection();

  const monthData = state.months[currentKey()];
  const hasData   = monthData && (
    monthData.income      > 0 ||
    monthData.savingsGoal > 0 ||
    (monthData.items && monthData.items.length > 0)
  );

  const deleteBtn = document.getElementById('month-delete-btn');
  if (deleteBtn) deleteBtn.classList.toggle('hidden', !hasData);
}

function renderTotalExpensesBar(needs, wants, funded, gross, expensesPct, income) {
  const card = document.getElementById('total-expenses-card');
  if (needs + wants + funded === 0) { card.style.display = 'none'; return; }
  card.style.display = '';

  const netTotal    = needs + wants;
  const colourClass = expensesPct > 100 ? 'danger' : expensesPct > 80 ? 'warn' : 'safe';

  document.getElementById('total-exp-main').textContent = fmt(netTotal);

  const grossEl = document.getElementById('total-exp-gross');
  if (funded > 0) {
    grossEl.style.display = '';
    grossEl.innerHTML = `<span class="gross-incl-label">incl. funded:</span> ${fmt(gross)}`;
  } else {
    grossEl.style.display = 'none';
  }

  const pctEl = document.getElementById('total-exp-pct');
  pctEl.textContent = `${expensesPct.toFixed(1)}% of income`;
  pctEl.className   = `total-expenses-pct ${colourClass}`;

  const fill = document.getElementById('expenses-bar-fill');
  fill.style.width = `${Math.min(100, expensesPct)}%`;
  fill.className   = `expenses-bar-fill ${colourClass}`;

  const breakdownParts = [`Needs ${fmt(needs)}`, `Wants ${fmt(wants)}`];
  if (funded > 0) breakdownParts.push(`Funded ${fmt(funded)}`);
  document.getElementById('total-exp-breakdown').textContent = breakdownParts.join(' · ');
  document.getElementById('total-exp-income-label').textContent = `of ${fmt(income)}`;
}

function renderGoalBar(savingsPct, goal, income) {
  const wrap = document.getElementById('goal-bar-wrap');
  if (!goal || !income) { wrap.style.display = 'none'; return; }
  wrap.style.display = '';

  const diff   = savingsPct - goal;
  const fill   = document.getElementById('goal-bar-fill');
  const marker = document.getElementById('goal-marker');
  const label  = document.getElementById('goal-bar-pct-label');
  const status = document.getElementById('goal-status-text');

  fill.style.width  = `${Math.min(100, savingsPct)}%`;
  marker.style.left = `${Math.min(99, goal)}%`;
  label.textContent = `${savingsPct.toFixed(1)}% of ${goal}% goal`;

  fill.className   = 'goal-bar-fill';
  status.className = 'goal-status';

  if (diff >= 0) {
    fill.classList.add('met');
    status.classList.add('met');
    status.textContent = `🎉 Goal met! Projecting ${savingsPct.toFixed(1)}% savings — ${diff.toFixed(1)}% above target.`;
  } else if (diff >= -3) {
    fill.classList.add('close');
    status.classList.add('close');
    status.textContent = `⚠️ Almost there! ${Math.abs(diff).toFixed(1)}% below your ${goal}% goal.`;
  } else {
    fill.classList.add('under');
    status.classList.add('under');
    status.textContent = `❌ ${Math.abs(diff).toFixed(1)}% below your ${goal}% goal. Consider trimming wants.`;
  }
}

function renderItemList(cat, type) {
  const listEl = document.getElementById(`${cat}-${type}-list`);
  const data   = currentMonthData();
  const items  = (data.items || []).filter(i => i.category === cat && i.type === type);

  if (items.length === 0) {
    listEl.innerHTML = `<div class="empty-subsection">No ${type === 'recurring' ? 'recurring' : 'one-off'} items yet.</div>`;
    return;
  }

  listEl.innerHTML = items.map(buildItemRowHTML).join('');
}

// ─────────────────────────────────────────
// RENDER — HISTORY TAB
// ─────────────────────────────────────────

function renderHistory() {
  const grid    = document.getElementById('history-grid');
  const entries = Object.entries(state.months)
    .filter(([, d]) => d.income > 0)
    .sort(([a], [b]) => b.localeCompare(a));

  if (entries.length === 0) {
    grid.innerHTML = '<div class="empty-history">No months planned yet.<br>Start adding your expected income and expenses on the Plan tab.</div>';
    return;
  }

  grid.innerHTML = entries.map(([key, data]) => {
    const [y, m]  = key.split('-');
    const label   = monthLabel(parseInt(m) - 1, parseInt(y));
    const items   = data.items || [];
    const needs   = items.filter(i => i.category === 'needs' && !i.funded).reduce((s, i) => s + i.amount, 0);
    const wants   = items.filter(i => i.category === 'wants' && !i.funded).reduce((s, i) => s + i.amount, 0);
    const savings = Math.max(0, data.income - needs - wants);
    const savPct  = data.income > 0 ? (savings / data.income) * 100 : 0;
    const goal    = data.savingsGoal ?? 0;

    return `
      <div class="history-card" onclick="openHistoryModal('${key}')">
        <div class="history-month">${label}</div>
        <div class="history-stat"><span class="hl">Income</span><span class="hr">${fmt(data.income)}</span></div>
        <div class="history-stat"><span class="hl">Needs</span><span class="hr need">${fmt(needs)}</span></div>
        <div class="history-stat"><span class="hl">Wants</span><span class="hr want">${fmt(wants)}</span></div>
      <div class="history-stat">
        <span class="hl">Savings</span>
        <span class="hr save">
          ${fmt(savings)}
          <span class="savings-pct">(${savPct.toFixed(1)}%)</span>
        </span>
      </div>
      ${goal > 0 ? `
        <div class="history-stat" style="margin-top:6px;padding-top:6px;border-top:1px solid var(--border)">
          <span class="hl">Goal</span>
          <span class="hr" style="color:${savPct >= goal ? 'var(--accent2)' : 'var(--danger)'}">
            ${savPct >= goal ? '✓' : '✗'} ${goal}%
          </span>
        </div>` : ''}
        ${data.aiReview ? '<div class="ai-badge">📝 Coach\'s Advice</div>' : ''}
      </div>
    `;
  }).join('');
}

function openHistoryModal(key) {
  const data = state.months[key];
  if (!data) return;

  const [y, m] = key.split('-');
  document.getElementById('modal-month-title').textContent = monthLabel(parseInt(m) - 1, parseInt(y));

  const items   = data.items || [];
  const grouped = { needs: { recurring: [], oneoff: [] }, wants: { recurring: [], oneoff: [] } };
  items.forEach(item => {
    if (grouped[item.category]?.[item.type]) grouped[item.category][item.type].push(item);
  });

  const needs   = items.filter(i => i.category === 'needs' && !i.funded).reduce((s, i) => s + i.amount, 0);
  const wants   = items.filter(i => i.category === 'wants' && !i.funded).reduce((s, i) => s + i.amount, 0);
  const savings = Math.max(0, data.income - needs - wants);

  function renderModalList(arr) {
    if (arr.length === 0) return '<div class="empty-subsection">None</div>';
    return arr.map(i => `
      <div class="item-row">
        <span class="item-name">${escHtml(i.name)}</span>
        ${i.funded ? '<span class="item-badge funded">From Savings</span>' : ''}
        <span class="item-amount">${fmt(i.amount)}</span>
      </div>
    `).join('');
  }

  const aiSection = data.aiReview ? `
    <div class="collapsible-header" onclick="toggleCollapsible(this)">
      <span class="collapsible-title">📝 Coach's Advice</span>
      <span class="collapsible-arrow">▼</span>
    </div>
    <div class="collapsible-body">
      <div class="ai-text">${escHtml(data.aiReview)}</div>
    </div>
  ` : '';

  document.getElementById('modal-body').innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px">
      <div class="summary-tile needs"><span class="label">Needs</span><span class="value">${fmt(needs)}</span></div>
      <div class="summary-tile wants"><span class="label">Wants</span><span class="value">${fmt(wants)}</span></div>
      <div class="summary-tile savings"><span class="label">Savings</span><span class="value">${fmt(savings)}</span></div>
    </div>
    <div class="card-title" style="margin-bottom:10px">Expected Needs</div>
    <div class="subsection-label">🔁 Recurring</div>${renderModalList(grouped.needs.recurring)}
    <div class="subsection-label" style="margin-top:10px">📌 One-off</div>${renderModalList(grouped.needs.oneoff)}
    <div class="divider"></div>
    <div class="card-title" style="margin-bottom:10px">Expected Wants</div>
    <div class="subsection-label">🔁 Recurring</div>${renderModalList(grouped.wants.recurring)}
    <div class="subsection-label" style="margin-top:10px">📌 One-off</div>${renderModalList(grouped.wants.oneoff)}
    ${aiSection}
  `;

  document.getElementById('history-modal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function toggleCollapsible(header) {
  header.querySelector('.collapsible-arrow').classList.toggle('open');
  header.nextElementSibling.classList.toggle('open');
}

function closeHistoryModal() {
  document.getElementById('history-modal').classList.remove('open');
  document.body.style.overflow = '';
}

function handleModalOverlayClick(e) {
  if (e.target === document.getElementById('history-modal')) closeHistoryModal();
}

// ─────────────────────────────────────────
// PANEL HELPERS
// ─────────────────────────────────────────

function closePanel(id) {
  document.getElementById(id).classList.remove('open');
  document.body.style.overflow = '';
}

function showConfirm(message, confirmText = 'Delete') {
  return new Promise(resolve => {
    document.getElementById('confirm-modal-message').textContent = message;
    document.getElementById('confirm-modal-ok').textContent      = confirmText;

    const overlay   = document.getElementById('confirm-modal-overlay');
    const okBtn     = document.getElementById('confirm-modal-ok');
    const cancelBtn = document.getElementById('confirm-modal-cancel');

    const freshOk     = okBtn.cloneNode(true);
    const freshCancel = cancelBtn.cloneNode(true);
    okBtn.replaceWith(freshOk);
    cancelBtn.replaceWith(freshCancel);

    function close(result) {
      overlay.classList.remove('open');
      document.body.style.overflow = '';
      resolve(result);
    }

    document.getElementById('confirm-modal-ok').addEventListener('click',     () => close(true),  { once: true });
    document.getElementById('confirm-modal-cancel').addEventListener('click', () => close(false), { once: true });

    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  });
}

function handlePanelOverlayClick(e, id) {
  const overlay = document.getElementById(id);
  if (overlay._mandatory) return;
  if (e.target === overlay) {
    if (id === 'income-panel-overlay') {
      cancelIncomePanel();
    } else {
      closePanel(id);
    }
  }
}

// ─────────────────────────────────────────
// ACTUALS — STATE
// ─────────────────────────────────────────

/**
 * In-memory store for the currently loaded actuals summary.
 * Populated after a successful parse or DB load.
 * Shape: { monthKey, dateRangeLabel, totalExpenses, transactionCount, categories[] }
 */
let loadedActuals = null;

// ─────────────────────────────────────────
// ACTUALS — SUPABASE LOAD
// ─────────────────────────────────────────

/**
 * Loads any previously saved actuals summary from Supabase for the current user.
 * Called once during initApp().
 */
async function loadActualsFromSupabase() {
  const { data, error } = await sb
    .from('actual_spending')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('uploaded_at', { ascending: false });

  if (error) {
    console.error('loadActualsFromSupabase error:', error);
    return;
  }

  // Store all rows keyed by month_key for quick lookup
  if (data && data.length > 0) {
    // We keep all months in memory — UI shows the most relevant one
    window._allActuals = {};
    data.forEach(row => {
      window._allActuals[row.month_key] = {
        monthKey:         row.month_key,
        dateRangeLabel:   row.date_range_label,
        totalExpenses:    Number(row.total_expenses),
        transactionCount: row.transaction_count,
        categories:       row.categories
      };
    });
  }
}

/**
 * Returns the actuals record most relevant to the current session.
 * Priority: last month > any most recent month available.
 */
function getBestActuals() {
  if (!window._allActuals) return null;

  // Last month key
  let lm = state.currentMonth - 1;
  let ly = state.currentYear;
  if (lm < 0) { lm = 11; ly--; }
  const lastMonthKey = monthKey(lm, ly);

  if (window._allActuals[lastMonthKey]) return window._allActuals[lastMonthKey];

  // Fall back to most recently uploaded
  const keys = Object.keys(window._allActuals).sort().reverse();
  return keys.length > 0 ? window._allActuals[keys[0]] : null;
}

// ─────────────────────────────────────────
// ACTUALS — SUPABASE SAVE
// ─────────────────────────────────────────

async function saveActualsToSupabase(summary) {
  showToast('saving');

  const payload = {
    user_id:           currentUser.id,
    month_key:         summary.monthKey,
    uploaded_at:       new Date().toISOString(),
    total_expenses:    summary.totalExpenses,
    transaction_count: summary.transactionCount,
    date_range_label:  summary.dateRangeLabel,
    categories:        summary.categories
  };

  // Check if a row already exists for this month
  const { data: existing } = await sb
    .from('actual_spending')
    .select('id')
    .eq('user_id', currentUser.id)
    .eq('month_key', summary.monthKey)
    .maybeSingle();

  let error;

  if (existing) {
    ({ error } = await sb
      .from('actual_spending')
      .update(payload)
      .eq('id', existing.id));
  } else {
    ({ error } = await sb
      .from('actual_spending')
      .insert(payload));
  }

  if (error) {
    console.error('saveActualsToSupabase error:', error);
    showToast('error', 'Failed to save actuals');
    return false;
  }

  // Update in-memory store
  if (!window._allActuals) window._allActuals = {};
  window._allActuals[summary.monthKey] = summary;

  showToast('saved');
  return true;
}

// ─────────────────────────────────────────
// ACTUALS — DELETE
// ─────────────────────────────────────────

async function deleteActualsFromSupabase(monthKey) {
  const { error } = await sb
    .from('actual_spending')
    .delete()
    .eq('user_id', currentUser.id)
    .eq('month_key', monthKey);

  if (error) {
    console.error('deleteActualsFromSupabase error:', error);
    return false;
  }

  if (window._allActuals) delete window._allActuals[monthKey];
  return true;
}

// ─────────────────────────────────────────
// ACTUALS — PARSE XLSX
// ─────────────────────────────────────────

/**
 * Parses the uploaded .xlsx file using SheetJS.
 * Filters to Expense rows only, groups by Category + Subcategory,
 * and returns a clean summary object.
 */
function parseActualsXlsx(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data     = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });

        // Use first sheet
        const sheetName = workbook.SheetNames[0];
        const sheet     = workbook.Sheets[sheetName];

        // Convert to array of arrays (raw rows)
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

        // Find header row — look for "Category" in row
        let headerRowIdx = -1;
        let colMap       = {};

        for (let i = 0; i < Math.min(rows.length, 5); i++) {
          const row = rows[i].map(c => String(c).trim().toLowerCase());
          if (row.includes('category')) {
            headerRowIdx = i;
            row.forEach((cell, idx) => { colMap[cell] = idx; });
            break;
          }
        }

        if (headerRowIdx === -1) {
          reject(new Error('Could not find header row. Make sure this is a Money Manager export.'));
          return;
        }

        // Column indices
        const COL = {
          date:        colMap['date']        ?? 0,
          category:    colMap['category']    ?? 2,
          subcategory: colMap['subcategory'] ?? 3,
          type:        colMap['income/expense'] ?? 6,
          amount:      colMap['amount']      ?? 8
        };

        // Parse data rows
        const dataRows = rows.slice(headerRowIdx + 1);

        let totalExpenses    = 0;
        let transactionCount = 0;
        let minDate          = null;
        let maxDate          = null;
        const catMap         = {}; // "Category||Subcategory" → total

        dataRows.forEach(row => {
          if (!row || row.length === 0) return;

          const type = String(row[COL.type] ?? '').trim().toLowerCase();

          // Only process Expense rows
          if (type !== 'expense') return;

          const rawAmount = parseFloat(row[COL.amount]);
          if (isNaN(rawAmount) || rawAmount <= 0) return;

          const category    = String(row[COL.category]    ?? '').trim() || 'Uncategorised';
          const subcategory = String(row[COL.subcategory] ?? '').trim() || '';
          const rawDate     = String(row[COL.date]        ?? '').trim();

          // Track date range
          if (rawDate) {
            // Parse date — format is "DD/MM/YYYY HH:MM:SS"
            const datePart = rawDate.split(' ')[0];
            const [d, m, y] = datePart.split('/').map(Number);
            const parsed    = new Date(y, m - 1, d);
            if (!isNaN(parsed)) {
              if (!minDate || parsed < minDate) minDate = parsed;
              if (!maxDate || parsed > maxDate) maxDate = parsed;
            }
          }

          const key = `${category}||${subcategory}`;
          if (!catMap[key]) catMap[key] = { category, subcategory, total: 0, count: 0 };
          catMap[key].total += rawAmount;
          catMap[key].count += 1;

          totalExpenses    += rawAmount;
          transactionCount += 1;
        });

        if (transactionCount === 0) {
          reject(new Error('No expense transactions found. Please check the file is a valid Money Manager export.'));
          return;
        }

        // Build categories array sorted by total descending
        const categories = Object.values(catMap)
          .sort((a, b) => b.total - a.total)
          .map(c => ({
            category:    c.category,
            subcategory: c.subcategory,
            total:       Math.round(c.total * 100) / 100,
            count:       c.count
          }));

        // Determine month key from the majority of transactions (use maxDate month)
        const refDate    = maxDate || new Date();
        const detectedMonthKey = monthKey(refDate.getMonth(), refDate.getFullYear());

        // Build date range label
        const fmt2 = (d) => d.toLocaleDateString('en-MY', {
          day: '2-digit', month: 'short', year: 'numeric'
        });
        const dateRangeLabel = minDate && maxDate
          ? `${fmt2(minDate)} – ${fmt2(maxDate)}`
          : 'Unknown date range';

        resolve({
          monthKey:         detectedMonthKey,
          dateRangeLabel,
          totalExpenses:    Math.round(totalExpenses * 100) / 100,
          transactionCount,
          categories
        });

      } catch (err) {
        reject(new Error(`Failed to parse file: ${err.message}`));
      }
    };

    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsArrayBuffer(file);
  });
}

// ─────────────────────────────────────────
// ACTUALS — HANDLE UPLOAD
// ─────────────────────────────────────────
async function handleActualsUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  event.target.value = '';

  // Show parsing state
  const uploadRow = document.getElementById('actuals-upload-row');
  const origHTML  = uploadRow.innerHTML;
  uploadRow.innerHTML = `<span style="font-size:0.82rem;color:var(--text-muted)">⏳ Parsing file…</span>`;

  let summary;
  try {
    summary = await parseActualsXlsx(file);
  } catch (err) {
    uploadRow.innerHTML = origHTML;
    showAlert(`Could not parse file: ${err.message}`, 'error');
    return;
  }

  uploadRow.innerHTML = origHTML;

  // ── Month picker modal ─────────────────────────────────────
  const confirmedMonthKey = await showMonthPickerModal(summary.monthKey);
  if (!confirmedMonthKey) return; // user cancelled

  summary.monthKey = confirmedMonthKey;

  // Update dateRangeLabel month reference if month was changed
  const [yr, mo] = confirmedMonthKey.split('-');
  const pickedLabel = monthLabel(parseInt(mo) - 1, parseInt(yr));
  summary.monthLabel = pickedLabel;

  // ── Check for existing data ────────────────────────────────
  const existing = window._allActuals?.[summary.monthKey];
  if (existing) {
    const confirmed = await showConfirm(
      `You already have actual spending data for ${pickedLabel}. Replace it with this new upload?`,
      'Replace'
    );
    if (!confirmed) return;
  }

  // ── Save & render ──────────────────────────────────────────
  const ok = await saveActualsToSupabase(summary);
  if (!ok) return;

  renderActualsPreview();
  updateActualsBadge();
}

// ─────────────────────────────────────────
// MONTH PICKER MODAL
// ─────────────────────────────────────────

function showMonthPickerModal(defaultMonthKey) {
  return new Promise((resolve) => {

    // Build year/month options
    const now       = new Date();
    const thisYear  = now.getFullYear();
    const startYear = 2020; // adjust if needed

    // Parse default
    const [defY, defM] = defaultMonthKey.split('-').map(Number);

    // Build year select
    let yearOptions = '';
    for (let y = thisYear; y >= startYear; y--) {
      yearOptions += `<option value="${y}" ${y === defY ? 'selected' : ''}>${y}</option>`;
    }

    // Build month select
    const MONTH_NAMES = [
      'January','February','March','April','May','June',
      'July','August','September','October','November','December'
    ];
    let monthOptions = '';
    MONTH_NAMES.forEach((name, idx) => {
      const val = String(idx + 1).padStart(2, '0');
      monthOptions += `<option value="${val}" ${(idx + 1) === defM ? 'selected' : ''}>${name}</option>`;
    });

    // Inject modal HTML
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id        = 'month-picker-overlay';
    overlay.innerHTML = `
      <div class="modal-box month-picker-modal">
        <div class="modal-header">
          <span class="modal-title">📅 Confirm Data Month</span>
        </div>
        <div class="modal-body">
          <p class="month-picker-desc">
            We detected your data is from 
            <strong>${MONTH_NAMES[defM - 1]} ${defY}</strong>.
            Confirm or change the month this data belongs to.
          </p>
          <div class="month-picker-selects">
            <select id="month-picker-month" class="form-input month-picker-select">
              ${monthOptions}
            </select>
            <select id="month-picker-year" class="form-input month-picker-select">
              ${yearOptions}
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="month-picker-cancel">Cancel</button>
          <button class="btn btn-primary" id="month-picker-confirm">Confirm</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('modal-overlay--visible'));

    const cleanup = () => {
      overlay.classList.remove('modal-overlay--visible');
      setTimeout(() => overlay.remove(), 200);
    };

    document.getElementById('month-picker-cancel').onclick = () => {
      cleanup();
      resolve(null);
    };

    document.getElementById('month-picker-confirm').onclick = () => {
      const m = document.getElementById('month-picker-month').value;
      const y = document.getElementById('month-picker-year').value;
      cleanup();
      resolve(`${y}-${m}`);
    };

    // Click outside to cancel
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        cleanup();
        resolve(null);
      }
    });
  });
}

// ─────────────────────────────────────────
// ACTUALS — REMOVE
// ─────────────────────────────────────────

async function removeActuals() {
  const actuals = getBestActuals();
  if (!actuals) return;

  const [yr, mo] = actuals.monthKey.split('-');
  const label    = monthLabel(parseInt(mo) - 1, parseInt(yr));

  const confirmed = await showConfirm(
    `Remove actual spending data for ${label}? The AI will no longer have this data.`,
    'Remove'
  );
  if (!confirmed) return;

  const ok = await deleteActualsFromSupabase(actuals.monthKey);
  if (!ok) return;

  renderActualsPreview();
  updateActualsBadge();
}

// ─────────────────────────────────────────
// ACTUALS — RENDER PREVIEW
// ─────────────────────────────────────────

function renderActualsPreview() {
  const preview  = document.getElementById('actuals-preview');
  const metaEl   = document.getElementById('actuals-preview-meta');
  const catsEl   = document.getElementById('actuals-preview-cats');

  const actuals = getBestActuals();

  if (!actuals) {
    preview.style.display = 'none';
    return;
  }

  preview.style.display = '';

  // Meta line
  const [yr, mo] = actuals.monthKey.split('-');
  const label    = monthLabel(parseInt(mo) - 1, parseInt(yr));

  metaEl.innerHTML = `
    <strong>✅ ${label} actuals loaded</strong><br>
    ${actuals.transactionCount} transactions · ${actuals.dateRangeLabel}<br>
    Total Expenses: <strong>${fmt(actuals.totalExpenses)}</strong>
  `;

  // Category chips
  catsEl.innerHTML = actuals.categories.map(c => {
    const label = c.subcategory ? `${c.category} / ${c.subcategory}` : c.category;
    return `
      <span class="actuals-cat-chip">
        <strong>${escHtml(label)}</strong> ${fmt(c.total)}
      </span>
    `;
  }).join('');
}

// ─────────────────────────────────────────
// ACTUALS — BADGE (section title indicator)
// ─────────────────────────────────────────

function updateActualsBadge() {
  const titleEl = document.getElementById('ai-questions-section-title');
  if (!titleEl) return;

  // Remove existing badge if any
  const existing = titleEl.querySelector('.actuals-title-badge');
  if (existing) existing.remove();

  const actuals = getBestActuals();
  if (!actuals) return;

  const [yr, mo] = actuals.monthKey.split('-');
  const label    = MONTHS[parseInt(mo) - 1];

  const badge = document.createElement('span');
  badge.className   = 'actuals-title-badge';
  badge.textContent = `📂 ${label} actuals`;
  titleEl.appendChild(badge);
}

// ─────────────────────────────────────────
// ACTUALS — BUILD PROMPT SECTION
// ─────────────────────────────────────────

/**
 * Returns a formatted string to inject into the AI prompt,
 * or null if no actuals are loaded.
 */
function buildActualsPromptSection() {
  const actuals = getBestActuals();
  if (!actuals) return null;

  const [yr, mo] = actuals.monthKey.split('-');
  const label    = monthLabel(parseInt(mo) - 1, parseInt(yr));

  const catLines = actuals.categories.map(c => {
    const pct     = actuals.totalExpenses > 0
      ? ((c.total / actuals.totalExpenses) * 100).toFixed(1)
      : '0.0';
    const subPart = c.subcategory ? ` / ${c.subcategory}` : '';
    return `  - ${c.category}${subPart}: ${fmt(c.total)} (${pct}%) — ${c.count} transaction${c.count !== 1 ? 's' : ''}`;
  }).join('\n');

  return `ACTUAL SPENDING DATA — ${label} (from Money Manager export):
Total Actual Expenses: ${fmt(actuals.totalExpenses)} across ${actuals.transactionCount} transactions
Date Range: ${actuals.dateRangeLabel}
Note: Transfer-Out and Income rows are excluded. Only expense transactions are included.

Breakdown by Category:
${catLines}

When coaching, compare these real figures against this month's planned expenses.
Flag any categories where the plan looks unrealistic based on last month's actual behaviour.
If the user is consistently overspending in a category, name it directly and suggest a specific RM adjustment.`;
}

// ─────────────────────────────────────────
// AI QUESTIONS — Dynamic list management
// ─────────────────────────────────────────

let aiQuestionCount = 1;

function addAIQuestion() {
  aiQuestionCount++;
  const questionNumber = aiQuestionCount;

  const list = document.getElementById('ai-questions-list');

  const row = document.createElement('div');
  row.className = 'ai-question-row';
  row.id = `ai-question-row-${questionNumber}`;

  row.innerHTML = `
    <div class="ai-question-input-wrap">
      <textarea
        id="ai-question-${questionNumber}"
        class="form-input ai-question-textarea"
        rows="2"
        placeholder="e.g. What should I prioritise next month?"
      ></textarea>
    </div>
    <button
      class="ai-question-remove-btn"
      onclick="removeAIQuestion(${questionNumber})"
      title="Remove this question"
    >−</button>
  `;

  list.appendChild(row);
}

function removeAIQuestion(id) {
  const row = document.getElementById(`ai-question-row-${id}`);
  if (row) {
    row.style.transition = 'opacity 0.2s, transform 0.2s';
    row.style.opacity = '0';
    row.style.transform = 'translateX(8px)';
    setTimeout(() => row.remove(), 200);
  }
}

function collectAIQuestions() {
  const textareas = document.querySelectorAll('#ai-questions-list .ai-question-textarea');
  const questions = [];
  textareas.forEach(ta => {
    const val = ta.value.trim();
    if (val.length > 0) questions.push(val);
  });
  return questions;
}

function clearAIQuestions() {
  // Reset to just 1 empty question
  aiQuestionCount = 1;
  const list = document.getElementById('ai-questions-list');
  list.innerHTML = `
    <div class="ai-question-row" id="ai-question-row-1">
      <div class="ai-question-input-wrap">
        <textarea
          id="ai-question-1"
          class="form-input ai-question-textarea"
          rows="2"
          placeholder="e.g. How can I reduce my food spending?"
        ></textarea>
      </div>
    </div>
  `;
}

// ─────────────────────────────────────────
// BUILD PROMPT (extracted, reusable)
// ─────────────────────────────────────────
function buildPrompt() {
  // ── Plan data ──────────────────────────────────────────────
  const planMonth  = monthLabel(state.currentMonth, state.currentYear);
  const income     = getIncome();
  const expenses   = getPlanExpenses();
  const balance    = income - expenses;
  const categories = getPlanCategories(); // your existing helper

  let prompt = `You are a friendly but direct personal finance coach. 
The user is planning their budget for ${planMonth}.

BUDGET PLAN — ${planMonth}:
Total Income:   ${fmt(income)}
Total Planned Expenses: ${fmt(expenses)}
Remaining Balance: ${fmt(balance)}

Expense Breakdown:
${categories}`;

  // ── Actuals section ────────────────────────────────────────
  const actualsSection = buildActualsPromptSection();

  // ── User questions ─────────────────────────────────────────
  const userQuestions  = collectAIQuestions();
  const hasActuals     = !!actualsSection;
  const hasQuestions   = userQuestions.trim().length > 0;

  // ── Output format instructions ─────────────────────────────
  prompt += `\n\n---\nINSTRUCTIONS FOR YOUR RESPONSE:
You MUST return your response using EXACTLY these section markers.
Do not add any text outside the markers.
Do not skip any marker even if the section is short.

[COACHING]
Provide 3–5 concise, actionable coaching tips about the ${planMonth} plan above.
Focus on balance health, overspending risks, and savings opportunities.
Be specific — mention actual RM amounts where relevant.
Do NOT repeat or summarise the comparison data here — that goes in [COMPARISON].
[/COACHING]`;

  if (hasActuals) {
    prompt += `\n\n${actualsSection}

[COMPARISON]
Compare the ACTUAL SPENDING DATA above against the ${planMonth} plan category by category.
For each category that exists in both actuals and plan:
  - State the planned amount, the actual amount, and the RM difference
  - Flag clearly if the user is over or under their plan
  - If a category only exists in actuals but not in the plan, flag it as unplanned spending
  - End with 1–2 sentences summarising the biggest risk or win from the comparison
Use clear formatting — one category per line. Be direct and specific with RM figures.
[/COMPARISON]`;
  }

  if (hasQuestions) {
    prompt += `\n\n[QUESTIONS]
The user has asked the following specific questions. Answer each one clearly and directly,
referencing their actual plan and spending data where relevant.
Number your answers to match the questions.

User questions:
${userQuestions}
[/QUESTIONS]`;
  }

  // Close with explicit reminder
  prompt += `\n\nRemember: Only output the marker sections listed above. No preamble, no sign-off.`;

  return prompt;
}

// ─────────────────────────────────────────
// PROMPT PREVIEW MODAL
// ─────────────────────────────────────────

function openPromptPreview() {
  const data = currentMonthData();
  if (!data.income) {
    showAlert('Please set your expected income first — the prompt needs data to preview.', 'info');
    return;
  }

  const prompt = buildPrompt();

  // Populate and open modal
  document.getElementById('prompt-preview-content').textContent = prompt;
  openPanel('prompt-preview-overlay');
}

function closePromptPreview() {
  closePanel('prompt-preview-overlay');
}

// ─────────────────────────────────────────
// AI REVIEW (refactored — uses buildPrompt)
// ─────────────────────────────────────────

async function runAIReview() {
  const data = currentMonthData();
  if (!data.income) { showAlert('Please set your expected income first.', 'info'); return; }

  const prompt = buildPrompt();

  const card    = document.getElementById('ai-review-card');
  const content = document.getElementById('ai-review-content');
  card.style.display = '';
  content.innerHTML  = `<div class="ai-loading"><div class="spinner"></div><span>Your coach is reviewing your plan…</span></div>`;

  const btn = document.getElementById('coach-me-btn');
  btn.disabled    = true;
  btn.textContent = '⏳ Analysing…';
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });

  try {
    const res = await fetch('https://groq-proxy.henryooi0077.workers.dev', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
        model:       'llama-3.1-8b-instant',
        messages:    [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens:  600
      })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || `HTTP ${res.status}`);
    }

    const json = await res.json();
    const text = json.choices?.[0]?.message?.content || 'No response received.';

    currentMonthData().aiReview = text;
    triggerSave();
    showAIResult(text);

  } catch (e) {
    content.innerHTML = `
      <div style="color:var(--danger);font-size:0.85rem;margin-bottom:10px">⚠️ Error: ${escHtml(e.message)}</div>
      <button class="btn btn-secondary btn-sm" onclick="resetAIReviewUI()">↩ Back</button>
    `;
  } finally {
    btn.disabled    = false;
    btn.textContent = '✨ Coach Me — Analyse My Plan';
    clearAIQuestions();
  }
}

function parseAIResponse(raw) {
  const extract = (tag) => {
    const re  = new RegExp(`\\[${tag}\\]([\\s\\S]*?)\\[\\/${tag}\\]`, 'i');
    const match = raw.match(re);
    return match ? match[1].trim() : null;
  };

  return {
    coaching:    extract('COACHING'),
    comparison:  extract('COMPARISON'),
    questions:   extract('QUESTIONS')
  };
}

function showAIResult(raw) {
  const { coaching, comparison, questions } = parseAIResponse(raw);

  const resultContainer = document.getElementById('ai-result-container');
  resultContainer.innerHTML = '';

  // ── Card builder helper ──────────────────────────────────
  const makeCard = (emoji, title, content, accentClass = '') => {
    const card = document.createElement('div');
    card.className = `ai-result-card ${accentClass}`.trim();
    card.innerHTML = `
      <div class="ai-result-card-header">
        <span class="ai-result-card-icon">${emoji}</span>
        <span class="ai-result-card-title">${title}</span>
      </div>
      <div class="ai-result-card-body">${marked.parse(content)}</div>
    `;
    resultContainer.appendChild(card);
  };

  // ── 1. Coaching — always shown ───────────────────────────
  if (coaching) {
    makeCard('💡', 'Coaching & Recommendations', coaching);
  }

  // ── 2. Comparison — only if actuals were loaded ──────────
  if (comparison) {
    makeCard('📊', 'Actual vs Plan Comparison', comparison, 'ai-result-card--comparison');
  }

  // ── 3. Questions — only if user asked something ──────────
  if (questions) {
    makeCard('❓', 'Your Questions', questions, 'ai-result-card--questions');
  }

  // ── Fallback — if markers failed (safety net) ────────────
  if (!coaching && !comparison && !questions) {
    const card = document.createElement('div');
    card.className = 'ai-result-card';
    card.innerHTML = `<div class="ai-result-card-body">${marked.parse(raw)}</div>`;
    resultContainer.appendChild(card);
  }
}

function resetAIReviewUI() {
  document.getElementById('ai-review-card').style.display = 'none';
  document.getElementById('ai-review-content').innerHTML  = '';
}

// ─────────────────────────────────────────
// PASSWORD TOGGLE
// ─────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const toggleBtn     = document.getElementById('toggle-password');
  const passwordInput = document.getElementById('auth-password');
  const eyeOpen       = document.getElementById('icon-eye-open');
  const eyeClosed     = document.getElementById('icon-eye-closed');

  if (toggleBtn && passwordInput) {
    toggleBtn.addEventListener('click', () => {
      if (passwordInput.type === 'password') {
        passwordInput.type      = 'text';
        eyeOpen.style.display   = 'none';
        eyeClosed.style.display = '';
      } else {
        passwordInput.type      = 'password';
        eyeOpen.style.display   = '';
        eyeClosed.style.display = 'none';
      }
    });
  }
});

function resetPasswordToggle() {
  const passwordInput = document.getElementById('auth-password');
  const eyeOpen       = document.getElementById('icon-eye-open');
  const eyeClosed     = document.getElementById('icon-eye-closed');

  if (passwordInput) passwordInput.type      = 'password';
  if (eyeOpen)       eyeOpen.style.display   = '';
  if (eyeClosed)     eyeClosed.style.display = 'none';
}

// ─────────────────────────────────────────
// CHANGE PASSWORD MODAL
// ─────────────────────────────────────────
function openChangePasswordModal() {
  const modal = document.getElementById('change-password-modal');
  if (modal) {
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
}

function closeChangePasswordModal() {
  const modal = document.getElementById('change-password-modal');
  if (!modal) return;

  modal.classList.remove('open');
  document.body.style.overflow = '';

  const newPass    = document.getElementById('cp-new-password');
  const confirmPass = document.getElementById('cp-confirm-password');
  const errorEl    = document.getElementById('cp-error');
  const successEl  = document.getElementById('cp-success');

  if (newPass)     newPass.value     = '';
  if (confirmPass) confirmPass.value = '';
  if (errorEl)     errorEl.classList.add('hidden');
  if (successEl)   successEl.classList.add('hidden');
}

async function submitChangePassword() {
  const newPass     = document.getElementById('cp-new-password').value;
  const confirmPass = document.getElementById('cp-confirm-password').value;
  const errorEl     = document.getElementById('cp-error');
  const submitBtn   = document.querySelector('#change-password-modal .btn-primary');
  const cancelBtn   = document.querySelector('#change-password-modal .btn-secondary');

  errorEl.classList.add('hidden');

  if (!newPass || newPass.length < 6) {
    errorEl.textContent = 'Password must be at least 6 characters.';
    errorEl.classList.remove('hidden');
    return;
  }

  if (newPass !== confirmPass) {
    errorEl.textContent = 'Passwords do not match.';
    errorEl.classList.remove('hidden');
    return;
  }

  if (submitBtn) {
    submitBtn.disabled    = true;
    submitBtn.textContent = '⏳ Updating…';
  }
  if (cancelBtn) cancelBtn.disabled = true;

  const { error } = await sb.auth.updateUser({ password: newPass });

  if (submitBtn) {
    submitBtn.disabled    = false;
    submitBtn.textContent = 'Update Password';
  }
  if (cancelBtn) cancelBtn.disabled = false;

  if (error) {
    errorEl.textContent = error.message || 'Failed to update password.';
    errorEl.classList.remove('hidden');
    return;
  }

  showAlert('Your password has been updated successfully! 🎉', 'success', {
    label: 'OK',
    onClick: () => {
      closeAlert();
      closeChangePasswordModal();
    }
  });
}
