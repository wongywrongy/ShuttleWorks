/**
 * SetupProduct — the workflow-first Setup surface (SP-OPCON-1 rework).
 *
 * Two modes off one route family:
 *
 * - `/setup` (landing) renders the ONE full readiness checklist (RDY-3).
 * - `/setup/{section}` renders that section's editor with a one-line strip
 *   (section status + overall) linking back — the checklist card does not
 *   repeat beside a rail that already lists the same sections.
 *
 * Readiness itself is server-derived from domain rows (ruling R-M A); this
 * component renders it and never re-derives. A section whose `authority` is
 * `domain` (events once real draws/divisions exist — ruling R-N A) renders a
 * read-only summary of actual state plus a link to the owning surface; its
 * editor and Save affordance do not mount, so the "empty events textarea over
 * five running draws" state (evidence S09) is structurally impossible.
 *
 * Inputs follow the settings row grammar (`platform/engine-config/
 * SettingsControls`): free text → `FieldRow`, everything else → `Row` with a
 * fixed-width control (Seg / Toggle / number+unit). Repeating records use
 * `SetupRowsEditor` (INP-1) — the pipe textareas and their syntax captions
 * are gone. There is no Refresh button (INP-3): the surface refetches on
 * section navigation, after every save (the PATCH returns the full setup),
 * and on window focus.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button, Notice } from '@scheduler/design-system';
import { ActionsBar, PageBody } from '../../components/control-plane';
import {
  FieldRow,
  NumberWithSuffix,
  Row,
  Seg,
  SelectInput,
  Toggle,
} from '../../platform/engine-config/SettingsControls';
import { ScoringFields, type ScoringValue } from '../../platform/engine-config/ScoringFields';
import { apiClient } from '../../api/client';
import type {
  SetupKey,
  SetupSectionData,
  SetupSectionStateDTO,
  SetupStatus,
  TournamentSetupDTO,
} from '../../api/dto';
import { STATE_WORD } from '../../lib/stateWords';
import { useUiStore } from '../../store/uiStore';
import { DownstreamImpact } from './DownstreamImpact';
import { SetupRowsEditor, type SetupRow } from './SetupRowsEditor';
import { StatusPill } from '../../components/StatusPill';
import { TEXT_EMPHASIS, TEXT_MUTED_SM, TEXT_MUTED_XS, TEXT_TITLE, TEXT_TITLE_SM } from '../../lib/utils'

const SECTION_LABELS: Record<SetupKey, string> = {
  general: 'General identity',
  dates: 'Dates and sessions',
  venue: 'Venue and courts',
  events: 'Events and eligibility',
  rules: 'Formats and scoring',
  entries: 'Entry rules',
  people: 'Staff contacts',
  'public-info': 'Public information',
};

const SECTION_ORDER: readonly SetupKey[] = [
  'general',
  'dates',
  'venue',
  'events',
  'rules',
  'entries',
  'people',
  'public-info',
];

const STATUS_LABELS: Record<SetupStatus, string> = {
  not_started: 'Not started',
  in_progress: STATE_WORD.pending,
  ready: 'Ready',
  blocked: 'Blocked',
  published: 'Published',
  complete: 'Complete',
};

/** `none` sentinel because the underlying Select cannot carry an empty
 *  string item value; mapped back to null on change. */
const FORMAT_OPTIONS = [
  { value: 'none', label: 'Not set' },
  { value: 'se', label: 'Single elimination' },
  { value: 'de', label: 'Double elimination' },
  { value: 'rr', label: 'Round robin' },
  { value: 'swiss', label: 'Swiss' },
  { value: 'monrad', label: 'Monrad' },
  { value: 'compass', label: 'Compass' },
];

const VISIBILITY_OPTIONS = [
  { value: 'private' as const, label: 'Private' },
  { value: 'unlisted' as const, label: 'Unlisted' },
  { value: 'public' as const, label: 'Public' },
];

function sectionState(setup: TournamentSetupDTO | null, key: SetupKey): SetupSectionStateDTO | null {
  return setup?.sections.find((section) => section.key === key) ?? null;
}

function SetupStatusLabel({ status }: { status: SetupStatus }) {
  if (status === 'blocked') {
    return <StatusPill tone="red">{STATUS_LABELS[status]}</StatusPill>;
  }
  const tone = status === 'published'
    ? 'text-accent'
    : status === 'ready' || status === 'complete'
      ? 'font-semibold text-muted-foreground'
      : 'font-normal text-muted-foreground';
  return <span className={`shrink-0 text-xs ${tone}`}>{STATUS_LABELS[status]}</span>;
}

