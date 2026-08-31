import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { PersonRef } from '../app/components/PersonRef';
import {
  createPersonRef,
  formatPersonIdentity,
  personHref,
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
