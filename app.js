// ─────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────
const GROQ_API_KEY = 'GROQ_API_KEY_PLACEHOLDER';

// ─────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

// ─────────────────────────────────────────
// SESSION FLAG — in-memory only, resets on every page load
// ─────────────────────────────────────────
let bannerDismissedThisSession = false;

// ─────────────────────────────────────────
// STATE — now just in-memory, Supabase is source of truth
// ─────────────────────────────────────────
let state = {
  defaults:       { income: 0, savingsGoal: 0 },
  recurringItems: [],
  currentMonth:   new Date().getMonth(),
  currentYear:    new Date().getFullYear(),
  months:         {}
};

// ─────────────────────────────────────────
// TOAST (kept as-is, no localStorage involved)
// ─────────────────────────────────────────
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
    setTimeout(() => toast.classList.remove('visible', 'saved'), 1800);
  }
}

// ─────────────────────────────────────────
// SUPABASE — LOAD ALL DATA
// Called once on login. Fetches everything
// for this user and populates state.
// ─────────────────────────────────────────
async function loadFromSupabase() {
  // ✅ Always reset state before loading — prevents previous user's
  // data from leaking into the next user's session
  state = {
    defaults:       { income: 0, savingsGoal: 0 },
    recurringItems: [],
    currentMonth:   new Date().getMonth(),
    currentYear:    new Date().getFullYear(),
    months:         {}
  };
  
  const userId = currentUser.id;

  // 1. Load defaults
  const { data: defaults } = await sb
    .from('user_defaults')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (defaults) {
    state.defaults.income      = defaults.income;
    state.defaults.savingsGoal = defaults.savings_goal;
  }

  // 2. Load recurring items
  const { data: recurring } = await sb
    .from('recurring_items')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (recurring) {
    // Map Supabase rows → our in-memory format
    // We use the Supabase row id as our item id
    state.recurringItems = recurring.map(r => ({
      id:     r.id,
      name:   r.name,
      amount: r.amount
    }));
  }

  // 3. Load all month plans
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
// We use upsert for edits and a separate
// delete call for removals.
// ─────────────────────────────────────────
async function saveRecurringItem(item) {
  showToast('saving');

  if (item._isNew) {
    // INSERT — let Supabase generate the id
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
    return data.id; // Return the real Supabase id
  } else {
    // UPDATE existing row
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
// Called whenever items, income, goal, or
// aiReview changes for the current month.
// ─────────────────────────────────────────
let saveTimer = null;

function triggerSave() {
  showToast('saving');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveCurrentMonth(), 600);
}

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
// HELPERS (unchanged)
// ─────────────────────────────────────────
function monthKey(m, y)   { return `${y}-${String(m+1).padStart(2,'0')}`; }
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
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function fmt(n) {
  return `RM ${Number(n).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─────────────────────────────────────────
// BANNER — session only (unchanged)
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
// INIT — now async, loads from Supabase
// ─────────────────────────────────────────
async function initApp() {
  // Show a loading state while we fetch
  showToast('saving');
  document.getElementById('toast-label').textContent = 'Loading…';

  await loadFromSupabase();

  showToast('saved');
  document.getElementById('toast-label').textContent = '✓ Ready';

  updateMonthLabel();

  const hasDefaults = state.defaults.income > 0 || state.defaults.savingsGoal > 0;

  if (!hasDefaults) {
    // Brand new user — show first-time setup
    document.getElementById('setup-panel-overlay').classList.add('open');
    return;
  }

  checkAndPromptMonth();
  renderDefaultsTab();
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

  // Save to Supabase instead of localStorage
  await saveDefaults();

  checkAndPromptMonth();
  renderDefaultsTab();
}

function skipSetup() {
  document.getElementById('setup-panel-overlay').classList.remove('open');
  checkAndPromptMonth();
}

// ─────────────────────────────────────────
// MONTH PROMPT (unchanged logic)
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
  } else if (!data.income) {
    openIncomePanel();
  } else {
    render();
    if (data.aiReview) showAIResult(data.aiReview);
  }
}

function applyDefaults() {
  const data = currentMonthData();
  data.income      = state.defaults.income;
  data.savingsGoal = state.defaults.savingsGoal;
  document.getElementById('defaults-prompt-overlay').classList.remove('open');
  triggerSave();
  render();
}

function enterOwnValues() {
  document.getElementById('defaults-prompt-overlay').classList.remove('open');

  // ✅ Mark the income panel as opened from the new-month flow
  document.getElementById('panel-income').value = '';
  const overlay = document.getElementById('income-panel-overlay');
  overlay._fromNewMonthFlow = true;
  overlay.classList.add('open');
  setTimeout(() => document.getElementById('panel-income').focus(), 100);
}

// ─────────────────────────────────────────
// TABS (unchanged)
// ─────────────────────────────────────────
function switchTab(tab) {
  ['planner','recurring','history','defaults'].forEach(t => {
    document.getElementById(`tab-${t}`).style.display    = t === tab ? '' : 'none';
    document.getElementById(`tab-btn-${t}`).classList.toggle('active', t === tab);
  });
  document.getElementById('coach-me-wrap').style.display = tab === 'planner' ? '' : 'none';

  if (tab === 'planner')   showBannerIfNeeded();
  if (tab === 'history')   renderHistory();
  if (tab === 'recurring') renderRecurringMasterList();
  if (tab === 'defaults')  renderDefaultsTab();
}

// ─────────────────────────────────────────
// MONTH NAVIGATION (unchanged)
// ─────────────────────────────────────────
function changeMonth(dir) {
  state.currentMonth += dir;
  if (state.currentMonth > 11) { state.currentMonth = 0; state.currentYear++; }
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
// CONFIRM DELETE MONTH
// Shows a friendly but firm confirmation
// before wiping all data for the month.
// ─────────────────────────────────────────
function confirmDeleteMonth() {
  const label = document.getElementById('month-label').textContent.trim();

  // Build a clean confirm dialog using your existing panel system
  const confirmed = confirm(
    `⚠️ Delete all data for ${label}?\n\n` +
    `This will permanently remove:\n` +
    `  • Expected income\n` +
    `  • Savings goal\n` +
    `  • All expected needs & wants\n` +
    `  • AI review\n\n` +
    `This cannot be undone.`
  );

  if (confirmed) deleteCurrentMonth();
}

// ─────────────────────────────────────────
// DELETE CURRENT MONTH
// Deletes the month_plans row from Supabase
// using user_id + month_key, then resets
// the local state for that month.
// ─────────────────────────────────────────
async function deleteCurrentMonth() {
  const key = currentKey();
  if (!currentUser) return;

  // ── Snapshot whether this is the real current month BEFORE deleting ──
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

    // ✅ Wipe local in-memory data for this month
    delete state.months[key];

    if (btn) {
      btn.textContent = '🗑️';
      btn.classList.add('hidden');
    }

    if (isDeletingCurrentMonth) {
      // They deleted the actual current month — let normal flow handle it
      checkAndPromptMonth();
    } else {
      // ✅ They deleted a different month (accidental data) — 
      // silently snap back to today without prompting
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
// INCOME PANEL
// ─────────────────────────────────────────
function openIncomePanel() {
  document.getElementById('panel-income').value = currentMonthData().income || '';
  const overlay = document.getElementById('income-panel-overlay');
  overlay._fromNewMonthFlow = false; // ✅ normal edit — cancel just closes
  overlay.classList.add('open');
  setTimeout(() => document.getElementById('panel-income').focus(), 100);
}

function saveIncomePanel() {
  const val = parseFloat(document.getElementById('panel-income').value);
  if (!val || val <= 0) { alert('Please enter a valid income amount.'); return; }
  currentMonthData().income = val;
  closePanel('income-panel-overlay');

  // ✅ If savings goal is not yet set for this month,
  // immediately prompt for it before rendering the app.
  // This ensures both income AND goal are always set together.
  const data = currentMonthData();
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
    // ✅ User came from "enter my own values" — send them back to the prompt
    overlay._fromNewMonthFlow = false;
    checkAndPromptMonth();
  }
  // else: normal edit cancel — do nothing extra ✅
}

// ─────────────────────────────────────────
// MANDATORY GOAL PANEL
// Called after income is set for the first
// time. Cannot be dismissed — user MUST
// enter a savings goal to proceed.
// ─────────────────────────────────────────
function openGoalPanelMandatory() {
  document.getElementById('panel-goal').value = '';

  // Update panel title and subtitle to explain why this is required
  const title    = document.getElementById('goal-panel-title');
  const subtitle = document.getElementById('goal-panel-subtitle');
  if (title)    title.textContent    = '🎯 Set Your Savings Goal';
  if (subtitle) subtitle.textContent = 'A savings goal is required to complete your monthly plan.';

  // Hide the close/cancel button so user cannot skip
  const cancelBtn = document.getElementById('goal-panel-cancel-btn');
  if (cancelBtn) cancelBtn.style.display = 'none';

  document.getElementById('goal-panel-overlay').classList.add('open');

  // Block overlay click-to-dismiss for this mandatory flow
  const overlay = document.getElementById('goal-panel-overlay');
  overlay._mandatory = true;

  setTimeout(() => document.getElementById('panel-goal').focus(), 100);
}

// ─────────────────────────────────────────
// SAVINGS GOAL PANEL
// ─────────────────────────────────────────
function openGoalPanel() {
  document.getElementById('panel-goal').value = currentMonthData().savingsGoal ?? '';
  document.getElementById('goal-panel-overlay').classList.add('open');
  setTimeout(() => document.getElementById('panel-goal').focus(), 100);
}

function saveGoalPanel() {
  const val = Math.min(100, Math.max(0,
    parseFloat(document.getElementById('panel-goal').value) || 0));

  if (val <= 0) {
    alert('Please enter a savings goal between 1 and 100%.');
    return;
  }

  currentMonthData().savingsGoal = val;

  // ✅ Restore cancel button and mandatory flag for future normal use
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
  document.getElementById('default-income-panel-overlay').classList.add('open');
  setTimeout(() => document.getElementById('panel-default-income').focus(), 100);
}

async function saveDefaultIncomePanel() {
  state.defaults.income = parseFloat(document.getElementById('panel-default-income').value) || 0;
  closePanel('default-income-panel-overlay');
  renderDefaultsTab();
  await saveDefaults(); // saves to Supabase
}

// ─────────────────────────────────────────
// DEFAULT GOAL PANEL
// ─────────────────────────────────────────
function openDefaultGoalPanel() {
  document.getElementById('panel-default-goal').value = state.defaults.savingsGoal || '';
  document.getElementById('default-goal-panel-overlay').classList.add('open');
  setTimeout(() => document.getElementById('panel-default-goal').focus(), 100);
}

async function saveDefaultGoalPanel() {
  state.defaults.savingsGoal = Math.min(100, Math.max(0,
    parseFloat(document.getElementById('panel-default-goal').value) || 0));
  closePanel('default-goal-panel-overlay');
  renderDefaultsTab();
  await saveDefaults(); // saves to Supabase
}

// ─────────────────────────────────────────
// DEFAULTS TAB RENDER (unchanged)
// ─────────────────────────────────────────
function renderDefaultsTab() {
  document.getElementById('defaults-income-display').textContent =
    state.defaults.income > 0 ? fmt(state.defaults.income) : 'Not set';
  document.getElementById('defaults-goal-display').textContent =
    state.defaults.savingsGoal > 0 ? `${state.defaults.savingsGoal}%` : 'Not set';
}

// ─────────────────────────────────────────
// RECURRING MASTER LIST
// Now uses Supabase for all CRUD
// ─────────────────────────────────────────
let editingRecurringId = null;

function openRecurringPanel(id) {
  editingRecurringId = id || null;
  const title   = document.getElementById('recurring-panel-title');
  const saveBtn = document.getElementById('recurring-panel-save-btn');

  if (id) {
    const item = state.recurringItems.find(r => r.id === id);
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

  document.getElementById('recurring-panel-overlay').classList.add('open');
  setTimeout(() => document.getElementById('panel-rec-name').focus(), 100);
}

async function saveRecurringPanel() {
  const name   = document.getElementById('panel-rec-name').value.trim();
  const amount = parseFloat(document.getElementById('panel-rec-amount').value);
  if (!name)                  { alert('Please enter an item name.'); return; }
  if (!amount || amount <= 0) { alert('Please enter a valid amount.'); return; }

  if (editingRecurringId) {
    // Update in-memory
    const item = state.recurringItems.find(r => r.id === editingRecurringId);
    if (item) { item.name = name; item.amount = amount; }
    // Update in Supabase
    await saveRecurringItem({ id: editingRecurringId, name, amount });
  } else {
    // Insert into Supabase first to get the real id
    const realId = await saveRecurringItem({ name, amount, _isNew: true });
    if (realId) {
      // Now store in-memory with the Supabase-generated id
      state.recurringItems.push({ id: realId, name, amount });
    }
  }

  closePanel('recurring-panel-overlay');
  renderRecurringMasterList();
}

async function deleteRecurringItem(id) {
  if (!confirm('Remove this recurring item? Existing plan items won\'t be affected.')) return;
  // Remove from in-memory
  state.recurringItems = state.recurringItems.filter(r => r.id !== id);
  // Remove from Supabase
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
        <button class="item-action-btn edit" onclick="openRecurringPanel(${item.id})" title="Edit">✎</button>
        <button class="item-action-btn del"  onclick="deleteRecurringItem(${item.id})" title="Delete">✕</button>
      </div>
    </div>
  `).join('');
}

// ─────────────────────────────────────────
// ADD ITEM FORM (unchanged — triggerSave handles Supabase)
// ─────────────────────────────────────────
function toggleAddForm(cat) {
  const wrapper = document.getElementById(`add-form-${cat}`);
  const visible = wrapper.style.display !== 'none';
  if (visible) { wrapper.style.display = 'none'; return; }
  wrapper.style.display = '';
  renderAddForm(cat);
}

function renderAddForm(cat) {
  const inner        = document.getElementById(`add-form-${cat}-inner`);
  const hasRecurring = state.recurringItems.length > 0;
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
  const sel = document.getElementById(`${cat}-recurring-select`);
  const id  = parseInt(sel.value);
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

  if (!name)                  { alert('Please enter an item name.'); return; }
  if (!amount || amount <= 0) { alert('Please enter a valid amount.'); return; }

  // Use Date.now() as a temporary in-memory id for items inside the JSONB array
  currentMonthData().items.push({ id: Date.now(), name, amount, category: cat, type, funded });
  document.getElementById(`add-form-${cat}`).style.display = 'none';
  render();
  triggerSave(); // saves entire month JSONB to Supabase
}

// ─────────────────────────────────────────
// DELETE ITEM
// ─────────────────────────────────────────
function deleteItem(id) {
  const data = currentMonthData();
  data.items = data.items.filter(i => i.id !== id);
  render();
  triggerSave(); // saves entire month JSONB to Supabase
}

// ─────────────────────────────────────────
// EDIT ITEM PANEL
// ─────────────────────────────────────────
function openEditItemPanel(id) {
  const item = currentMonthData().items.find(i => i.id === id);
  if (!item) return;
  document.getElementById('edit-item-id').value       = id;
  document.getElementById('edit-item-name').value     = item.name;
  document.getElementById('edit-item-amount').value   = item.amount;
  document.getElementById('edit-item-category').value = item.category;
  document.getElementById('edit-item-type').value     = item.type;
  document.getElementById('edit-item-funded').checked = item.funded || false;
  toggleEditFundedField();
  document.getElementById('edit-item-panel-overlay').classList.add('open');
  setTimeout(() => document.getElementById('edit-item-name').focus(), 100);
}

function toggleEditFundedField() {
  const cat  = document.getElementById('edit-item-category').value;
  const type = document.getElementById('edit-item-type').value;
  const show = cat === 'wants' && type === 'oneoff';
  document.getElementById('edit-funded-wrap').style.display = show ? '' : 'none';
  if (!show) document.getElementById('edit-item-funded').checked = false;
}

function saveEditItem() {
  const id     = parseInt(document.getElementById('edit-item-id').value);
  const name   = document.getElementById('edit-item-name').value.trim();
  const amount = parseFloat(document.getElementById('edit-item-amount').value);
  const cat    = document.getElementById('edit-item-category').value;
  const type   = document.getElementById('edit-item-type').value;
  const funded = (cat === 'wants' && type === 'oneoff')
    ? document.getElementById('edit-item-funded').checked : false;

  if (!name)                  { alert('Please enter an item name.'); return; }
  if (!amount || amount <= 0) { alert('Please enter a valid amount.'); return; }

  const item = currentMonthData().items.find(i => i.id === id);
  if (item) { item.name = name; item.amount = amount; item.category = cat; item.type = type; item.funded = funded; }

  closePanel('edit-item-panel-overlay');
  render();
  triggerSave(); // saves entire month JSONB to Supabase
}

// ─────────────────────────────────────────
// CALCULATIONS (unchanged)
// ─────────────────────────────────────────
function calcTotals() {
  const data  = currentMonthData();
  const items = data.items || [];

  const needs   = items.filter(i => i.category === 'needs' && !i.funded).reduce((s,i) => s + i.amount, 0);
  const wants   = items.filter(i => i.category === 'wants' && !i.funded).reduce((s,i) => s + i.amount, 0);
  const funded  = items.filter(i => i.funded).reduce((s,i) => s + i.amount, 0);
  const gross   = needs + wants + funded;

  const savings     = Math.max(0, data.income - needs - wants);
  const savingsPct  = data.income > 0 ? (savings / data.income) * 100 : 0;
  const expensesPct = data.income > 0 ? ((needs + wants) / data.income) * 100 : 0;

  return { needs, wants, funded, gross, savings, savingsPct, expensesPct, income: data.income };
}

// ─────────────────────────────────────────
// RENDER — PLAN TAB (unchanged)
// ─────────────────────────────────────────
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

  const needsTotal = (data.items||[]).filter(i=>i.category==='needs').reduce((s,i)=>s+i.amount,0);
  const wantsTotal = (data.items||[]).filter(i=>i.category==='wants').reduce((s,i)=>s+i.amount,0);
  document.getElementById('needs-total').textContent = fmt(needsTotal);
  document.getElementById('wants-total').textContent = fmt(wantsTotal);

  // ── Delete button visibility ──────────────
  const key = currentKey();
  const monthData = state.months[key];
  const hasData = monthData && (
    monthData.income      > 0                           ||
    monthData.savingsGoal > 0                           ||
    (monthData.items && monthData.items.length > 0)
  );
  
  const deleteBtn = document.getElementById('month-delete-btn');
  if (deleteBtn) {
    deleteBtn.classList.toggle('hidden', !hasData);
  }
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
    fill.classList.add('met');   status.classList.add('met');
    status.textContent = `🎉 Goal met! Projecting ${savingsPct.toFixed(1)}% savings — ${diff.toFixed(1)}% above target.`;
  } else if (diff >= -3) {
    fill.classList.add('close'); status.classList.add('close');
    status.textContent = `⚠️ Almost there! ${Math.abs(diff).toFixed(1)}% below your ${goal}% goal.`;
  } else {
    fill.classList.add('under'); status.classList.add('under');
    status.textContent = `❌ ${Math.abs(diff).toFixed(1)}% below your ${goal}% goal. Consider trimming wants.`;
  }
}

