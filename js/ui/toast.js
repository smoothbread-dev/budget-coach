import { $ } from '../utils.js';

const DURATIONS = { saved: 1800, error: 5000, warning: 3500, info: 2500 };
const ICONS     = { saved: '✓', error: '✕', warning: '⚠️', info: 'ℹ️' };
const CLASSES   = { saved: 'saved', error: 'toast-error', warning: 'toast-warning', info: 'toast-info' };
const DEFAULT_LABELS = { saving: 'Saving…', saved: 'Saved', error: 'Something went wrong', warning: '', info: '' };

let dismissTimer = null;

/** status: 'saving' | 'saved' | 'error' | 'warning' | 'info' */
export function showToast(status, message = '') {
  const toast   = $('save-toast');
  if (!toast) return;
  const spinner = $('toast-spinner');
  const label   = $('toast-label');

  clearTimeout(dismissTimer);
  toast.classList.remove('visible', ...Object.values(CLASSES));
  spinner.classList.toggle('bc-hidden', status !== 'saving');

  const text = message || DEFAULT_LABELS[status] || '';
  label.textContent = ICONS[status] ? `${ICONS[status]} ${text}` : text;

  if (CLASSES[status]) toast.classList.add(CLASSES[status]);
  toast.classList.add('visible');

  if (DURATIONS[status]) {
    dismissTimer = setTimeout(() => toast.classList.remove('visible', ...Object.values(CLASSES)), DURATIONS[status]);
  }
}

/**
 * Runs an async write with saving/saved/error feedback.
 * Returns { ok, data } so callers only update local state on success.
 */
export async function persist(task, errorMessage = 'Could not save. Please try again.') {
  showToast('saving');
  try {
    const data = await task();
    showToast('saved');
    return { ok: true, data };
  } catch (err) {
    console.error(err);
    showToast('error', errorMessage);
    return { ok: false, error: err };
  }
}
