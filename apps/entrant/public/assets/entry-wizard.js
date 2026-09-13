/** Route-scoped enhancement for the entry form: turns the one native form the server renders into its two stages (Entry details, Review), shows partner fields only for ticked doubles events, keeps a same-tab session draft through the account pages, and marks a quote stale once the selection changes. */

import { createPersonRef } from './person-ref.js';

const DRAFT_PREFIX = 'shuttleworks:entry-draft:';
const STAGE_DONE = 'border-action-selected-bg bg-action-selected-bg text-action-primary'.split(' ');
const STAGE_ACTIVE = 'border-accent bg-accent text-accent-ink'.split(' ');
const DRAFT_FIELDS = new Set([
  'playerName',
  'gender',
  'club', 'representation',
  'birthYear',
  'remarks',
  'events',
  'showAllEvents',
]);

function slugFor(form) {
  const action = form.getAttribute('action') || '';
  return action.split('/').pop() || 'unknown';
}

function draftKey(form) {
  return `${DRAFT_PREFIX}${slugFor(form)}`;
}

function setHidden(element, hidden) {
  element.hidden = hidden;
  if (hidden) element.setAttribute('aria-hidden', 'true');
  else element.removeAttribute('aria-hidden');
}

// A quote describes one selection. After events, the show-every-event box, a
// partner address or the gender change, the bar is marked stale and asks for
// a fresh quote. UX only: the server's `reviewedQuote` hash refuses a stale
// quote at submit, and "Review entry" always re-quotes first.
const STALE_COPY = 'Selection changed. Update the total to see the new quote.';

function quoteExists(root) {
  const reviewed = root.querySelector('input[name="reviewedQuote"]');
  return Boolean((reviewed && reviewed.value) || root.querySelector('[data-quote-figure]'));
}

function markQuoteStale(root) {
  if (!quoteExists(root)) return;
  const bar = root.querySelector('#total');
  if (!bar) return;
  bar.dataset.quoteStale = 'true';
  const figure = bar.querySelector('[data-quote-figure]');
  if (figure) setHidden(figure, true);
  const status = bar.querySelector('[data-quote-status]');
  if (status) {
    status.textContent = STALE_COPY;
    status.hidden = false;
  }
  // A stale quote must not be posted as reviewed. Clearing the hash here
  // mirrors what the server would decide anyway.
  const reviewed = root.querySelector('input[name="reviewedQuote"]');
  if (reviewed) reviewed.value = '';
}

function selectionChanged(target) {
  if (!(target instanceof Element)) return false;
  const name = target.getAttribute('name') || '';
  return name === 'events' || name === 'showAllEvents' || name.startsWith('partner:') || name === 'gender';
}

/** Partner fields belong to the events that are ticked, and to no others. */
function syncPartnerFields(root) {
  const ticked = new Set(
    [...root.querySelectorAll('input[name="events"]:checked')].map((box) => box.value),
  );
  for (const field of root.querySelectorAll('[data-entry-partner-for]')) {
    setHidden(field, !ticked.has(field.getAttribute('data-entry-partner-for')));
  }
}

function showStage(root, stage, scroll) {
  const effective = stage === 'review' ? 'review' : 'details';
  const shell = root.parentElement || root;

  let active = null;
  for (const panel of root.querySelectorAll('[data-entry-stage]')) {
    const current = panel.getAttribute('data-entry-stage') === effective;
    setHidden(panel, !current);
    if (current) active = panel;
  }
  for (const controls of root.querySelectorAll('[data-entry-wizard-controls]')) {
    setHidden(controls, controls.getAttribute('data-entry-wizard-controls') !== effective);
  }

  // One forward action per stage on the total bar too: pricing belongs to the
  // stage where events are chosen, submitting to the stage that shows the
  // quote it commits to.
  const quote = root.querySelector('[data-entry-bar-quote]');
  const submit = root.querySelector('[data-entry-bar-submit]');
  if (quote) setHidden(quote, effective !== 'details');
  if (submit) setHidden(submit, effective !== 'review');

  const nav = shell.querySelector('[data-entry-stage-nav]');
  if (nav) {
    setHidden(nav, false);
    let done = true;
    for (const item of nav.querySelectorAll('[data-entry-stage-item]')) {
      const current = item.getAttribute('data-entry-stage-item') === effective;
      if (current) done = false;
      if (current) item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
      const number = item.querySelector('[data-entry-stage-number]');
      if (number) {
        number.classList.remove(...STAGE_DONE, ...STAGE_ACTIVE);
        number.classList.add(...(current ? STAGE_ACTIVE : done ? STAGE_DONE : []));
      }
    }
  }

  root.dataset.entryStage = effective;
  if (scroll && active) {
    if (typeof active.scrollIntoView === 'function') active.scrollIntoView({ block: 'start', behavior: 'smooth' });
    const heading = active.querySelector('h2, h3');
    if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
  }
}

