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
import { LockRibbon } from '../../components/status/LockRibbon';
import { EngineConfigForm } from '../../platform/settings/EngineConfigForm';
import { ConfigSurface } from '../../platform/settings/ConfigSurface';
import { IconDone } from '@scheduler/design-system';

const FORM_ID = 'meet-config-form';

export function TournamentSetupPage() {
  const { config, loading, error } = useTournament();
  const { isLocked, confirmUnlock } = useLockGuard();
  const [busy, setBusy] = useState(false);
  // Save errors now render inside EngineConfigForm, which owns the save.
  const [saveError] = useState<string | null>(null);
  const justSaved = useSuccessFlash(busy);

  const isNewTournament = !config && error && error.includes('not found');

  if (loading && !config && !error) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-muted-foreground">Loading tournament configuration…</div>
      </div>
    );
  }

  return (
    <ConfigSurface
      actions={
        <button
          type="submit"
          form={FORM_ID}
          disabled={busy}
          data-testid="config-save"
          className="inline-flex h-7 items-center gap-1.5 rounded-sm bg-accent px-3 text-xs font-medium text-accent-ink shadow-glow transition-[filter] duration-fast ease-brand hover:brightness-110 disabled:opacity-50"
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
      }
      ribbons={
        <>
          {/* Page-level banners — full-bleed border-b ribbons, each shrink-0. */}
          {isLocked ? <LockRibbon tier="soft" locked /> : null}
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
        </>
      }
    >
      {/* ONE form, one save path. Configuration used to be an Engine/Events
          switch over two forms that each spread the whole config on submit;
          the meet-structure fields now live in this form's own state, so
          Format and Events are just its first two sections. */}
      <EngineConfigForm
        module="meet"
        formId={FORM_ID}
        onBusyChange={setBusy}
        guardSave={() => confirmUnlock('save configuration')}
      />
    </ConfigSurface>
  );
}
