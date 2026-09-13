/**
 * Frontend draw-format registry (draw-formats program, D1).
 *
 * One descriptor per draw format the product speaks (or will speak):
 * picker copy (label / blurb / the guaranteed-matches hint directors
 * actually choose by), a mini-glyph for the New-draw card grid, the
 * renderer family DrawView dispatches on (S8), and the per-format
 * configuration fields the picker + Configure layer render dynamically.
 *
 * `implemented: false` formats are DISPLAY-ONLY: they keep their label and
 * renderer so an existing draw still renders, but they are absent from the
 * creation path (O8/D6 — the New-draw modal offers supported formats only,
 * never a roadmap card a director cannot pick).
 *
 * `creatable: false` marks a format that IS shipped but is not its own
 * entry in the chooser because a plainer choice reaches it: `monrad` is
 * what "single elimination + consolation" generates (see
 * CONSOLATION_POLICIES).
 *
 * Field `target` decides where a value lands in the upsert/patch body:
 * 'column' → a top-level DTO key (seeded_count / bracket_size / rr_rounds),
 * 'config' → inside the event's format-specific `config` blob.
 */
import type { JSX, ReactNode } from 'react';

export type DrawFormatId =
  | 'se'
  | 'rr'
  | 'de'
  | 'monrad'
  | 'compass'
  | 'swiss'
  | 'groups'
  | 'ladder';

export interface FormatConfigField {
  key: string;
  label: string;
  kind: 'number' | 'select' | 'toggle';
  options?: { value: string; label: string }[];
  target: 'column' | 'config';
  default?: unknown;
  min?: number;
  max?: number;
  help?: string;
}

export interface FormatDescriptor {
  id: DrawFormatId;
  label: string;
  blurb: string;
  /** The guaranteed-matches property directors choose formats by. */
  matchesHint: string;
  glyph: (props: { className?: string }) => JSX.Element;
  implemented: boolean;
  /** Absent/true → offered in the New-draw format chooser. */
  creatable?: boolean;
  renderer: 'bracket' | 'grid' | 'segments' | 'swiss';
  fields: FormatConfigField[];
}

// ---------------------------------------------------------------------------
// Glyphs — minimal 20×20 currentColor line drawings for the picker cards.
// ---------------------------------------------------------------------------

