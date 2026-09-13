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
 * and that same URL is the no-JavaScript fallback it was built from. Clearing
 * writes the URL back too (public-ui-refinement P4), so "Clear path" survives
 * a reload rather than lasting until the next refresh.
 *
 * **public-ui-refinement P4 (A05/D4)** adds two things: the selected SIDE ROW
 * of each match on the path is marked (`data-selected-side`, recomputed from
 * the same two id lists the server rendered it from), and a round jump lands
 * on a meaningful node — the selected player's match in that round, else the
 * round's first match — instead of on empty canvas beside a late round.
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
  applySideRows(root, personId);
}

/**
 * public-ui-refinement P4 (D4): WHICH side row of a match the selection is
 * standing on. The server writes the same `data-selected-side` from the same
 * two id lists, so the enhanced rendering and the no-JavaScript rendering are
 * the same document; this recomputes it in place when the selection changes.
 * The named anchor itself also gets a weight/underline cue, so selection is
 * never carried by colour alone.
 */
export function applySideRows(root, personId) {
  const active = Boolean(personId);
  for (const slot of root.querySelectorAll('[data-side-a-ids]')) {
    const side = !active
      ? ''
      : (slot.dataset.sideAIds ?? '').split(/\s+/).includes(personId)
        ? 'a'
        : (slot.dataset.sideBIds ?? '').split(/\s+/).includes(personId)
          ? 'b'
          : '';
    if (side) slot.dataset.selectedSide = side;
    else delete slot.dataset.selectedSide;
  }
  for (const ref of root.querySelectorAll('[data-person-id]')) {
    ref.classList.toggle('is-person-selected', active && ref.dataset.personId === personId);
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
  if (!personId) {
    // P4: "Clear path" restores the normal tree, and a reload has to restore
    // it too — leaving `?player=` behind meant the cleared state lasted only
    // until the reader refreshed or shared the link.
    url.searchParams.delete('player');
    if (url.searchParams.get('view') === 'path') url.searchParams.delete('view');
    return `${url.pathname}${url.search}`;
  }
  url.searchParams.set('view', 'path');
  url.searchParams.set('player', personId);
  return `${url.pathname}${url.search}`;
}

/** Scroll one round column to the leading edge of the bracket's scroll
 *  region. Rect maths rather than `offsetLeft`, because the region is not
 *  necessarily the column's offset parent; a no-op in jsdom, where every
 *  rect is zero and `scrollBy` is absent. */
export function scrollRoundIntoView(scroller, column, behavior = 'smooth', focus = null) {
  if (!scroller || !column || typeof scroller.scrollBy !== 'function') return;
  const region = scroller.getBoundingClientRect();
  const left = column.getBoundingClientRect().left - region.left;
  // A05: a late round is one node in a very tall column, so scrolling only
  // sideways landed the reader on empty canvas. `focus` is the meaningful
  // target in that column — the selected player's match when there is one,
  // the first match otherwise — and it is centred vertically at the same time.
  let top = 0;
  if (focus && typeof focus.getBoundingClientRect === 'function') {
    const rect = focus.getBoundingClientRect();
    if (rect.height || rect.top) {
      top = rect.top + rect.height / 2 - (region.top + region.height / 2);
    }
  }
  scroller.scrollBy({ left, top, behavior });
}

/** The node a round jump should land on: the selected player's match in that
 *  column when they have one, otherwise the column's first match. */
export function roundFocusNode(column, personId) {
  const nodes = [...(column?.querySelectorAll?.('[data-node-key][data-person-ids]') ?? [])];
  if (personId) {
    const own = nodes.find((node) => includesPerson(node, personId));
    if (own) return own;
  }
  return nodes[0] ?? null;
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
const LINK_CLASS = 'text-sm font-semibold text-accent underline-offset-4 hover:underline';
const MUTED_LINK_CLASS = 'text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline';
const SUMMARY_CLASS =
  'flex flex-wrap items-baseline gap-x-3 gap-y-1 border-s-2 border-action-primary bg-surface-sunken px-3 py-2 text-sm';

/** How many MATCH nodes (not braces) carry the selected person. */
function pathMatchCount(root, personId) {
  let count = 0;
  for (const node of root.querySelectorAll('[data-node-key][data-person-ids]')) {
    if (includesPerson(node, personId)) count += 1;
  }
  return count;
}

/**
 * The ONE path summary (refinement 2026-09-12, the S44 duplicate-clear
 * defect): `Path: name · N matches · View profile · Clear path`. The server
 * renders it for `?player={id}`; this keeps that same element in step with
 * an in-place selection — filling it, creating it in `[data-path-slot]`
 * when the page arrived with no selection, and removing it on clear. The
 * script never builds a second clear or a second profile link beside it.
 */
function renderSummary(doc, section, root, personId, name, href) {
  const slot = section.querySelector?.('[data-path-slot]') ?? null;
  let summary = section.querySelector?.('[data-path-summary]') ?? null;
  if (!personId) {
    if (summary) summary.remove();
    return;
  }
  if (!summary) {
    if (!slot) return;
    summary = doc.createElement('p');
    summary.setAttribute('data-path-summary', '');
    summary.setAttribute('role', 'status');
    summary.className = SUMMARY_CLASS;
    const lead = doc.createElement('span');
    lead.className = 'text-muted-foreground';
    lead.textContent = 'Path: ';
    const strong = doc.createElement('strong');
    strong.setAttribute('data-path-name', '');
    strong.className = 'font-semibold text-foreground';
    lead.appendChild(strong);
    const count = doc.createElement('span');
    count.setAttribute('data-path-count', '');
    count.className = 'tabular-nums text-muted-foreground';
    const profile = doc.createElement('a');
    profile.setAttribute('data-path-profile', '');
    profile.className = LINK_CLASS;
    profile.textContent = 'View profile';
    const clear = doc.createElement('a');
    clear.setAttribute('data-path-clear', '');
    clear.className = MUTED_LINK_CLASS;
    clear.textContent = 'Clear path';
    summary.append(lead, count, profile, clear);
    slot.appendChild(summary);
  }
  const nameEl = summary.querySelector('[data-path-name]');
  if (nameEl && name) nameEl.textContent = name;
  const countEl = summary.querySelector('[data-path-count]');
  if (countEl) {
    const n = pathMatchCount(root, personId);
    countEl.textContent = `${n} ${n === 1 ? 'match' : 'matches'}`;
  }
  const profile = summary.querySelector('[data-path-profile]');
  if (profile) {
    if (href) {
      profile.href = href;
      profile.hidden = false;
    } else if (!profile.getAttribute('href')) {
      profile.hidden = true;
    }
  }
  const clear = summary.querySelector('[data-path-clear]');
  if (clear && doc.defaultView?.location) {
    clear.href = personPathHref(doc.defaultView.location.href, '');
  }
}

export function mountBracketPath(root) {
  const doc = root.ownerDocument ?? (typeof document !== 'undefined' ? document : null);
  if (!doc) return;
  // The toolbar, the round controls and the path summary live in the page's
  // one toolbar ABOVE the canvas (refinement 2026-09-12), so the scope is
  // the document's main landmark rather than the canvas section.
  const section = root.closest?.('main') ?? doc;
  const scroller = root.closest?.('[data-bracket-scroll]') ?? null;
  const toolbar = section.querySelector?.('[data-bracket-toolbar]') ?? null;

  /** The persistent selection — SSR's `?player={id}` to begin with. */
  let pinned = root.dataset.pinnedPerson ?? '';
  let highlight = false;

  applyPersonPath(root, pinned);
  scrollPinnedPersonIntoView(root, pinned);

  // ---- the toolbar (built here, so no-JS readers see no dead control) ----
  let toggle = null;

  function syncToolbar() {
    if (toggle) toggle.setAttribute('aria-pressed', highlight ? 'true' : 'false');
  }

  /** The selected person's name and profile href, read off their own
   *  anchor in the tree — the identity seam wrote both. */
  function personFacts(personId) {
    const anchor = personId ? root.querySelector(`[data-person-id="${personId}"]`) : null;
    return {
      name: anchor?.textContent?.trim() ?? '',
      href: anchor?.getAttribute('href') ?? '',
    };
  }

  function select(personId, href) {
    pinned = personId ?? '';
    applyPersonPath(root, pinned);
    root.dataset.pinnedPerson = pinned;
    const facts = personFacts(pinned);
    renderSummary(doc, section, root, pinned, facts.name, href || facts.href);
    syncToolbar();
    if (typeof doc.defaultView?.history?.replaceState === 'function') {
      doc.defaultView.history.replaceState(
        null,
        '',
        personPathHref(doc.defaultView.location.href, pinned),
      );
    }
  }

  // Arriving pinned (`?player={id}`), the server has already rendered the
  // summary; this fills any field it could not (the live match count) and
  // creates the line only where a document arrived without one.
  if (pinned) {
    const facts = personFacts(pinned);
    renderSummary(doc, section, root, pinned, facts.name, facts.href);
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
    toolbar.append(toggle);
    syncToolbar();
  }

  // The SSR summary's clear is a real link (the no-JS reset); with the
  // script it clears in place instead of reloading the document. Listened
  // on the summary's own slot, so nothing outside it is ever intercepted.
  const pathSlot = section.querySelector?.('[data-path-slot]') ?? null;
  pathSlot?.addEventListener('click', (event) => {
    const clear = event.target?.closest?.('[data-path-clear]');
    if (!clear || !plainActivation(event)) return;
    event.preventDefault();
    select('', '');
  });

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
      // The selection is NOT cleared by moving round: the reader keeps the
      // player and lands on that player's match in the round they asked for.
      scrollRoundIntoView(scroller, column, 'smooth', roundFocusNode(column, pinned));
      for (const other of jumps) other.removeAttribute('aria-current');
      jump.setAttribute('aria-current', 'true');
    });
  }
  const initial = root.dataset.initialRound;
  if (initial) {
    const column = doc.getElementById(initial);
    scrollRoundIntoView(scroller, column, 'auto', roundFocusNode(column, pinned));
  }
}

if (typeof document !== 'undefined') {
  for (const root of document.querySelectorAll('[data-bracket-grid]')) mountBracketPath(root);
}
