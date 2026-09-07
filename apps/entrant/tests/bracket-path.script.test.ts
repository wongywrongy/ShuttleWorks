// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  applyPersonPath,
  includesPerson,
  mountBracketPath,
  personPathHref,
} from '../public/assets/bracket-path.js';

describe('public bracket path emphasis', () => {
  it('lights every node and brace carrying the stable person id', () => {
    const root = document.createElement('div');
    root.innerHTML = '<div data-person-ids="p1 p2"></div><div data-person-ids="p2"></div><div data-person-ids="p3"></div>';
    applyPersonPath(root, 'p2');
    expect(root.classList.contains('has-person-path')).toBe(true);
    expect([...root.querySelectorAll('.is-person-path')]).toHaveLength(2);
  });

  it('matches complete ids rather than substrings', () => {
    const node = document.createElement('div');
    node.dataset.personIds = 'person-10 person-2';
    expect(includesPerson(node, 'person-1')).toBe(false);
  });

  it('clears the route when no person is active', () => {
    const root = document.createElement('div');
    root.innerHTML = '<div class="is-person-path" data-person-ids="p1"></div>';
    root.className = 'has-person-path';
    applyPersonPath(root, '');
    expect(root.className).toBe('');
    expect(root.querySelector('.is-person-path')).toBeNull();
  });
});

// ---------------------------------------------------------------------
// public-visual-fixes P4 — persistent in-place selection, and the one rule
// that keeps a name a link: a plain activation selects a path ONLY in the
// explicit "Highlight path" mode, and never takes a modified click.
// ---------------------------------------------------------------------

/** The server's markup, trimmed to what this script touches. */
function bracket({ pinned = '' } = {}) {
  document.body.innerHTML = `
    <section data-testid="public-bracket-canvas">
      <nav aria-label="Rounds">
        <a href="#draw-round-final" data-round-jump="draw-round-final">F</a>
      </nav>
      <div data-bracket-toolbar></div>
      <div data-bracket-scroll>
        <div data-bracket-grid${pinned ? ` data-pinned-person="${pinned}"` : ''}>
          <section id="draw-round-final" data-bracket-round="Final">
            <div data-node-key="f1" data-person-ids="p1 p2">
              <a href="/e/spring-open/players/p1" data-person-id="p1">Ada Lovelace</a>
              <a href="/e/spring-open/players/p2" data-person-id="p2">Grace Hopper</a>
            </div>
          </section>
          <span class="bracket-link-slot" data-person-ids="p1"></span>
        </div>
      </div>
    </section>`;
  const root = document.querySelector('[data-bracket-grid]') as HTMLElement;
  mountBracketPath(root);
  return root;
}

const toolbarButton = (label: string) =>
  [...document.querySelectorAll('[data-bracket-toolbar] button')].find(
    (node) => node.textContent === label,
  ) as HTMLButtonElement;

describe('the Highlight path mode (§4.3, P4)', () => {
  it('builds its controls only where the script runs — never a dead SSR control', () => {
    document.body.innerHTML = '<div data-bracket-toolbar></div>';
    expect(document.querySelector('[data-bracket-toolbar]')?.children.length).toBe(0);
    bracket();
    expect(toolbarButton('Highlight path')).toBeTruthy();
    expect(toolbarButton('Highlight path').getAttribute('aria-pressed')).toBe('false');
  });

  it('leaves a plain name activation alone until the mode is turned on', () => {
    const root = bracket();
    const name = root.querySelector('[data-person-id="p1"]') as HTMLAnchorElement;
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    name.dispatchEvent(event);
    // Not prevented: the browser follows the href to the profile.
    expect(event.defaultPrevented).toBe(false);
    expect(root.classList.contains('has-person-path')).toBe(false);
  });

  it('selects the path IN PLACE once the mode is on, and keeps the profile one click away', () => {
    const root = bracket();
    toolbarButton('Highlight path').click();
    expect(toolbarButton('Highlight path').getAttribute('aria-pressed')).toBe('true');

    const name = root.querySelector('[data-person-id="p1"]') as HTMLAnchorElement;
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    name.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true); // no navigation, no reload
    expect(root.classList.contains('has-person-path')).toBe(true);
    expect([...root.querySelectorAll('.is-person-path')]).toHaveLength(2);

    const profile = document.querySelector(
      '[data-bracket-toolbar] a',
    ) as HTMLAnchorElement;
    expect(profile.hidden).toBe(false);
    expect(profile.getAttribute('href')).toBe('/e/spring-open/players/p1');
  });

  it('never takes a modified click — new tab still opens the profile', () => {
    const root = bracket();
    toolbarButton('Highlight path').click();
    const name = root.querySelector('[data-person-id="p1"]') as HTMLAnchorElement;
    for (const modifier of ['metaKey', 'ctrlKey', 'shiftKey', 'altKey'] as const) {
      const event = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        button: 0,
        [modifier]: true,
      });
      name.dispatchEvent(event);
      expect(event.defaultPrevented, modifier).toBe(false);
    }
  });

  it('holds the selection through hover — the path is not a hover state', () => {
    const root = bracket();
    toolbarButton('Highlight path').click();
    (root.querySelector('[data-person-id="p1"]') as HTMLElement).dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
    );
    const other = root.querySelector('[data-person-id="p2"]') as HTMLElement;
    other.dispatchEvent(new Event('pointerover', { bubbles: true }));
    // Still p1's path: the brace that carries only p1 stays lit.
    expect(
      (document.querySelector('.bracket-link-slot') as HTMLElement).classList.contains(
        'is-person-path',
      ),
    ).toBe(true);
  });

  it('offers a clear reset, by button and by Escape', () => {
    const root = bracket({ pinned: 'p1' });
    expect(root.classList.contains('has-person-path')).toBe(true);
    const clear = toolbarButton('Clear path');
    expect(clear.hidden).toBe(false);
    clear.click();
    expect(root.classList.contains('has-person-path')).toBe(false);

    const again = bracket({ pinned: 'p1' });
    again.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(again.classList.contains('has-person-path')).toBe(false);
  });

  it('writes the selection back as the same URL the no-JS fallback uses', () => {
    expect(personPathHref('/e/spring-open/draws/MS?segment=MAIN', 'p1')).toBe(
      '/e/spring-open/draws/MS?segment=MAIN&view=path&player=p1',
    );
    // An existing selection is replaced, never appended twice.
    expect(personPathHref('/e/spring-open/draws/MS?view=path&player=p9', 'p1')).toBe(
      '/e/spring-open/draws/MS?view=path&player=p1',
    );
  });
});

describe('the round controls', () => {
  it('scroll the bracket region in place instead of pushing a #hash', () => {
    bracket();
    const jump = document.querySelector('[data-round-jump]') as HTMLAnchorElement;
    const scroller = document.querySelector('[data-bracket-scroll]') as HTMLElement;
    let scrolled = false;
    (scroller as unknown as { scrollBy: () => void }).scrollBy = () => {
      scrolled = true;
    };
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    jump.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(scrolled).toBe(true);
    expect(jump.getAttribute('aria-current')).toBe('true');
  });

  it('keeps working as a native anchor when the click is modified', () => {
    bracket();
    const jump = document.querySelector('[data-round-jump]') as HTMLAnchorElement;
    const event = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      button: 0,
      ctrlKey: true,
    });
    jump.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});
