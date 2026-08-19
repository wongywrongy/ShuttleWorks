/**
 * rosterEvents — pure derivations between the bracket roster
 * (`BracketPlayerDTO`, keyed by player slug) and the bracket snapshot's
 * per-event participants (`events[].participants`, SP-D7 S3).
 *
 * Badges derive from `events[].participants` — NOT from `play_units` —
 * so DRAFT draws (no matches generated yet) still badge their entrants.
 * A player is "in" an event when their slug is the participant id
 * directly (singles) or appears in a TEAM participant's `members`
 * (doubles/mixed).
 */
import type { BracketTournamentDTO, Participant } from '../../api/bracketDto';
import type { BracketEventDTO } from './eventUpsertPayload';

/** Canonical discipline order for badge sorting (matches the meet's
 *  matches-export order). Unknown prefixes sort after, alphabetically. */
const BADGE_ORDER = ['MS', 'WS', 'MD', 'WD', 'XD'];

/** Discipline prefix of a badge code: "MS1" → "MS". */
const prefixOf = (code: string) => code.replace(/\d+$/, '');

const badgeRank = (code: string) => {
  const i = BADGE_ORDER.indexOf(prefixOf(code));
  return i === -1 ? BADGE_ORDER.length : i;
};

/** Stable badge sort: canonical discipline order, then code. */
export function sortBadges(codes: Iterable<string>): string[] {
  return Array.from(new Set(codes)).sort(
    (a, b) => badgeRank(a) - badgeRank(b) || a.localeCompare(b),
  );
}

/** A player's entry badge with its discipline attribution. `code` is the
 *  display label (discipline, or event id when a discipline has several
 *  draws — see `badgeForEvent`); `type` is always the event's discipline,
 *  so category grouping survives event-id relabeling ("MD2X" stays under
 *  Doubles even though its code no longer parses to a discipline). */
export interface BadgeEntry {
  code: string;
  type: string;
  /** The player's seed IN that event (1 = top). Inline after the code —
   *  seeds are never a separate column (SP-CONSOLE-REFINE G6/B1). */
  seed?: number | null;
}

/**
 * Badge code for one event. Same labeling intent as the roster's
 * historical play_units derivation: the event's discipline code, falling
 * back to the event id. When SEVERAL events share a discipline (MS1-style
 * splits) the discipline alone is ambiguous, so those badge by event id.
 */
export function badgeForEvent(
  ev: BracketEventDTO,
  allEvents: BracketEventDTO[],
): string {
  const shared =
    allEvents.filter((e) => e.discipline === ev.discipline).length > 1;
  if (shared) return ev.id;
  return ev.discipline || ev.id;
}

/**
 * player id → sorted badge entries ({code, type}), derived from every
 * event's own participant list (works for draft draws pre-generate).
 * Sorted by canonical discipline order (on `type`, so event-id-relabeled
 * codes keep their discipline's position), then code.
 */
export function badgesByPlayerId(
  data: BracketTournamentDTO | null,
): Map<string, BadgeEntry[]> {
  const out = new Map<string, Map<string, BadgeEntry>>();
  if (!data) return new Map();
  for (const ev of data.events) {
    const code = badgeForEvent(ev, data.events);
    const entry: BadgeEntry = { code, type: ev.discipline || prefixOf(code) };
    for (const part of ev.participants ?? []) {
      const ids =
        part.members && part.members.length > 0 ? part.members : [part.id];
      // Seed is PER PARTICIPANT (a doubles pair's seed applies to both
      // members), so a seeded entry can't share the event-level object.
      const withSeed =
        part.seed != null ? { ...entry, seed: part.seed } : entry;
      for (const id of ids) {
        const byCode = out.get(id) ?? new Map<string, BadgeEntry>();
        byCode.set(code, withSeed);
        out.set(id, byCode);
      }
    }
  }
  const rank = (e: BadgeEntry) => {
    const i = BADGE_ORDER.indexOf(e.type);
    return i === -1 ? BADGE_ORDER.length : i;
  };
  return new Map(
    Array.from(out.entries(), ([id, byCode]) => [
      id,
      Array.from(byCode.values()).sort(
        (a, b) => rank(a) - rank(b) || a.code.localeCompare(b.code),
      ),
    ]),
  );
}

/** True when the player is entered in the event — singles participant id
 *  or member of one of its TEAM participants. */
export function isEnteredIn(ev: BracketEventDTO, playerId: string): boolean {
  return (ev.participants ?? []).some(
    (p) => p.id === playerId || (p.members ?? []).includes(playerId),
  );
}

/** Every player id already occupying the event (singles ids + team
 *  members) — used to exclude taken partners from the pairing select. */
export function enteredPlayerIds(ev: BracketEventDTO): Set<string> {
  const ids = new Set<string>();
  for (const p of ev.participants ?? []) {
    if (p.members && p.members.length > 0) {
      for (const m of p.members) ids.add(m);
    } else {
      ids.add(p.id);
    }
  }
  return ids;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Next synthesized team id for an event, following ParticipantPicker's
 * `${eventId}-T{n}` rule. The picker numbers by sequence position (it
 * always builds a fresh list); appending to an EXISTING list generalizes
 * that to max-suffix + 1 so a removed pair's number is never reused
 * against a live one.
 */
export function nextTeamId(eventId: string, participants: Participant[]): string {
  const re = new RegExp(`^${escapeRegExp(eventId)}-T(\\d+)$`);
  let maxN = 0;
  for (const p of participants) {
    const m = re.exec(p.id);
    if (m) maxN = Math.max(maxN, Number(m[1]));
  }
  return `${eventId}-T${maxN + 1}`;
}

/** Wire participant → upsert-input participant (drops `members: null`;
 *  echoes `seed` so an existing draw's seeds survive a create-or-replace
 *  upsert instead of being silently reset to unseeded). */
export function toUpsertParticipant(p: Participant): {
  id: string;
  name: string;
  members?: string[];
  seed?: number;
} {
  return {
    id: p.id,
    name: p.name,
    ...(p.members && p.members.length > 0 ? { members: [...p.members] } : {}),
    ...(p.seed != null ? { seed: p.seed } : {}),
  };
}

/**
 * Day bounds for the roster AvailabilityControl, derived from the bracket
 * session the same way the S2 solver channel anchors windows: slot k =
 * `start_time + k * interval_minutes` (player_constraints.py). With a
 * start time, the day runs from its time-of-day to the session's last
 * slot (capped at 23:59 — the inversion helpers are same-day only).
 * Without one the solver skips per-player windows entirely, so the
 * editor falls back to 08:00–22:00 and flags `anchored: false` (the UI
 * shows the "applies when the session start time is set" hint).
 */
export function sessionDayBounds(data: BracketTournamentDTO | null): {
  dayStart: string;
  dayEnd: string;
  anchored: boolean;
} {
  const fallback = { dayStart: '08:00', dayEnd: '22:00', anchored: false };
  if (!data?.start_time) return fallback;
  const start = new Date(data.start_time);
  if (Number.isNaN(start.getTime())) return fallback;
  const startMin = start.getHours() * 60 + start.getMinutes();
  const sessionMin = (data.total_slots ?? 0) * (data.interval_minutes ?? 30);
  const endMin =
    sessionMin > 0 ? Math.min(startMin + sessionMin, 24 * 60 - 1) : 24 * 60 - 1;
  const pad = (n: number) => String(n).padStart(2, '0');
  const toHHMM = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  return { dayStart: toHHMM(startMin), dayEnd: toHHMM(endMin), anchored: true };
}