function textOf(data: SetupSectionData, field: string): string {
  const value = data[field];
  return value == null ? '' : String(value);
}

function rowsOf(data: SetupSectionData, field: string): SetupRow[] {
  const value = data[field];
  return Array.isArray(value) ? (value as SetupRow[]) : [];
}

function numberOf(data: SetupSectionData, field: string): number {
  const value = Number(data[field]);
  return Number.isFinite(value) ? value : 0;
}

function DateTimeRow({
  label,
  value,
  onChange,
  last,
}: {
  label: string;
  value: string;
  onChange: (iso: string | null) => void;
  last?: boolean;
}) {
  return (
    <FieldRow
      label={label}
      type="datetime-local"
      value={value.slice(0, 16)}
      onChange={(event) => onChange(event.target.value ? new Date(event.target.value).toISOString() : null)}
      last={last}
    />
  );
}

function SectionEditor({
  section,
  data,
  onChange,
}: {
  section: SetupSectionStateDTO;
  data: SetupSectionData;
  onChange: (field: string, value: unknown) => void;
}) {
  switch (section.key) {
    case 'general':
      return (
        <div>
          <FieldRow label="Tournament name" value={textOf(data, 'name')} onChange={(e) => onChange('name', e.target.value)} />
          <FieldRow label="Public name" value={textOf(data, 'publicName')} onChange={(e) => onChange('publicName', e.target.value)} />
          <FieldRow label="Organizer" value={textOf(data, 'organizer')} onChange={(e) => onChange('organizer', e.target.value)} />
          <FieldRow label="Timezone" hint="Use an IANA timezone, for example Europe/London." value={textOf(data, 'timezone')} onChange={(e) => onChange('timezone', e.target.value)} />
          <FieldRow label="Tournament number" value={textOf(data, 'tournamentNumber')} onChange={(e) => onChange('tournamentNumber', e.target.value)} />
          <FieldRow label="Season" value={textOf(data, 'season')} onChange={(e) => onChange('season', e.target.value)} last />
        </div>
      );
    case 'dates':
      return (
        <div className="space-y-6">
          <div>
            <DateTimeRow label="Tournament starts" value={textOf(data, 'tournamentStart')} onChange={(iso) => onChange('tournamentStart', iso)} />
            <DateTimeRow label="Tournament ends" value={textOf(data, 'tournamentEnd')} onChange={(iso) => onChange('tournamentEnd', iso)} />
            <DateTimeRow label="Entries open" value={textOf(data, 'entryOpening')} onChange={(iso) => onChange('entryOpening', iso)} />
            <DateTimeRow label="Entry deadline" value={textOf(data, 'entryDeadline')} onChange={(iso) => onChange('entryDeadline', iso)} last />
          </div>
          <SetupRowsEditor
            label="Daily sessions"
            addLabel="Add session"
            columns={[
              { field: 'name', label: 'Name' },
              { field: 'date', label: 'Date', type: 'date' },
              { field: 'startTime', label: 'Starts', type: 'time' },
              { field: 'endTime', label: 'Ends', type: 'time' },
              { field: 'courtIds', label: 'Courts', type: 'list', placeholder: 'court-1, court-2' },
            ]}
            rows={rowsOf(data, 'dailySessions')}
            onChange={(rows) => onChange('dailySessions', rows)}
            newRow={() => ({ name: '', date: '', startTime: '09:00', endTime: '18:00', courtIds: [] })}
          />
        </div>
      );
    case 'venue':
      return (
        <div className="space-y-6">
          <div>
            <FieldRow label="Venue name" value={textOf(data, 'venueName')} onChange={(e) => onChange('venueName', e.target.value)} />
            <FieldRow label="Address" value={textOf(data, 'address')} onChange={(e) => onChange('address', e.target.value)} />
            <FieldRow label="Map link" type="url" value={textOf(data, 'mapLink')} onChange={(e) => onChange('mapLink', e.target.value)} />
            <FieldRow label="Accessibility notes" value={textOf(data, 'accessibilityNotes')} onChange={(e) => onChange('accessibilityNotes', e.target.value)} last />
          </div>
          <SetupRowsEditor
            label="Named courts"
            addLabel="Add court"
            columns={[
              { field: 'name', label: 'Court name' },
              { field: 'group', label: 'Group', placeholder: 'Optional' },
              { field: 'available', label: 'Available', type: 'checkbox' },
            ]}
            rows={rowsOf(data, 'courts')}
            onChange={(rows) => onChange('courts', rows)}
            newRow={() => ({ name: '', group: null, available: true })}
          />
        </div>
      );
    case 'events':
      return (
        <SetupRowsEditor
          label="Events"
          addLabel="Add event"
          columns={[
            { field: 'name', label: 'Name', placeholder: "Men's Singles" },
            { field: 'code', label: 'Code', placeholder: 'MS' },
          ]}
          rows={rowsOf(data, 'events')}
          onChange={(rows) => onChange('events', rows)}
          newRow={() => ({ name: '', code: '', status: 'draft' })}
        />
      );
    case 'rules':
      {
        const scoring: ScoringValue = {
          scoringFormat: textOf(data, 'scoring') === 'simple' ? 'simple' : 'badminton',
          pointsPerSet: numberOf(data, 'pointsPerSet') || 21,
          setsToWin: numberOf(data, 'setsToWin') || 2,
          deuceEnabled: data.deuceEnabled !== false,
        };
        const updateScoring = (patch: Partial<ScoringValue>) => {
          for (const [field, value] of Object.entries(patch)) {
            onChange(field === 'scoringFormat' ? 'scoring' : field, value);
          }
        };
      return (
        <div>
          <Row
            label="Format"
            control={
              <SelectInput
                value={textOf(data, 'format') || 'none'}
                onChange={(v) => onChange('format', v === 'none' ? null : v)}
                options={FORMAT_OPTIONS}
                ariaLabel="Default draw format"
              />
            }
          />
          <ScoringFields value={scoring} onChange={updateScoring} />
          <Row
            label="Default rest"
            control={
              <NumberWithSuffix
                value={numberOf(data, 'defaultRestMinutes')}
                onChange={(v) => onChange('defaultRestMinutes', v >= 0 ? v : null)}
                suffix="min"
                min={0}
                max={240}
                ariaLabel="Default rest minutes"
              />
            }
          />
          <Row
            label="Draw size"
            control={
              <NumberWithSuffix
                value={numberOf(data, 'drawSize')}
                onChange={(v) => onChange('drawSize', v > 0 ? v : null)}
                suffix="players"
                min={2}
                max={4096}
                ariaLabel="Draw size"
              />
            }
            last
          />
        </div>
      );
      }
    case 'entries':
      return (
        <div>
          <FieldRow label="Registration method" value={textOf(data, 'registrationMethod')} onChange={(e) => onChange('registrationMethod', e.target.value)} />
          <FieldRow label="Partner rules" value={textOf(data, 'partnerRules')} onChange={(e) => onChange('partnerRules', e.target.value)} last />
          <Row
            label="Payment required"
            control={<Toggle value={Boolean(data.paymentRequired)} onChange={(v) => onChange('paymentRequired', v)} ariaLabel="Payment required" />}
          />
          <Row
            label="Waitlist enabled"
            control={<Toggle value={Boolean(data.waitlistEnabled)} onChange={(v) => onChange('waitlistEnabled', v)} ariaLabel="Waitlist enabled" />}
          />
          <Row
            label="Organizer approval required"
            control={<Toggle value={Boolean(data.organizerApprovalRequired)} onChange={(v) => onChange('organizerApprovalRequired', v)} ariaLabel="Organizer approval required" />}
            last
          />
        </div>
      );
    case 'people':
      return (
        <SetupRowsEditor
          label="Contacts"
          addLabel="Add contact"
          columns={[
            { field: 'role', label: 'Role', placeholder: 'Referee' },
            { field: 'name', label: 'Name' },
            { field: 'email', label: 'Email', type: 'email' },
            { field: 'public', label: 'Public', type: 'checkbox' },
          ]}
          rows={rowsOf(data, 'contacts')}
          onChange={(rows) => onChange('contacts', rows)}
          newRow={() => ({ role: '', name: '', email: null, public: false })}
        />
      );
    case 'public-info':
      return (
        <div>
          <FieldRow label="Public slug" value={textOf(data, 'publicSlug')} onChange={(e) => onChange('publicSlug', e.target.value)} />
          <FieldRow label="Description" value={textOf(data, 'description')} onChange={(e) => onChange('description', e.target.value)} />
          <FieldRow label="Regulations URL" type="url" value={textOf(data, 'regulationsUrl')} onChange={(e) => onChange('regulationsUrl', e.target.value)} />
          <FieldRow label="Logo URL" type="url" value={textOf(data, 'logoUrl')} onChange={(e) => onChange('logoUrl', e.target.value)} />
          <FieldRow label="Banner URL" type="url" value={textOf(data, 'bannerUrl')} onChange={(e) => onChange('bannerUrl', e.target.value)} last />
          <Row
            label="Visibility"
            control={
              <Seg
                options={VISIBILITY_OPTIONS}
                value={textOf(data, 'visibility') as 'private' | 'unlisted' | 'public'}
                onChange={(v) => onChange('visibility', v)}
                ariaLabel="Public visibility"
              />
            }
            last
          />
        </div>
      );
  }
}

