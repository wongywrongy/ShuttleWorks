/**
 * Position / player detail — the pane docked beside the roster grid, opened
 * by a grid cell or a pool row. It is a *position* view when a cell opened
 * it (a doubles cell has two occupants) and a single-player view when the
 * pool list did.
 *
 * All fields are per-player (school, availability, rest, events, notes) —
 * there is no position-level data — and every edit flows through
 * `updatePlayer` to the canonical roster record.
 *
 * WHAT CHANGED (console-IA §2, 2026-08-12):
 *  - The body was ten editable controls under one flat `flex flex-col gap-3`
 *    with no headings, each field re-typing its own `text-xs font-medium`
 *    label. It is now `DetailPanel.Section` groups in ONE order shared with
 *    Bracket's roster pane — Identity, Availability, Events, Notes — with
 *    `Row` from the settings grammar inside them. No label recipe is spelled
 *    out in this file any more.
 *  - A doubles position rendered that whole form TWICE, stacked, with nothing
 *    saying where one occupant ended and the next began (the densest thing in
 *    the app). Two occupants now get a seat switcher and one form at a time.
 *  - Unassigning moved HERE from the grid cell, behind the canon two-click
 *    arm (finding 1.1): 24 immediate `×` targets sat ~4px from the name
 *    buttons whose click means "just show me this".
 */
import { useState } from 'react';
import { Select } from '@scheduler/design-system/components';
import type { PlayerDTO, RosterGroupDTO } from '../../../api/dto';
import { useTournamentStore } from '../../../store/tournamentStore';
import {
  DetailPanel,
  formatWindowSummary,
} from '../../../components/control-plane';
import { Row } from '../../../platform/settings/SettingsControls';
import { useCanEdit } from '../../../hooks/useCanEdit';
import { useConfirmClick } from '../../../hooks/useConfirmClick';
import { READ_ONLY_MESSAGE } from '../../../platform/domain/permissions';
import { useRankAssignment } from './positionGrid/useRankAssignment';
import { PlayerAvailabilityField, PlayerEventsField } from './PlayerFields';

/* =========================================================================
 * DetailDrawer — Meet's consumer of the shared DetailPanel chrome.
 * ========================================================================= */
