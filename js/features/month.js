// Month navigation, per-month income & savings goal, new-month prompt, delete month.
import * as api from '../api.js';
import { store, monthData, currentKey, hasDefaults } from '../state.js';
import { $, fmt, monthLabel, parseAmount, clampPct } from '../utils.js';
import { registerActions } from '../ui/actions.js';
import { openPanel, closePanel, showAlert, showConfirm } from '../ui/modals.js';
import { persist } from '../ui/toast.js';
import { markDirty, forget } from './sync.js';
import { render } from './planner.js';
import { showSavedReview, resetReviewUI } from './coach.js';

export function updateMonthLabel() {
  $('month-label').textContent = monthLabel(store.currentMonth, store.currentYear);
}

/** Renders the current month and, if it has no plan yet, offers to start one. */
export function checkAndPromptMonth() {
  const data = monthData();
  render();

  if (data.aiReview) showSavedReview(data.aiReview);
  else resetReviewUI();

  if (data.income) return;

  if (hasDefaults()) {
    $('defaults-prompt-title').textContent    = `📅 ${monthLabel(store.currentMonth, store.currentYear)}`;
    $('defaults-prompt-subtitle').textContent = 'This month has no plan yet. Would you like to start with your default values?';

    const parts = [];
    if (store.defaults.income > 0)      parts.push(`Income: ${fmt(store.defaults.income)}`);
    if (store.defaults.savingsGoal > 0) parts.push(`Savings goal: ${store.defaults.savingsGoal}%`);
    $('defaults-prompt-values').textContent = parts.join(' · ');

    openPanel('defaults-prompt-overlay');
  } else {
    openIncomePanel();
  }
}

function changeMonth(dir) {
  const d = new Date(store.currentYear, store.currentMonth + dir, 1);
  store.currentMonth = d.getMonth();
  store.currentYear  = d.getFullYear();
  updateMonthLabel();
  checkAndPromptMonth();
}

function goToToday() {
  const now = new Date();
  if (store.currentMonth === now.getMonth() && store.currentYear === now.getFullYear()) return;
  store.currentMonth = now.getMonth();
  store.currentYear  = now.getFullYear();
  updateMonthLabel();
  checkAndPromptMonth();
}

// ── New-month prompt ──

function applyDefaults() {
  closePanel('defaults-prompt-overlay');
  const data = monthData();
  data.income      = store.defaults.income;
  data.savingsGoal = store.defaults.savingsGoal || null;

  if (!(data.income > 0)) { openIncomePanel(); return; }
  if (!data.savingsGoal)  openGoalPanel();
  render();
  markDirty();
}

function enterOwnValues() {
  closePanel('defaults-prompt-overlay');
  openIncomePanel();
}

// ── Income panel ──

export function openIncomePanel() {
  $('panel-income').value = monthData().income || '';
  openPanel('income-panel-overlay', 'panel-income');
}

function saveIncomePanel() {
  const income = parseAmount($('panel-income').value);
  if (!(income > 0)) { showAlert('Please enter a valid income amount.', 'warning'); return; }

  const data = monthData();
  data.income = income;
  closePanel('income-panel-overlay');
  render();
  markDirty();

  if (data.savingsGoal == null) openGoalPanel(true);
}

// ── Goal panel ──

export function openGoalPanel(isFirstTime = false) {
  $('panel-goal').value = monthData().savingsGoal ?? '';
  $('goal-panel-title').textContent    = isFirstTime ? '🎯 Set Your Savings Goal' : 'Savings Goal 🎯';
  $('goal-panel-subtitle').textContent = isFirstTime
    ? 'What % of this month\'s income do you want to save? You can change this later.'
    : 'What % of income do you want to save this month?';
  openPanel('goal-panel-overlay', 'panel-goal');
}

function saveGoalPanel() {
  const goal = clampPct($('panel-goal').value);
  if (goal <= 0) { showAlert('Please enter a savings goal between 1 and 100%.', 'warning'); return; }

  monthData().savingsGoal = goal;
  closePanel('goal-panel-overlay');
  render();
  markDirty();
}

// ── Delete month ──

async function confirmDeleteMonth() {
  const key   = currentKey();
  const label = monthLabel(store.currentMonth, store.currentYear);
  const confirmed = await showConfirm(
    `This will permanently remove all income, savings goal, expenses, savings allocations and AI review for ${label}. This cannot be undone.`,
    'Delete Month'
  );
  if (!confirmed) return;

  const { ok } = await persist(() => api.deleteMonth(key), 'Could not delete this month. Please try again.');
  if (!ok) return;

  forget(key);
  delete store.months[key];
  store.planSavings = store.planSavings.filter(p => p.month_key !== key);

  const now = new Date();
  store.currentMonth = now.getMonth();
  store.currentYear  = now.getFullYear();
  updateMonthLabel();
  checkAndPromptMonth();
}

registerActions({
  'change-month':        el => changeMonth(Number(el.dataset.dir)),
  'go-to-today':         goToToday,
  'apply-defaults':      applyDefaults,
  'enter-own-values':    enterOwnValues,
  'open-income-panel':   () => openIncomePanel(),
  'save-income-panel':   saveIncomePanel,
  'open-goal-panel':     () => openGoalPanel(false),
  'save-goal-panel':     saveGoalPanel,
  'delete-month':        confirmDeleteMonth
});
