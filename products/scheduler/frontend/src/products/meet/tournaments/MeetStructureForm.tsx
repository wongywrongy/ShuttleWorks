/**
 * MeetStructureForm — the "Meet" tab of Configuration.
 *
 * Owns the two meet-specific structural choices: the meet type (Dual /
 * Tri) and the lineup position **counts** per discipline (`rankCounts`,
 * e.g. 3 = 1st–3rd singles). The player-assignment grid (`PositionGrid`)
 * stays in Roster — this tab sets *how many* positions, not *who* fills
 * them.
 *
 * Save model mirrors the former `TournamentConfigForm`: the form spreads
 * the full config so saving the Meet tab never drops Engine-tab fields,
 * and identity (name / date) is re-derived from the freshest config prop
 * and never coerced to '' — otherwise a save here would blank the Hub
 * workspace summary (the identity-clobber bug guarded below).
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { TournamentConfig } from '../../../api/dto';
import { useTournamentId } from '../../../hooks/useTournamentId';
import { useSuccessFlash } from '../../../hooks/useSuccessFlash';
import { Button, IconDone } from '@scheduler/design-system';
import {
  Row,
  SectionHeader,
  Seg,
  NumberWithSuffix,
} from '../../../platform/settings/SettingsControls';

interface MeetStructureFormProps {
  config: TournamentConfig;
  onSave: (config: TournamentConfig) => void;
  saving: boolean;
  /** When set, the form carries this id so the page actions-bar Save can
   *  submit it via `form=`, and the in-form Save button is hidden. */
  formId?: string;
}

const MEET_TYPE_OPTIONS = [
  { value: 'dual' as const, label: 'Dual' },
  { value: 'tri' as const, label: 'Tri' },
];

const DEFAULT_RANKS = { MS: 3, WS: 3, MD: 2, WD: 2, XD: 2 };

export function MeetStructureForm({
  config,
  onSave,
  saving,
  formId,
}: MeetStructureFormProps) {
  const [formData, setFormData] = useState<TournamentConfig>({
    ...config,
    rankCounts: config.rankCounts || { ...DEFAULT_RANKS },
    meetMode: config.meetMode ?? 'dual',
    tournamentName: config.tournamentName,
    tournamentDate: config.tournamentDate,
  });
  const justSaved = useSuccessFlash(saving);
  const tid = useTournamentId();

  const baselineRef = useRef<TournamentConfig>(config);

  // Dirty-check: adopt new server values only for fields the user hasn't
  // touched since the last accepted baseline — an autosave from another
  // tab can't clobber an in-flight edit.
  useEffect(() => {
    setFormData((prev) => {
      const merged: TournamentConfig = { ...prev };
      const prevBaseline = baselineRef.current;
      (Object.keys(config) as Array<keyof TournamentConfig>).forEach((key) => {
        const userTouched =
          JSON.stringify(prev[key]) !== JSON.stringify(prevBaseline[key]);
        if (!userTouched) {
          (merged as unknown as Record<string, unknown>)[key] = config[key];
        }
      });
      if (merged.rankCounts == null) merged.rankCounts = { ...DEFAULT_RANKS };
      if (merged.meetMode == null) merged.meetMode = 'dual';
      return merged;
    });
    baselineRef.current = config;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSave({
      ...formData,
      // Identity is re-derived from the freshest config prop, never form
      // state. When config has no identity these are `undefined` → omitted
      // from the JSON PUT → the backend summary-mirror is skipped, so the
      // workspace name/date survive.
      tournamentName: config.tournamentName,
      tournamentDate: config.tournamentDate,
    });
  };

  const ranks = formData.rankCounts ?? { ...DEFAULT_RANKS };
  const setRank = (key: 'MS' | 'WS' | 'MD' | 'WD' | 'XD', n: number) =>
    setFormData((prev) => ({
      ...prev,
      rankCounts: { ...(prev.rankCounts ?? ranks), [key]: n },
    }));

  return (
    <form id={formId} onSubmit={handleSubmit}>
      <section>
        <SectionHeader>Format</SectionHeader>
        <Row
          label="Meet type"
          control={
            <Seg
              options={MEET_TYPE_OPTIONS}
              value={formData.meetMode ?? 'dual'}
              onChange={(v) => setFormData((prev) => ({ ...prev, meetMode: v }))}
              ariaLabel="Meet type"
            />
          }
          last
        />
      </section>

      <section>
        <SectionHeader>Events</SectionHeader>
        <p className="pb-1 text-xs text-muted-foreground">
          Lineup positions contested per discipline (e.g. 3 = 1st–3rd singles).
          Who fills each position lives in{' '}
          <Link
            to={`/tournaments/${tid}/roster`}
            className="text-accent hover:underline"
          >
            Roster
          </Link>
          .
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10">
          <Row label="Men's singles" control={
            <NumberWithSuffix value={ranks.MS ?? 3} onChange={(n) => setRank('MS', n)} suffix="positions" min={0} max={20} ariaLabel="Men's singles positions" />
          } />
          <Row label="Women's singles" control={
            <NumberWithSuffix value={ranks.WS ?? 3} onChange={(n) => setRank('WS', n)} suffix="positions" min={0} max={20} ariaLabel="Women's singles positions" />
          } />
          <Row label="Men's doubles" control={
            <NumberWithSuffix value={ranks.MD ?? 2} onChange={(n) => setRank('MD', n)} suffix="positions" min={0} max={20} ariaLabel="Men's doubles positions" />
          } />
          <Row label="Women's doubles" control={
            <NumberWithSuffix value={ranks.WD ?? 2} onChange={(n) => setRank('WD', n)} suffix="positions" min={0} max={20} ariaLabel="Women's doubles positions" />
          } />
          <Row label="Mixed doubles" control={
            <NumberWithSuffix value={ranks.XD ?? 2} onChange={(n) => setRank('XD', n)} suffix="positions" min={0} max={20} ariaLabel="Mixed doubles positions" />
          } last />
        </div>
      </section>

      {/* In-form Save — hidden when the page actions-bar Save owns
          submission (formId set). */}
      {!formId ? (
        <div className="mt-6">
          <Button type="submit" disabled={saving}>
            {justSaved ? (
              <span key="saved" className="motion-enter-icon inline-flex items-center gap-2">
                <IconDone size={16} /> Saved
              </span>
            ) : saving ? (
              'Saving…'
            ) : (
              'Save meet settings'
            )}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