export function DetailDrawer({
  eyebrow,
  title,
  subtitle,
  mono = false,
  occupants,
  groups,
  emptyHint,
  rank,
  onClose,
}: {
  /** Uppercase context label, e.g. "Position" or "Player". */
  eyebrow: string;
  /** Primary heading — a rank ("MS1") or a player name. */
  title: string;
  /** Optional muted context after the title (e.g. the event label). */
  subtitle?: string;
  /** Render the title in the mono face (true for rank codes). */
  mono?: boolean;
  occupants: PlayerDTO[];
  groups: RosterGroupDTO[];
  /** Shown below the occupants when the position has open seats. */
  emptyHint?: string | null;
  /** Set when a POSITION opened the pane: enables "unassign from this rank". */
  rank?: string | null;
  onClose: () => void;
}) {
  const [seat, setSeat] = useState(0);
  // Clamped rather than reset in an effect: the occupant list changes under
  // this pane (unassign, displacement) and a stale index must never blank it.
  const index = Math.min(seat, Math.max(occupants.length - 1, 0));
  const active = occupants[index] ?? null;

  return (
    <DetailPanel
      variant="docked"
      label={eyebrow}
      value={title}
      sub={subtitle}
      mono={mono}
      onClose={onClose}
      testId="position-detail-drawer"
    >
      {occupants.length > 1 ? (
        <div
          role="tablist"
          aria-label="Seat"
          data-testid="seat-switcher"
          className="flex items-stretch gap-0.5 border-b border-border px-2"
        >
          {occupants.map((occ, i) => (
            <button
              key={occ.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              onClick={() => setSeat(i)}
              data-testid={`seat-tab-${i}`}
              className={[
                '-mb-px border-b-2 px-3 py-2 text-sm transition-colors duration-fast ease-brand',
                i === index
                  ? 'border-b-accent font-semibold text-foreground'
                  : 'border-b-transparent text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {occ.name || '(unnamed)'}
            </button>
          ))}
        </div>
      ) : null}

      {active ? (
        <PlayerDetailFields
          key={active.id}
          player={active}
          groups={groups}
          rank={rank ?? null}
        />
      ) : null}

      {emptyHint ? (
        <p className="border-t border-border/60 px-4 py-3 text-xs italic text-muted-foreground">
          {emptyHint}
        </p>
      ) : null}
    </DetailPanel>
  );
}

/* =========================================================================
 * PlayerDetailFields — one occupant's form, in the canonical section order.
 * ========================================================================= */
function PlayerDetailFields({
  player,
  groups,
  rank,
}: {
  player: PlayerDTO;
  groups: RosterGroupDTO[];
  rank: string | null;
}) {
  const updatePlayer = useTournamentStore((s) => s.updatePlayer);
  const config = useTournamentStore((s) => s.config);
  const entered = player.ranks ?? [];

  return (
    <>
      <DetailPanel.Section
        eyebrow="Identity"
        right={rank ? <UnassignButton player={player} rank={rank} /> : undefined}
      >
        <Row
          label="Player"
          control={
            <span className="text-sm text-foreground">
              {player.name || '(unnamed)'}
            </span>
          }
        />
        <Row
          label="School"
          last
          control={
            <Select
              value={player.groupId}
              onValueChange={(v) => updatePlayer(player.id, { groupId: v })}
              options={groups.map((g) => ({ value: g.id, label: g.name }))}
              ariaLabel="School"
              size="sm"
              triggerStyle={{ width: '11rem' }}
            />
          }
        />
      </DetailPanel.Section>

      <DetailPanel.Section
        eyebrow="Availability"
        right={
          <span className="text-2xs text-muted-foreground">
            {formatWindowSummary(player.availability ?? [])}
          </span>
        }
      >
        <PlayerAvailabilityField player={player} />
        <Row
          label="Min rest"
          last
          control={
            <span className="inline-flex items-baseline gap-2">
              <input
                type="number"
                min={0}
                max={120}
                aria-label="Min rest"
                value={
                  player.minRestMinutes != null ? String(player.minRestMinutes) : ''
                }
                placeholder={
                  config != null ? `default (${config.defaultRestMinutes})` : 'default'
                }
                onChange={(e) => {
                  const raw = e.target.value;
                  updatePlayer(player.id, {
                    minRestMinutes: raw === '' ? undefined : Number(raw) || 0,
                  });
                }}
                className="h-7 w-28 rounded-sm border border-border bg-bg-elev px-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <span className="text-xs text-muted-foreground">min</span>
            </span>
          }
        />
      </DetailPanel.Section>

      <DetailPanel.Section
        eyebrow="Events"
        right={
          <span className="text-2xs tabular-nums text-muted-foreground">
            {entered.length} entered
          </span>
        }
      >
        <PlayerEventsField player={player} />
      </DetailPanel.Section>

      <DetailPanel.Section eyebrow="Notes">
        <textarea
          aria-label="Notes"
          value={player.notes ?? ''}
          onChange={(e) =>
            updatePlayer(player.id, { notes: e.target.value || undefined })
          }
          rows={3}
          placeholder="Optional notes…"
          className="w-full rounded-sm border border-border bg-bg-elev px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </DetailPanel.Section>
    </>
  );
}

/* =========================================================================
 * UnassignButton — take this player out of THIS position. Two-click armed
 * (the canon `useConfirmClick`), visible rather than hover-revealed: in a
 * pane there is no row to hover, and a destructive control nobody can find
 * is not safer, only harder to use.
 * ========================================================================= */
function UnassignButton({ player, rank }: { player: PlayerDTO; rank: string }) {
  const { unassignRank } = useRankAssignment();
  const canEditWorkspace = useCanEdit();
  const confirm = useConfirmClick(() => unassignRank(player.id, rank));
  const name = player.name || 'player';
  return (
    <button
      type="button"
      disabled={!canEditWorkspace}
      onClick={confirm.press}
      onBlur={confirm.reset}
      data-testid={`unassign-${player.id}`}
      title={canEditWorkspace ? undefined : READ_ONLY_MESSAGE}
      aria-label={
        confirm.armed
          ? `Confirm unassign ${name} from ${rank}`
          : `Unassign ${name} from ${rank}`
      }
      className={[
        'rounded-sm border px-2 py-0.5 text-2xs transition-colors duration-fast ease-brand disabled:cursor-not-allowed disabled:opacity-50',
        confirm.armed
          ? 'border-destructive bg-destructive/10 font-medium text-destructive'
          : 'border-border text-muted-foreground hover:border-destructive/40 hover:text-destructive',
      ].join(' ')}
    >
      {confirm.armed ? 'Click again' : 'Unassign'}
    </button>
  );
}
