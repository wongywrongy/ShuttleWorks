import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import PartnerInvitePage, { type PartnerLoaderData } from '../app/routes/partner';

const TOKEN = 'invite_AbC-123';

function renderInvite() {
  const loaderData: PartnerLoaderData = {
    formCsrf: 'csrf-value',
    token: TOKEN,
    accepted: false,
    failed: false,
    invite: {
      tournamentName: 'Spring Open',
      slug: 'spring-open',
      eventCode: 'XD',
      discipline: 'Mixed Doubles',
      invitedBy: 'Ada Chen',
      askBirthYear: false,
    },
  };
  return renderToStaticMarkup(
    createElement(PartnerInvitePage, {
      loaderData,
      params: { token: TOKEN },
      // React Router's generated component props encode the full matched
      // route tuple. This focused static render supplies only the data the
      // component reads; keep the fixture honest without duplicating router
      // internals that are irrelevant to the invitation surface.
      matches: undefined as never,
    }),
  );
}

describe('partner invitation context', () => {
  it('shows inviter, event, and tournament before acceptance', () => {
    const html = renderInvite();
    expect(html).toMatch(/<span[^>]*person-ref[^>]*>Ada Chen<\/span> invited you to play/);
    expect(html).toContain('Mixed Doubles at Spring Open');
    expect(html).toContain(`/e/api/partner-invites/${TOKEN}/accept`);
  });

  it('preserves the invitation through sign-in and account creation', () => {
    const html = renderInvite();
    expect(html).toContain(
      `href="/e/login?next=%2Fe%2Fpartner%2F${TOKEN}"`,
    );
    expect(html).toContain(`href="/e/signup/partner/${TOKEN}"`);
    expect(html).toContain('You will return to this invitation.');
  });
});