function renderItemList(cat, type) {
  const listEl = document.getElementById(`${cat}-${type}-list`);
  const items  = (currentMonthData().items || []).filter(i => i.category === cat && i.type === type);

  if (items.length === 0) {
    listEl.innerHTML = `<div class="empty-subsection">No ${type === 'recurring' ? 'recurring' : 'one-off'} items yet.</div>`;
    return;
  }

  listEl.innerHTML = items.map(item => `
    <div class="item-row">
      <span class="item-name">${escHtml(item.name)}</span>
      ${item.funded ? '<span class="item-badge funded">From Savings</span>' : ''}
      <span class="item-amount">${fmt(item.amount)}</span>
      <div class="item-actions">
        <button class="item-action-btn edit" onclick="openEditItemPanel(${item.id})" title="Edit">✎</button>
        <button class="item-action-btn del"  onclick="deleteItem(${item.id})" title="Delete">✕</button>
      </div>
    </div>
  `).join('');
}

// ─────────────────────────────────────────
// RENDER — HISTORY TAB (unchanged)
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
    const needs   = items.filter(i=>i.category==='needs'&&!i.funded).reduce((s,i)=>s+i.amount,0);
    const wants   = items.filter(i=>i.category==='wants'&&!i.funded).reduce((s,i)=>s+i.amount,0);
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

