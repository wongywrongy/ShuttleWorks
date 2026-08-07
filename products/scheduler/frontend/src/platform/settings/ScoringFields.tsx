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
import { Row, Seg, Toggle } from './SettingsControls';

export interface ScoringValue {
  scoringFormat: 'simple' | 'badminton';
  pointsPerSet: number;
  setsToWin: number;
  deuceEnabled: boolean;
}

const SCORE_TYPE_OPTIONS = [
  { value: 'simple' as const, label: 'Simple' },
  { value: 'badminton' as const, label: 'Sets' },
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
          label="Points per set"
          control={
            <Seg
              value={value.pointsPerSet}
              onChange={(v) => onChange({ pointsPerSet: v })}
              options={POINTS_PER_SET_OPTIONS}
              ariaLabel="Points per set"
              disabled={isSimple}
            />
          }
        />
        <Row
          label="Match format"
          control={
            <Seg
              value={value.setsToWin}
              onChange={(v) => onChange({ setsToWin: v })}
              options={MATCH_FORMAT_OPTIONS}
              ariaLabel="Match format"
              disabled={isSimple}
            />
          }
        />
        <Row
          label="Deuce (win by 2)"
          control={
            <Toggle
              value={value.deuceEnabled}
              onChange={(v) => onChange({ deuceEnabled: v })}
              ariaLabel="Deuce enabled"
            />
          }
          last
        />
      </div>
    </>
  );
}