/** Ruling R-N (A): real events exist, so Setup shows them and points at the
 *  owning surface instead of mounting an editor over a shadow copy. */
function DomainEventsSummary({
  tid,
  data,
}: {
  tid: string;
  data: SetupSectionData;
}) {
  const storeKind = useUiStore((state) => state.activeTournamentKind);
  const events = rowsOf(data, 'events');
  // Before the kind fetch lands, the rows themselves disambiguate: only
  // bracket-derived events carry `discipline` (see `_domain_events`).
  const kind = storeKind ?? (events.some((event) => 'discipline' in event) ? 'bracket' : 'meet');
  const owner = kind === 'bracket'
    ? { href: `/tournaments/${encodeURIComponent(tid)}/competition/draws`, label: 'Manage events in Competition' }
    : { href: `/tournaments/${encodeURIComponent(tid)}/participants/people`, label: 'Manage divisions from the Roster' };
  return (
    <div>
      <div>
        {events.map((event, index) => (
          <Row
            key={String(event.id ?? index)}
            label={String(event.name ?? event.code ?? '')}
            control={<span className={TEXT_MUTED_SM}>{String(event.code ?? '')}</span>}
            readOnly
            last={index === events.length - 1}
          />
        ))}
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        These events are live domain records; this page is a summary.{' '}
        <Link to={owner.href} className="text-accent underline underline-offset-2">
          {owner.label}
        </Link>
      </p>
    </div>
  );
}

