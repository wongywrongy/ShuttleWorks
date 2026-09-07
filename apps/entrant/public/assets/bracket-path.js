/**
 * The public bracket's one page-scoped script (`entrants-filter.js` documents
 * the pattern: external ES module, no inline JS, no CSP change).
 *
 * It enhances a bracket that is already complete without it. The server
 * renders the whole tree, the round columns carry real `id`s that the round
 * controls are native anchors to, and a selected player's path is painted
 * server-side from `?player={id}` — so with scripting off every requirement
 * of match-card contract §4.3 still holds. This module adds three things on
 * top (public-visual-fixes P4):
 *
 * 1. **Persistent, in-place path selection.** Hover emphasis alone was
 *    unusable on touch and forgotten the moment the pointer moved. A
 *    selected path now stays selected until it is cleared, and hover is
 *    demoted to a preview that only runs while nothing is selected.
 * 2. **An explicit "Highlight path" mode**, which is the only state where a
 *    plain click on a name selects a path instead of opening the profile.
 *    The anchor keeps its real `href` throughout, so ctrl/cmd/middle-click
 *    and "open in new tab" still reach the profile, and the selected
 *    player's profile is one click away in the toolbar ("View profile").
 *    Outside that mode a name is a link and behaves like one.
 * 3. **In-region round jumps.** The controls already work as anchors; here
 *    they scroll the bracket's own scroll region smoothly instead of jumping
 *    the document and pushing a `#hash` onto the URL, and `?round=`/
 *    `?view=round` positions the region on arrival.
 *
 * The selection is written back to the URL (`?view=path&player={id}`) with
 * `replaceState`, so the state a reader can see is the state they can share —
 * and that same URL is the no-JavaScript fallback it was built from.
 */

export function includesPerson(node, personId) {
  return (node?.dataset?.personIds ?? '').split(/\s+/).includes(personId);
}

export function applyPersonPath(root, personId) {
  const active = Boolean(personId);
  root.classList.toggle('has-person-path', active);
  for (const node of root.querySelectorAll('[data-person-ids]')) {
    node.classList.toggle('is-person-path', active && includesPerson(node, personId));
  }
}

/**
 * V3-PE12.1: the found match gets scrolled into view, not just highlighted —
 * a spectator who just searched should not have to hunt across a wide
 * canvas for the one node that changed. Finds the first node on the pinned
 * person's path and centers it; a no-op where `scrollIntoView` is absent
 * (jsdom in tests) or nothing matched.
 */
export function scrollPinnedPersonIntoView(root, personId) {
  if (!personId) return;
  // `[data-node-key]` narrows to actual match slots — the connector braces
  // between rounds carry `data-person-ids` too, and scrolling to one of
  // those would land beside a match rather than on it.
  for (const node of root.querySelectorAll('[data-node-key][data-person-ids]')) {
    if (includesPerson(node, personId)) {
      if (typeof node.scrollIntoView === 'function') {
        node.scrollIntoView({ block: 'center', inline: 'center' });
      }
      return;
    }
  }
}

/**
 * The shareable URL for a selected path — the same one the "Find a player"
 * form and a `?view=path` link produce, so the state the script puts in the
 * address bar is a state the SERVER can render on its own.
 */
export function personPathHref(href, personId) {
  const url = new URL(href, 'http://bracket.invalid');
  url.searchParams.set('view', 'path');
  url.searchParams.set('player', personId);
  return `${url.pathname}${url.search}`;
}

/** Scroll one round column to the leading edge of the bracket's scroll
 *  region. Rect maths rather than `offsetLeft`, because the region is not
 *  necessarily the column's offset parent; a no-op in jsdom, where every
 *  rect is zero and `scrollBy` is absent. */
export function scrollRoundIntoView(scroller, column, behavior = 'smooth') {
  if (!scroller || !column || typeof scroller.scrollBy !== 'function') return;
  const left = column.getBoundingClientRect().left - scroller.getBoundingClientRect().left;
  scroller.scrollBy({ left, behavior });
}

/** A plain activation: the one click a script may take over. Every modified
 *  click — new tab, new window, middle button — belongs to the browser and
 *  to the anchor's real `href`. */
