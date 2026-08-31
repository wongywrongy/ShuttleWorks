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
    expect(html).toContain('fresh confirmation link has been sent');
    expect(html).toContain('your saved entries are unchanged');
    expect(html).toContain('href="/e/me/entries"');
  });
});

describe('password reset recovery', () => {
  const token = 'reset_token_AbC-123';
  const next = '/e/spring-open/enter';

  it('keeps a valid token and destination after password-policy validation', async () => {
    const { html } = await render(
      `/e/reset/password-failed?token=${token}&next=${encodeURIComponent(next)}`,
    );
    expect(html).toContain('password does not meet the requirements');
    expect(html).toContain('Your reset link is still valid');
    expect(html).toContain(`name="token" value="${token}"`);
    expect(html).toContain(`name="next" value="${next}"`);
    expect(html).not.toContain('reset link is no longer usable');
  });

  it('distinguishes an invalid token and preserves recovery context', async () => {
    const { html } = await render(
      `/e/reset/failed?next=${encodeURIComponent(next)}`,
    );
    expect(html).toContain('reset link is no longer usable');
    expect(html).toContain('no password was changed');
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