function DomainVenueSummary({ tid, data }: { tid: string; data: SetupSectionData }) {
  const courts = rowsOf(data, 'courts');
  return (
    <div>
      <div>
        {textOf(data, 'venueName') ? (
          <Row label="Venue" control={textOf(data, 'venueName')} readOnly />
        ) : null}
        {textOf(data, 'address') ? (
          <Row label="Address" control={textOf(data, 'address')} readOnly />
        ) : null}
        {courts.map((court, index) => (
          <Row
            key={String(court.id ?? index)}
            label={String(court.name ?? `Court ${index + 1}`)}
            control={court.available === false ? 'Unavailable' : String(court.group ?? 'Available')}
            readOnly
            last={index === courts.length - 1}
          />
        ))}
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        The current plan uses these courts, so Setup is read-only.{' '}
        <Link
          to={`/tournaments/${encodeURIComponent(tid)}/operations/plan`}
          className="text-accent underline underline-offset-2"
        >
          Manage the schedule in Operations · Plan
        </Link>
      </p>
    </div>
  );
}

function DomainSectionSummary({
  tid,
  section,
}: {
  tid: string;
  section: SetupSectionStateDTO;
}) {
  return section.key === 'venue'
    ? <DomainVenueSummary tid={tid} data={section.data} />
    : <DomainEventsSummary tid={tid} data={section.data} />;
}

