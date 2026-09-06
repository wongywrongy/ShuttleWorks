// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

import { loadPartnerAccepted } from '../public/assets/partner-accepted.js';

function mount(entryId = 'entry-2') {
  document.body.innerHTML = '<h1 id="partner-accepted-title">Partner invitation update</h1><div id="details" />';
  const root = document.querySelector<HTMLElement>('#details')!;
  root.dataset.entryId = entryId;
  return root;
}

const entries = {
  tournaments: [
    { tournamentName: 'Other Open', events: [{ entryId: 'entry-1', discipline: 'Singles', player: { identity: { name: 'Wrong' } }, partner: { identity: { name: 'Wrong partner' } } }] },
    { tournamentName: 'Spring Open', events: [{ entryId: 'entry-2', discipline: 'Mixed Doubles', player: { identity: { name: 'Ada Chen' } }, partner: { identity: { name: 'Sam Ali' }, label: null } }] },
  ],
};

describe('accepted partner verification', () => {
  it('selects the exact entry id and reads identity names', async () => {
    const root = mount();
    await loadPartnerAccepted(root, vi.fn(async () => new Response(JSON.stringify(entries), { status: 200 })));
    expect(document.querySelector('#partner-accepted-title')?.textContent).toBe('Entry accepted');
    expect(root.textContent).toContain('Spring Open · Mixed Doubles: Ada Chen with Sam Ali.');
    expect(root.textContent).not.toContain('Wrong');
  });

  it('does not claim acceptance for unauthorized or missing records', async () => {
    const unauthorized = mount()!;
    await loadPartnerAccepted(unauthorized, vi.fn(async () => new Response('', { status: 401 })));
    expect(document.querySelector('#partner-accepted-title')?.textContent).toBe('Partner invitation update');
    expect(unauthorized.textContent).toContain('Sign in');

    const missing = mount('missing')!;
    await loadPartnerAccepted(missing, vi.fn(async () => new Response(JSON.stringify(entries), { status: 200 })));
    expect(document.querySelector('#partner-accepted-title')?.textContent).toBe('Partner invitation update');
    // V3-PE36.1: no success term ("accepted", "verified") for an unverified
    // outcome — the heading stays "update" and the body says only that the
    // outcome could not be confirmed.
    expect(missing.textContent).toContain("couldn't confirm whether your invitation was accepted");
  });

  it('never claims acceptance when there is no entry id to check at all (V3-PE36.1)', async () => {
    document.body.innerHTML = '<h1 id="partner-accepted-title">Partner invitation update</h1><div id="details" />';
    const root = document.querySelector<HTMLElement>('#details')!;
    await loadPartnerAccepted(root, vi.fn());
    expect(document.querySelector('#partner-accepted-title')?.textContent).toBe('Partner invitation update');
    expect(root.textContent).toContain("couldn't confirm whether your invitation was accepted");
  });
});
