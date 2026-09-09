const text = (value) => `button:text-is(${JSON.stringify(value)})`;
const named = (value) => `[aria-label=${JSON.stringify(value)}]`;
const step = (caption, selector, expected = 'body', position) => [caption, selector, expected, position];

// Snapshot every control, including disabled actions and native select options,
// so the manifest can distinguish a reviewed state from an unavailable action.
export async function inventoryControls(page) {
  return page.locator('button, summary, select, input[type="checkbox"], [role="tab"], [role="radio"], [role="switch"], [role="option"], [role="menuitemcheckbox"]').evaluateAll(elements => elements.filter(element => element.getBoundingClientRect().width > 2 && element.getBoundingClientRect().height > 2).map(element => {
    const label = element.getAttribute('aria-label');
    const testId = element.getAttribute('data-testid');
    const content = (element.textContent ?? '').trim();
    const role = element.getAttribute('role');
    const groupLabel = element.closest('[role="radiogroup"]')?.getAttribute('aria-label');
    const associatedLabel = element.labels?.[0]?.textContent?.trim();
    let selector = testId ? `[data-testid=${JSON.stringify(testId)}]` : label ? `[aria-label=${JSON.stringify(label)}]` : element.tagName === 'SELECT' && element.id ? `#${CSS.escape(element.id)}` : content ? `${role ? `[role=${JSON.stringify(role)}]` : element.tagName.toLowerCase()}:${['option', 'menuitemcheckbox'].includes(role) ? 'has-text' : 'text-is'}(${JSON.stringify(content)})` : element.id ? `#${CSS.escape(element.id)}` : associatedLabel ? `label:has-text(${JSON.stringify(associatedLabel)}) input[type="checkbox"]` : null;
    if (groupLabel && selector) selector = `[role="radiogroup"][aria-label=${JSON.stringify(groupLabel)}] ${selector}`;
    return { label: groupLabel ? `${groupLabel} · ${label || content}` : label || associatedLabel || content || element.tagName.toLowerCase(), selector, tag: element.tagName.toLowerCase(), role: element.getAttribute('role'), expanded: element.getAttribute('aria-expanded'), checked: element.getAttribute('aria-checked'), selected: element.getAttribute('aria-selected'), disabled: Boolean(element.disabled), options: element.tagName === 'SELECT' ? [...element.options].map(option => ({ value: option.value, label: option.label, disabled: option.disabled, selected: option.selected })) : undefined };
  }));
}

