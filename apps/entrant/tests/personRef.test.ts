import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { PersonRef } from '../app/components/PersonRef';
import {
  createPersonRef,
  formatPersonIdentity,
  personHref,
  personRefModel,
} from '../public/assets/person-ref.js';

const IDENTITY = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'An Se-young',
};

describe('PersonRef', () => {
  it('routes resolved identity only by its persisted id', () => {
    const html = renderToStaticMarkup(
      h(PersonRef, { slug: 'korea-masters', identity: IDENTITY }),
    );
    expect(html).toContain(
      'href="/e/korea-masters/players/11111111-1111-4111-8111-111111111111"',
    );
    expect(html).toContain('An Se-young');
    expect(personHref('korea-masters', IDENTITY)).not.toContain('An%20Se-young');
  });

  it('renders winner as the same link with weight, not a mark or container', () => {
    const html = renderToStaticMarkup(
      h(PersonRef, { slug: 'korea-masters', identity: IDENTITY, state: 'winner' }),
    );
    expect(html).toContain('<a');
    expect(html).toContain('font-[650]');
    expect(html).not.toMatch(/badge|pill|rounded-full|status-live/);
  });

  it.each([
    ['explicit dead', IDENTITY, 'dead', null],
    ['missing id', { ...IDENTITY, id: null }, 'resolved', null],
    ['bye', null, 'dead', 'Bye'],
    ['feeder', null, 'dead', 'Winner of QF 2'],
  ] as const)('%s is plain text with no link', (_case, identity, state, label) => {
    const html = renderToStaticMarkup(
      h(PersonRef, { slug: 'korea-masters', identity, state, label }),
    );
    expect(html).toContain('<span');
    expect(html).not.toContain('<a');
    expect(html).not.toContain('href=');
  });

  it('keeps the formatter a pass-through seam', () => {
    expect(formatPersonIdentity(IDENTITY)).toBe('An Se-young');
  });
});

describe('one shared link-target resolver (public-visual-fixes P2)', () => {
  it('addresses the same person in ANOTHER tournament by that tournament\'s own key', () => {
    // A profile history row is a slug + the person key that workspace
    // issued. It routes through the SAME resolver an in-page name uses, so
    // there is one URL shape on the tier and no second anchor renderer.
    expect(personHref('taipei-open', { id: 'other-key', name: 'An Se-young' })).toBe(
      '/e/taipei-open/players/other-key',
    );
    expect(personRefModel({ slug: 'taipei-open', identity: { id: 'other-key', name: 'An Se-young' } }).href).toBe(
      personHref('taipei-open', { id: 'other-key', name: 'An Se-young' }),
    );
  });

  it('never derives a target from a name', () => {
    // No id, no link — whatever the name is. This is the rule that keeps a
    // cross-tournament match from ever being a string comparison.
    expect(personHref('taipei-open', { id: null, name: 'An Se-young' })).toBeNull();
    expect(personHref('', IDENTITY)).toBeNull();
  });
});

describe('browser PersonRef adapter', () => {
  function documentDouble() {
    return {
      createElement(tagName: string) {
        return {
          tagName: tagName.toUpperCase(),
          className: '',
          textContent: '',
          href: undefined as string | undefined,
          dataset: {} as Record<string, string>,
        };
      },
    } as unknown as Document;
  }

  it('uses the same resolved/dead route decision as SSR', () => {
    const doc = documentDouble();
    const link = createPersonRef(doc, { slug: 'korea-masters', identity: IDENTITY });
    expect(link.tagName).toBe('A');
    expect((link as HTMLAnchorElement).href).toBe(personHref('korea-masters', IDENTITY));

    const dead = createPersonRef(doc, {
      slug: 'korea-masters',
      identity: { ...IDENTITY, id: null },
    });
    expect(dead.tagName).toBe('SPAN');
    expect(dead).not.toHaveProperty('href', expect.any(String));
  });
});