function GlyphSvg({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** Single bracket tree — two pairs converging on a final. */
function SeGlyph(props: { className?: string }) {
  return (
    <GlyphSvg {...props}>
      <path d="M2 3H5V7H2" />
      <path d="M5 5H9" />
      <path d="M2 13H5V17H2" />
      <path d="M5 15H9" />
      <path d="M9 5V15" />
      <path d="M9 10H18" />
    </GlyphSvg>
  );
}

/** Round-robin grid dots — everyone meets everyone. */
function RrGlyph(props: { className?: string }) {
  const xs = [5, 10, 15];
  return (
    <GlyphSvg {...props}>
      {xs.flatMap((x) =>
        xs.map((y) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r={1.4} fill="currentColor" stroke="none" />
        )),
      )}
    </GlyphSvg>
  );
}

/** Twin stacked trees — losers drop into a second bracket. */
function DeGlyph(props: { className?: string }) {
  return (
    <GlyphSvg {...props}>
      <path d="M2 3H6V7H2" />
      <path d="M6 5H12" />
      <path d="M4 7V11" />
      <path d="M6 11H10V15H6" />
      <path d="M10 13H16" />
    </GlyphSvg>
  );
}

/** Tree + plate — knockout with a consolation plate below. */
function MonradGlyph(props: { className?: string }) {
  return (
    <GlyphSvg {...props}>
      <path d="M2 2H6V6H2" />
      <path d="M6 4H12" />
      <path d="M5 11H15" />
      <path d="M6.5 11C6.5 14 8 15.8 10 15.8C12 15.8 13.5 14 13.5 11" />
    </GlyphSvg>
  );
}

/** Compass rose — mini-brackets at the compass points. */
function CompassGlyph(props: { className?: string }) {
  return (
    <GlyphSvg {...props}>
      <path d="M10 2L12 8L18 10L12 12L10 18L8 12L2 10L8 8Z" />
      <circle cx={10} cy={10} r={1} fill="currentColor" stroke="none" />
    </GlyphSvg>
  );
}

/** Round columns — the same field re-paired each round. */
function SwissGlyph(props: { className?: string }) {
  return (
    <GlyphSvg {...props}>
      <path d="M2 5H6" />
      <path d="M2 10H6" />
      <path d="M2 15H6" />
      <path d="M8 7.5H12" />
      <path d="M8 12.5H12" />
      <path d="M14 10H18" />
    </GlyphSvg>
  );
}

/** Pools + tree — round-robin pools feeding a knockout. */
function GroupsGlyph(props: { className?: string }) {
  return (
    <GlyphSvg {...props}>
      <circle cx={4} cy={4} r={1.2} fill="currentColor" stroke="none" />
      <circle cx={8} cy={4} r={1.2} fill="currentColor" stroke="none" />
      <circle cx={4} cy={8} r={1.2} fill="currentColor" stroke="none" />
      <circle cx={8} cy={8} r={1.2} fill="currentColor" stroke="none" />
      <circle cx={4} cy={13} r={1.2} fill="currentColor" stroke="none" />
      <circle cx={8} cy={13} r={1.2} fill="currentColor" stroke="none" />
      <circle cx={4} cy={17} r={1.2} fill="currentColor" stroke="none" />
      <circle cx={8} cy={17} r={1.2} fill="currentColor" stroke="none" />
      <path d="M11 6H14V15H11" />
      <path d="M14 10.5H18" />
    </GlyphSvg>
  );
}

/** Ladder rungs — a standing challenge board. */
function LadderGlyph(props: { className?: string }) {
  return (
    <GlyphSvg {...props}>
      <path d="M7 3V17" />
      <path d="M13 3V17" />
      <path d="M7 6H13" />
      <path d="M7 10H13" />
      <path d="M7 14H13" />
    </GlyphSvg>
  );
}

// ---------------------------------------------------------------------------
// Shared field fragments
// ---------------------------------------------------------------------------

const SEEDED_COUNT_FIELD: FormatConfigField = {
  key: 'seeded_count',
  label: 'Seeded players',
  kind: 'number',
  target: 'column',
  min: 0,
};

const BRACKET_SIZE_FIELD: FormatConfigField = {
  key: 'bracket_size',
  label: 'Bracket size',
  kind: 'number',
  target: 'column',
  min: 2,
  help: 'auto = next power of two',
};

// ---------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------

export const DRAW_FORMATS: FormatDescriptor[] = [
  {
    id: 'se',
    label: 'Single elimination',
    blurb: 'Classic knockout: win and advance, lose and you’re out.',
    matchesHint: '1 loss and out',
    glyph: SeGlyph,
    implemented: true,
    renderer: 'bracket',
    fields: [SEEDED_COUNT_FIELD, BRACKET_SIZE_FIELD],
  },
  {
    id: 'rr',
    label: 'Round robin',
    blurb: 'One pool where every pairing gets played.',
    matchesHint: 'Everyone plays everyone',
    glyph: RrGlyph,
    implemented: true,
    renderer: 'grid',
    fields: [
      {
        key: 'rr_rounds',
        label: 'Cycles',
        kind: 'number',
        target: 'column',
        min: 1,
        max: 4,
        help: 'times everyone plays everyone',
      },
    ],
  },
  {
    id: 'de',
    label: 'Double elimination',
    blurb: 'Losers drop into a second bracket for another life.',
    matchesHint: 'At least 2 matches',
    glyph: DeGlyph,
    implemented: true,
    renderer: 'segments',
    fields: [
      SEEDED_COUNT_FIELD,
      BRACKET_SIZE_FIELD,
      {
        key: 'grand_final_reset',
        label: 'Grand final reset',
        kind: 'toggle',
        target: 'config',
        help: 'second final if the winners-bracket champion loses GF1',
      },
    ],
  },
  {
    id: 'monrad',
    label: 'Monrad',
    blurb: 'Knockout with consolation rounds until every place is decided.',
    matchesHint: 'Every place decided, everyone keeps playing',
    glyph: MonradGlyph,
    implemented: true,
    // Reached from the chooser as "Single elimination + Consolation", so it
    // is not a second card competing with SE for the same director.
    creatable: false,
    renderer: 'segments',
    fields: [
      SEEDED_COUNT_FIELD,
      BRACKET_SIZE_FIELD,
      {
        key: 'consolation',
        label: 'Consolation',
        kind: 'select',
        target: 'config',
        default: 'full',
        options: [
          { value: 'full', label: 'Full classification' },
          { value: 'plate', label: 'Plate only' },
        ],
      },
    ],
  },
  {
    id: 'compass',
    label: 'Compass',
    blurb: 'Each loss moves you to another compass-point mini-bracket.',
    matchesHint: 'At least 3 matches (up to 8 mini-brackets)',
    glyph: CompassGlyph,
    implemented: true,
    renderer: 'segments',
    fields: [SEEDED_COUNT_FIELD, BRACKET_SIZE_FIELD],
  },
  {
    id: 'swiss',
    label: 'Swiss',
    blurb: 'Every round pairs players on similar scores: no rematches.',
    matchesHint: 'Fixed rounds, standings decide',
    glyph: SwissGlyph,
    implemented: true,
    renderer: 'swiss',
    fields: [
      {
        key: 'swiss_rounds',
        label: 'Swiss rounds',
        kind: 'number',
        target: 'config',
        min: 1,
        help: 'blank = ⌈log₂N⌉ rounds',
      },
    ],
  },
  {
    id: 'groups',
    label: 'Group stage',
    blurb: 'Pools play round robin; top finishers advance to a knockout.',
    matchesHint: 'Pool matches, then knockout',
    glyph: GroupsGlyph,
    implemented: false,
    renderer: 'segments',
    fields: [],
  },
  {
    id: 'ladder',
    label: 'Ladder',
    blurb: 'A standing challenge board: challenge up, winners swap ranks.',
    matchesHint: 'Ongoing, matches by challenge',
    glyph: LadderGlyph,
    implemented: false,
    renderer: 'grid',
    fields: [],
  },
];

/** The formats the New-draw chooser offers: shipped, and not reached
 *  through another format's option (monrad is reached via consolation). */
export const CREATABLE_FORMATS: FormatDescriptor[] = DRAW_FORMATS.filter(
  (d) => d.implemented && d.creatable !== false,
);

// ---------------------------------------------------------------------------
// Consolation (D6/O8)
// ---------------------------------------------------------------------------

/**
 * One consolation policy a director can attach to a compatible MAIN format.
 *
 * Consolation is deliberately NOT the same idea as double elimination (a
 * second life inside one championship) or as full placement classification —
 * each policy below names exactly which losers qualify, and each maps onto a
 * generator the engine already runs end to end (generation, feeder
 * references, scheduler dependencies, result correction, published draws).
 * There is no policy here the backend cannot generate.
 */
export interface ConsolationPolicy {
  value: 'off' | 'plate' | 'full';
  label: string;
  /** Which losing entrants qualify — the sentence shown under the choice. */
  eligibility: string;
  /** Format actually generated for this policy. */
  format: DrawFormatId;
  /** Extra keys merged into the event's `config` blob. */
  config?: Record<string, unknown>;
  /** Extra matches beyond the main draw, given a known bracket size. */
  extraMatches?: (bracketSize: number) => number;
}

/** Matches in a knockout over `size` entrants. */
function knockoutMatches(size: number): number {
  return Math.max(0, size - 1);
}

/** Monrad full-classification recursion (mirrors `_plan_children` in
 *  apps/api/src/bracket/formats/monrad.py): every round but a bracket's
 *  final spawns a child bracket over that round's losers. */
function fullClassificationExtras(size: number): number {
  let total = 0;
  const rounds = Math.log2(size);
  for (let r = 0; r < rounds - 1; r += 1) {
    const childSize = size >> (r + 1);
    if (childSize < 2) continue;
    total += knockoutMatches(childSize) + fullClassificationExtras(childSize);
  }
  return total;
}

export const CONSOLATION_POLICIES: ConsolationPolicy[] = [
  {
    value: 'off',
    label: 'Off',
    eligibility: 'A loss ends the entrant’s event. Main draw only.',
    format: 'se',
  },
  {
    value: 'plate',
    label: 'First-round losers play a plate',
    eligibility:
      'Everyone beaten in round 1 enters one knockout plate, so every entrant plays at least twice. A bye is not a loss and creates no plate entrant.',
    format: 'monrad',
    config: { consolation: 'plate' },
    extraMatches: (size) => knockoutMatches(size / 2),
  },
  {
    value: 'full',
    label: 'Every place decided (full classification)',
    eligibility:
      'Losers keep playing in classification brackets until every finishing place is decided. Places left with no real entrant (byes, withdrawals) stay undecided.',
    format: 'monrad',
    config: { consolation: 'full' },
    extraMatches: fullClassificationExtras,
  },
];

/** Main formats that accept a consolation policy. Single elimination is the
 *  only one today: the engine's Monrad main draw is the SAME bracket (BWF
 *  seeding + byes), so "SE + consolation" is a real generated structure.
 *  DE/compass already route losers by construction; rr/swiss have no losers'
 *  side to feed. */
export function consolationPoliciesFor(
  format: string | undefined,
): ConsolationPolicy[] {
  return format === 'se' ? CONSOLATION_POLICIES : [];
}

/** Descriptor lookup by (case-insensitive) format id; undefined for
 *  unknown/absent formats so callers can fall back to the raw id. */
export function descriptorFor(format: string | undefined): FormatDescriptor | undefined {
  if (!format) return undefined;
  const id = format.toLowerCase();
  return DRAW_FORMATS.find((d) => d.id === id);
}
