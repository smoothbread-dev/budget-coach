import { $ } from '../utils.js';
import { registerActions } from './actions.js';

const OVERLAY_SELECTOR   = '.panel-overlay, .modal-overlay';
const FOCUSABLE_SELECTOR = 'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const stack = [];               // open overlays, top = last
const dismissHandlers = {};     // overlay id -> custom dismiss behaviour

/** Overrides what happens when the user dismisses (Esc / backdrop / Cancel) a panel. */
export function onDismiss(id, fn) { dismissHandlers[id] = fn; }

function syncScrollLock() {
  document.body.style.overflow = stack.length ? 'hidden' : '';
}

function focusables(root) {
  return [...root.querySelectorAll(FOCUSABLE_SELECTOR)].filter(el => el.offsetParent !== null);
}

export function openPanel(id, focusId) {
  const el = $(id);
  if (!el) return;
  if (!el.classList.contains('open')) {
    stack.push({ id, returnFocus: document.activeElement });
    el.classList.add('open');
    el.setAttribute('aria-hidden', 'false');
    syncScrollLock();
  }
  requestAnimationFrame(() => focusPanel(el, focusId));
}

// Chrome can ignore focus() until the overlay's visibility change is applied, so retry briefly.
function focusPanel(el, focusId, attempt = 0) {
  if (!el.classList.contains('open')) return;
  const target = focusId ? $(focusId) : focusables(el)[0];
  if (!target) return;
  void getComputedStyle(el).visibility;
  target.focus();
  if (document.activeElement !== target && attempt < 10) {
    setTimeout(() => focusPanel(el, focusId, attempt + 1), 30);
  }
}

export function closePanel(id) {
  const el = $(id);
  if (!el) return;
  el.classList.remove('open');
  el.setAttribute('aria-hidden', 'true');

  const idx = stack.findLastIndex(s => s.id === id);
  if (idx >= 0) {
    const [entry] = stack.splice(idx, 1);
    if (entry.returnFocus?.isConnected) entry.returnFocus.focus();
  }
  syncScrollLock();
}

export function dismissPanel(id) {
  const el = $(id);
  if (!el || el.dataset.mandatory === 'true') return;
  (dismissHandlers[id] || closePanel)(id);
}

export function closeAllPanels() {
  [...stack].reverse().forEach(({ id }) => closePanel(id));
}

export function setMandatory(id, mandatory) {
  const el = $(id);
  if (el) el.dataset.mandatory = mandatory ? 'true' : 'false';
}

// ── Alert ──

const ALERT_TITLES = {
  error:   '❌ Error',
  warning: '⚠️ Warning',
  info:    'ℹ️ Info',
  success: '✅ Success'
};

/** action: optional { label, onClick } shown instead of the default OK button. */
export function showAlert(message, type = 'warning', action = null) {
  $('alert-modal-title').textContent   = ALERT_TITLES[type] || ALERT_TITLES.warning;
  $('alert-modal-message').textContent = message;

  const actions = $('alert-modal-actions');
  actions.replaceChildren();

  const btn = document.createElement('button');
  btn.type        = 'button';
  btn.className   = 'btn btn-primary';
  btn.textContent = action?.label ?? 'OK';
  btn.addEventListener('click', () => {
    closeAlert();
    action?.onClick?.();
  });

  if (action) {
    const dismiss = document.createElement('button');
    dismiss.type        = 'button';
    dismiss.className   = 'btn btn-secondary';
    dismiss.textContent = 'Close';
    dismiss.addEventListener('click', closeAlert);
    actions.append(dismiss);
  }
  actions.append(btn);

  openPanel('alert-modal-overlay');
}

export function closeAlert() {
  closePanel('alert-modal-overlay');
}

// ── Confirm ──

let resolveConfirm = null;

function settleConfirm(result) {
  closePanel('confirm-modal-overlay');
  resolveConfirm?.(result);
  resolveConfirm = null;
}

/** Resolves true when confirmed, false when cancelled or dismissed. */
export function showConfirm(message, confirmText = 'Delete', title = 'Are you sure?') {
  resolveConfirm?.(false);
  $('confirm-modal-title').textContent   = title;
  $('confirm-modal-message').textContent = message;
  $('confirm-modal-ok').textContent      = confirmText;
  openPanel('confirm-modal-overlay', 'confirm-modal-cancel');
  return new Promise(resolve => { resolveConfirm = resolve; });
}

// ── Global wiring ──

export function initModals() {
  onDismiss('confirm-modal-overlay', () => settleConfirm(false));

  registerActions({
    'close-panel':    el => dismissPanel(el.dataset.target),
    'confirm-ok':     () => settleConfirm(true),
    'confirm-cancel': () => settleConfirm(false)
  });

  document.addEventListener('keydown', (e) => {
    const top = stack[stack.length - 1];
    if (!top) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      dismissPanel(top.id);
      return;
    }

    if (e.key === 'Tab') {
      const items = focusables($(top.id));
      if (items.length === 0) return;
      const first = items[0];
      const last  = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  // Backdrop click (mousedown + click both on the overlay, so text-selection drags don't close it).
  let downOnBackdrop = false;
  document.addEventListener('mousedown', e => {
    downOnBackdrop = e.target.matches?.(OVERLAY_SELECTOR) ?? false;
  });
  document.addEventListener('click', e => {
    if (downOnBackdrop && e.target.matches?.(OVERLAY_SELECTOR)) dismissPanel(e.target.id);
    downOnBackdrop = false;
  });
}
