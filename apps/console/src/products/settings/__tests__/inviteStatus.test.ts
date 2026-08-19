import { describe, it, expect } from 'vitest';
import { inviteStatus } from '../inviteStatus';
import type { InviteSummaryDTO } from '../../../api/dto';

const base: InviteSummaryDTO = {
  token: 't',
  tournamentId: 'x',
  role: 'operator',
  createdAt: '',
  expiresAt: null,
  revokedAt: null,
  valid: true,
};
const NOW = 1_000_000_000;

describe('inviteStatus', () => {
  it('revoked when revokedAt is set (wins over everything)', () => {
    expect(inviteStatus({ ...base, revokedAt: '2020-01-01T00:00:00Z' }, NOW)).toBe('revoked');
  });
  it('expired when expiresAt is in the past and not revoked', () => {
    expect(inviteStatus({ ...base, expiresAt: new Date(NOW - 1000).toISOString() }, NOW)).toBe(
      'expired',
    );
  });
  it('active when valid with no expiry or a future expiry', () => {
    expect(inviteStatus(base, NOW)).toBe('active');
    expect(
      inviteStatus({ ...base, expiresAt: new Date(NOW + 100000).toISOString() }, NOW),
    ).toBe('active');
  });
  it('inactive when not valid, not revoked, not expired', () => {
    expect(inviteStatus({ ...base, valid: false }, NOW)).toBe('inactive');
  });
});
