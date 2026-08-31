/**
 * Small, route-scoped enhancement for the entry form.
 *
 * The server still renders one complete native form. This module adds a
 * focused chapter-at-a-time view for visitors who have JavaScript, while
 * keeping the same POST, CSRF token, idempotency key, and browser validation
 * path. A same-tab session draft carries the journey through account pages
 * and reloads, but disappears when the tab closes; server-issued hidden
 * fields are never copied to storage.
 */

import { createPersonRef } from './person-ref.js';

const DRAFT_PREFIX = 'shuttleworks:entry-draft:';
const STEP_ORDER = ['eligibility', 'account', 'participant', 'events', 'partner', 'review'];
const DRAFT_FIELDS = new Set([
  'playerName',
  'gender',
  'club',
  'birthYear',
  'remarks',
  'events',
  'showAllEvents',
  'acknowledged',
]);

function slugFor(form) {
  const action = form.getAttribute('action') || '';
  return action.split('/').pop() || 'unknown';
}

function draftKey(form) {
  return `${DRAFT_PREFIX}${slugFor(form)}`;
}

function controlsFor(root, step) {
  return [...root.querySelectorAll(`[data-entry-wizard-controls="${step}"]`)];
}

function hasPartnerFields(root) {
  return root.querySelector('[data-entry-section="partner"] input') !== null;
}

function setHidden(element, hidden) {
  element.hidden = hidden;
  if (hidden) element.setAttribute('aria-hidden', 'true');
  else element.removeAttribute('aria-hidden');
}

function showStep(root, step) {
  const form = root;
  const shell = root.parentElement || root;
  const partnerStep = hasPartnerFields(root);
  const effective = step === 'partner' && !partnerStep ? 'review' : step;

  const eligibility = root.parentElement?.querySelector('[data-entry-wizard-panel="eligibility"]');
  const account = root.parentElement?.querySelector('[data-entry-wizard-panel="account"]');
  const review = root.querySelector('[data-entry-wizard-panel="review"]');
  if (eligibility) setHidden(eligibility, effective !== 'eligibility');
  if (account) setHidden(account, effective !== 'account');
  if (review) setHidden(review, effective !== 'review');

  for (const panel of root.querySelectorAll('[data-entry-section]')) {
    const kind = panel.getAttribute('data-entry-section');
    const visible = effective === 'review' || effective === kind || (effective === 'partner' && kind === 'events');
    setHidden(panel, !visible);
  }
  for (const controls of shell.querySelectorAll('[data-entry-wizard-controls]')) {
    setHidden(controls, controls.getAttribute('data-entry-wizard-controls') !== effective);
  }
  for (const element of root.querySelectorAll('[data-entry-wizard-only]')) {
    setHidden(element, element.getAttribute('data-entry-wizard-only') !== effective);
  }
  const submitBar = root.querySelector('[data-entry-submit-bar]');
  if (submitBar) setHidden(submitBar, effective !== 'review');

  for (const item of root.parentElement?.querySelectorAll('[data-entry-step]') || []) {
    const itemStep = item.getAttribute('data-entry-step');
    const link = item.querySelector('[data-wizard-step-link]');
    const current = itemStep === effective;
    item.toggleAttribute('data-current', current);
    if (link) {
      if (current) link.setAttribute('aria-current', 'step');
      else link.removeAttribute('aria-current');
    }
  }
  root.dataset.entryStep = effective;
  const target = effective === 'eligibility'
    ? eligibility
    : effective === 'account'
      ? account
      : effective === 'review'
        ? review
        : root.querySelector(`[data-entry-section="${effective}"]`);
  if (target && typeof target.scrollIntoView === 'function') {
    target.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
}

function nextStep(current, root) {
  const start = STEP_ORDER.indexOf(current);
  for (let index = start + 1; index < STEP_ORDER.length; index += 1) {
    if (STEP_ORDER[index] !== 'partner' || hasPartnerFields(root)) return STEP_ORDER[index];
  }
  return 'review';
}

function backStep(current, root) {
  const start = STEP_ORDER.indexOf(current);
  for (let index = start - 1; index >= 0; index -= 1) {
    if (STEP_ORDER[index] !== 'partner' || hasPartnerFields(root)) return STEP_ORDER[index];
  }
  return 'eligibility';
}

function validForStep(root, step) {
  if (step !== 'participant') return true;
  for (const field of root.querySelectorAll('[data-entry-section="participant"] input, [data-entry-section="participant"] select, [data-entry-section="participant"] textarea')) {
    if (typeof field.reportValidity === 'function' && !field.reportValidity()) return false;
  }
  return true;
}

function makeButton(label, action, value) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = action === 'next'
    ? 'inline-flex min-h-10 items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:bg-accent/90'
    : 'inline-flex min-h-10 items-center justify-center rounded-md border border-rule-control px-4 py-2 text-sm font-semibold text-foreground hover:bg-surface-sunken';
  button.dataset[`wizard${action === 'next' ? 'Next' : 'Back'}`] = value;
  button.textContent = label;
  return button;
}

