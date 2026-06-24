/**
 * Pure accessors over a workspace summary's server-computed `signals`
 * (SP-A / SP-C). Each falls back safely when `signals` is absent (older
 * payloads), so the Hub renders without it and lights up when present.
 */
import type { AttentionReasonDTO, TournamentSummaryDTO } from '../../api/dto';

export type WorkspaceHealth = 'good' | 'attention' | 'draft' | 'archived';

/** Health badge value — prefers `signals.health`, else derives from status. */
export function workspaceHealth(t: TournamentSummaryDTO): WorkspaceHealth {
  if (t.signals) return t.signals.health;
  if (t.status === 'archived') return 'archived';
  if (t.status === 'draft') return 'draft';
  return 'good';
}

/** Coded attention reasons; empty when none / no signals. */
export function attentionReasons(t: TournamentSummaryDTO): AttentionReasonDTO[] {
  return t.signals?.attention ?? [];
}

/** Whether the workspace needs operator attention. Prefers signals (health or
 *  any attention reason); falls back to the legacy owner-and-draft heuristic. */
export function needsAttention(t: TournamentSummaryDTO): boolean {
  if (t.signals) {
    return t.signals.health === 'attention' || t.signals.attention.length > 0;
  }
  return t.role === 'owner' && t.status === 'draft';
}

export interface Readiness {
  ready: number;
  total: number;
}

/** Setup readiness as ready/total over the per-kind checklist; null when no
 *  signals (or an empty checklist). */
export function readinessOf(t: TournamentSummaryDTO): Readiness | null {
  const setup = t.signals?.setup;
  if (!setup) return null;
  const keys = Object.keys(setup);
  if (keys.length === 0) return null;
  return { ready: keys.filter((k) => setup[k]).length, total: keys.length };
}

/** Enabled / available module counts; null when no signals. */
export function moduleCountsOf(
  t: TournamentSummaryDTO,
): { enabled: number; available: number } | null {
  if (!t.signals) return null;
  return { enabled: t.signals.modules.enabled, available: t.signals.modules.available };
}

/** Member + active-invite counts; null when no signals. */
export function collaborationOf(
  t: TournamentSummaryDTO,
): { memberCount: number; activeInviteCount: number } | null {
  return t.signals?.collaboration ?? null;
}
