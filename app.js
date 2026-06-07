// ─────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────
const GROQ_API_KEY = 'GROQ_API_KEY_PLACEHOLDER';

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

// ─────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────

/** Displays a save status toast. Pass 'saving' to show spinner, anything else to show ✓ Saved. */
function showToast(status) {
  const toast   = document.getElementById('save-toast');
  const spinner = document.getElementById('toast-spinner');
  const label   = document.getElementById('toast-label');

  toast.classList.remove('saved');
  spinner.style.display = '';

  if (status === 'saving') {
    label.textContent = 'Saving…';
    toast.classList.add('visible');
  } else {
    spinner.style.display = 'none';
    label.textContent = '✓ Saved';
    toast.classList.add('visible', 'saved');
    setTimeout(() => toast.classList.remove('visible', 'saved'), TOAST_TIMEOUT);
  }
}

// ─────────────────────────────────────────
// SUPABASE — LOAD
// ─────────────────────────────────────────

/** Resets state and loads all user data from Supabase. Called once on login. */
async function loadFromSupabase() {  
  state = {
    defaults:       { income: 0, savingsGoal: 0 },
    recurringItems: [],
    currentMonth:   new Date().getMonth(),
    currentYear:    new Date().getFullYear(),
    months:         {}
  };

  const userId = currentUser.id;

  const { data: defaults } = await sb
    .from('user_defaults')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (defaults) {
    state.defaults.income      = defaults.income;
    state.defaults.savingsGoal = defaults.savings_goal;
  }

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
}

// ─────────────────────────────────────────
// SUPABASE — SAVE DEFAULTS
// ─────────────────────────────────────────

/** Persists the user's default income and savings goal to Supabase. */
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