function addPanelControl(panel, label, action, value) {
  const controls = document.createElement('div');
  controls.className = 'mt-2 flex flex-wrap gap-2';
  controls.dataset.entryWizardControls = value;
  controls.append(makeButton(label, action, value));
  panel.append(controls);
}

function valuesFor(form) {
  const result = {};
  for (const field of form.elements) {
    if (!field.name || !DRAFT_FIELDS.has(field.name) && !field.name.startsWith('partner:')) continue;
    if (field.type === 'submit' || field.type === 'button') continue;
    if (field.type === 'checkbox' && !field.checked) continue;
    if (!result[field.name]) result[field.name] = [];
    result[field.name].push(field.type === 'checkbox' ? 'on' : field.value);
  }
  return result;
}

function hasMeaningfulValues(form) {
  return Object.entries(valuesFor(form)).some(([name, values]) => {
    if (name === 'acknowledged' || name === 'showAllEvents') return values.length > 0;
    return values.some((value) => value.trim() !== '');
  });
}

function saveDraft(form) {
  try {
    window.sessionStorage.setItem(draftKey(form), JSON.stringify(valuesFor(form)));
  } catch {
    // Storage can be disabled or full. The native form remains usable.
  }
}

function restoreDraft(form, root) {
  let raw;
  try {
    raw = window.sessionStorage.getItem(draftKey(form));
  } catch {
    return;
  }
  if (!raw || hasMeaningfulValues(form)) return;
  let saved;
  try {
    saved = JSON.parse(raw);
  } catch {
    return;
  }
  if (!saved || typeof saved !== 'object') return;
  for (const field of form.elements) {
    if (!field.name || !Object.prototype.hasOwnProperty.call(saved, field.name)) continue;
    const values = Array.isArray(saved[field.name]) ? saved[field.name] : [];
    if (field.type === 'checkbox') field.checked = values.includes(field.value) || values.includes('on');
    else field.value = values.shift() ?? '';
  }
  const notice = document.createElement('p');
  notice.className = 'text-sm text-muted-foreground';
  notice.setAttribute('role', 'status');
  notice.textContent = 'Your saved entry draft was restored on this device.';
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'ml-2 text-accent underline underline-offset-4';
  clear.textContent = 'Clear draft';
  clear.addEventListener('click', () => {
    try { window.sessionStorage.removeItem(draftKey(form)); } catch { /* no-op */ }
    window.location.reload();
  });
  notice.append(clear);
  root.parentElement?.insertBefore(notice, root);
}

