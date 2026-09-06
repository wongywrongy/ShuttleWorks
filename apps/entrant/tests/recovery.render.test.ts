import { afterAll, describe, expect, it } from 'vitest';
import { createServer } from 'vite';
import { createRequestHandler, type ServerBuild } from 'react-router';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
afterAll(() => vite.close());

async function render(path: string, headers: HeadersInit = {}) {
  const build = (await vite.ssrLoadModule(
    'virtual:react-router/server-build',
  )) as unknown as ServerBuild;
  const response = await createRequestHandler(build, 'development')(
    new Request(`http://entrant.test${path}`, { headers }),
  );
  return { response, html: await response.text() };
}

describe('email confirmation recovery', () => {
  it('asks a signed-out visitor to sign in and return before resending', async () => {
    const { html } = await render('/e/verify/failed');
    expect(html).toContain('Your saved entries are unchanged');
    expect(html).toContain('href="/e/login?next=/e/verify/failed"');
    expect(html).not.toContain('action="/e/account/resend-verification"');
  });

  it('offers the account-scoped resend form to a session-bearing visitor', async () => {
    const { html } = await render('/e/verify/failed', {
      cookie: 'sw_play_session=opaque-session-handle',
    });
    expect(html).toContain('action="/e/account/resend-verification"');
    expect(html).toContain('Send a new confirmation email');
    expect(html).toMatch(/name="_csrf" value="[0-9a-f]{64}"/);
  });

  it('confirms a resend without losing the entries destination', async () => {
    const { html } = await render('/e/verify/sent');
    expect(html).toContain('Confirmation email sent');
    expect(html).toContain('Open the latest email');
    expect(html).toContain('href="/e/me/entries"');
  });

  it('tells a signed-in visitor the resend actually failed, with a retry action', async () => {
    const { html } = await render('/e/verify/sent?ok=0', {
      cookie: 'sw_play_session=opaque-session-handle',
    });
    expect(html).toContain('We could not send the email');
    expect(html).not.toContain('Confirmation email sent');
    expect(html).toContain('action="/e/account/resend-verification"');
    expect(html).toContain('Try again');
  });

  it('offers the resend control directly to a signed-in visitor with no token', async () => {
    // V3-PE25.1: a signed-in visitor who lost the confirmation link's query
    // string resends right here instead of being routed through sign-in
    // again to reach a control this page can show directly.
    const { html } = await render('/e/verify', {
      cookie: 'sw_play_session=opaque-session-handle',
    });
    expect(html).toContain('action="/e/account/resend-verification"');
    expect(html).toContain('Send a new confirmation email');
  });

  it('sends a signed-out visitor through sign-in instead', async () => {
    const { html } = await render('/e/verify');
    expect(html).not.toContain('action="/e/account/resend-verification"');
    expect(html).toContain('href="/e/login"');
  });
});

describe('password reset recovery', () => {
  const token = 'reset_token_AbC-123';
  const next = '/e/spring-open/enter';

  it('keeps a valid token and destination after password-policy validation', async () => {
    const { html } = await render(
      `/e/reset/password-failed?token=${token}&next=${encodeURIComponent(next)}`,
    );
    // V3-PE34.1: the specific rejection sits beside the field, wired by
    // `aria-describedby`, rather than repeating the general requirements in
    // the banner above the form.
    expect(html).toContain('Your reset link is still valid');
    expect(html).toMatch(/aria-describedby="reset-password-error"/);
    expect(html).toContain('id="reset-password-error"');
    expect(html).toContain('too common or too short');
    // The persistent requirements helper is gone while the field-level error
    // is present — `TextField` swaps `hint` for `error`, never both.
    expect(html).not.toContain('At least 8 characters. Avoid common passwords.');
    expect(html).toContain(`name="token" value="${token}"`);
    expect(html).toContain(`name="next" value="${next}"`);
    expect(html).not.toContain('invalid or has expired');
  });

  it('shows the same password requirements before any submission', async () => {
    // The other half of PE34.1: the requirements are visible before a
    // failure too, not only discoverable by triggering the error.
    const { html } = await render(`/e/reset?token=${token}`);
    expect(html).toContain('At least 8 characters. Avoid common passwords.');
    expect(html).toMatch(/aria-describedby="reset-password-hint"/);
  });

  it('distinguishes an invalid token and preserves recovery context', async () => {
    const { html } = await render(
      `/e/reset/failed?next=${encodeURIComponent(next)}`,
    );
    expect(html).toContain('This reset link is invalid or has expired');
    expect(html).toContain("Your password hasn&#x27;t changed");
    expect(html).toContain(`/e/forgot?next=${encodeURIComponent(next)}`);
  });

  it('returns a completed reset through sign-in to the interrupted entry', async () => {
    const { html } = await render(
      `/e/reset/done?next=${encodeURIComponent(next)}`,
    );
    expect(html).toContain('Sign in and continue');
    expect(html).toContain(`/e/login?next=${encodeURIComponent(next)}`);
  });
});
