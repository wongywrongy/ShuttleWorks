/**
 * Canonical Bracket pairing mutation seam.
 *
 * Bracket event writes are whole-event replacements.  Keeping the pairing
 * command here means every caller derives the replacement list from the
 * current event snapshot and carries the metadata on rows it did not touch
 * (and on a changed TEAM row) through the existing upsert payload builder.
 */
import type { BracketEventUpsertIn, Participant } from '../../api/bracketDto';
import { teamName } from './bracketLabels';
import {
  nextTeamId,
  toUpsertParticipant,
} from './rosterEvents';
import {
  buildEventUpsertPayload,
  type BracketEventDTO,
} from './eventUpsertPayload';

export interface PairingPlayer {
  id: string;
  name: string;
  entryPlayerId?: string | null;
}

export type BracketPairingCommand =
  | {
      type: 'assign';
      player: PairingPlayer;
      partner: PairingPlayer;
    }
  | {
      type: 'change';
      player: PairingPlayer;
      partner: PairingPlayer;
    }
  | {
      type: 'dissolve';
      playerId: string;
    }
  | {
      /** Draw-side bulk editor compatibility. The command still crosses the
       * same lock-checked commit seam as player-side assign/change/dissolve. */
      type: 'replace';
      participants: PairingParticipant[];
    };

export type PairingParticipant = ReturnType<typeof toUpsertParticipant>;

export const PAIRING_LOCKED_REASON =
  'Participants are locked once a draw is generated.';

function withoutEntryPlayerId(
  participant: PairingParticipant,
): Omit<PairingParticipant, 'entryPlayerId'> {
  const copy = { ...participant };
  delete copy.entryPlayerId;
  return copy;
}

function containsPlayer(participant: Participant, playerId: string): boolean {
  return participant.id === playerId || (participant.members ?? []).includes(playerId);
}

function teamForPlayer(
  participants: Participant[],
  playerId: string,
): Participant | undefined {
  return participants.find(
    (participant) =>
      (participant.members?.length ?? 0) > 0 &&
      (participant.members ?? []).includes(playerId),
  );
}

function assertAvailablePartner(
  participants: Participant[],
  playerId: string,
  partnerId: string,
  ignoredTeamId?: string,
): void {
  if (playerId === partnerId) {
    throw new Error('A player cannot be paired with themself.');
  }
  const occupied = participants.find(
    (participant) =>
      participant.id !== ignoredTeamId && containsPlayer(participant, partnerId),
  );
  // A singleton is a legal candidate for pairing: the command consumes that
  // standalone row and replaces it with the TEAM. Existing TEAM occupancy is
  // the conflict that must remain rejected.
  if (occupied && (occupied.members?.length ?? 0) > 0) {
    throw new Error('That partner is already entered in this draw.');
  }
}

/**
 * Apply one Bracket pairing command to an event's current participant list.
 *
 * `dissolve` removes the TEAM participant as a unit.  It deliberately does
 * not turn its members into singleton rows: that would silently change the
 * draw's participant model and contradict R-PAIR-4.
 */
export function applyBracketPairingCommand(
  ev: Pick<BracketEventDTO, 'id' | 'participants'>,
  command: BracketPairingCommand,
): PairingParticipant[] {
  const current = ev.participants ?? [];

  if (command.type === 'replace') {
    return command.participants.map((participant) => ({ ...participant }));
  }

  if (command.type === 'dissolve') {
    const team = teamForPlayer(current, command.playerId);
    if (!team) {
      // A legacy/malformed doubles draw may contain a singleton participant.
      // Removing that row is the toggle-off operation; unlike a TEAM dissolve
      // it still does not synthesize singleton rows for the former members.
      return current
        .filter((participant) => participant.id !== command.playerId)
        .map(toUpsertParticipant);
    }
    return current
      .filter((participant) => participant.id !== team.id)
      .map(toUpsertParticipant);
  }

  const player = command.player;
  const partner = command.partner;
  const existingTeam = teamForPlayer(current, player.id);
  const ignoredTeamId = command.type === 'change' ? existingTeam?.id : undefined;
  assertAvailablePartner(current, player.id, partner.id, ignoredTeamId);

  if (command.type === 'change' && !existingTeam) {
    // A stale UI snapshot can lose the team between opening and confirming.
    // Treat this as a fresh assignment while retaining all unrelated rows.
    return applyBracketPairingCommand(ev, {
      type: 'assign',
      player,
      partner,
    });
  }

  if (existingTeam) {
    // Change keeps the event-scoped participant identity and all metadata
    // (seed/person key) on the TEAM row. Only its member/name fields change.
    return current
      .filter(
        (participant) =>
          participant.id === existingTeam.id ||
          !containsPlayer(participant, partner.id),
      )
      .map((participant) => {
        if (participant.id !== existingTeam.id) return toUpsertParticipant(participant);
        const teamMetadata = withoutEntryPlayerId(toUpsertParticipant(participant));
        return {
          ...teamMetadata,
          name: teamName(player.name, partner.name),
          members: [player.id, partner.id],
          ...(player.entryPlayerId != null
            ? { entryPlayerId: player.entryPlayerId }
            : {}),
        };
      });
  }

  const teamId = nextTeamId(ev.id, current);
  return [
    ...current
      .filter((participant) => !containsPlayer(participant, player.id))
      .filter((participant) => !containsPlayer(participant, partner.id))
      .map(toUpsertParticipant),
    {
      id: teamId,
      name: teamName(player.name, partner.name),
      members: [player.id, partner.id],
      ...(player.entryPlayerId != null
        ? { entryPlayerId: player.entryPlayerId }
        : {}),
    },
  ];
}

/** One write seam for all Bracket pair commands over the existing upsert. */
export async function commitBracketPairing(
  commit: (eventId: string, body: BracketEventUpsertIn) => Promise<void>,
  ev: BracketEventDTO,
  command: BracketPairingCommand,
): Promise<void> {
  if ((ev.status ?? 'draft') !== 'draft') {
    throw new Error(PAIRING_LOCKED_REASON);
  }
  const participants = applyBracketPairingCommand(ev, command);
  await commit(ev.id, buildEventUpsertPayload(ev, participants));
}