function renderReview(root) {
  const summary = root.querySelector('[data-entry-review-summary]');
  if (!summary) return;
  while (summary.firstChild) summary.removeChild(summary.firstChild);
  const list = document.createElement('dl');
  list.className = 'grid gap-2 sm:grid-cols-2';
  const form = root;
  const names = [...form.querySelectorAll('input[name="playerName"]')];
  const selected = [...form.querySelectorAll('input[name="events"]:checked')];
  const playerTerm = document.createElement('dt');
  playerTerm.className = 'text-xs text-muted-foreground';
  playerTerm.textContent = 'Players';
  const playerDetail = document.createElement('dd');
  playerDetail.className = 'flex flex-wrap gap-x-2 font-medium text-foreground';
  const enteredNames = names.map((field) => field.value.trim()).filter(Boolean);
  if (enteredNames.length === 0) {
    playerDetail.appendChild(createPersonRef(document, {
      slug: '', identity: null, state: 'dead', label: 'No name entered',
    }));
  } else {
    enteredNames.forEach((name, index) => {
      if (index > 0) {
        const separator = document.createElement('span');
        separator.className = 'text-muted-foreground';
        separator.textContent = ',';
        playerDetail.appendChild(separator);
      }
      playerDetail.appendChild(createPersonRef(document, {
        slug: '', identity: { id: null, name }, state: 'dead',
      }));
    });
  }

  const eventTerm = document.createElement('dt');
  eventTerm.className = 'text-xs text-muted-foreground';
  eventTerm.textContent = 'Events';
  const eventDetail = document.createElement('dd');
  eventDetail.className = 'font-medium text-foreground';
  eventDetail.textContent = selected
    .map((field) => field.closest('label')?.textContent?.replace(/\s+/g, ' ').trim() || field.value)
    .join(', ') || 'No events selected';
  list.append(playerTerm, playerDetail, eventTerm, eventDetail);
  summary.append(list);
  for (const [label, target] of [['Edit participant details', 'participant'], ['Edit events and partner', 'events']]) {
    const link = document.createElement('a');
    link.href = `#entry-${target}`;
    link.dataset.wizardStepLink = target;
    link.className = 'text-accent underline underline-offset-4';
    link.textContent = label;
    summary.append(link);
  }
}

export function initEntryWizard(root = document.querySelector('[data-entry-wizard]')) {
  if (!root || root.dataset.entryWizardReady === 'true') return;
  root.dataset.entryWizardReady = 'true';
  const form = root;
  const eligibility = root.parentElement?.querySelector('[data-entry-wizard-panel="eligibility"]');
  const account = root.parentElement?.querySelector('[data-entry-wizard-panel="account"]');
  if (eligibility) addPanelControl(eligibility, 'Continue to account', 'next', 'eligibility');
  if (account) addPanelControl(account, 'Continue to participant details', 'next', 'account');

  restoreDraft(form, root);
  const initial = root.dataset.entryInitialStep || 'eligibility';
  showStep(root, initial);

  const shell = root.parentElement || root;
  shell.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const stepLink = target?.closest('[data-wizard-step-link]');
    if (stepLink) {
      const step = stepLink.getAttribute('data-wizard-step-link');
      if (step && STEP_ORDER.includes(step) && (step !== 'partner' || hasPartnerFields(root))) {
        event.preventDefault();
        if (step === 'review') renderReview(root);
        showStep(root, step);
      }
      return;
    }
    const next = target?.closest('[data-wizard-next]')?.getAttribute('data-wizard-next');
    if (next) {
      event.preventDefault();
      if (!validForStep(form, next)) return;
      const destination = nextStep(next, root);
      renderReview(root);
      showStep(root, destination);
      return;
    }
    const back = target?.closest('[data-wizard-back]')?.getAttribute('data-wizard-back');
    if (back) {
      event.preventDefault();
      showStep(root, backStep(back, root));
    }
  });

  let timer;
  root.addEventListener('input', () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => saveDraft(form), 250);
  });
  root.addEventListener('change', () => saveDraft(form));
  form.addEventListener('submit', () => saveDraft(form));
}

if (typeof document !== 'undefined') initEntryWizard();
