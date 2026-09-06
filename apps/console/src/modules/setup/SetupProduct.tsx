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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button, Notice } from '@scheduler/design-system';
import { ActionsBar, PageBody } from '../../components/control-plane';
import {
  FieldRow,
  NumberWithSuffix,
  Row,
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
import { PropertyPanel } from '../../components/control-plane/PropertyPanel';
import { localInputToUtc, zonedLocalInput } from '../../lib/timezoneLocal';
import { SetupRowsEditor, type SetupRow } from './SetupRowsEditor';
import { StatusPill } from '../../components/StatusPill';
import { TEXT_EMPHASIS, TEXT_MUTED_SM, TEXT_MUTED_XS, TEXT_TITLE_SM } from '../../lib/utils'

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
  { value: 'none', label: 'Not configured' },
  { value: 'mixed', label: 'Mixed / by event' },
  { value: 'se', label: 'Single elimination' },
  { value: 'de', label: 'Double elimination' },
  { value: 'rr', label: 'Round robin' },
  { value: 'swiss', label: 'Swiss' },
  { value: 'monrad', label: 'Monrad' },
  { value: 'compass', label: 'Compass' },
];

const supportedTimezones = (Intl as typeof Intl & {
  supportedValuesOf?: (key: 'timeZone') => string[];
}).supportedValuesOf?.('timeZone') ?? [];
const TIMEZONE_OPTIONS = ['UTC', ...supportedTimezones.filter((zone) => zone !== 'UTC')];
function timezoneLabel(zone: string): string {
  if (zone === 'UTC') return 'UTC';
  return zone.replace(/_/g, ' ').replace(/\//g, ' / ');
}
const TIMEZONE_SELECT_OPTIONS = TIMEZONE_OPTIONS.map((zone) => ({
  value: zone,
  label: timezoneLabel(zone),
}));

const REGISTRATION_OPTIONS = [
  { value: 'none', label: 'Not configured' },
  { value: 'online', label: 'Online entry' },
  { value: 'email', label: 'Email or paper entry' },
  { value: 'invitation', label: 'Invitation only' },
] as const;
const CONTACT_ROLE_OPTIONS = [
  { value: 'tournament-director', label: 'Tournament director' },
  { value: 'referee', label: 'Referee' },
  { value: 'venue-operations', label: 'Venue operations' },
] as const;

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
  timezone,
  onInvalid,
  last,
}: {
  label: string;
  value: string;
  onChange: (iso: string | null) => void;
  timezone: string;
  onInvalid?: () => void;
  last?: boolean;
}) {
  const [localValue, setLocalValue] = useState(value ? zonedLocalInput(value, timezone) : '');
  const [error, setError] = useState<string | undefined>();
  useEffect(() => {
    setLocalValue(value ? zonedLocalInput(value, timezone) : '');
    setError(undefined);
  }, [value, timezone]);
  return (
    <FieldRow
      label={label}
      type="datetime-local"
      value={localValue}
      error={error}
      onChange={(event) => {
        const local = event.target.value;
        setLocalValue(local);
        const iso = local ? localInputToUtc(local, timezone) : null;
        const message = local && !iso ? `That local time does not exist in ${timezone}. Choose a time outside the clock change.` : '';
        event.target.setCustomValidity(message);
        setError(message || undefined);
        if (!message) onChange(iso);
        else { onChange(value); onInvalid?.(); }
      }}
      last={last}
    />
  );
}