function openHistoryModal(key) {
  const data = state.months[key];
  if (!data) return;
  const [y, m] = key.split('-');
  document.getElementById('modal-month-title').textContent = monthLabel(parseInt(m) - 1, parseInt(y));

  const items   = data.items || [];
  const grouped = { needs: { recurring:[], oneoff:[] }, wants: { recurring:[], oneoff:[] } };
  items.forEach(item => { if (grouped[item.category]?.[item.type]) grouped[item.category][item.type].push(item); });

  const needs   = items.filter(i=>i.category==='needs'&&!i.funded).reduce((s,i)=>s+i.amount,0);
  const wants   = items.filter(i=>i.category==='wants'&&!i.funded).reduce((s,i)=>s+i.amount,0);
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
}

function toggleCollapsible(header) {
  header.querySelector('.collapsible-arrow').classList.toggle('open');
  header.nextElementSibling.classList.toggle('open');
}

function closeHistoryModal() { document.getElementById('history-modal').classList.remove('open'); }
function handleModalOverlayClick(e) {
  if (e.target === document.getElementById('history-modal')) closeHistoryModal();
}

// ─────────────────────────────────────────
// PANEL HELPERS (unchanged)
// ─────────────────────────────────────────
function closePanel(id) { document.getElementById(id).classList.remove('open'); }
function handlePanelOverlayClick(e, id) {
  const overlay = document.getElementById(id);
  if (overlay._mandatory) return;
  if (e.target === overlay) {
    if (id === 'income-panel-overlay') {
      cancelIncomePanel(); // ✅ handles flow-aware cancel
    } else {
      closePanel(id);
    }
  }
}