/** Inserts or updates a recurring item in Supabase. Returns the item's ID. */
async function saveRecurringItem(item) {
  showToast('saving');

  if (item._isNew) {
    const { data, error } = await sb
      .from('recurring_items')
      .insert({
        user_id: currentUser.id,
        name:    item.name,
        amount:  item.amount
      })
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

/** Deletes a recurring item from Supabase by ID. */
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

/**
 * Debounced save trigger. Waits DEBOUNCE_DELAY ms after the last call
 * before writing the current month plan to Supabase.
 */
const triggerSave = (() => {
  let timer = null;
  return function () {
    showToast('saving');
    clearTimeout(timer);
    timer = setTimeout(() => saveCurrentMonth(), DEBOUNCE_DELAY);
  };
})();

/** Writes the current month's full plan (income, goal, items, AI review) to Supabase. */
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
// HELPERS
// ─────────────────────────────────────────

/** Returns a zero-padded month key string, e.g. '2025-06'. */
function monthKey(m, y)   { return `${y}-${String(m + 1).padStart(2, '0')}`; }

/** Returns a human-readable month label, e.g. 'June 2025'. */
function monthLabel(m, y) { return `${MONTHS[m]} ${y}`; }

/** Returns the month key for the currently viewed month. */
function currentKey()     { return monthKey(state.currentMonth, state.currentYear); }

/** Returns the plan data object for the currently viewed month, initialising it if missing. */
function currentMonthData() {
  const key = currentKey();
  if (!state.months[key]) {
    state.months[key] = { income: 0, savingsGoal: null, items: [], aiReview: null };
  }
  return state.months[key];
}

/** Escapes HTML special characters to prevent XSS when injecting user content into innerHTML. */
function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Formats a number as a Malaysian Ringgit string, e.g. 'RM 1,234.56'. */
function fmt(n) {
  return `RM ${Number(n).toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

/** Generates a unique ID for in-memory plan items stored in the JSONB array. */
function generateId() {
  return crypto.randomUUID();
}

// ─────────────────────────────────────────
// BANNER
// ─────────────────────────────────────────

/** Hides the purpose banner for the rest of the session and plays its exit animation. */
function dismissBanner() {
  bannerDismissedThisSession = true;
  const banner = document.getElementById('purpose-banner');
  banner.classList.add('hiding');
  banner.addEventListener('animationend', () => {
    banner.style.display = 'none';
  }, { once: true });
}

/** Shows or hides the purpose banner based on whether it was dismissed this session. */
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

/** Initialises the app after login. Loads all Supabase data, then routes to the correct first screen. */
async function initApp() {
  showToast('saving');
  document.getElementById('toast-label').textContent = 'Loading…';
  await loadFromSupabase();
  
  showToast('saved');
  document.getElementById('toast-label').textContent = '✓ Ready';

  updateMonthLabel();

  const hasDefaults = state.defaults.income > 0 || state.defaults.savingsGoal > 0;
  if (!hasDefaults) {
    document.getElementById('setup-panel-overlay').classList.add('open');
    document.body.style.overflow = 'hidden'; // 🔒
    return;
  }

  checkAndPromptMonth();
  renderDefaultsTab();
}

// ─────────────────────────────────────────
// FIRST-TIME SETUP
// ─────────────────────────────────────────

/** Saves the first-time setup values (income + goal) and transitions into the main app. */
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

/** Skips first-time setup and proceeds directly to the month prompt. */
function skipSetup() {
  document.getElementById('setup-panel-overlay').classList.remove('open');
  checkAndPromptMonth();
}

// ─────────────────────────────────────────
// MONTH PROMPT
// ─────────────────────────────────────────

/**
 * Checks whether the current month has a plan and routes accordingly:
 * - No income + has defaults → show defaults prompt overlay
 * - No income + no defaults → open income panel directly
 * - Has income → render the planner
 */
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
    document.body.style.overflow = 'hidden'; // 🔒
  } else if (!data.income) {
    openIncomePanel();
  } else {
    render();
    if (data.aiReview) showAIResult(data.aiReview);
  }
}

/** Applies the user's default income and savings goal to the current month and saves. */
function applyDefaults() {
  const data       = currentMonthData();
  data.income      = state.defaults.income;
  data.savingsGoal = state.defaults.savingsGoal;
  document.getElementById('defaults-prompt-overlay').classList.remove('open');
  triggerSave();
  render();
}

/**
 * Dismisses the defaults prompt and opens the income panel in new-month flow mode.
 * The _fromNewMonthFlow flag ensures cancel routes back to the prompt rather than closing silently.
 */
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

/** Switches the active tab and triggers any tab-specific render logic. */
function switchTab(tab) {
  ['planner', 'recurring', 'history', 'defaults'].forEach(t => {
    document.getElementById(`tab-${t}`).style.display     = t === tab ? '' : 'none';
    document.getElementById(`tab-btn-${t}`).classList.toggle('active', t === tab);
  });

  document.getElementById('coach-me-wrap').style.display = tab === 'planner' ? '' : 'none';

  if (tab === 'planner')   showBannerIfNeeded();
  if (tab === 'history')   renderHistory();
  if (tab === 'recurring') renderRecurringMasterList();
  if (tab === 'defaults')  renderDefaultsTab();
}

// ─────────────────────────────────────────
// MONTH NAVIGATION
// ─────────────────────────────────────────

/** Moves the viewed month forward (dir = 1) or backward (dir = -1) and re-evaluates the plan state. */
function changeMonth(dir) {
  state.currentMonth += dir;
  if (state.currentMonth > 11) { state.currentMonth = 0;  state.currentYear++; }
  if (state.currentMonth < 0)  { state.currentMonth = 11; state.currentYear--; }
  updateMonthLabel();
  resetAIReviewUI();
  checkAndPromptMonth();
}

/** Updates the month label element to reflect the currently viewed month. */
function updateMonthLabel() {
  document.getElementById('month-label').textContent =
    monthLabel(state.currentMonth, state.currentYear);
}

// ─────────────────────────────────────────
// DELETE MONTH
// ─────────────────────────────────────────

/** Shows a confirmation dialog before permanently deleting all data for the current month. */
async function confirmDeleteMonth() {
  const label = document.getElementById('month-label').textContent.trim();

  const confirmed = await showConfirm(
    `This will permanently remove all income, savings goal, expenses and AI review for ${label}. This cannot be undone.`,
    'Delete Month'
  );
  if (confirmed) deleteCurrentMonth();
}

/**
 * Deletes the current month's plan from Supabase and clears it from local state.
 * If the deleted month is not the real current month, snaps back to today silently.
 */
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
    alert('Something went wrong while deleting. Please try again.');
    const btn = document.getElementById('month-delete-btn');
    if (btn) btn.textContent = '🗑️';
  }
}

// ─────────────────────────────────────────
// PANEL HELPER
// ─────────────────────────────────────────

/** Opens a panel overlay and optionally focuses an input inside it. */
function openPanel(overlayId, focusId) {
  document.getElementById(overlayId).classList.add('open');
  document.body.style.overflow = 'hidden'; // 🔒 lock scroll
  if (focusId) {
    setTimeout(() => document.getElementById(focusId).focus(), FOCUS_DELAY);
  }
}

// ─────────────────────────────────────────
// INCOME PANEL
// ─────────────────────────────────────────

/** Opens the income panel for a normal edit. Cancel will simply close the panel. */
function openIncomePanel() {
  const data = currentMonthData();
  document.getElementById('panel-income').value = data.income || '';
  const overlay = document.getElementById('income-panel-overlay');
  overlay._fromNewMonthFlow = false;
  openPanel('income-panel-overlay', 'panel-income');
}

/**
 * Validates and saves the income value, then either prompts for a savings goal
 * (if not yet set) or renders the full planner.
 */
function saveIncomePanel() {
  const val = parseFloat(document.getElementById('panel-income').value);
  if (!val || val <= 0) { alert('Please enter a valid income amount.'); return; }

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

/**
 * Cancels the income panel. If opened from the new-month flow, routes back to
 * the defaults prompt instead of closing silently.
 */
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

/**
 * Opens the savings goal panel in mandatory mode after income is set for the first time.
 * The cancel button is hidden and backdrop dismissal is blocked until a valid goal is entered.
 */
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

/** Opens the savings goal panel for a normal edit. */
function openGoalPanel() {
  const data = currentMonthData();
  document.getElementById('panel-goal').value = data.savingsGoal ?? '';
  openPanel('goal-panel-overlay', 'panel-goal');
}

/** Validates and saves the savings goal, then restores the panel to its normal (non-mandatory) state. */
function saveGoalPanel() {
  const val = Math.min(100, Math.max(0,
    parseFloat(document.getElementById('panel-goal').value) || 0));

  if (val <= 0) { alert('Please enter a savings goal between 1 and 100%.'); return; }

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

/** Opens the default income panel pre-filled with the current default income. */
function openDefaultIncomePanel() {
  document.getElementById('panel-default-income').value = state.defaults.income || '';
  openPanel('default-income-panel-overlay', 'panel-default-income');
}

/** Saves the updated default income to state and Supabase, then re-renders the defaults tab. */
async function saveDefaultIncomePanel() {
  state.defaults.income = parseFloat(document.getElementById('panel-default-income').value) || 0;
  closePanel('default-income-panel-overlay');
  renderDefaultsTab();
  await saveDefaults();
}

// ─────────────────────────────────────────
// DEFAULT GOAL PANEL
// ─────────────────────────────────────────

/** Opens the default savings goal panel pre-filled with the current default goal. */
function openDefaultGoalPanel() {
  document.getElementById('panel-default-goal').value = state.defaults.savingsGoal || '';
  openPanel('default-goal-panel-overlay', 'panel-default-goal');
}

/** Saves the updated default savings goal to state and Supabase, then re-renders the defaults tab. */
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

/** Renders the current default income and savings goal values into the defaults tab. */
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

/** Opens the recurring item panel for adding (no id) or editing (with id). */
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

/** Validates and saves the recurring item panel — inserts or updates in Supabase accordingly. */
async function saveRecurringPanel() {
  const name   = document.getElementById('panel-rec-name').value.trim();
  const amount = parseFloat(document.getElementById('panel-rec-amount').value);
  if (!name)                  { alert('Please enter an item name.'); return; }
  if (!amount || amount <= 0) { alert('Please enter a valid amount.'); return; }

  if (editingRecurringId) {
    const item = state.recurringItems.find(r => String(r.id) === String(editingRecurringId)); // ✅ safe compare
    if (item) { item.name = name; item.amount = amount; }
    await saveRecurringItem({ id: editingRecurringId, name, amount });
  } else {
    const realId = await saveRecurringItem({ name, amount, _isNew: true });
    if (realId) {
      state.recurringItems.push({ id: String(realId), name, amount }); // ✅ always store as string
    }
  }

  closePanel('recurring-panel-overlay');
  renderRecurringMasterList();
}

/** Confirms and deletes a recurring item from Supabase and local state. */
async function deleteRecurringItem(id) {
  const item = state.recurringItems.find(r => r.id == id);
  const name = item ? `"${item.name}"` : 'this item';

  const confirmed = await showConfirm(`Remove ${name} from your recurring list? Existing plan items won't be affected.`);
  if (!confirmed) return;

  state.recurringItems = state.recurringItems.filter(r => r.id != id);
  await deleteRecurringFromDB(id);
  renderRecurringMasterList();
}

/**
 * Renders the full recurring master list into the recurring tab.
 *
 * FIX: item.id is a Supabase UUID/integer — it must be quoted in the onclick
 * attribute string so the browser parses it as a JS string argument, not a
 * bare identifier. Without quotes, onclick="openRecurringPanel(abc-123)" is
 * invalid JS and the click handler silently does nothing.
 */
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
// ADD ITEM FORM
// ─────────────────────────────────────────

/** Toggles the add item form for a given category (needs/wants). */
function toggleAddForm(cat) {
  const wrapper = document.getElementById(`add-form-${cat}`);
  const visible = wrapper.style.display !== 'none';
  if (visible) { wrapper.style.display = 'none'; return; }
  wrapper.style.display = '';
  renderAddForm(cat);
}

/** Renders the add item form HTML for a given category, including the recurring picker if applicable. */
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
        <input class="form-input" id="${cat}-name" placeholder="e.g. ${cat === 'needs' ? 'Rent' : 'Netflix'}" />
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

/** Shows or hides the recurring picker and funded checkbox based on the selected item type. */
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

/** Auto-fills the item name and amount fields from the selected recurring item. */
function fillFromRecurring(cat) {
  const sel  = document.getElementById(`${cat}-recurring-select`);
  const id   = sel.value;
  if (!id) return;
  const item = state.recurringItems.find(r => r.id === id);
  if (!item) return;
  document.getElementById(`${cat}-name`).value   = item.name;
  document.getElementById(`${cat}-amount`).value = item.amount;
}

/** Validates and adds a new item to the current month plan, then saves. */
function addItem(cat) {
  const name     = document.getElementById(`${cat}-name`).value.trim();
  const amount   = parseFloat(document.getElementById(`${cat}-amount`).value);
  const type     = document.getElementById(`${cat}-type`).value;
  const fundedEl = document.getElementById(`${cat}-funded`);
  const funded   = (cat === 'wants' && type === 'oneoff' && fundedEl) ? fundedEl.checked : false;

  if (!name)                  { alert('Please enter an item name.'); return; }
  if (!amount || amount <= 0) { alert('Please enter a valid amount.'); return; }

  const data = currentMonthData();
  data.items.push({ id: generateId(), name, amount, category: cat, type, funded });

  document.getElementById(`add-form-${cat}`).style.display = 'none';
  render();
  triggerSave();
}

// ─────────────────────────────────────────
// DELETE ITEM
// ─────────────────────────────────────────

/** Removes an item from the current month plan by ID and saves. */
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

/** Opens the edit item panel pre-filled with the selected item's current values. */
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

/** Shows or hides the funded checkbox in the edit panel based on category and type. */
function toggleEditFundedField() {
  const cat  = document.getElementById('edit-item-category').value;
  const type = document.getElementById('edit-item-type').value;
  const show = cat === 'wants' && type === 'oneoff';
  document.getElementById('edit-funded-wrap').style.display = show ? '' : 'none';
  if (!show) document.getElementById('edit-item-funded').checked = false;
}

/** Validates and saves edits to an existing plan item, then re-renders and saves. */
function saveEditItem() {
  const id     = document.getElementById('edit-item-id').value;
  const name   = document.getElementById('edit-item-name').value.trim();
  const amount = parseFloat(document.getElementById('edit-item-amount').value);
  const cat    = document.getElementById('edit-item-category').value;
  const type   = document.getElementById('edit-item-type').value;
  const funded = (cat === 'wants' && type === 'oneoff')
    ? document.getElementById('edit-item-funded').checked : false;

  if (!name)                  { alert('Please enter an item name.'); return; }
  if (!amount || amount <= 0) { alert('Please enter a valid amount.'); return; }

  const data = currentMonthData();
  const item = data.items.find(i => i.id === id);
  if (item) { item.name = name; item.amount = amount; item.category = cat; item.type = type; item.funded = funded; }

  closePanel('edit-item-panel-overlay');
  render();
  triggerSave();
}

// ─────────────────────────────────────────
// CALCULATIONS
// ─────────────────────────────────────────

/**
 * Calculates all financial totals for the current month.
 * Returns needs, wants, funded, gross, savings, savingsPct, expensesPct, and income.
 */
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

/**
 * Builds an HTML string for a single plan item row, used by renderItemList.
 *
 * FIX: item.id is a UUID string — it must be wrapped in single quotes inside
 * the onclick attribute so the browser parses it as a JS string argument.
 * Without quotes, onclick="openEditItemPanel(550e8400-e29b-...)" is invalid
 * JS (the hyphens are parsed as subtraction) and the handler silently fails.
 */
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

/**
 * Renders the full planner view for the current month.
 * Exits early if no income is set.
 */
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

  const monthData = state.months[currentKey()];
  const hasData   = monthData && (
    monthData.income      > 0 ||
    monthData.savingsGoal > 0 ||
    (monthData.items && monthData.items.length > 0)
  );

  const deleteBtn = document.getElementById('month-delete-btn');
  if (deleteBtn) deleteBtn.classList.toggle('hidden', !hasData);
}

/** Renders the total expenses progress bar and breakdown below the income display. */
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
    grossEl.textContent   = `(${fmt(gross)} incl. funded)`;
  } else {
    grossEl.style.display = 'none';
  }

  const pctEl = document.getElementById('total-exp-pct');
  pctEl.textContent = `${expensesPct.toFixed(1)}% of income`;
  pctEl.className   = `total-expenses-pct ${colourClass}`;

  const fill = document.getElementById('expenses-bar-fill');
  fill.style.width = `${Math.min(100, expensesPct)}%`;
  fill.className   = `expenses-bar-fill ${colourClass}`;

  document.getElementById('total-exp-breakdown').textContent =
    `Needs ${fmt(needs)} · Wants ${fmt(wants)}${funded > 0 ? ` · Funded ${fmt(funded)}` : ''}`;
  document.getElementById('total-exp-income-label').textContent = `of ${fmt(income)}`;
}

