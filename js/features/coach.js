// AI coach: optional user questions, prompt building, request to the AI proxy, result formatting.
import * as api from '../api.js';
import { AI_PROXY_URL, AI_MODEL, AI_TEMPERATURE, AI_MAX_TOKENS, AI_TIMEOUT_MS, CURRENCY } from '../config.js';
import { store, monthData, currentKey, calcTotals, allocationsForMonth, totalAllocated, findCategory, categoryTotalSaved } from '../state.js';
import { $, show, escHtml, fmt } from '../utils.js';
import { registerActions } from '../ui/actions.js';
import { openPanel, showAlert } from '../ui/modals.js';
import { markDirty } from './sync.js';

const MAX_QUESTIONS       = 5;
const MAX_QUESTION_LENGTH = 500;
const COACH_BTN_LABEL     = '✨ Coach Me — Analyse My Plan';

// ─────────────────────────────────────────
// QUESTIONS
// ─────────────────────────────────────────

function questionRowHTML(removable) {
  return `
    <div class="ai-question-row">
      <div class="ai-question-input-wrap">
        <textarea class="form-input ai-question-textarea" rows="2" maxlength="${MAX_QUESTION_LENGTH}"
                  aria-label="Question for the AI coach"
                  placeholder="e.g. How can I reduce my food spending?"></textarea>
      </div>
      ${removable ? '<button type="button" class="ai-question-remove-btn" data-action="remove-question" aria-label="Remove this question">−</button>' : ''}
    </div>`;
}

function updateAddQuestionButton() {
  const count = document.querySelectorAll('#ai-questions-list .ai-question-row').length;
  show('ai-add-question-btn', count < MAX_QUESTIONS);
}

function addQuestion() {
  const list = $('ai-questions-list');
  list.insertAdjacentHTML('beforeend', questionRowHTML(true));
  list.lastElementChild.querySelector('textarea').focus();
  updateAddQuestionButton();
}

function removeQuestion(btn) {
  btn.closest('.ai-question-row')?.remove();
  updateAddQuestionButton();
}

export function clearQuestions() {
  const list = $('ai-questions-list');
  if (!list) return;
  list.innerHTML = questionRowHTML(false);
  updateAddQuestionButton();
}

function collectQuestions() {
  return [...document.querySelectorAll('#ai-questions-list .ai-question-textarea')]
    .map(t => t.value.trim().slice(0, MAX_QUESTION_LENGTH))
    .filter(Boolean);
}

// ─────────────────────────────────────────
// PROMPT
// ─────────────────────────────────────────

export function buildPrompt() {
  const data = monthData();
  if (!data.income) return null;

  const { income, needs, wants, savings, savingsPct } = calcTotals(data);
  const goal = data.savingsGoal ?? 0;
  const pctOf = (n) => ((n / income) * 100).toFixed(1);

  const goalContext = goal > 0
    ? `The user's savings goal is ${goal}%. They are projecting ${savingsPct.toFixed(1)}% savings.\n${
        savingsPct < goal
          ? `They are ${(goal - savingsPct).toFixed(1)}% BELOW their goal. Be direct and specific about which wants to reduce.`
          : 'They have MET their savings goal. Be encouraging but still offer optimisation tips.'}`
    : 'The user has not set a savings goal.';

  const fundedItems = data.items.filter(i => i.funded);
  const fundedNote  = fundedItems.length
    ? `Note: These items are funded from pre-saved money, NOT this month's income — do NOT flag them as concerns: ${fundedItems.map(i => i.name).join(', ')}.`
    : '';

  const itemList = data.items
    .filter(i => !i.funded)
    .map(i => `- ${i.name} (${i.category}, ${i.type}): ${fmt(i.amount)}`)
    .join('\n');

  const allocations = allocationsForMonth();
  const allocationLines = allocations.length
    ? allocations.map(p => {
        const cat     = findCategory(p.savings_category_id);
        const name    = cat?.name ?? p.category_name ?? 'Unknown';
        const saved   = cat ? categoryTotalSaved(cat) : 0;
        const goalAmt = cat ? Number(cat.goal_amount) : 0;
        const pct     = goalAmt > 0 ? ((saved / goalAmt) * 100).toFixed(1) : 'N/A';
        return `- ${name}: ${fmt(p.allocated_amount)} allocated this month (${fmt(saved)} saved of ${fmt(goalAmt)} goal — ${pct}% complete)`;
      }).join('\n')
    : 'No savings allocations set for this month.';

  const questions = collectQuestions();

  const steps = [
    'Overall Assessment — use header: [HEADER: Overall Assessment]',
    `2-3 specific actionable coaching tips with ${CURRENCY.symbol} amounts — use header: [HEADER: Coaching Tips]`,
    'Comment on savings allocations progress — use header: [HEADER: Savings Allocations]',
    ...(questions.length ? ['Address each user question directly — use header: [HEADER: Your Questions]'] : []),
    'Encouraging closing remark — use header: [HEADER: Final Note]'
  ].map((s, i) => `${i + 1}. ${s}`).join('\n');

  let prompt = `You are a friendly but honest personal finance coach. The user is planning their budget BEFORE their salary arrives. Analyse their expected budget and give a concise, actionable coaching session.

REGIONAL CONTEXT:
This user is based in ${CURRENCY.region}. Please ensure all financial advice, product references, loan structures, tax considerations, and spending norms are appropriate and relevant to the ${CURRENCY.region} context. Avoid assumptions based on other countries' financial systems or products.

FORMATTING RULES — FOLLOW STRICTLY:
- Do NOT use Markdown tables (no pipe characters, no | --- | separators).
- Do NOT use Markdown bold (**text**) or italic (*text*) syntax.
- Do NOT use # or ## for headers.
- For section headers, use this exact format: [HEADER: Your Header Title Here]
  Example: [HEADER: Overall Assessment]
- Use plain text only for all other content. Structure with short paragraphs and bullet points (• or -).

PLAN SUMMARY:
- Expected Income: ${fmt(income)}
- Expected Needs: ${fmt(needs)} (${pctOf(needs)}% of income)
- Expected Wants: ${fmt(wants)} (${pctOf(wants)}% of income)
- Projected Savings: ${fmt(savings)} (${savingsPct.toFixed(1)}% of income)

${goalContext}
${fundedNote}

PLANNED EXPENSES:
${itemList || 'No items added yet.'}

SAVINGS ALLOCATIONS THIS MONTH (${fmt(totalAllocated())} total allocated):
${allocationLines}`;

  if (questions.length) {
    prompt += `\n\n---\nUSER QUESTIONS TO ADDRESS:\n${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`;
  }

  prompt += `\n\n---\nPlease provide your response in this exact order:\n${steps}\n\nKeep the tone warm, coach-like, and honest. Format clearly with short paragraphs.`;
  return prompt;
}

