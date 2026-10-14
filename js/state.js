import { monthKey } from './utils.js';

function freshStore() {
  const now = new Date();
  return {
    user:               null,
    defaults:           { income: 0, savingsGoal: 0 },
    recurringItems:     [],
    currentMonth:       now.getMonth(),
    currentYear:        now.getFullYear(),
    months:             {},
    savingsCategories:  [],
    savingsAdjustments: [],
    planSavings:        []
  };
}

// Single mutable store shared by all modules.
export const store = freshStore();

export function resetStore(user = null) {
  Object.assign(store, freshStore(), { user });
}

export const sameId = (a, b) => a != null && b != null && String(a) === String(b);

export function currentKey() {
  return monthKey(store.currentMonth, store.currentYear);
}

export function monthData(key = currentKey()) {
  if (!store.months[key]) {
    store.months[key] = { income: 0, savingsGoal: null, items: [], aiReview: null };
  }
  return store.months[key];
}

export function hasDefaults() {
  return store.defaults.income > 0 || store.defaults.savingsGoal > 0;
}

// ── Calculations ──

const sum = (items, pred) => items.filter(pred).reduce((s, i) => s + Number(i.amount), 0);

export function calcTotals(data = monthData()) {
  const items  = data.items || [];
  const income = Number(data.income) || 0;

  const needs  = sum(items, i => i.category === 'needs' && !i.funded);
  const wants  = sum(items, i => i.category === 'wants' && !i.funded);
  const funded = sum(items, i => i.funded);

  const savings = Math.max(0, income - needs - wants);
  return {
    income, needs, wants, funded,
    gross:       needs + wants + funded,
    savings,
    savingsPct:  income > 0 ? (savings / income) * 100 : 0,
    expensesPct: income > 0 ? ((needs + wants) / income) * 100 : 0,
    needsAll:    sum(items, i => i.category === 'needs'),
    wantsAll:    sum(items, i => i.category === 'wants')
  };
}

// ── Savings ──

export function findCategory(id) {
  return store.savingsCategories.find(c => sameId(c.id, id));
}

export function allocationsForMonth(key = currentKey()) {
  return store.planSavings.filter(p => p.month_key === key);
}

export function totalAllocated(key = currentKey()) {
  return allocationsForMonth(key).reduce((s, p) => s + Number(p.allocated_amount), 0);
}

export function adjustmentsFor(categoryId) {
  return store.savingsAdjustments.filter(a => sameId(a.savings_category_id, categoryId));
}

export function sumAdjustments(categoryId) {
  return adjustmentsFor(categoryId).reduce((s, a) => s + Number(a.amount), 0);
}

/** Total saved = all monthly allocations for the category + manual adjustments. */
export function categoryTotalSaved(cat) {
  const planned = store.planSavings
    .filter(p => sameId(p.savings_category_id, cat.id))
    .reduce((s, p) => s + Number(p.allocated_amount), 0);
  return planned + sumAdjustments(cat.id);
}