function plainActivation(event) {
  return (
    !event.defaultPrevented &&
    (event.button === undefined || event.button === 0) &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

const BUTTON_CLASS =
  'h-8 rounded-sm border border-rule-control bg-surface-raised px-2 text-sm font-semibold text-foreground hover:bg-surface-sunken';
const LINK_CLASS = 'text-sm text-accent underline-offset-4 hover:underline';

export function mountBracketPath(root) {
  const doc = root.ownerDocument ?? (typeof document !== 'undefined' ? document : null);
  if (!doc) return;
  const section = root.closest?.('[data-testid="public-bracket-canvas"]') ?? doc;
  const scroller = root.closest?.('[data-bracket-scroll]') ?? null;
  const toolbar = section.querySelector?.('[data-bracket-toolbar]') ?? null;

  /** The persistent selection — SSR's `?player={id}` to begin with. */
  let pinned = root.dataset.pinnedPerson ?? '';
  let pinnedHref = '';
  let highlight = false;

  applyPersonPath(root, pinned);
  scrollPinnedPersonIntoView(root, pinned);

  // ---- the toolbar (built here, so no-JS readers see no dead control) ----
  let toggle = null;
  let profileLink = null;
  let clearButton = null;

  function syncToolbar() {
    if (toggle) toggle.setAttribute('aria-pressed', highlight ? 'true' : 'false');
    if (clearButton) clearButton.hidden = pinned === '';
    if (profileLink) {
      profileLink.hidden = pinned === '' || pinnedHref === '';
      if (pinnedHref) profileLink.href = pinnedHref;
    }
  }

  function select(personId, href) {
    pinned = personId ?? '';
    pinnedHref = href ?? '';
    applyPersonPath(root, pinned);
    root.dataset.pinnedPerson = pinned;
    syncToolbar();
    if (pinned && typeof doc.defaultView?.history?.replaceState === 'function') {
      doc.defaultView.history.replaceState(
        null,
        '',
        personPathHref(doc.defaultView.location.href, pinned),
      );
    }
  }

  if (toolbar) {
    toggle = doc.createElement('button');
    toggle.type = 'button';
    toggle.className = BUTTON_CLASS;
    toggle.textContent = 'Highlight path';
    toggle.setAttribute('aria-pressed', 'false');
    toggle.addEventListener('click', () => {
      highlight = !highlight;
      syncToolbar();
    });

    profileLink = doc.createElement('a');
    profileLink.className = LINK_CLASS;
    profileLink.textContent = 'View profile';
    profileLink.hidden = true;

    clearButton = doc.createElement('button');
    clearButton.type = 'button';
    clearButton.className = LINK_CLASS;
    clearButton.textContent = 'Clear path';
    clearButton.hidden = true;
    clearButton.addEventListener('click', () => select('', ''));

    toolbar.append(toggle, profileLink, clearButton);
    syncToolbar();
  }

  // ---- selection: click, touch and keyboard (Enter fires a click) --------
  const personFrom = (target) => target?.closest?.('[data-person-id]') ?? null;
  root.addEventListener('click', (event) => {
    if (!highlight) return; // a name is a link; activating it opens the profile
    if (!plainActivation(event)) return; // the native href keeps new-tab behaviour
    const anchor = personFrom(event.target);
    if (!anchor) return;
    event.preventDefault();
    select(anchor.dataset.personId, anchor.getAttribute('href') ?? '');
  });
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && pinned) select('', '');
  });

  // ---- hover/focus preview, only while nothing is selected --------------
  const previewId = (target) => personFrom(target)?.dataset?.personId ?? '';
  root.addEventListener('pointerover', (event) => {
    if (pinned) return;
    const personId = previewId(event.target);
    if (personId) applyPersonPath(root, personId);
  });
  root.addEventListener('pointerout', (event) => {
    if (pinned) return;
    const from = previewId(event.target);
    const to = previewId(event.relatedTarget);
    if (from && from !== to) applyPersonPath(root, pinned);
  });
  root.addEventListener('focusin', (event) => {
    if (pinned) return;
    const personId = previewId(event.target);
    if (personId) applyPersonPath(root, personId);
  });
  root.addEventListener('focusout', (event) => {
    if (pinned) return;
    const from = previewId(event.target);
    const to = previewId(event.relatedTarget);
    if (from && from !== to) applyPersonPath(root, pinned);
  });

  // ---- round controls ---------------------------------------------------
  const jumps = [...(section.querySelectorAll?.('[data-round-jump]') ?? [])];
  for (const jump of jumps) {
    jump.addEventListener('click', (event) => {
      if (!plainActivation(event)) return;
      const column = doc.getElementById(jump.dataset.roundJump);
      if (!column) return;
      event.preventDefault();
      scrollRoundIntoView(scroller, column);
      for (const other of jumps) other.removeAttribute('aria-current');
      jump.setAttribute('aria-current', 'true');
    });
  }
  const initial = root.dataset.initialRound;
  if (initial) scrollRoundIntoView(scroller, doc.getElementById(initial), 'auto');
}

if (typeof document !== 'undefined') {
  for (const root of document.querySelectorAll('[data-bracket-grid]')) mountBracketPath(root);
}
