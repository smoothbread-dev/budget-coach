// Data access layer: every Supabase query lives here. All functions throw on error.
import { sb } from './supabaseClient.js';
import { store } from './state.js';

function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

const uid = () => store.user.id;
const owned = (table) => sb.from(table).delete().eq('user_id', uid());

// ── Load ──

export async function loadAll() {
  const id = uid();
  const [defaults, recurring, plans, categories, adjustments, planSavings] = await Promise.all([
    sb.from('user_defaults').select('*').eq('user_id', id).maybeSingle(),
    sb.from('recurring_items').select('*').eq('user_id', id).order('created_at', { ascending: true }),
    sb.from('month_plans').select('*').eq('user_id', id),
    sb.from('savings_categories').select('*').eq('user_id', id).order('created_at', { ascending: true }),
    sb.from('savings_adjustments').select('*').eq('user_id', id).order('created_at', { ascending: true }),
    sb.from('plan_savings').select('*').eq('user_id', id)
  ].map(q => q.then(unwrap)));

  return { defaults, recurring, plans, categories, adjustments, planSavings };
}

// ── Defaults ──

export async function saveDefaults({ income, savingsGoal }) {
  unwrap(await sb.from('user_defaults').upsert({
    user_id:      uid(),
    income,
    savings_goal: savingsGoal,
    updated_at:   new Date().toISOString()
  }, { onConflict: 'user_id' }));
}

// ── Recurring items ──

export async function insertRecurring({ name, amount }) {
  return unwrap(await sb.from('recurring_items')
    .insert({ user_id: uid(), name, amount })
    .select().single());
}

export async function updateRecurring(id, { name, amount }) {
  unwrap(await sb.from('recurring_items')
    .update({ name, amount }).eq('id', id).eq('user_id', uid()));
}

export async function deleteRecurring(id) {
  unwrap(await owned('recurring_items').eq('id', id));
}

// ── Month plans ──

export async function upsertMonthPlan(key, data) {
  unwrap(await sb.from('month_plans').upsert({
    user_id:      uid(),
    month_key:    key,
    income:       data.income,
    savings_goal: data.savingsGoal,
    items:        data.items || [],
    ai_review:    data.aiReview || null,
    updated_at:   new Date().toISOString()
  }, { onConflict: 'user_id,month_key' }));
}

/** Removes the month plan and its savings allocations. */
export async function deleteMonth(key) {
  unwrap(await owned('plan_savings').eq('month_key', key));
  unwrap(await owned('month_plans').eq('month_key', key));
}

// ── Savings categories ──

export async function insertSavingsCategory(fields) {
  return unwrap(await sb.from('savings_categories')
    .insert({ user_id: uid(), ...fields })
    .select().single());
}

export async function updateSavingsCategory(id, fields) {
  unwrap(await sb.from('savings_categories')
    .update(fields).eq('id', id).eq('user_id', uid()));
}

/** Deletes a category and its adjustments. plan_savings rows are kept (FK is ON DELETE SET NULL). */
export async function deleteSavingsCategory(id) {
  unwrap(await owned('savings_adjustments').eq('savings_category_id', id));
  unwrap(await owned('savings_categories').eq('id', id));
}

// ── Savings adjustments ──

export async function insertAdjustment({ categoryId, amount, note }) {
  return unwrap(await sb.from('savings_adjustments').insert({
    user_id:             uid(),
    savings_category_id: categoryId,
    amount,
    note:                note || null
  }).select().single());
}

export async function deleteAdjustment(id) {
  unwrap(await owned('savings_adjustments').eq('id', id));
}

// ── Plan savings allocations ──

export async function insertPlanSavings({ key, categoryId, categoryName, amount }) {
  return unwrap(await sb.from('plan_savings').insert({
    user_id:             uid(),
    month_key:           key,
    savings_category_id: categoryId,
    category_name:       categoryName,
    allocated_amount:    amount
  }).select().single());
}

export async function updatePlanSavingsAmount(id, amount) {
  unwrap(await sb.from('plan_savings')
    .update({ allocated_amount: amount }).eq('id', id).eq('user_id', uid()));
}

export async function deletePlanSavings(id) {
  unwrap(await owned('plan_savings').eq('id', id));
}

// ── Auth helpers ──

export async function accessToken() {
  const { data } = await sb.auth.getSession();
  return data.session?.access_token ?? null;
}
