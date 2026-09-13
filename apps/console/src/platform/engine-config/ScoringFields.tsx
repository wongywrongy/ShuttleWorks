/**
 * ScoringFields — the score-type field set shared by the Meet Engine tab
 * and the Bracket Engine tab. Extracted so "identical field set in both
 * modules" (SP-E4) is true by construction, not by parallel copies that
 * drift. Controlled: the parent owns the four scoring values and applies
 * the emitted patch to its own form state / store.
 *
 * Layout matches the rest of the settings surfaces — every field is a
 * locked `<Row>`; the Sets-only dependents (points / match format / deuce)
 * sit in an indented, dimmed group when score type is Simple.
 */
import { useState } from 'react';

import { Row, Seg, Toggle, NumberWithSuffix } from './SettingsControls';

export interface ScoringValue {
  scoringFormat: 'simple' | 'badminton';
  pointsPerSet: number;
  setsToWin: number;
  deuceEnabled: boolean;
  /** Ruling C3 (state-and-formatting §5.1): the only cap the product
   *  actually enforces is whatever an operator configures here — there is
   *  no built-in "cap 30". `null` means uncapped (the stored schema is
   *  `ge=1`, so `0` is a display-only sentinel, never a saved value),
   *  matching Setup's `rules.pointCap` field this mirrors (V3-13-2). */
  pointCap: number | null;
}

/** The one configuration the product is allowed to call standard: 21 points,
 *  best of 3, win by 2, capped at 30. Anything else is Custom — a preset
 *  label is a claim about the rules of the sport, not a convenience. */
export const STANDARD_SCORING = {
  pointsPerSet: 21,
  setsToWin: 2,
  deuceEnabled: true,
  pointCap: 30,
} as const;

export function isStandardScoring(value: ScoringValue): boolean {
  return (
    value.scoringFormat === 'badminton'
    && value.pointsPerSet === STANDARD_SCORING.pointsPerSet
    && value.setsToWin === STANDARD_SCORING.setsToWin
    && value.deuceEnabled
    && value.pointCap === STANDARD_SCORING.pointCap
  );
}

const GAMES_PHRASE: Record<number, string> = {
  1: 'Single game',
  2: 'Best of 3 games',
  3: 'Best of 5 games',
};

/**
 * The effective rules as one sentence, generated from the values — the same
 * sentence the public site publishes (`shared/scoring_rules.py`), so what the
 * director reads while editing is what an entrant reads once published.
 */
export function effectiveRulesSentence(value: ScoringValue): string {
  if (value.scoringFormat === 'simple') {
    return 'Match result only. Game scores are not recorded.';
  }
  const games = GAMES_PHRASE[value.setsToWin] ?? 'Best of 3 games';
  const parts = [`${games} to ${value.pointsPerSet}`];
  if (value.deuceEnabled) {
    parts.push('win by 2');
    parts.push(value.pointCap ? `capped at ${value.pointCap}` : 'no maximum');
  } else {
    parts.push('no advantage required');
  }
  return `${parts.join(', ')}.`;
}

const PRESET_OPTIONS = [
  { value: 'standard' as const, label: 'Standard 21-point' },
  { value: 'custom' as const, label: 'Custom' },
];

const CAP_OPTIONS = [
  { value: 'none' as const, label: 'No limit' },
  { value: 'cap' as const, label: 'Maximum' },
];

const SCORE_TYPE_OPTIONS = [
  { value: 'simple' as const, label: 'Match result only' },
  { value: 'badminton' as const, label: 'Game scores' },
];

const MATCH_FORMAT_OPTIONS = [
  { value: 1, label: 'Best of 1' },
  { value: 2, label: 'Best of 3' },
  { value: 3, label: 'Best of 5' },
];

const POINTS_PER_SET_OPTIONS = [
  { value: 11, label: '11 points' },
  { value: 15, label: '15 points' },
  { value: 21, label: '21 points' },
];

