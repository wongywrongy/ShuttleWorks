import { useEffect, useState } from 'react';
import { Button, Checkbox, FormActions, Select } from '@scheduler/design-system';
import { apiClient } from '../../api/client';
import type { EntryPageDTO, EntryPagePublicationPatchDTO } from '../../api/dto';
import { useCanEdit } from '../../hooks/useCanEdit';
import { PropertyPanel } from '../../components/control-plane/PropertyPanel';
import { Section } from '../../platform/engine-config/SettingsControls';

type Publication = Required<EntryPagePublicationPatchDTO>;
type LoadState = 'loading' | 'ready' | 'absent' | 'denied' | 'failed';
const audienceOptions = [
  { value: 'private', label: 'Private' },
  { value: 'unlisted', label: 'Unlisted' },
  { value: 'public', label: 'Public' },
] as const;
const audienceDescription = {
  private: 'The public site is unavailable. Entrants can still access their own entries.',
  unlisted: 'Anyone with the page link can view it. It is excluded from tournament discovery.',
  public: 'Anyone can find and view the tournament page.',
};
const rows = [
  { key: 'entrantsPublished', label: 'Entrant list', detail: 'Confirmed entrant names, clubs, and player pages.', review: 'participants/people', reviewLabel: 'Review entrants' },
  { key: 'drawsPublished', label: 'Draws & seeded entries', detail: 'Shows draw pairings and player names. Scores appear only when Results is on.', review: 'competition/draws', reviewLabel: 'Review draws' },
  { key: 'resultsPublished', label: 'Results', detail: 'Scores, standings, winners, and win-loss records.', review: 'competition/matches', reviewLabel: 'Review results' },
] as const;
function publicationOf(page: EntryPageDTO): Publication {
  return { audience: page.audience, entrantsPublished: page.entrantsPublished, drawsPublished: page.drawsPublished, resultsPublished: page.resultsPublished };
}
function httpStatus(error: unknown): number | undefined {
  const value = error as { status?: number; response?: { status?: number } } | null;
  return value?.response?.status ?? value?.status;
}

/** Publication changes are a deliberate transaction, separate from saving Setup. */
export function PublicationSettings({ tid, bracketEnabled = true }: { tid: string; bracketEnabled?: boolean }) {
  const canEdit = useCanEdit();
  const [state, setState] = useState<LoadState>('loading');
  const [page, setPage] = useState<EntryPageDTO | null>(null);
  const [draft, setDraft] = useState<Publication | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  useEffect(() => {
    let cancelled = false;
    setState('loading');
    setError(null);
    apiClient.getEntryPage(tid).then((result) => {
      if (cancelled) return;
      setPage(result);
      setDraft(publicationOf(result));
      setState('ready');
    }).catch((cause: unknown) => {
      if (cancelled) return;
      const status = httpStatus(cause);
      setState(status === 401 || status === 403 ? 'denied' : status === 404 ? 'absent' : 'failed');
    });
    return () => { cancelled = true; };
  }, [tid, attempt]);
  if (!canEdit || state === 'denied') return <p>You need operator access to manage publication.</p>;
  if (state === 'loading') return <p role="status">Loading publication settings…</p>;
  if (state === 'absent') return <p>No public page is configured. <a className="text-accent underline" href={`/tournaments/${encodeURIComponent(tid)}/participants/entries`}>Set up the entry page</a>.</p>;
  if (state === 'failed') return <div role="alert"><p>Publication settings could not be loaded. Their current state is unknown.</p><Button variant="outline" className="mt-4" onClick={() => setAttempt((n) => n + 1)}>Retry</Button></div>;
  if (!draft || !page) return null;
  const current = publicationOf(page);
  const dirty = Object.keys(current).some((key) => current[key as keyof Publication] !== draft[key as keyof Publication]);
  const update = (patch: Partial<Publication>) => { setDraft({ ...draft, ...patch }); setSaved(false); setError(null); };
  async function save() {
    if (!draft || !page || !online || !canEdit || busy) return;
    const previous = publicationOf(page);
    const patch = Object.fromEntries(Object.entries(draft).filter(([key, value]) => previous[key as keyof Publication] !== value)) as EntryPagePublicationPatchDTO;
    setBusy(true);
    setError(null);
    try {
      const result = await apiClient.patchEntryPagePublication(tid, patch);
      setPage(result);
      setDraft(publicationOf(result));
      setSaved(true);
    } catch (cause) {
      const code = (cause as { response?: { data?: { detail?: { code?: string } } } })?.response?.data?.detail?.code;
      if (code === 'EVENT_CHECKED_OUT') {
        setError('Publication is locked while an event node controls this tournament. Return control before publishing. Your changes are still unsaved.');
      } else setError('Publication was not confirmed. Your changes are still unsaved. Reconnect and retry.');
    } finally { setBusy(false); }
  }
  return (
    <PropertyPanel><form data-testid="sharing-publication" className="space-y-6" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <Section title="Audience">
        <div className="space-y-2 py-4">
          <Select ariaLabel="Public audience" options={audienceOptions} value={draft.audience} onValueChange={(value) => update({ audience: value as Publication['audience'] })} disabled={busy} />
          <p className="text-sm text-muted-foreground">{audienceDescription[draft.audience]}</p>
          {!page.isOpen && <p className="text-sm text-muted-foreground">The page is disabled. Enable it in Entry page settings before it can be viewed.</p>}
        </div>
      </Section>
      <Section title="Visible content">
        <div className="divide-y divide-border">
          {rows.map(({ key, label, detail, review, reviewLabel }) => (
            <div key={key} className="flex items-start justify-between gap-4 py-4">
              <Checkbox
                className="min-w-0"
                checked={draft[key]}
                disabled={busy}
                onChange={(event) => update({ [key]: event.target.checked })}
                label={<><span className="font-semibold">{label}</span><span className="mt-1 block text-muted-foreground">{detail}</span></>}
              />
              {(key !== 'drawsPublished' || bracketEnabled) && <a className="shrink-0 text-sm text-accent underline" href={`/tournaments/${encodeURIComponent(tid)}/${review}`}>{reviewLabel}</a>}
            </div>
          ))}
        </div>
      </Section>
      <div className="space-y-4 border-t border-border pt-6">
        <p className="text-sm text-muted-foreground" role="status">{!online ? 'Offline. Publication requires a connection; these changes are not queued.' : dirty ? 'Unsaved changes. Saving applies the selected audience and content to the public site.' : saved ? 'Publication settings saved.' : `Current audience: ${audienceOptions.find((option) => option.value === page.audience)?.label}.`}</p>
        <FormActions
          dirty={dirty}
          saving={busy}
          error={error ?? undefined}
          saveBlocked={!online}
          cleanReason={saved ? 'Publication settings saved' : 'No changes'}
          onSave={() => void save()}
          onDiscard={() => { setDraft(current); setError(null); setSaved(false); }}
          saveLabel="Save publication changes"
          discardLabel="Discard changes"
          asFormSubmit
        />
      </div>
    </form></PropertyPanel>
  );
}