// ─────────────────────────────────────────
// AI REVIEW (triggerSave now saves to Supabase)
// ─────────────────────────────────────────
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

  const fundedItems = (data.items||[]).filter(i => i.funded);
  const fundedNote  = fundedItems.length > 0
    ? `Note: These items are funded from pre-saved money, NOT this month's income — do NOT flag them as concerns: ${fundedItems.map(i=>i.name).join(', ')}.`
    : '';

  const itemList = (data.items||[])
    .filter(i => !i.funded)
    .map(i => `- ${i.name} (${i.category}, ${i.type}): ${fmt(i.amount)}`)
    .join('\n');

  const prompt = `You are a friendly but honest personal finance coach. The user is planning their budget BEFORE their salary arrives. Analyse their expected budget and give a concise, actionable coaching session.

PLAN SUMMARY:
- Expected Income: ${fmt(data.income)}
- Expected Needs: ${fmt(needs)} (${((needs/data.income)*100).toFixed(1)}% of income)
- Expected Wants: ${fmt(wants)} (${((wants/data.income)*100).toFixed(1)}% of income)
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
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 600
      })
    });

    if (!res.ok) { const err = await res.json(); throw new Error(err.error?.message || `HTTP ${res.status}`); }
    const json = await res.json();
    const text = json.choices?.[0]?.message?.content || 'No response received.';
    currentMonthData().aiReview = text;
    triggerSave(); // persists aiReview to Supabase
    showAIResult(text);
  } catch(e) {
    content.innerHTML = `
      <div style="color:var(--danger);font-size:0.85rem;margin-bottom:10px">⚠️ Error: ${escHtml(e.message)}</div>
      <button class="btn btn-secondary btn-sm" onclick="resetAIReviewUI()">↩ Back</button>`;
  } finally {
    btn.disabled    = false;
    btn.textContent = '✨ Coach Me — Analyse My Plan';
  }
}

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

function resetAIReviewUI() {
  document.getElementById('ai-review-card').style.display = 'none';
  document.getElementById('ai-review-content').innerHTML  = '';
}