export function ScoringFields({
  value,
  onChange,
}: {
  value: ScoringValue;
  onChange: (patch: Partial<ScoringValue>) => void;
}) {
  const isSimple = value.scoringFormat === 'simple';
  // The preset is a real choice, not a decoration: Standard writes the four
  // values, Custom unlocks them. It is derived from the values, so a
  // configuration loaded from the server reads as Standard when it is one.
  const [customUnlocked, setCustomUnlocked] = useState(false);
  const preset = !customUnlocked && isStandardScoring(value) ? 'standard' : 'custom';
  const locked = preset === 'standard';
  const capped = value.pointCap != null && value.pointCap > 0;
  return (
    <>
      <Row
        label="Score type"
        control={
          <Seg
            options={SCORE_TYPE_OPTIONS}
            value={value.scoringFormat}
            onChange={(v) => onChange({ scoringFormat: v })}
            ariaLabel="Score type"
          />
        }
        last
      />
      {/* Sets-only dependents: indented and dimmed when Simple so they read
          as dependent on the score type (the values still persist).

          All three pick-one controls here are segmented, not a mix of
          segmented and dropdown. Each has exactly 3 options; the rule is
          3 or fewer segmented, more than 3 a dropdown. A form where every
          choice looks like a different kind of control reads as unfinished
          rather than as varied. */}
      <div
        className={[
          isSimple ? 'opacity-50 pointer-events-none' : '',
        ].join(' ')}
        aria-disabled={isSimple}
      >
        <Row
          label="Scoring rules"
          control={
            <Seg
              options={PRESET_OPTIONS}
              value={preset}
              onChange={(v) => {
                setCustomUnlocked(v === 'custom');
                if (v === 'standard') onChange({ ...STANDARD_SCORING });
              }}
              ariaLabel="Scoring rules"
              disabled={isSimple}
            />
          }
        />
        <Row
          label="Points per game"
          control={
            <Seg
              value={value.pointsPerSet}
              onChange={(v) => onChange({ pointsPerSet: v })}
              options={POINTS_PER_SET_OPTIONS}
              ariaLabel="Points per game"
              disabled={isSimple || locked}
            />
          }
        />
        <Row
          label="Games per match"
          control={
            <Seg
              value={value.setsToWin}
              onChange={(v) => onChange({ setsToWin: v })}
              options={MATCH_FORMAT_OPTIONS}
              ariaLabel="Match format"
              disabled={isSimple || locked}
            />
          }
        />
        <Row
          label="Winning margin"
          control={
            <Toggle
              value={value.deuceEnabled}
              onChange={(v) => onChange({ deuceEnabled: v })}
              ariaLabel="Deuce enabled"
              disabled={isSimple || locked}
            />
          }
        />
        {value.deuceEnabled ? (
          <>
            {/* "No limit" is the named choice an operator picks; the stored
                sentinel (null) never reaches the form's vocabulary — the old
                control asked for "0" and captioned it "(0 = no cap)". */}
            <Row
              label="Maximum points"
              control={
                <Seg
                  options={CAP_OPTIONS}
                  value={capped ? 'cap' : 'none'}
                  onChange={(v) => onChange({ pointCap: v === 'cap' ? (value.pointCap || value.pointsPerSet + 9) : null })}
                  ariaLabel="Maximum points"
                  disabled={isSimple || locked}
                />
              }
              last={!capped}
            />
            {capped ? (
              <Row
                label="Maximum"
                control={
                  <NumberWithSuffix
                    value={value.pointCap ?? 0}
                    onChange={(v) => onChange({ pointCap: v > 0 ? v : null })}
                    suffix="pts"
                    min={1}
                    max={200}
                    ariaLabel="Point cap"
                    disabled={isSimple || locked}
                  />
                }
                last
              />
            ) : null}
          </>
        ) : null}
        <p className="pt-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Effective rules: </span>
          {effectiveRulesSentence(value)}
        </p>
      </div>
    </>
  );
}
