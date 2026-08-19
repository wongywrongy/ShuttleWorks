import type { InviteSummaryDTO } from '../../api/dto';

export type InviteStatus = 'active' | 'revoked' | 'expired' | 'inactive';

/** Derive an invite's display status. `nowMs` is injected for determinism. */
export function inviteStatus(invite: InviteSummaryDTO, nowMs: number): InviteStatus {
  if (invite.revokedAt) return 'revoked';
  if (invite.expiresAt && new Date(invite.expiresAt).getTime() < nowMs) return 'expired';
  if (invite.valid) return 'active';
  return 'inactive';
}