export function SetupProduct({ tid }: { tid: string }) {
  const location = useLocation();
  const routeKey = useMemo<SetupKey | null>(() => {
    const candidate = location.pathname.split('/').filter(Boolean).pop();
    return SECTION_ORDER.includes(candidate as SetupKey) ? (candidate as SetupKey) : null;
  }, [location.pathname]);
  const [setup, setSetup] = useState<TournamentSetupDTO | null>(null);
  const [draft, setDraft] = useState<SetupSectionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await apiClient.getTournamentSetup(tid);
      setSetup(next);
      if (routeKey) {
        const selected = sectionState(next, routeKey);
        if (selected) setDraft(selected.data);
      }
    } catch {
      setError('Setup could not be loaded. Check the connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [routeKey, tid]);

  useEffect(() => {
    void load();
  }, [load]);

  // INP-3: no Refresh button. Navigation and save already refetch (`load`
  // re-runs per section; PATCH returns the whole setup); window focus covers
  // the remaining staleness case (edits made in another tab or by a peer).
  useEffect(() => {
    const onFocus = () => {
      void load();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  const selected = routeKey ? sectionState(setup, routeKey) : null;
  const editable = selected != null && selected.authority !== 'domain';

  const save = async () => {
    if (!draft || !selected || !editable) return;
    setSaving(true);
    setError(null);
    try {
      const next = await apiClient.patchTournamentSetup(tid, selected.key, draft);
      setSetup(next);
      const updated = sectionState(next, selected.key);
      if (updated) setDraft(updated.data);
    } catch {
      setError('This section changed elsewhere. Reload it before saving again.');
    } finally {
      setSaving(false);
    }
  };

  const setupHref = `/tournaments/${encodeURIComponent(tid)}/setup`;
  const overall = setup
    ? `${STATUS_LABELS[setup.status]}${setup.blockingIssueCount ? ` · ${setup.blockingIssueCount} blocking` : ''}`
    : null;

  // ---- Landing: the ONE full checklist rendering (RDY-3) ----
  if (!routeKey) {
    return (
      <div className="flex min-h-full flex-col bg-background">
        <ActionsBar title="Setup" status={loading && !setup ? 'Loading…' : overall ?? ''} />
        <PageBody variant="form">
          {error ? <Notice tone="warning" title="Setup needs attention">{error}</Notice> : null}
          {loading && !setup ? (
            <div className="rounded border border-border bg-card p-6 text-sm text-muted-foreground">Loading setup sections…</div>
          ) : setup ? (
            <section aria-labelledby="setup-sections-heading" className="rounded border border-border bg-card">
              <div className="border-b border-border px-4 py-3">
                <h2 id="setup-sections-heading" className={TEXT_TITLE_SM}>Readiness checklist</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Complete the sections in any order. Blocking issues explain what must change before the event can run.
                </p>
              </div>
              <div className="divide-y divide-border">
                {SECTION_ORDER.map((key) => {
                  const item = sectionState(setup, key);
                  if (!item) return null;
                  const blocking = item.issues.filter((issue) => issue.severity === 'blocking').length;
                  return (
                    <Link key={item.key} to={`${setupHref}/${item.key}`} className="block px-4 py-3 hover:bg-muted/30">
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-sm font-medium text-foreground">{SECTION_LABELS[item.key]}</span>
                        <SetupStatusLabel status={item.status} />
                      </div>
                      <span className="mt-1 block text-xs text-muted-foreground">{item.summary}</span>
                      {blocking ? (
                        <span className="mt-1 block text-xs text-destructive">
                          {blocking} blocking issue{blocking === 1 ? '' : 's'}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
              <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
                <span className={TEXT_EMPHASIS}>Overall:</span> {overall}
              </div>
            </section>
          ) : null}
        </PageBody>
      </div>
    );
  }

  // ---- Section page: strip + editor, checklist lives on the landing ----
  return (
    <div className="flex min-h-full flex-col bg-background">
      <ActionsBar
        title={`Setup · ${SECTION_LABELS[routeKey]}`}
        status={loading && !setup ? 'Loading…' : ''}
      >
        {editable ? (
          <Button size="sm" onClick={() => void save()} disabled={!selected || !draft || saving}>
            {saving ? 'Saving…' : 'Save section'}
          </Button>
        ) : null}
      </ActionsBar>
      <PageBody variant="form">
        <div className="space-y-4">
          {error ? <Notice tone="warning" title="Setup needs attention">{error}</Notice> : null}
          {setup && selected ? (
            <>
              <div
                data-testid="setup-strip"
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded border border-border bg-card px-4 py-2"
              >
                <SetupStatusLabel status={selected.status} />
                <span className={TEXT_MUTED_XS}>Overall: {overall}</span>
                <Link to={setupHref} className="ml-auto text-xs text-accent underline underline-offset-2">
                  View full checklist
                </Link>
              </div>
              {selected.issues.length ? (
                <div className="space-y-2">
                  {selected.issues.map((issue) => (
                    <Notice
                      key={issue.code}
                      tone={issue.severity === 'blocking' ? 'warning' : 'info'}
                      title={issue.message}
                    />
                  ))}
                </div>
              ) : null}
              <section aria-labelledby="setup-editor-heading" className="min-w-0 rounded border border-border bg-card">
                <div className="border-b border-border px-5 py-4">
                  <h2 id="setup-editor-heading" className={TEXT_TITLE}>
                    {SECTION_LABELS[selected.key]}
                  </h2>
                </div>
                <div className="space-y-6 p-5">
                  {selected.authority === 'domain' ? (
                    <DomainSectionSummary tid={tid} section={selected} />
                  ) : draft ? (
                    <SectionEditor
                      section={selected}
                      data={draft}
                      onChange={(field, value) => setDraft((previous) => ({ ...(previous ?? {}), [field]: value }))}
                    />
                  ) : null}
                  <DownstreamImpact targets={selected.downstreamImpact} />
                </div>
              </section>
            </>
          ) : loading ? (
            <div className="rounded border border-border bg-card p-6 text-sm text-muted-foreground">Loading setup sections…</div>
          ) : null}
        </div>
      </PageBody>
    </div>
  );
}

export { SECTION_LABELS, STATUS_LABELS };
