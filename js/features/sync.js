// Debounced auto-save for month plans. Tracks dirty months by key, so switching
// months mid-debounce still saves the right month, and failed saves are retried.
import * as api from '../api.js';
import { SAVE_DEBOUNCE_MS } from '../config.js';
import { store, currentKey } from '../state.js';
import { showToast } from '../ui/toast.js';

const RETRY_MS = 15_000;
const dirty = new Set();
let timer = null;
let inFlight = null;

export function markDirty(key = currentKey()) {
  dirty.add(key);
  showToast('saving');
  clearTimeout(timer);
  timer = setTimeout(flush, SAVE_DEBOUNCE_MS);
}

/** Drops pending changes for a month (e.g. after it was deleted). */
export function forget(key) {
  dirty.delete(key);
}

export function hasUnsavedChanges() {
  return dirty.size > 0;
}

export async function flush() {
  clearTimeout(timer);
  timer = null;
  if (inFlight) await inFlight;
  if (dirty.size === 0 || !store.user) return true;

  const keys = [...dirty];
  dirty.clear();

  inFlight = (async () => {
    const failed = [];
    for (const key of keys) {
      if (!store.months[key]) continue;
      try {
        await api.upsertMonthPlan(key, store.months[key]);
      } catch (err) {
        console.error('Month save failed:', key, err);
        failed.push(key);
      }
    }
    return failed;
  })();

  const failed = await inFlight;
  inFlight = null;

  if (failed.length) {
    failed.forEach(k => dirty.add(k));
    showToast('error', 'Not saved — retrying shortly. Check your connection.');
    timer = setTimeout(flush, RETRY_MS);
    return false;
  }
  showToast('saved');
  return true;
}

export function initSync() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('beforeunload', (e) => {
    if (!hasUnsavedChanges()) return;
    flush();
    e.preventDefault();
    e.returnValue = '';
  });
}
