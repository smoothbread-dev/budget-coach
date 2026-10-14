// Delegated event handling: markup uses data-action (click) / data-change (change)
// instead of inline handlers, so the CSP can forbid inline scripts.

const clickActions  = {};
const changeActions = {};

export function registerActions(map)       { Object.assign(clickActions, map); }
export function registerChangeActions(map) { Object.assign(changeActions, map); }

const busy = new WeakSet();

async function run(handler, el, event) {
  if (busy.has(el)) return;
  const result = handler(el, event);
  if (!(result instanceof Promise)) return;

  // Block double submissions while an async action runs. Uses aria-disabled rather than
  // `disabled`, because disabling the focused button makes the browser drop focus.
  busy.add(el);
  el.setAttribute('aria-disabled', 'true');
  try {
    await result;
  } catch (err) {
    console.error(`Action failed: ${el.dataset.action}`, err);
  } finally {
    busy.delete(el);
    el.removeAttribute('aria-disabled');
  }
}

export function initActions() {
  document.addEventListener('click', (event) => {
    const el = event.target.closest('[data-action]');
    if (!el) return;
    const handler = clickActions[el.dataset.action];
    if (!handler) { console.warn('Unknown action:', el.dataset.action); return; }
    run(handler, el, event);
  });

  document.addEventListener('change', (event) => {
    const el = event.target.closest('[data-change]');
    if (!el) return;
    const handler = changeActions[el.dataset.change];
    if (handler) run(handler, el, event);
  });
}
