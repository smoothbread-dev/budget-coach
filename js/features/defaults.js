// Defaults tab and first-time setup: default income & savings goal for new months.
import * as api from '../api.js';
import { store } from '../state.js';
import { $, fmt, parseAmount, clampPct } from '../utils.js';
import { registerActions } from '../ui/actions.js';
import { openPanel, closePanel, showAlert, onDismiss } from '../ui/modals.js';
import { onTabShow } from '../ui/tabs.js';
import { persist } from '../ui/toast.js';
import { checkAndPromptMonth } from './month.js';

export function renderDefaultsTab() {
  $('defaults-income-display').textContent = store.defaults.income > 0 ? fmt(store.defaults.income) : 'Not set';
  $('defaults-goal-display').textContent   = store.defaults.savingsGoal > 0 ? `${store.defaults.savingsGoal}%` : 'Not set';
}

/** Saves defaults; local state is only replaced once the database accepts it. */
async function saveDefaults(next) {
  const { ok } = await persist(() => api.saveDefaults(next), 'Could not save your defaults.');
  if (ok) store.defaults = next;
  renderDefaultsTab();
  return ok;
}

// ── First-time setup ──

export function openSetup() {
  openPanel('setup-panel-overlay', 'setup-income');
}

async function saveSetup() {
  const income = parseAmount($('setup-income').value);
  const goal   = clampPct($('setup-goal').value);
  if (Number.isNaN(income) || income < 0) { showAlert('Please enter a valid income amount.', 'warning'); return; }

  if (!await saveDefaults({ income, savingsGoal: goal })) return;
  closePanel('setup-panel-overlay');
  checkAndPromptMonth();
}

function skipSetup() {
  closePanel('setup-panel-overlay');
  checkAndPromptMonth();
}

// ── Defaults tab panels ──

function openDefaultIncome() {
  $('panel-default-income').value = store.defaults.income || '';
  openPanel('default-income-panel-overlay', 'panel-default-income');
}

async function saveDefaultIncome() {
  const income = parseAmount($('panel-default-income').value);
  if (Number.isNaN(income) || income < 0) { showAlert('Please enter a valid income amount.', 'warning'); return; }
  if (await saveDefaults({ ...store.defaults, income })) closePanel('default-income-panel-overlay');
}

function openDefaultGoal() {
  $('panel-default-goal').value = store.defaults.savingsGoal || '';
  openPanel('default-goal-panel-overlay', 'panel-default-goal');
}

async function saveDefaultGoal() {
  const savingsGoal = clampPct($('panel-default-goal').value);
  if (await saveDefaults({ ...store.defaults, savingsGoal })) closePanel('default-goal-panel-overlay');
}

onDismiss('setup-panel-overlay', skipSetup);

registerActions({
  'save-setup':          saveSetup,
  'skip-setup':          skipSetup,
  'open-default-income': openDefaultIncome,
  'save-default-income': saveDefaultIncome,
  'open-default-goal':   openDefaultGoal,
  'save-default-goal':   saveDefaultGoal
});

onTabShow('defaults', renderDefaultsTab);