/** Renders the savings goal progress bar and status message. */
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

/** Renders the list of items for a given category and type (recurring/oneoff). */
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

/** Renders the history grid with a summary card for each month that has a plan. */
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
        <div class="history-stat"><span class="hl">Savings</span><span class="hr save">${fmt(savings)} (${savPct.toFixed(1)}%)</span></div>
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

/** Opens the history detail modal for a given month key. */
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
  document.body.style.overflow = 'hidden'; // 🔒 lock scroll
}

/** Toggles a collapsible section open or closed. */
function toggleCollapsible(header) {
  header.querySelector('.collapsible-arrow').classList.toggle('open');
  header.nextElementSibling.classList.toggle('open');
}

/** Closes the history detail modal. */
function closeHistoryModal() {
  document.getElementById('history-modal').classList.remove('open');
  document.body.style.overflow = ''; // 🔓 unlock scroll
}

/** Closes the history modal when the user clicks the backdrop. */
function handleModalOverlayClick(e) {
  if (e.target === document.getElementById('history-modal')) closeHistoryModal();
}

// ─────────────────────────────────────────
// PANEL HELPERS
// ─────────────────────────────────────────

/** Closes a panel overlay by removing the 'open' class. */
function closePanel(id) {
  document.getElementById(id).classList.remove('open');
  document.body.style.overflow = ''; // 🔓 unlock scroll
}

