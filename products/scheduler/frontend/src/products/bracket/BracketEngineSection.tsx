/**
 * BracketEngineSection — the Engine tab of bracket Configuration.
 *
 * The bracket's CP-SAT input surface. It surfaces the SAME scoring field
 * set as the Meet Engine tab (via the shared `ScoringFields`) plus the
 * one bracket-specific timing input, rest between rounds. Courts, slot
 * duration, and the day window live in workspace settings — the nudge
 * line points there.
 *
 * Persist path: scoring writes through `setConfig` immediately; the rest
 * field writes on blur (only when changed). `useTournamentState`'s
 * debounce coalesces the PUT either way.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTournamentStore } from '../../store/tournamentStore';
import { useTournamentId } from '../../hooks/useTournamentId';
import type { TournamentConfig } from '../../api/dto';
import { Row, SectionHeader } from '../../platform/settings/SettingsControls';
import {
  ScoringFields,
  type ScoringValue,
} from '../../platform/settings/ScoringFields';

const FALLBACK_CONFIG: TournamentConfig = {
  intervalMinutes: 30,
  dayStart: '09:00',
  dayEnd: '18:00',
  breaks: [],
  courtCount: 4,
  defaultRestMinutes: 0,
  freezeHorizonSlots: 0,
  restBetweenRounds: 1,
};

const TEXT_INPUT_CLASSES =
  'h-7 rounded-sm border border-border bg-bg-elev px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring';

export function BracketEngineSection() {
  const config = useTournamentStore((s) => s.config);
  const setConfig = useTournamentStore((s) => s.setConfig);
  const tid = useTournamentId();

  const [restDraft, setRestDraft] = useState(
    String(config?.restBetweenRounds ?? 1),
  );

  useEffect(() => {
    setRestDraft(String(config?.restBetweenRounds ?? 1));
  }, [config?.restBetweenRounds]);

  const update = (patch: Partial<TournamentConfig>) => {
    setConfig({ ...(config ?? FALLBACK_CONFIG), ...patch });
  };

  const scoring: ScoringValue = {
    scoringFormat: config?.scoringFormat ?? 'badminton',
    pointsPerSet: config?.pointsPerSet ?? 21,
    setsToWin: config?.setsToWin ?? 2,
    deuceEnabled: config?.deuceEnabled ?? true,
  };

  return (
    <div>
      <SectionHeader>Scoring</SectionHeader>
      <ScoringFields value={scoring} onChange={(patch) => update(patch)} />

      <SectionHeader>Timing</SectionHeader>
      <p className="pb-1 text-xs text-muted-foreground">
        Courts, slot duration, and the day window live in{' '}
        <Link
          to={`/tournaments/${tid}/ws-venue`}
          className="text-accent hover:underline"
        >
          Venue &amp; schedule
        </Link>
        .
      </p>
      <Row
        label="Rest between rounds (slots)"
        control={
          <input
            type="number"
            min={0}
            max={32}
            aria-label="Rest between rounds (slots)"
            value={restDraft}
            onChange={(e) => setRestDraft(e.target.value)}
            onBlur={(e) => {
              const next = Number(e.target.value);
              if (next !== (config?.restBetweenRounds ?? 1)) {
                update({ restBetweenRounds: next });
              }
            }}
            className={`${TEXT_INPUT_CLASSES} w-20 tabular-nums`}
          />
        }
        last
      />
    </div>
  );
}