function openPromptPreview() {
  const prompt = buildPrompt();
  if (!prompt) {
    showAlert('Please set your expected income first — the prompt needs data to preview.', 'info');
    return;
  }
  $('prompt-preview-content').textContent = prompt;
  openPanel('prompt-preview-overlay');
}

// ─────────────────────────────────────────
// AI REQUEST
// ─────────────────────────────────────────

async function requestReview(prompt) {
  const token = await api.accessToken();
  if (!token) throw new Error('Your session has expired. Please sign in again.');

  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const res = await fetch(AI_PROXY_URL, {
      method:  'POST',
      signal:  controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({
        model:       AI_MODEL,
        messages:    [{ role: 'user', content: prompt }],
        temperature: AI_TEMPERATURE,
        max_tokens:  AI_MAX_TOKENS
      })
    });

    if (res.status === 429) throw new Error('You have reached the AI usage limit. Please try again later.');
    if (res.status === 401) throw new Error('Your session has expired. Please sign in again.');

    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error?.message || `The coach is unavailable right now (HTTP ${res.status}).`);

    return json.choices?.[0]?.message?.content || 'No response received.';
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('The coach took too long to respond. Please try again.');
    if (err instanceof TypeError)  throw new Error('Could not reach the AI coach. Check your connection and try again.');
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function runReview() {
  const prompt = buildPrompt();
  if (!prompt) { showAlert('Please set your expected income first.', 'info'); return; }

  // Capture the month now so switching months mid-request saves to the right one.
  const key     = currentKey();
  const content = $('ai-review-content');
  const btn     = $('coach-me-btn');

  content.innerHTML = '<div class="ai-loading" role="status"><div class="spinner"></div><span>Your coach is reviewing your plan…</span></div>';
  btn.disabled    = true;
  btn.textContent = '⏳ Analysing…';
  $('ai-review-card').scrollIntoView({ behavior: 'smooth', block: 'start' });

  try {
    const text = await requestReview(prompt);
    store.months[key].aiReview = text;
    markDirty(key);
    if (key === currentKey()) showSavedReview(text);
    clearQuestions();
  } catch (err) {
    content.innerHTML = `
      <div class="ai-error" role="alert">⚠️ ${escHtml(err.message)}</div>
      <button type="button" class="btn btn-secondary btn-sm" data-action="run-review">↻ Try again</button>`;
  } finally {
    btn.disabled    = false;
    btn.textContent = COACH_BTN_LABEL;
  }
}

// ─────────────────────────────────────────
// RESULT RENDERING
// ─────────────────────────────────────────

/** Converts the model's plain-text format into safe HTML. Input is escaped first. */
export function formatAIText(text) {
  let safe = escHtml(text);

  safe = safe.replace(/\[HEADER:\s*(.+?)\]/g, '<span class="ai-section-header">$1</span>');
  safe = safe.replace(/^([•-])\s+(.+?)\n?$/gm,
    '<span class="ai-bullet"><span class="ai-bullet-dot">•</span><span>$2</span></span>');
  safe = safe.replace(/(<\/span>)\n{1,2}(?=<span class="ai-bullet">)/g, '$1');
  safe = safe
    .replace(/\n{2,}/g, '</p><p class="ai-para">')
    .replace(/\n(?!<span)/g, '<br>');

  return `<p class="ai-para">${safe}</p>`;
}

export function showSavedReview(text) {
  $('ai-review-content').innerHTML = `
    <div class="ai-review-box">
      <div class="ai-label">🤖 Coach's Advice</div>
      <div class="ai-text">${formatAIText(text)}</div>
    </div>
    <button type="button" class="btn btn-secondary btn-sm bc-mt-10" data-action="run-review">🔄 Re-analyse</button>`;
}

export function resetReviewUI() {
  const content = $('ai-review-content');
  if (content) content.innerHTML = '<div class="empty-subsection">No advice yet for this month. Tap “Coach Me” below to get feedback on your plan.</div>';
}

registerActions({
  'add-question':        addQuestion,
  'remove-question':     removeQuestion,
  'run-review':          runReview,
  'open-prompt-preview': openPromptPreview
});