/** The details stage's own validity, checked before it is hidden. */
function detailsAreValid(root) {
  const stage = root.querySelector('[data-entry-stage="details"]');
  if (!stage) return true;
  for (const field of stage.querySelectorAll('input, select, textarea')) {
    if (field.hidden || field.closest('[hidden]')) continue;
    if (typeof field.reportValidity === 'function' && !field.reportValidity()) return false;
  }
  return true;
}

function valuesFor(form) {
  const result = {};
  for (const field of form.elements) {
    if (!field.name || !DRAFT_FIELDS.has(field.name) && !field.name.startsWith('partner:')) continue;
    if (field.type === 'submit' || field.type === 'button') continue;
    if (field.type === 'checkbox' && !field.checked) continue;
    if (!result[field.name]) result[field.name] = [];
    result[field.name].push(field.value);
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
  if (!raw) return;
  let saved;
  try {
    saved = JSON.parse(raw);
  } catch {
    return;
  }
  if (!saved || typeof saved !== 'object') return;
  const hasEcho = hasMeaningfulValues(form);
  const current = valuesFor(form);
  const keys = new Set([...Object.keys(saved), ...Object.keys(current)]);
  const different = [...keys].some(name => name !== 'acknowledged' && JSON.stringify(saved[name] ?? []) !== JSON.stringify(current[name] ?? []));
  if (hasEcho && !different) return;
  const applyDraft = () => {
    const remaining = Object.fromEntries(Object.entries(saved).map(([name, values]) => [name, Array.isArray(values) ? [...values] : []]));
    for (const field of form.elements) {
      if (!DRAFT_FIELDS.has(field.name) && !field.name.startsWith('partner:')) continue;
      const values = remaining[field.name] ?? [];
      if (field.type === 'checkbox') field.checked = values.includes(field.value);
      else if (Object.prototype.hasOwnProperty.call(remaining, field.name)) field.value = values.shift() ?? '';
    }
    const review = form.querySelector('input[name="reviewedQuote"]');
    if (review) review.value = '';
    const consent = form.querySelector('input[name="acknowledged"]');
    if (consent) consent.checked = false;
    root.dataset.entryInitialStage = 'details';
    syncPartnerFields(root);
    renderReview(root);
    showStage(root, 'details', true);
  };
  if (!hasEcho) applyDraft();
  const notice = document.createElement('p');
  notice.className = 'text-sm text-muted-foreground';
  notice.setAttribute('role', 'status');
  notice.textContent = hasEcho ? 'A different saved entry draft is available on this device.' : 'Your saved entry draft was restored on this device.';
  if (hasEcho) {
    const restore = document.createElement('button');
    restore.type = 'button';
    restore.className = 'ml-2 text-accent underline underline-offset-4';
    restore.textContent = 'Restore saved draft';
    restore.addEventListener('click', () => { applyDraft(); notice.remove(); });
    notice.append(restore);
  }
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

/** One `<dt>`/`<dd>` pair on the review summary. */
function addRow(list, term, build) {
  const dt = document.createElement('dt');
  dt.className = 'text-xs text-muted-foreground';
  dt.textContent = term;
  const dd = document.createElement('dd');
  dd.className = 'font-medium text-foreground';
  build(dd);
  list.append(dt, dd);
}

/** The review summary: who is being entered, into what, with whom. */
function renderReview(root) {
  const summary = root.querySelector('[data-entry-review-summary]');
  if (!summary) return;
  while (summary.firstChild) summary.removeChild(summary.firstChild);

  const list = document.createElement('dl');
  list.className = 'grid gap-2 sm:grid-cols-[10rem_minmax(0,1fr)]';
  const blocks = [...root.querySelectorAll('[data-entry-player-block]')];
  const sources = blocks.length > 0 ? blocks : [root];

  let entered = 0;
  sources.forEach((block, index) => {
    const nameField = block.querySelector('input[name="playerName"]');
    const name = (nameField?.value ?? '').trim();
    const selected = [...block.querySelectorAll('input[name="events"]:checked')];
    if (name === '' && selected.length === 0) return;
    entered += 1;

    addRow(list, name === '' ? `Player ${index + 1}` : 'Player', (dd) => {
      dd.className = 'flex flex-wrap gap-x-2 font-medium text-foreground';
      dd.appendChild(createPersonRef(document, {
        slug: '',
        identity: name === '' ? null : { id: null, name },
        state: 'dead',
        label: name === '' ? 'No name entered' : undefined,
      }));
    });

    addRow(list, 'Events', (dd) => {
      dd.textContent = selected
        .map((field) => field.closest('label')?.textContent?.replace(/\s+/g, ' ').trim() || field.value)
        .join(', ') || 'No events selected';
    });

    const partners = [...block.querySelectorAll('[data-entry-partner-for]')]
      .filter((field) => !field.hidden)
      .map((field) => field.querySelector('input')?.value.trim())
      .filter((value) => value);
    if (partners.length > 0) {
      addRow(list, 'Partner invitations', (dd) => {
        dd.textContent = partners.join(', ');
      });
    }
  });

  if (entered === 0) {
    addRow(list, 'Players', (dd) => {
      dd.textContent = 'Nothing entered yet.';
    });
  }
  summary.append(list);
}

/** Guard the submission against a second local click. */
function guardSubmit(root) {
  root.addEventListener('submit', (event) => {
    saveDraft(root);
    const submitter = event.submitter;
    // The quote round trip and "Add another player" are ordinary round
    // trips: they come straight back to this page and must stay pressable.
    if (submitter && submitter.hasAttribute('formaction')) return;
    if (root.dataset.entrySubmitting === 'true') {
      event.preventDefault();
      return;
    }
    root.dataset.entrySubmitting = 'true';
    // After the browser has serialised the form: a disabled control is not
    // submitted, and this one may still be the submitter.
    window.setTimeout(() => {
      for (const button of root.querySelectorAll('[data-entry-bar-submit] button')) {
        button.disabled = true;
        button.textContent = 'Submitting…';
      }
    }, 0);
  });

  window.addEventListener('pageshow', () => {
    delete root.dataset.entrySubmitting;
    for (const button of root.querySelectorAll('[data-entry-bar-submit] button')) {
      button.disabled = false;
      if (button.textContent === 'Submitting…') button.textContent = 'Submit entry';
    }
  });
}

export function initEntryWizard(root = document.querySelector('[data-entry-wizard]')) {
  if (!root || root.dataset.entryWizardReady === 'true') return;
  root.dataset.entryWizardReady = 'true';
  const form = root;

  restoreDraft(form, root);
  syncPartnerFields(root);
  renderReview(root);
  showStage(root, root.dataset.entryInitialStage || 'details', false);

  const shell = root.parentElement || root;
  shell.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('[data-wizard-next]')) {
      event.preventDefault();
      if (!detailsAreValid(root)) return;
      const quoteButton = root.querySelector('[data-entry-bar-quote] button');
      if (quoteButton) form.requestSubmit(quoteButton);
      return;
    }
    if (target?.closest('[data-wizard-back]')) {
      event.preventDefault();
      showStage(root, 'details', true);
    }
  });

  let timer;
  root.addEventListener('input', () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => saveDraft(form), 250);
  });
  root.addEventListener('change', (event) => {
    syncPartnerFields(root);
    if (selectionChanged(event.target)) markQuoteStale(root);
    saveDraft(form);
  });
  guardSubmit(root);
}

if (typeof document !== 'undefined') initEntryWizard();