function SectionEditor({
  tid,
  timezone,
  section,
  data,
  courtOptions,
  onChange,
}: {
  tid: string;
  timezone?: string;
  section: SetupSectionStateDTO;
  data: SetupSectionData;
  courtOptions?: readonly { value: string; label: string }[];
  onChange: (field: string, value: unknown) => void;
}) {
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});
  switch (section.key) {
    case 'general':
      return (
        <div>
          <FieldRow label="Tournament name" value={textOf(data, 'name')} onChange={(e) => onChange('name', e.target.value)} />
          <FieldRow label="Public name" value={textOf(data, 'publicName')} onChange={(e) => onChange('publicName', e.target.value)} />
          <FieldRow label="Organizer" value={textOf(data, 'organizer')} onChange={(e) => onChange('organizer', e.target.value)} />
          <Row
            label="Timezone"
            control={
              <SelectInput
                value={textOf(data, 'timezone') || 'UTC'}
                onChange={(value) => onChange('timezone', value)}
                options={TIMEZONE_SELECT_OPTIONS}
                ariaLabel="Tournament timezone"
                width={240}
              />
            }
          />
          <FieldRow label="Tournament number" value={textOf(data, 'tournamentNumber')} onChange={(e) => onChange('tournamentNumber', e.target.value)} />
          <FieldRow label="Season" value={textOf(data, 'season')} onChange={(e) => onChange('season', e.target.value)} last />
        </div>
      );
    case 'dates':
      return (
        <div className="space-y-6">
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Times in {timezone || textOf(data, 'timezone') || 'the tournament timezone'}. Repeated clock-change times use the earlier occurrence.
            </p>
            <DateTimeRow label="Tournament starts" value={textOf(data, 'tournamentStart')} timezone={timezone || 'UTC'} onChange={(iso) => onChange('tournamentStart', iso)} />
            <DateTimeRow label="Tournament ends" value={textOf(data, 'tournamentEnd')} timezone={timezone || 'UTC'} onChange={(iso) => onChange('tournamentEnd', iso)} />
            <DateTimeRow label="Entries open" value={textOf(data, 'entryOpening')} timezone={timezone || 'UTC'} onChange={(iso) => onChange('entryOpening', iso)} />
            <DateTimeRow label="Entry deadline" value={textOf(data, 'entryDeadline')} timezone={timezone || 'UTC'} onChange={(iso) => onChange('entryDeadline', iso)} last />
          </div>
          <SetupRowsEditor
            label="Daily sessions"
            addLabel="Add session"
            columns={[
              { field: 'name', label: 'Name' },
              { field: 'date', label: 'Date', type: 'date' },
              { field: 'startTime', label: 'Starts', type: 'time' },
              { field: 'endTime', label: 'Ends', type: 'time' },
              { field: 'courtIds', label: 'Courts', type: 'list', options: courtOptions, placeholder: 'Court 1, Court 2' },
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
      {
      const registrationValue = textOf(data, 'registrationMethod');
      const registrationOptions = registrationValue && !REGISTRATION_OPTIONS.some((option) => option.value === registrationValue)
        ? [...REGISTRATION_OPTIONS, { value: registrationValue, label: `Saved value: ${registrationValue} (review)` }]
        : REGISTRATION_OPTIONS;
      return (
        <div>
          <Row
            label="Registration method"
            control={
              <SelectInput
                value={textOf(data, 'registrationMethod') || 'none'}
                onChange={(value) => onChange('registrationMethod', value === 'none' ? null : value)}
                options={registrationOptions}
                ariaLabel="Registration method"
              />
            }
          />
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
      }
    case 'people':
      {
      const contactRows = rowsOf(data, 'contacts');
      const knownRoles = new Set<string>(CONTACT_ROLE_OPTIONS.map((option) => option.value));
      const contactRoleOptions = [...CONTACT_ROLE_OPTIONS, ...contactRows
        .map((row) => String(row.role ?? ''))
        .filter((role) => role && !knownRoles.has(role))
        .map((role) => ({ value: role, label: `Saved value: ${role} (review)` }))];
      return (
        <div>
          <p className="mb-3 max-w-[68ch] text-sm text-muted-foreground">
            Contacts are stored for operator coordination. The current public
            site does not display staff details; the Public checkbox preserves
            publication intent for a future public projection. Email remains a
            separate operator field and is never selected by this checkbox.
          </p>
          <SetupRowsEditor
            label="Contacts"
            addLabel="Add contact"
            columns={[
              { field: 'role', label: 'Role', type: 'select', options: contactRoleOptions },
              { field: 'name', label: 'Name' },
              { field: 'email', label: 'Email', type: 'email' },
              { field: 'public', label: 'Public', type: 'checkbox' },
            ]}
              rows={contactRows}
            onChange={(rows) => onChange('contacts', rows)}
            newRow={() => ({ role: '', name: '', email: null, public: false })}
          />
        </div>
      );
      }
    case 'public-info':
      return (
        <div>
          <FieldRow label="Public slug" value={textOf(data, 'publicSlug')} onChange={(e) => onChange('publicSlug', e.target.value)} />
          <FieldRow label="Description" value={textOf(data, 'description')} onChange={(e) => onChange('description', e.target.value)} />
          <FieldRow label="Regulations URL" type="url" value={textOf(data, 'regulationsUrl')} onChange={(e) => onChange('regulationsUrl', e.target.value)} />
          <FieldRow label="Logo URL" type="url" value={textOf(data, 'logoUrl')} onChange={(e) => onChange('logoUrl', e.target.value)} />
          <FieldRow label="Banner URL" type="url" value={textOf(data, 'bannerUrl')} onChange={(e) => onChange('bannerUrl', e.target.value)} last />
          {(textOf(data, 'logoUrl') || textOf(data, 'bannerUrl')) ? (
            <div className="grid gap-4 border-t border-border/60 pt-4 sm:grid-cols-2" aria-label="Publication image preview">
              {(['logoUrl', 'bannerUrl'] as const).map((field) => {
                const url = textOf(data, field);
                if (!url) return null;
                return (
                  <figure key={field} className="min-w-0">
                    <figcaption className="mb-2 text-xs font-medium text-foreground">
                      {field === 'logoUrl' ? 'Logo preview' : 'Banner preview'}
                    </figcaption>
                    <div className="overflow-hidden rounded-sm border border-border bg-muted">
                      {imageErrors[field] ? <div className="flex h-24 items-center justify-center px-3 text-xs text-muted-foreground">Preview unavailable. Check the address before saving.</div> : <img
                        src={url}
                        alt={field === 'logoUrl' ? 'Selected tournament logo' : 'Selected tournament banner'}
                        loading="lazy"
                        onError={() => setImageErrors((current) => ({ ...current, [field]: true }))}
                        className={field === 'logoUrl' ? 'mx-auto h-24 max-w-full object-contain' : 'h-24 w-full object-cover'}
                      />}
                    </div>
                  </figure>
                );
              })}
            </div>
          ) : null}
          <Row
            label="Publication audience"
            readOnly
            control={
              <Link to={`/tournaments/${encodeURIComponent(tid)}/publish/site`} className="text-sm font-medium text-accent underline underline-offset-2">
                Manage audience in Publish Site →
              </Link>
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
    ? { href: `/tournaments/${encodeURIComponent(tid)}/competition/draws`, label: 'Add or manage events' }
    : { href: `/tournaments/${encodeURIComponent(tid)}/participants/people`, label: 'Manage divisions from the Roster' };
  return (
    <div>
      <div>
        {events.map((event, index) => (
          <Row
            key={String(event.id ?? index)}
            label={String(event.name ?? event.code ?? '')}
            pane
            control={
              <span className="inline-flex whitespace-nowrap items-center gap-3">
                <span className={TEXT_MUTED_SM}>
                  {kind === 'bracket' ? (FORMAT_OPTIONS.find((option) => option.value === event.format)?.label ?? 'Format not configured') : String(event.code ?? '')}
                  {typeof event.capacity === 'number' && event.capacity > 0 ? ` · Capacity ${event.capacity}` : ''}
                </span>
                {kind === 'bracket' ? (
                  <Link
                    to={`/tournaments/${encodeURIComponent(tid)}/competition/draws?event=${encodeURIComponent(String(event.id ?? event.code ?? ''))}`}
                    className="text-xs font-medium text-accent underline underline-offset-2"
                  >
                    Edit event
                  </Link>
                ) : null}
              </span>
            }
            readOnly
            last={index === events.length - 1}
          />
        ))}
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
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
  return <SetupEditor key={`${tid}:${location.pathname}`} tid={tid} />;
}

function SetupEditor({ tid }: { tid: string }) {
  const location = useLocation();
  const routeKey = useMemo<SetupKey | null>(() => {
    const candidate = location.pathname.split('/').filter(Boolean).pop();
    return SECTION_ORDER.includes(candidate as SetupKey) ? (candidate as SetupKey) : null;
  }, [location.pathname]);
  const [setup, setSetup] = useState<TournamentSetupDTO | null>(null);
  const [draft, setDraft] = useState<SetupSectionData | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editorRevision, setEditorRevision] = useState(0);
  const editorRef = useRef<HTMLDivElement>(null);
  const dirtyRef = useRef(false);
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
        if (selected && !dirtyRef.current) setDraft(selected.data);
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
    const onFocus = () => { if (!dirtyRef.current) void load(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  const selected = routeKey ? sectionState(setup, routeKey) : null;
  const editable = selected != null && selected.authority !== 'domain';

  const save = async () => {
    if (!draft || !selected || !editable || saving) return;
    for (const input of editorRef.current?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select') ?? []) {
      if (!input.reportValidity()) return;
    }
    setSaving(true);
    setError(null);
    try {
      // Publication audience is owned by the public site. The setup summary
      // may include it for context, but it is never part of this editor's
      // writable contract.
      const payload = selected.key === 'public-info'
        ? Object.fromEntries(Object.entries(draft).filter(([key]) => key !== 'visibility'))
        : draft;
      const next = await apiClient.patchTournamentSetup(tid, selected.key, payload);
      setSetup(next);
      const updated = sectionState(next, selected.key);
      if (updated) setDraft(updated.data);
      dirtyRef.current = false;
      setDirty(false);
      setSaved(true);
    } catch (err) {
      const failure = err as { status?: number; response?: { status?: number } };
      const status = failure?.response?.status ?? failure?.status;
      setError(status === 409
        ? 'This section changed elsewhere. Discard your draft or resolve the conflict before saving again.'
        : 'This section could not be saved. Your draft is still here; check the connection and try again.');
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
        <ActionsBar title="Setup" status={loading && !setup ? 'Loading…' : ''} />
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
                      {item.summary !== STATUS_LABELS[item.status] && <span className="mt-1 block text-xs text-muted-foreground">{item.summary}</span>}
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
        status={<span role="status">{loading && !setup ? 'Loading…' : dirty ? 'Unsaved changes' : saved ? 'Section saved' : ''}</span>}
      />
      <PageBody variant="form">
        <div className="space-y-4">
          {error ? <Notice tone="warning" title="Setup needs attention">{error}</Notice> : null}
          {setup && selected ? (
            <>
              {selected.status !== 'ready' && selected.status !== 'complete' ? (
                <div
                  data-testid="setup-strip"
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded border border-border bg-card px-4 py-2"
                >
                  <SetupStatusLabel status={selected.status} />
                  {overall !== STATUS_LABELS[selected.status] ? (
                    <span className={TEXT_MUTED_XS}>Overall: {overall}</span>
                  ) : null}
                  <Link to={setupHref} className="ml-auto text-xs text-accent underline underline-offset-2">
                    View full checklist
                  </Link>
                </div>
              ) : null}
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
              <PropertyPanel
                title={SECTION_LABELS[selected.key]}
                action={editable ? (
                  <span className="flex items-center gap-2">
                    {dirty ? <Button variant="ghost" size="sm" onClick={() => { dirtyRef.current = false; setDirty(false); setSaved(false); setDraft(selected?.data ?? null); setEditorRevision((value) => value + 1); void load(); }} disabled={saving}>Discard</Button> : null}
                    <Button size="sm" onClick={() => void save()} disabled={!selected || !draft || !dirty || saving}>
                      {saving ? 'Saving…' : 'Save section'}
                    </Button>
                  </span>
                ) : undefined}
              >
                <div className="space-y-6" ref={editorRef} key={editorRevision}>
                  {selected.authority === 'domain' ? (
                    <DomainSectionSummary tid={tid} section={selected} />
                  ) : draft ? (
                    <SectionEditor
                      tid={tid}
                      timezone={textOf((setup?.sections.find((item) => item.key === 'general')?.data ?? {}) as SetupSectionData, 'timezone')}
                      section={selected}
                      data={draft}
                      courtOptions={rowsOf(sectionState(setup, 'venue')?.data ?? {}, 'courts')
                        .filter((court) => court.id != null && String(court.id).trim() !== '')
                        .map((court, index) => ({
                          value: String(court.id),
                          label: String(court.name ?? `Court ${index + 1}`),
                        }))}
                      onChange={(field, value) => { setSaved(false); dirtyRef.current = true; setDirty(true); setDraft((previous) => ({ ...(previous ?? {}), [field]: value })); }}
                    />
                  ) : null}
              <DownstreamImpact targets={selected.downstreamImpact} readOnly={!editable} />
                </div>
              </PropertyPanel>
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