export function expandedRecipes(tier, surfaces, inventories = []) {
  const recipes = [];
  const add = (label, name, steps) => {
    const path = surfaces.find(surface => surface[0] === label)?.[1];
    if (path) recipes.push({ name: `${label} · ${name}`, path, steps });
  };
  if (tier === 'console') {
    add('Hub — workspace list', 'Workspace search', [
      ['Filter the workspace list', 'input[placeholder="Search or jump to…"]', 'body', undefined, { fill: 'Taipei' }],
      ['Clear the workspace filter', 'input[placeholder="Search or jump to…"]', 'body', undefined, { fill: '' }],
    ]);
    add('Meet · Team structure', 'Position reassignment picker', [step('Open the position player picker', 'button[aria-label^="Reassign "]', '[data-testid="picker-search"]')]);
    for (const label of ['Hub — workspace list', 'Hub — past workspaces', 'Hub — live workspaces']) {
      add(label, 'Selected workspace and side panel', [step('Click the workspace row', '[class~="cursor-pointer"]:has([data-testid="row-date"]) > span:first-child > span', '[data-testid="workspace-inspector"]')]);
    }
    add('Hub — workspace list', 'Delete confirmation', [step('Open workspace menu', named('More actions'), '[role="menu"]'), step('Review delete confirmation', '[role="menuitem"]:has-text("Delete")', '[role="dialog"]')]);
    add('Overview', 'Application status panel', [step('Open application status', named('App status'), '[aria-expanded="true"]')]);
    add('Overview', 'Workspace administration navigation', [step('Open workspace administration', named('Workspace administration'))]);
    add('Participants · Roster', 'Player side panel', [step('Select a roster player', '[data-testid^="roster-row-"]', '[data-testid="bracket-player-detail"]')]);
    add('Participants · Roster', 'Player action menu', [step('Open player actions', 'button[aria-label^="Actions for"]', '[role="menu"]')]);
    add('Participants · Roster', 'Inline player entry', [step('Open add player', text('Add player'), 'input[placeholder="New player name…"]')]);
    add('Participants · Roster', 'Bulk selection', [step('Select one player', 'input[aria-label^="Select "]:not([aria-label^="Select all"])')]);
    add('Bracket · Draws', 'New draw dialog', [step('Open new draw', text('New draw'), '[role="dialog"]')]);
    add('Bracket · Draw canvas', 'Inline score entry', [step('Open score entry', text('Enter score'), 'button:text-is("Cancel")')]);
    add('Bracket · Draw canvas', 'Canvas views and zoom', ['Mirrored','One-sided','Zoom in','Zoom out','Fit whole draw','Readable view','Reset view'].map(name => step(name, `button:is(:text-is(${JSON.stringify(name)}),[aria-label=${JSON.stringify(name)}])`)));
    add('Bracket · Matches', 'Status filters', ['Pending','Ready','Live','Done','All'].map(name => step(`Select ${name} matches`, `button:text-matches("^${name} ·")`)));
    add('Hub — workspace list', 'Workspace filters', ['Upcoming','Live','Past'].map(name => step(`Select ${name} workspaces`, `button:text-matches("^${name} ·")`)));
    add('Bracket · Matches', 'Contingency panel', [step('Open match contingency menu', 'button[aria-label^="Contingency for"]', '[role="menu"]'), step('Select walkover', '[data-testid^="bracket-match-menu-walkover-"]', '[data-testid="bracket-match-detail"]')]);
    add('Operations · Plan', 'Selected scheduled match', [step('Select a scheduled match', '[data-testid^="plan-queue-chip-"]', '[aria-label="Match detail"]')]);
    add('Operations · Plan', 'Plan settings', [step('Open plan settings', text('Plan settings'))]);
    add('Operations · Live day', 'Selected match tabs', [step('Select a queued match', '[data-testid^="run-queue-row-"]', '[aria-label="Match detail"]'), ...['Summary','Assignment','Result'].map(name => step(`Select ${name}`, `[role="tab"]:text-is(${JSON.stringify(name)})`, '[role="tab"][aria-selected="true"]'))]);
    add('Operations · Live day', 'Completed match disclosure', [step('Expand completed matches', '[data-testid="run-finished-toggle"]', '[data-testid="run-finished"][open]')]);
    add('Display · Board settings', 'Replace-link confirmation', [step('Review link replacement', named('Replace the venue board link'), '[aria-label="Confirm replacing the venue board link"]')]);
    add('Administration · Team', 'Member actions', [step('Open member actions', 'button[aria-label^="Actions for"]', '[role="menu"]')]);
    add('Administration · Backups', 'Restore confirmation', [step('Review restore', 'button[aria-label^="Restore backup"]', '[role="dialog"]')]);
    add('Administration · Backups', 'Backup contents', [step('Open backup menu', 'button[aria-label^="Backup "]', '[role="menu"]'), step('Inspect backup contents', '[data-testid^="backup-inspect-"]', '[role="dialog"]')]);
    add('Administration · Activity', 'Activity details', [step('Expand activity details', 'summary:text-is("Details")', 'details[open]')]);
    add('Bracket · Draw canvas', 'Mobile round navigation', [step('Move to the next round', named('Next round')), step('Return to the previous round', named('Previous round'))]);
    for (const recipe of recipes) {
      if (/ · (Inline score entry|Canvas views and zoom)$/.test(recipe.name)) recipe.viewport = 'desktop';
      if (recipe.name.endsWith('Mobile round navigation')) recipe.viewport = 'mobile';
    }
    add('Meet · Participants roster', 'Selected player detail', [step('Select a Meet player', '[data-testid^="player-row-"]')]);
    add('Meet · Matches', 'Selected match and detail tabs', [step('Select a Meet match', '[data-testid^="match-row-"]', '[aria-label="Match detail"]'), ...['Summary','Assignment','Result'].map(name => step(`Select ${name}`, `[role="tab"]:text-is(${JSON.stringify(name)})`, '[role="tab"][aria-selected="true"]'))]);
    for (const action of ['Delete']) add('Administration · Lifecycle', `${action} confirmation`, [step(`Review ${action.toLowerCase()}`, text(action), '[role="dialog"]')]);
  }
  const seen = new Set();
  for (const { label, path, viewport, controls } of inventories) {
    const recordFamilies = new Set();
    for (const control of controls) {
      if (!control.selector || control.disabled) continue;
      if (control.label.startsWith("Show this board ·")) continue;
      // Hundreds of players/matches reuse the same row-menu component. Keep
      // the full row inventory, but render each control pattern once per view.
      const family = /^(Actions for |Contingency for |Remove [A-Z])/.exec(control.label)?.[1];
      if (family && recordFamilies.has(family)) continue;
      if (family) recordFamilies.add(family);
      // Shared shell groups are captured on Overview; their selected destination
      // is already visible on every route's static sheet.
      if (/^(Show|Hide) .* links$/.test(control.label) && label !== 'Overview') continue;
      if (control.label === 'App status') continue;
      const key = `${new URL(path, "http://capture.invalid").pathname}|${viewport}|${control.selector}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const base = { name: `${label} · ${control.label}`, path, viewport };
      if (control.tag === 'summary' || control.expanded !== null) {
        recipes.push({ ...base, steps: [step(`Activate ${control.label}`, control.selector)] });
      } else if (['Columns','Add court','Add session','Add contact','Add break','Add team','Add group','New match','Change password','Bulk import','Add school','Workspace sections','Review entry'].includes(control.label) || control.label.startsWith('Continue to ') || /: Sort$|Sorted ascending|Sort players/.test(control.label)) {
        recipes.push({ ...base, steps: [step(`Open ${control.label}`, control.selector)] });
      } else if (control.tag === 'select' && !control.disabled) {
        const choices = (control.options ?? []).filter(option => !option.disabled && !option.selected);
        for (const option of choices.length > 12 ? choices.slice(0, 1) : choices) {
          if (!option.disabled && !option.selected) recipes.push({ ...base, name: `${base.name} · ${option.label}`, steps: [[`Select ${option.label}`, control.selector, 'body', undefined, { select: option.value }]] });
        }
      } else if ((control.role === 'switch' || control.tag === 'input') && /^(Setup|Bracket · Settings|Display · Board settings)/.test(label)) {
        recipes.push({ ...base, steps: [step(`Toggle ${control.label}`, control.selector)] });
      } else if (['option','menuitemcheckbox'].includes(control.role) && !label.startsWith('Administration · Lifecycle') && !/^Meet · (Participants roster|Team structure)/.test(label)) {
        const options = controls.filter(candidate => candidate.role === control.role);
        if (options.length <= 12 || options[0] === control) recipes.push({ ...base, steps: [step(`Select ${control.label}`, control.selector)] });
      } else if (control.role === 'tab' && control.selected !== 'true') {
        recipes.push({ ...base, steps: [step(`Select ${control.label}`, control.selector, `${control.selector}[aria-selected="true"]`)] });
      } else if (control.role === 'radio' && control.checked !== 'true' && !label.startsWith('Administration') && label !== 'Display · Board disabled') {
        recipes.push({ ...base, steps: [step(`Select ${control.label}`, control.selector, `${control.selector}[aria-checked="true"]`)] });
      }
    }
  }
  return recipes;
}