/**
 * Shows a custom confirmation modal and returns a Promise<boolean>.
 * Resolves true if the user confirms, false if they cancel.
 */
function showConfirm(message, confirmText = 'Delete') {
  return new Promise(resolve => {
    document.getElementById('confirm-modal-message').textContent = message;
    document.getElementById('confirm-modal-ok').textContent      = confirmText;

    const overlay   = document.getElementById('confirm-modal-overlay');
    const okBtn     = document.getElementById('confirm-modal-ok');
    const cancelBtn = document.getElementById('confirm-modal-cancel');

    // Clean up old listeners before adding new ones
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

/**
 * Handles backdrop clicks on panel overlays.
 * Mandatory panels (e.g. goal after income entry) cannot be dismissed this way.
 * The income panel routes through cancelIncomePanel to handle new-month flow correctly.
 */
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
// AI REVIEW
// ─────────────────────────────────────────

/** Builds the AI prompt, calls the Groq API, and displays the coach's advice. */
async function runAIReview() {
  const data = currentMonthData();
  if (!data.income) { alert('Please set your expected income first.'); return; }

  const { needs, wants, savings, savingsPct } = calcTotals();
  const goal = data.savingsGoal ?? 0;

  const goalContext = goal > 0
    ? `The user's savings goal is ${goal}%. They are projecting ${savingsPct.toFixed(1)}% savings.\n${
        savingsPct < goal
          ? `They are ${(goal - savingsPct).toFixed(1)}% BELOW their goal. Be direct and specific about which wants to reduce.`
          : `They have MET their savings goal. Be encouraging but still offer optimisation tips.`}`
    : 'The user has not set a savings goal.';

  const fundedItems = (data.items || []).filter(i => i.funded);
  const fundedNote  = fundedItems.length > 0
    ? `Note: These items are funded from pre-saved money, NOT this month's income — do NOT flag them as concerns: ${fundedItems.map(i => i.name).join(', ')}.`
    : '';

  const itemList = (data.items || [])
    .filter(i => !i.funded)
    .map(i => `- ${i.name} (${i.category}, ${i.type}): ${fmt(i.amount)}`)
    .join('\n');

  const prompt = `You are a friendly but honest personal finance coach. The user is planning their budget BEFORE their salary arrives. Analyse their expected budget and give a concise, actionable coaching session.

PLAN SUMMARY:
- Expected Income: ${fmt(data.income)}
- Expected Needs: ${fmt(needs)} (${((needs / data.income) * 100).toFixed(1)}% of income)
- Expected Wants: ${fmt(wants)} (${((wants / data.income) * 100).toFixed(1)}% of income)
- Projected Savings: ${fmt(savings)} (${savingsPct.toFixed(1)}% of income)

${goalContext}
${fundedNote}

PLANNED EXPENSES:
${itemList || 'No items added yet.'}

Please provide:
1. A brief overall assessment of this plan (2-3 sentences)
2. 2-3 specific, actionable coaching tips with RM amounts where relevant
3. One encouraging closing remark to motivate them

Keep the tone warm, coach-like, and honest. Format clearly with short paragraphs.`;

  const card    = document.getElementById('ai-review-card');
  const content = document.getElementById('ai-review-content');
  card.style.display = '';
  content.innerHTML  = `<div class="ai-loading"><div class="spinner"></div><span>Your coach is reviewing your plan…</span></div>`;

  const btn = document.getElementById('coach-me-btn');
  btn.disabled    = true;
  btn.textContent = '⏳ Analysing…';
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
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
  }
}

/** Renders the AI coach's advice into the review card. */
function showAIResult(text) {
  const card    = document.getElementById('ai-review-card');
  const content = document.getElementById('ai-review-content');
  card.style.display = '';
  content.innerHTML  = `
    <div class="ai-review-box">
      <div class="ai-label">🤖 Coach's Advice</div>
      <div class="ai-text">${escHtml(text)}</div>
    </div>
    <button class="btn btn-secondary btn-sm" style="margin-top:10px" onclick="runAIReview()">🔄 Re-analyse</button>
  `;
}

/** Hides the AI review card and clears its content. */
function resetAIReviewUI() {
  document.getElementById('ai-review-card').style.display = 'none';
  document.getElementById('ai-review-content').innerHTML  = '';
}

// ─────────────────────────────────────────
// PASSWORD TOGGLE
// ─────────────────────────────────────────

/** Toggles password visibility on the auth form. */
document.addEventListener('DOMContentLoaded', () => {
  const toggleBtn     = document.getElementById('toggle-password');
  const passwordInput = document.getElementById('auth-password');

  if (toggleBtn && passwordInput) {
    toggleBtn.addEventListener('click', () => {
      if (passwordInput.type === 'password') {
        passwordInput.type      = 'text';
        toggleBtn.textContent   = '🙈';
      } else {
        passwordInput.type      = 'password';
        toggleBtn.textContent   = '👁️';
      }
    });
  }
});
