/**
 * Configuration page — two-zone layout.
 *
 * A fixed 44px actions bar owns the page title, the Tournament / Engine
 * sub-page switcher (replacing the old in-content tab strip), and the
 * Save button. The scrollable content area below renders the active
 * section's form.
 *
 * Save is lifted to the bar via native `form=` association: only the
 * active section's form is mounted and carries `id={FORM_ID}`, so the
 * bar's `type="submit" form={FORM_ID}` button triggers that form's own
 * submit handler — the validation and the `updateConfig` payload are
 * unchanged from when each form owned its own button. A single `busy`
 * flag drives the Saving…/Saved feedback (page-owned for Tournament,
 * reported up from Engine).
 *
 * Page-level banners (lock indicator, new-tournament hint, errors) stack
 * as `border-b` ribbon rows between the bar and the content.
 */
import { useState } from 'react';
import { useTournament } from '../../hooks/useTournament';
import { useLockGuard } from '../../hooks/useLockGuard';
import { useSuccessFlash } from '../../hooks/useSuccessFlash';
import { useSearchParamState } from '../../hooks/useSearchParamState';
import { TournamentConfigForm } from './tournaments/TournamentConfigForm';
import { ScheduleLockIndicator } from '../../components/status/ScheduleLockIndicator';
import { EngineSettings } from './settings/EngineSettings';
import { MeetActionsBar } from './components/MeetActionsBar';
import { Seg } from '../../platform/settings/SettingsControls';
import { IconDone } from '@scheduler/design-system';
import type { TournamentConfig } from '../../api/dto';

const FORM_ID = 'meet-config-form';

const SECTION_OPTIONS = [
  { value: 'tournament' as const, label: 'Tournament' },
  { value: 'engine' as const, label: 'Engine' },
];

export function TournamentSetupPage() {
  const { config, loading, error, updateConfig } = useTournament();
  const { isLocked, confirmUnlock } = useLockGuard();
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [section, setSection] = useSearchParamState('section', 'tournament', {
    debounceMs: 0,
  });
  const justSaved = useSuccessFlash(busy);

  const handleSave = async (newConfig: TournamentConfig) => {
    if (!(await confirmUnlock())) return;
    try {
      setBusy(true);
      setSaveError(null);
      await updateConfig(newConfig);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save configuration');
    } finally {
      setBusy(false);
    }
  };

  // Show default config if tournament doesn't exist (404 error)
  const defaultConfig: TournamentConfig = {
    intervalMinutes: 30,
    dayStart: '09:00',
    dayEnd: '18:00',
    breaks: [],
    courtCount: 4,
    defaultRestMinutes: 30,
    freezeHorizonSlots: 0,
    rankCounts: { MS: 3, WS: 3, MD: 2, WD: 2, XD: 2 },
  };

  const displayConfig = config || defaultConfig;
  const isNewTournament = !config && error && error.includes('not found');
  const activeSection = section === 'engine' ? 'engine' : 'tournament';

  if (loading && !config && !error) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-muted-foreground">Loading tournament configuration…</div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <MeetActionsBar title="Configuration">
        <Seg
          options={SECTION_OPTIONS}
          value={activeSection}
          onChange={(v) => setSection(v)}
          ariaLabel="Configuration section"
        />
        <button
          type="submit"
          form={FORM_ID}
          disabled={busy}
          data-testid="config-save"
          className="inline-flex h-7 items-center gap-1.5 rounded-sm bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity duration-fast ease-brand hover:opacity-90 disabled:opacity-50"
        >
          {justSaved ? (
            <span className="motion-enter-icon inline-flex items-center gap-1.5">
              <IconDone size={14} /> Saved
            </span>
          ) : busy ? (
            'Saving…'
          ) : (
            'Save'
          )}
        </button>
      </MeetActionsBar>

      {/* Page-level banners — full-bleed border-b ribbons, each shrink-0. */}
      {isLocked ? <ScheduleLockIndicator showUnlockHint /> : null}
      {isNewTournament ? (
        <div className="motion-enter shrink-0 border-b border-status-started/40 bg-status-started/5 px-4 py-2 text-xs text-status-started">
          <span className="font-semibold">New tournament — </span>
          configure settings below. Saved on first save.
        </div>
      ) : null}
      {error && !isNewTournament ? (
        <div className="motion-enter shrink-0 border-b border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      {saveError ? (
        <div className="motion-enter shrink-0 border-b border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {saveError}
        </div>
      ) : null}

      {/* Scrollable content — the active section's form. Only one form is
          mounted at a time, both share FORM_ID so the bar Save targets it. */}
      <div className="min-h-0 flex-1 overflow-auto px-4 pb-6 pt-3">
        {activeSection === 'engine' ? (
          <EngineSettings formId={FORM_ID} onBusyChange={setBusy} />
        ) : (
          <TournamentConfigForm
            formId={FORM_ID}
            config={displayConfig}
            onSave={handleSave}
            saving={busy}
          />
        )}
      </div>
    </div>
  );
}
