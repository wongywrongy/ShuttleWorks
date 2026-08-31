/**
 * The Overview rail's rows — phase-agnostic facts about the workspace that
 * stay true whatever the lifecycle is doing (SP-UI-1 3d).
 *
 * Pure: takes the summary plus the one piece of state the Overview fetches
 * (whether a public display link exists) and returns rows. Every row links to
 * the surface that OWNS the fact, so the rail is a set of doors, not a
 * read-only stat block.
 *
 * Deliberately excluded: "last backup". It would need a second list fetch on
 * every workspace landing to render a glance-only fact — logged as debt rather
 * than paid for. See docs/reference/debt-log.md.
 */
import type { TournamentSummaryDTO } from '../../../api/dto';

export interface RailRow {
  key: string;
  label: string;
  value: string;
  /** Attention-toned when the value is a gap the operator may want to close. */
  tone?: 'muted' | 'warning';
  /** Canonical route beneath /tournaments/:id. */
  path: string;
  /** Verb shown instead of the value when there is nothing to state yet. */
  actionLabel?: string;
}

/** `2026-10-01` → `Oct 1, 2026`. Parsed from parts so a date-only string never
 *  drifts a day across timezones (same rule as the shell identity bar). */
export function formatEventDate(iso: string | null): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** `displayShared`: true = a public link exists, false = none, null = unknown
 *  (not yet loaded, or the caller lacks permission to see it). */
export function buildRailRows(
  summary: TournamentSummaryDTO | null,
  displayShared: boolean | null,
): RailRow[] {
  if (!summary) return [];
  const rows: RailRow[] = [];

  const date = formatEventDate(summary.tournamentDate);
  rows.push({
    key: 'date',
    label: 'Event date',
    value: date ?? 'Not set',
    tone: date ? undefined : 'warning',
    path: 'setup/dates',
    actionLabel: date ? undefined : 'Set date',
  });

  rows.push({
    key: 'display',
    label: 'Public display',
    // "Live link" named the OBJECT the row links to, so the rail read
    // "Public display: Live link" — a label and its own synonym, stating
    // nothing. The row answers whether the display is shared (OV-2); the
    // link itself lives on Sharing, which is where this row goes.
    value:
      displayShared === null ? '–' : displayShared ? 'Active' : 'Not shared',
    tone: displayShared ? undefined : 'muted',
    path: 'publish/displays',
  });

  const collab = summary.signals?.collaboration;
  if (collab) {
    const invites = collab.activeInviteCount;
    rows.push({
      key: 'collaborators',
      // The row names the workspace surface it links to (Members), and the
      // value is the count alone — "Collaborators: 1 member" said the same
      // noun twice (OV-3).
      label: 'Team',
      value: `${collab.memberCount}` + (invites > 0 ? ` · ${invites} invited` : ''),
      path: 'administration/team',
    });
  }

  return rows;
}
