import { $, show } from '../utils.js';
import { registerActions } from './actions.js';

const TABS = ['planner', 'recurring', 'savings', 'history', 'defaults'];
const renderers = {};

/** Registers a render callback that runs whenever a tab becomes visible. */
export function onTabShow(tab, fn) { renderers[tab] = fn; }

export function switchTab(tab) {
  TABS.forEach(t => {
    const active = t === tab;
    show(`tab-${t}`, active);
    const btn = $(`tab-btn-${t}`);
    btn?.classList.toggle('active', active);
    btn?.setAttribute('aria-selected', String(active));
  });
  show('coach-me-wrap', tab === 'planner');
  renderers[tab]?.();
}

registerActions({
  'switch-tab': el => switchTab(el.dataset.tab)
});
