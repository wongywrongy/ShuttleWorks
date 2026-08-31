/**
 * Source-aware match identity.  F-UNI-21/22/23/26: keep the engine's
 * decomposed coordinates in one value object while the identity refactor is
 * strangled in; this module does not parse or rebuild an opaque machine id.
 */

export type BracketPhaseKind = 'elimination' | 'round_robin';

export interface BracketMatchPhase {
  kind: BracketPhaseKind;
  round_index: number;
  /** Already-derived stage (F, SF, QF, R32, or RR's R1, R2, ...). */
  stage: string;
  /** Existing bracket segment, or null for a single-segment draw. */
  segment: string | null;
  /** Existing format metadata: the segment that is intentionally unlabelled. */
  main_segment?: string | null;
}

export interface BracketMatchIdentity {
  source: 'bracket';
  event_code: string;
  phase: BracketMatchPhase;
  /** 1-based operator sequence, derived from Bracket's 0-based index. */
  sequence: number;
}

export interface MeetMatchIdentity {
  source: 'meet';
  event_code: string;
  phase: null;
  /** Number in the eventRank (MS1), when the rank is present. */
  position: number | null;
  /** Meet's existing display ordinal, used by the M{n} fallback. */
  sequence: number | null;
}

export type MatchIdentity = BracketMatchIdentity | MeetMatchIdentity;

export interface MeetRankCoordinates {
  event_code: string;
  position: number | null;
}

/** F-UNI-21/26: construct bracket identity from explicit persisted/display coordinates. */
export function bracketMatchIdentity(input: {
  event_code: string;
  phase: BracketMatchPhase;
  sequence: number;
}): BracketMatchIdentity {
  return {
    source: 'bracket',
    event_code: input.event_code,
    phase: { ...input.phase },
    sequence: input.sequence,
  };
}

/** F-UNI-21/23: construct Meet identity from decomposed rank/ordinal fields. */
export function meetMatchIdentity(input: {
  event_code: string;
  position?: number | null;
  sequence?: number | null;
}): MeetMatchIdentity {
  return {
    source: 'meet',
    event_code: input.event_code,
    phase: null,
    position: input.position ?? null,
    sequence: input.sequence ?? null,
  };
}

/**
 * F-UNI-21/23: the sole compatibility parser for Meet's legacy `eventRank`
 * storage seam. Configured codes are matched longest-first so a numeric code
 * such as `U10` can be distinguished from position 1 in `U101`.
 */
export function decomposeMeetEventRank(
  eventRank: string | null | undefined,
  configuredEventCodes: readonly string[] = [],
): MeetRankCoordinates {
  const rank = eventRank?.trim() ?? '';
  if (!rank) return { event_code: '', position: null };

  const configured = [...new Set(configuredEventCodes.map((code) => code.trim()).filter(Boolean))]
    .sort((a, b) => b.length - a.length);
  for (const eventCode of configured) {
    if (!rank.startsWith(eventCode)) continue;
    const suffix = rank.slice(eventCode.length);
    if (/^[1-9]\d*$/.test(suffix)) {
      return { event_code: eventCode, position: Number(suffix) };
    }
    if (!suffix) return { event_code: eventCode, position: null };
  }

  // Legacy Meet data predates configurable event codes and uses alphabetic
  // discipline prefixes. This fallback lives only at the strangler seam.
  const legacy = /^([A-Z]+)([1-9]\d*)$/.exec(rank);
  if (legacy) return { event_code: legacy[1], position: Number(legacy[2]) };
  return { event_code: rank, position: null };
}

/** F-UNI-21/23: adapt Meet's stored rank without leaking parsing to callers. */
export function meetMatchIdentityFromStored(input: {
  event_rank?: string | null;
  sequence?: number | null;
  configured_event_codes?: readonly string[];
}): MeetMatchIdentity {
  const rank = decomposeMeetEventRank(input.event_rank, input.configured_event_codes);
  return meetMatchIdentity({ ...rank, sequence: input.sequence });
}

function segmentShort(
  segment: string,
  kind: BracketPhaseKind,
  mainSegment?: string | null,
): string {
  // These are the existing bracket label conventions; no new segment is
  // introduced here (F-UNI-22/26).
  if (kind === 'elimination' && segment === mainSegment) return '';
  if (segment === 'L') return 'L';
  if (segment === 'PLATE') return 'PL';
  const positions = /^P(\d+)_(\d+)$/.exec(segment);
  if (positions) return `${positions[1]}–${positions[2]}`;
  return segment;
}

/**
 * The one human identity formatter (F-UNI-22/23/26).  It intentionally
 * accepts the stable machine id only as a last-resort display fallback and
 * preserves the current corpus grammar. Keeping that fallback here prevents
 * each caller from inventing its own truncation rule.
 */
export function formatMatchIdentity(identity: MatchIdentity, machineId?: string): string {
  if (identity.source === 'meet') {
    if (identity.event_code) {
      return identity.position != null
        ? `${identity.event_code}${identity.position}`
        : identity.event_code;
    }
    if (identity.sequence != null) return `M${identity.sequence}`;
    return machineId?.slice(0, 6) ?? '';
  }

  const { phase } = identity;
  if (phase.kind === 'round_robin') {
    return `${identity.event_code} ${phase.stage}·${identity.sequence}`;
  }

  if (phase.segment === 'GF') {
    const reset = phase.round_index > 0 || identity.sequence > 1;
    return `${identity.event_code} GF${reset ? '-R' : ''}`;
  }

  const tag = phase.segment
    ? segmentShort(phase.segment, phase.kind, phase.main_segment)
    : '';
  const head = tag ? `${identity.event_code} ${tag}` : identity.event_code;
  if (phase.stage === 'F') return `${head} F`;
  const separator = phase.stage.startsWith('R') ? '·' : '';
  return `${head} ${phase.stage}${separator}${identity.sequence}`;
}
