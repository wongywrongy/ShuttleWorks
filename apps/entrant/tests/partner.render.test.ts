import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import PartnerInvitePage, { type PartnerLoaderData } from '../app/routes/partner';

const TOKEN = 'invite_AbC-123';

function renderInvite(signedIn = true) {
  const loaderData: PartnerLoaderData = {
    formCsrf: 'csrf-value',
    token: TOKEN,
    accepted: false,
    signedIn,
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

function renderDead() {
  const loaderData: PartnerLoaderData = {
    formCsrf: 'csrf-value',
    token: TOKEN,
    accepted: false,
    signedIn: true,
    failed: false,
    invite: null,
  };
  return renderToStaticMarkup(
    createElement(PartnerInvitePage, {
      loaderData,
      params: { token: TOKEN },
      matches: undefined as never,
    }),
  );
}

function renderFailed(reason: 'unverified' | 'unusable' | 'retry' | null) {
  const loaderData: PartnerLoaderData = {
    formCsrf: 'csrf-value',
    token: TOKEN,
    accepted: false,
    signedIn: true,
    failed: true,
    failureReason: reason,
    invite: null,
  };
  return renderToStaticMarkup(
    createElement(PartnerInvitePage, {
      loaderData,
      params: { token: TOKEN },
      matches: undefined as never,
    }),
  );
}

describe('partner invitation context', () => {
  it('shows inviter, event, and tournament before acceptance', () => {
    const html = renderInvite();
    expect(html).toContain('Ada Chen');
    expect(html).toContain('Invited by');
    expect(html).toContain('Mixed Doubles');
    expect(html).toContain('Spring Open');
    expect(html).toContain(`/e/api/partner-invites/${TOKEN}/accept`);
  });

  it('preserves the invitation through sign-in and account creation', () => {
    const html = renderInvite(false);
    expect(html).toContain(
      `href="/e/login?next=%2Fe%2Fpartner%2F${TOKEN}"`,
    );
    expect(html).toContain(`href="/e/signup?next=%2Fe%2Fpartner%2F${TOKEN}"`);
    expect(html).toContain('verified email address');
    expect(html).toContain('return to this page to complete your entry.');
  });
});

/** The action buttons wrap `class=` between `href=` and the closing `>`
 * (design-system `Button asChild`), so assertions match the href and the
 * label as separate substrings rather than one adjacent string. */
function hasAction(html: string, href: string, label: string): boolean {
  const re = new RegExp(
    `<a href="${href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>${label}</a>`,
  );
  return re.test(html);
}

describe('a dead invite (V3-PE35.1)', () => {
  it('claims neither expiry nor acceptance, and offers a real next step', () => {
    const html = renderDead();
    expect(html).toContain('This invitation is unavailable. Ask your partner to send a new one.');
    // Not the old wording, which asserted a fact ("expire ... once") the
    // uniform 404 cannot actually distinguish.
    expect(html).not.toContain('Invitations expire');
    expect(hasAction(html, '/e/', 'Browse tournaments')).toBe(true);
    // Safe to check an already-accepted invitation without claiming that is
    // what happened.
    expect(hasAction(html, '/e/me/entries', 'Check My entries')).toBe(true);
  });
});

describe('a failed acceptance (V3-PE37.1)', () => {
  it('sends an unverified account to verification, not a generic sign-in', () => {
    const html = renderFailed('unverified');
    expect(html).toContain('Confirm your email address before accepting this invitation.');
    expect(hasAction(html, '/e/verify', 'Verify your email')).toBe(true);
    // The shared shell's own nav always carries a "Sign in" link (every
    // signed-out page on the tier), so the property this test owns is not
    // its absence but that it appears exactly once — the card renders no
    // SECOND, mismatched "Sign in" action alongside the verify link.
    expect(html.match(/>Sign in</g)).toHaveLength(1);
  });

  it('offers to retry the SAME invitation when the tournament is checked out', () => {
    const html = renderFailed('retry');
    expect(html).toContain('The tournament is temporarily unavailable for changes. Try again shortly.');
    expect(hasAction(html, `/e/partner/${TOKEN}`, 'Try again')).toBe(true);
  });

  it('does not offer sign-in as the fix for an unusable invitation', () => {
    const html = renderFailed('unusable');
    expect(html).toContain('This invitation is no longer usable. Ask the person who invited you to send a new one.');
    expect(hasAction(html, '/e/', 'Browse tournaments')).toBe(true);
    expect(hasAction(html, '/e/me/entries', 'Check My entries')).toBe(true);
  });
});
