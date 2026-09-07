/**
 * SetupProduct — the consolidated Setup surface.
 *
 * Setup answers four questions, one page each, and every setting has exactly
 * one editing location:
 *
 *   - `setup/details`     — name, dates, timezone, venue, courts, sessions,
 *                           staff contacts
 *   - `setup/entries`     — entry windows beside entry requirements
 *   - `setup/scoring`     — points, best-of, deuce, cap
 *   - `setup/public-site` — public content, regulations, branding, and the
 *                           audience / visible-content controls that govern it
 *
 * The readiness checklist is NOT here: Overview owns it, once. Event
 * definitions, draw format and draw size moved to Bracket (they are
 * structural properties of a draw); minimum rest moved to Operations · Plan.
 *
 * A page maps onto SEVERAL stored sections (Details writes general, dates,
 * venue and people). Save patches only the sections the operator actually
 * changed, in order, and reports honestly when one of them fails — a partial
 * multi-section write is never announced as a success.
 *
 * Descriptive information stays editable after draws and schedules exist.
 * When an edit invalidates the current plan the plan is marked for
 * revalidation (`scheduleIsStale`) rather than the information being locked:
 * reconciliation belongs in Plan, and recorded results are untouched.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useLocation } from 'react-router-dom';
import { FormActions, Notice } from '@scheduler/design-system';
import { ActionsBar, PageBody } from '../../components/control-plane';
import {
  FieldRow,
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
import { useTournamentStore } from '../../store/tournamentStore';
import { PropertyPanel } from '../../components/control-plane/PropertyPanel';
import { PublicationSettings } from '../../components/PublicationSettings';
import { isAmbiguousLocalTime, localInputToUtc, zonedLocalInput } from '../../lib/timezoneLocal';
import { SetupRowsEditor, type SetupRow } from './SetupRowsEditor';
import { StatusPill } from '../../components/StatusPill';

/** The four consolidated Setup destinations. */
export type SetupPage = 'details' | 'entries' | 'scoring' | 'public-site';

export const SETUP_PAGES: readonly SetupPage[] = ['details', 'entries', 'scoring', 'public-site'];

export const PAGE_LABELS: Record<SetupPage, string> = {
  details: 'Details',
  entries: 'Entries',
  scoring: 'Scoring',
  'public-site': 'Public site',
};

/**
 * Which stored sections each page reads and writes. Order matters: it is the
 * order Save patches them in, so the most identifying write lands first.
 */
export const PAGE_SECTIONS: Record<SetupPage, readonly SetupKey[]> = {
  details: ['general', 'dates', 'venue', 'people'],
  // Entry windows are stored on `dates`; they are edited beside the entry
  // requirements they belong to, never on a separate dates page.
  entries: ['entries', 'dates'],
  scoring: ['rules'],
  'public-site': ['public-info'],
};

/** Fields a page does not render but must not silently drop. The PATCH
 *  replaces a section's stored data wholesale, so anything not rendered still
 *  travels in the draft it was loaded into. */
const STATUS_LABELS: Record<SetupStatus, string> = {
  not_started: 'Not started',
  in_progress: STATE_WORD.pending,
  ready: 'Ready',
  blocked: 'Blocked',
  published: 'Published',
  complete: 'Complete',
};

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

function textOf(data: SetupSectionData | undefined, field: string): string {
  const value = data?.[field];
  return value == null ? '' : String(value);
}

function rowsOf(data: SetupSectionData | undefined, field: string): SetupRow[] {
  const value = data?.[field];
  return Array.isArray(value) ? (value as SetupRow[]) : [];
}

function numberOf(data: SetupSectionData | undefined, field: string): number {
  const value = Number(data?.[field]);
  return Number.isFinite(value) ? value : 0;
}

/** The stored instant as a plain calendar date in the tournament timezone.
 *  A value already stored date-only is taken as written — reading it through
 *  `Date` would shift it a day in every negative-offset zone. */
function dateInputValue(value: string, timezone: string): string {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return zonedLocalInput(value, timezone).slice(0, 10);
}

/**
 * A tournament starts on a day and ends on a day — not at 09:00. The stored
 * value stays a real instant so nothing downstream changes shape: the start
 * is the first moment of that local day, the end the last.
 */
function DateOnlyRow({
  label,
  hint,
  value,
  timezone,
  edge,
  onChange,
  last,
}: {
  label: string;
  hint?: string;
  value: string;
  timezone: string;
  edge: 'start' | 'end';
  onChange: (iso: string | null) => void;
  last?: boolean;
}) {
  const [localValue, setLocalValue] = useState(() => dateInputValue(value, timezone));
  useEffect(() => setLocalValue(dateInputValue(value, timezone)), [value, timezone]);
  return (
    <FieldRow
      label={label}
      hint={hint}
      type="date"
      value={localValue}
      onChange={(event) => {
        const day = event.target.value;
        setLocalValue(day);
        if (!day) {
          onChange(null);
          return;
        }
        const wall = `${day}T${edge === 'start' ? '00:00' : '23:59'}`;
        // A clock change can delete local midnight. Step forward to the first
        // minute that exists rather than refusing a perfectly valid date.
        const iso =
          localInputToUtc(wall, timezone) ??
          localInputToUtc(`${day}T${edge === 'start' ? '01:00' : '22:59'}`, timezone);
        if (iso) onChange(iso);
      }}
      last={last}
    />
  );
}

function DateTimeRow({
  label,
  hint,
  value,
  onChange,
  timezone,
  onInvalid,
  last,
}: {
  label: string;
  hint?: string;
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
  // V3-OC07.3: the clock-change note only appears when the entered time is
  // actually ambiguous in this timezone — not as a blanket sentence shown
  // above every date field regardless of relevance.
  const ambiguous = !error && localValue !== '' && isAmbiguousLocalTime(localValue, timezone);
  return (
    <FieldRow
      label={label}
      type="datetime-local"
      value={localValue}
      error={error}
      hint={
        ambiguous
          ? 'This local time occurs twice here due to a clock change. The earlier occurrence is used.'
          : hint
      }
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

function ImagePreview({ field, url }: { field: 'logoUrl' | 'bannerUrl'; url: string }) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setFailed(false);
    setAttempt(0);
  }, [url]);
  return (
    <figure className="min-w-0">
      <figcaption className="mb-2 text-xs font-medium text-foreground">
        {field === 'logoUrl' ? 'Logo preview' : 'Banner preview'}
      </figcaption>
      <div className="overflow-hidden rounded-sm border border-border bg-muted">
        {failed ? (
          <div className="flex h-24 flex-col items-center justify-center gap-1 px-3 text-center text-xs text-muted-foreground">
            <span>The image could not be loaded from this link.</span>
            <button
              type="button"
              className="font-medium text-accent underline underline-offset-2"
              onClick={() => {
                setFailed(false);
                setAttempt((value) => value + 1);
              }}
            >
              Retry preview
            </button>
          </div>
        ) : (
          <img
            key={`${field}-${attempt}`}
            src={url}
            alt={field === 'logoUrl' ? 'Selected tournament logo' : 'Selected tournament banner'}
            loading="lazy"
            // A director's logo is usually hosted somewhere that sends no
            // CORS headers, so the image must NOT be requested as a CORS
            // fetch; `no-referrer` keeps hotlink-protected hosts from
            // rejecting it on the referrer alone (the reported console
            // errors). Failure is reported in the panel, with a retry.
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
            className={field === 'logoUrl' ? 'mx-auto h-24 max-w-full object-contain' : 'h-24 w-full object-cover'}
          />
        )}
      </div>
    </figure>
  );
}

interface PageEditorProps {
  tid: string;
  timezone: string;
  drafts: Partial<Record<SetupKey, SetupSectionData>>;
  onChange: (section: SetupKey, field: string, value: unknown) => void;
}

function DetailsPage({ timezone, drafts, onChange }: PageEditorProps) {
  const general = drafts.general;
  const dates = drafts.dates;
  const venue = drafts.venue;
  const people = drafts.people;
  const courtOptions = rowsOf(venue, 'courts')
    .filter((court) => court.id != null && String(court.id).trim() !== '')
    .map((court, index) => ({
      value: String(court.id),
      label: String(court.name ?? `Court ${index + 1}`),
    }));
  const contactRows = rowsOf(people, 'contacts');
  const knownRoles = new Set<string>(CONTACT_ROLE_OPTIONS.map((option) => option.value));
  const contactRoleOptions = [
    ...CONTACT_ROLE_OPTIONS,
    ...contactRows
      .map((row) => String(row.role ?? ''))
      .filter((role) => role && !knownRoles.has(role))
      .map((role) => ({ value: role, label: `Saved value: ${role} (review)` })),
  ];
  return (
    <div className="space-y-6">
      <PropertyPanel title="Tournament">
        <FieldRow label="Tournament name" hint="Used internally: exports, the operator console, activity." value={textOf(general, 'name')} onChange={(e) => onChange('general', 'name', e.target.value)} />
        <FieldRow label="Name shown to players" hint="Appears on the public site and entry forms. Defaults to the tournament name if left blank." value={textOf(general, 'publicName')} onChange={(e) => onChange('general', 'publicName', e.target.value)} />
        <FieldRow label="Organizer" value={textOf(general, 'organizer')} onChange={(e) => onChange('general', 'organizer', e.target.value)} />
        <Row
          label="Timezone"
          control={
            <SelectInput
              value={textOf(general, 'timezone') || 'UTC'}
              onChange={(value) => onChange('general', 'timezone', value)}
              options={TIMEZONE_SELECT_OPTIONS}
              ariaLabel="Tournament timezone"
              width={240}
            />
          }
        />
        <FieldRow label="Tournament number" value={textOf(general, 'tournamentNumber')} onChange={(e) => onChange('general', 'tournamentNumber', e.target.value)} />
        <FieldRow label="Season" value={textOf(general, 'season')} onChange={(e) => onChange('general', 'season', e.target.value)} />
        <DateOnlyRow
          label="Tournament starts"
          value={textOf(dates, 'tournamentStart')}
          timezone={timezone || 'UTC'}
          edge="start"
          onChange={(iso) => onChange('dates', 'tournamentStart', iso)}
        />
        <DateOnlyRow
          label="Tournament ends"
          value={textOf(dates, 'tournamentEnd')}
          timezone={timezone || 'UTC'}
          edge="end"
          onChange={(iso) => onChange('dates', 'tournamentEnd', iso)}
          last
        />
      </PropertyPanel>

      <PropertyPanel title="Venue and courts">
        <FieldRow label="Venue name" value={textOf(venue, 'venueName')} onChange={(e) => onChange('venue', 'venueName', e.target.value)} />
        <FieldRow label="Address" value={textOf(venue, 'address')} onChange={(e) => onChange('venue', 'address', e.target.value)} />
        <FieldRow label="Map link" type="url" value={textOf(venue, 'mapLink')} onChange={(e) => onChange('venue', 'mapLink', e.target.value)} />
        <FieldRow label="Accessibility notes" value={textOf(venue, 'accessibilityNotes')} onChange={(e) => onChange('venue', 'accessibilityNotes', e.target.value)} last />
        <div className="mt-6 space-y-6">
          <SetupRowsEditor
            label="Named courts"
            addLabel="Add court"
            columns={[
              { field: 'name', label: 'Court name' },
              { field: 'group', label: 'Group', placeholder: 'Optional' },
              { field: 'available', label: 'Available', type: 'checkbox' },
            ]}
            rows={rowsOf(venue, 'courts')}
            onChange={(rows) => onChange('venue', 'courts', rows)}
            newRow={() => ({ name: '', group: null, available: true })}
          />
          {/* Session court availability sits with the courts it selects from,
              not on a separate dates page that would edit the same list. */}
          <SetupRowsEditor
            label="Daily sessions"
            addLabel="Add session"
            columns={[
              { field: 'name', label: 'Name' },
              { field: 'date', label: 'Date', type: 'date' },
              { field: 'startTime', label: 'Starts', type: 'time' },
              { field: 'endTime', label: 'Ends', type: 'time' },
              { field: 'courtIds', label: 'Courts', type: 'list', options: courtOptions },
            ]}
            rows={rowsOf(dates, 'dailySessions')}
            onChange={(rows) => onChange('dates', 'dailySessions', rows)}
            newRow={() => ({ name: '', date: '', startTime: '09:00', endTime: '18:00', courtIds: [] })}
          />
        </div>
      </PropertyPanel>

      <PropertyPanel title="Staff contacts">
        <p className="mb-3 max-w-[68ch] text-sm text-muted-foreground">
          Staff contacts are visible to tournament operators and are never published.
        </p>
        <SetupRowsEditor
          label="Contacts"
          addLabel="Add contact"
          columns={[
            { field: 'role', label: 'Role', type: 'select', options: contactRoleOptions },
            { field: 'name', label: 'Name' },
            { field: 'email', label: 'Email', type: 'email' },
          ]}
          rows={contactRows}
          onChange={(rows) => onChange('people', 'contacts', rows)}
          newRow={() => ({ role: '', name: '', email: null, public: false })}
        />
      </PropertyPanel>
    </div>
  );
}

function EntriesPage({ timezone, drafts, onChange }: PageEditorProps) {
  const entries = drafts.entries;
  const dates = drafts.dates;
  const registrationValue = textOf(entries, 'registrationMethod');
  const registrationOptions = registrationValue && !REGISTRATION_OPTIONS.some((option) => option.value === registrationValue)
    ? [...REGISTRATION_OPTIONS, { value: registrationValue, label: `Saved value: ${registrationValue} (review)` }]
    : REGISTRATION_OPTIONS;
  return (
    <PropertyPanel title="Entries">
      {/* Entry windows belong beside the requirements they gate; the entry
          deadline is a real time of day, so it keeps a time control. */}
      <DateTimeRow
        label="Entries open"
        value={textOf(dates, 'entryOpening')}
        timezone={timezone || 'UTC'}
        onChange={(iso) => onChange('dates', 'entryOpening', iso)}
      />
      <DateTimeRow
        label="Entry deadline"
        value={textOf(dates, 'entryDeadline')}
        timezone={timezone || 'UTC'}
        onChange={(iso) => onChange('dates', 'entryDeadline', iso)}
      />
      <Row
        label="Registration method"
        control={
          <SelectInput
            value={registrationValue || 'none'}
            onChange={(value) => onChange('entries', 'registrationMethod', value === 'none' ? null : value)}
            options={registrationOptions}
            ariaLabel="Registration method"
          />
        }
      />
      <Row
        label="Payment required"
        control={<Toggle value={Boolean(entries?.paymentRequired)} onChange={(v) => onChange('entries', 'paymentRequired', v)} ariaLabel="Payment required" />}
      />
      <Row
        label="Waitlist enabled"
        control={<Toggle value={Boolean(entries?.waitlistEnabled)} onChange={(v) => onChange('entries', 'waitlistEnabled', v)} ariaLabel="Waitlist enabled" />}
      />
      <Row
        label="Organizer approval required"
        control={<Toggle value={Boolean(entries?.organizerApprovalRequired)} onChange={(v) => onChange('entries', 'organizerApprovalRequired', v)} ariaLabel="Organizer approval required" />}
        last
      />
    </PropertyPanel>
  );
}

function ScoringPage({ drafts, onChange }: PageEditorProps) {
  const rules = drafts.rules;
  const scoring: ScoringValue = {
    scoringFormat: textOf(rules, 'scoring') === 'simple' ? 'simple' : 'badminton',
    pointsPerSet: numberOf(rules, 'pointsPerSet') || 21,
    setsToWin: numberOf(rules, 'setsToWin') || 2,
    deuceEnabled: rules?.deuceEnabled !== false,
    pointCap: numberOf(rules, 'pointCap'),
  };
  return (
    <PropertyPanel title="Scoring">
      <ScoringFields
        value={scoring}
        onChange={(patch) => {
          for (const [field, value] of Object.entries(patch)) {
            onChange('rules', field === 'scoringFormat' ? 'scoring' : field, value);
          }
        }}
      />
    </PropertyPanel>
  );
}

function PublicSitePage({ tid, drafts, onChange }: PageEditorProps) {
  const info = drafts['public-info'];
  const logoUrl = textOf(info, 'logoUrl');
  const bannerUrl = textOf(info, 'bannerUrl');
  return (
    <div className="space-y-6">
      <PropertyPanel title="Public content">
        <FieldRow
          label="Tournament page address"
          hint="This is the slug in your public page's address. The rest of the address does not change."
          value={textOf(info, 'publicSlug')}
          onChange={(e) => onChange('public-info', 'publicSlug', e.target.value)}
        />
        <div className="border-b border-border/60 py-3">
          <label htmlFor="setup-public-description" className="mb-2 block text-xs font-medium text-foreground">Description</label>
          <textarea
            id="setup-public-description"
            value={textOf(info, 'description')}
            onChange={(e) => onChange('public-info', 'description', e.target.value)}
            rows={4}
            className="w-full rounded-sm border border-rule-control bg-bg-elev p-3 text-sm text-foreground transition-colors duration-fast ease-brand placeholder:text-muted-foreground hover:border-border focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div className="border-b border-border/60 py-3">
          <label htmlFor="setup-regulations-text" className="mb-2 block text-xs font-medium text-foreground">Regulations</label>
          <p className="mb-2 max-w-[68ch] text-xs text-muted-foreground">
            Published as the tournament&rsquo;s regulations document. Numbered or
            capitalised lines become section headings entrants can link to.
          </p>
          <textarea
            id="setup-regulations-text"
            value={textOf(info, 'regulationsText')}
            onChange={(e) => onChange('public-info', 'regulationsText', e.target.value)}
            rows={12}
            className="w-full rounded-sm border border-rule-control bg-bg-elev p-3 text-sm text-foreground transition-colors duration-fast ease-brand placeholder:text-muted-foreground hover:border-border focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <FieldRow
          label="Regulations document link"
          hint="Optional. Use it when the full regulations live in a document elsewhere."
          type="url"
          value={textOf(info, 'regulationsUrl')}
          onChange={(e) => onChange('public-info', 'regulationsUrl', e.target.value)}
        />
        <FieldRow label="Logo image link" type="url" value={logoUrl} onChange={(e) => onChange('public-info', 'logoUrl', e.target.value)} />
        <FieldRow label="Banner image link" type="url" value={bannerUrl} onChange={(e) => onChange('public-info', 'bannerUrl', e.target.value)} last />
        {logoUrl || bannerUrl ? (
          <div className="grid gap-4 border-t border-border/60 pt-4 sm:grid-cols-2" aria-label="Publication image preview">
            {logoUrl ? <ImagePreview field="logoUrl" url={logoUrl} /> : null}
            {bannerUrl ? <ImagePreview field="bannerUrl" url={bannerUrl} /> : null}
          </div>
        ) : null}
      </PropertyPanel>
      {/* The audience and the visible-content switches sit with the content
          they govern, not on a separate Publish page. */}
      <PublicationSettings key={tid} tid={tid} />
    </div>
  );
}

const PAGE_EDITORS: Record<SetupPage, (props: PageEditorProps) => ReactElement> = {
  details: DetailsPage,
  entries: EntriesPage,
  scoring: ScoringPage,
  'public-site': PublicSitePage,
};

/** Sections whose edits can invalidate an existing plan. */
const PLAN_AFFECTING: ReadonlySet<SetupKey> = new Set<SetupKey>(['dates', 'venue']);

export function SetupProduct({ tid }: { tid: string }) {
  const location = useLocation();
  return <SetupEditor key={`${tid}:${location.pathname}`} tid={tid} />;
}

function pageFromPath(pathname: string): SetupPage {
  const candidate = pathname.split('/').filter(Boolean).pop();
  return SETUP_PAGES.includes(candidate as SetupPage) ? (candidate as SetupPage) : 'details';
}

function SetupEditor({ tid }: { tid: string }) {
  const location = useLocation();
  const page = useMemo(() => pageFromPath(location.pathname), [location.pathname]);
  const keys = PAGE_SECTIONS[page];

  const [setup, setSetup] = useState<TournamentSetupDTO | null>(null);
  const [drafts, setDrafts] = useState<Partial<Record<SetupKey, SetupSectionData>>>({});
  const [dirtyKeys, setDirtyKeys] = useState<SetupKey[]>([]);
  const [saved, setSaved] = useState(false);
  const [editorRevision, setEditorRevision] = useState(0);
  const editorRef = useRef<HTMLDivElement>(null);
  const dirtyRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const schedule = useTournamentStore((state) => state.schedule);
  const setScheduleStale = useTournamentStore((state) => state.setScheduleStale);

  /** Take the server's state as the draft. `only` limits that to the sections
   *  that actually landed, so a partial save never discards the edits that
   *  did NOT land — the operator still has them to retry. */
  const adopt = useCallback((next: TournamentSetupDTO, only?: readonly SetupKey[]) => {
    setDrafts((current) => {
      const adopted = Object.fromEntries(
        next.sections
          .filter((section) => !only || only.includes(section.key))
          .map((section) => [section.key, section.data]),
      ) as Partial<Record<SetupKey, SetupSectionData>>;
      return only ? { ...current, ...adopted } : adopted;
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await apiClient.getTournamentSetup(tid);
      setSetup(next);
      // An in-flight edit is never overwritten by a background refresh: the
      // operator's unsaved work outranks a re-read of what they are changing.
      if (!dirtyRef.current) adopt(next);
    } catch {
      setError('Setup could not be loaded. Check the connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [adopt, tid]);

  useEffect(() => {
    void load();
  }, [load]);

  // No Refresh button: navigation and save already refetch, and window focus
  // covers edits made in another tab or by a peer.
  useEffect(() => {
    const onFocus = () => { if (!dirtyRef.current) void load(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  const timezone = textOf(drafts.general ?? sectionState(setup, 'general')?.data, 'timezone');
  const dirty = dirtyKeys.length > 0;

  const onChange = (section: SetupKey, field: string, value: unknown) => {
    setSaved(false);
    dirtyRef.current = true;
    setDirtyKeys((current) => (current.includes(section) ? current : [...current, section]));
    setDrafts((current) => ({
      ...current,
      [section]: { ...(current[section] ?? {}), [field]: value },
    }));
  };

  const save = async () => {
    if (!dirty || saving) return;
    for (const input of editorRef.current?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select') ?? []) {
      if (!input.reportValidity()) return;
    }
    setSaving(true);
    setError(null);
    // Patch in page order so a failure part-way leaves an honest report of
    // what did and did not land, rather than a blanket "saved".
    const pending = keys.filter((key) => dirtyKeys.includes(key));
    const written: SetupKey[] = [];
    let latest: TournamentSetupDTO | null = null;
    let failure: unknown = null;
    for (const key of pending) {
      const draft = drafts[key];
      if (!draft) continue;
      try {
        // Publication audience is owned by the publication transaction below;
        // the setup summary carries it for context but never writes it.
        const payload = key === 'public-info'
          ? Object.fromEntries(Object.entries(draft).filter(([field]) => field !== 'visibility'))
          : draft;
        latest = await apiClient.patchTournamentSetup(tid, key, payload);
        written.push(key);
      } catch (err) {
        failure = err;
        break;
      }
    }
    if (latest) {
      setSetup(latest);
      adopt(latest, failure ? written : undefined);
    }
    const remaining = pending.filter((key) => !written.includes(key));
    setDirtyKeys(remaining);
    dirtyRef.current = remaining.length > 0;
    if (written.some((key) => PLAN_AFFECTING.has(key)) && schedule) {
      // The information edit is accepted; the plan it affects is marked for
      // revalidation in Plan. Recorded results are untouched.
      setScheduleStale(true);
    }
    if (failure) {
      const status = (failure as { status?: number; response?: { status?: number } })?.response?.status
        ?? (failure as { status?: number })?.status;
      const done = written.length ? `${written.length} of ${pending.length} changed sections were saved. ` : '';
      setError(status === 409
        ? `${done}This page changed elsewhere. Reload before saving again.`
        : `${done}The remaining changes were not saved. Your edits are still here; check the connection and try again.`);
      setSaved(false);
    } else {
      setSaved(true);
    }
    setSaving(false);
  };

  const pageSections = keys
    .map((key) => sectionState(setup, key))
    .filter((section): section is SetupSectionStateDTO => section != null);
  const issues = pageSections.flatMap((section) => section.issues);
  const blockingCount = issues.filter((issue) => issue.severity === 'blocking').length;
  const Editor = PAGE_EDITORS[page];

  return (
    <div className="flex min-h-full flex-col bg-background">
      <ActionsBar
        title={PAGE_LABELS[page]}
        status={<span role="status">{loading && !setup ? 'Loading…' : dirty ? 'Unsaved changes' : saved ? 'Saved' : ''}</span>}
      />
      <PageBody variant="form">
        <div className="space-y-4">
          {setup ? (
            <>
              {blockingCount ? (
                <StatusPill tone="red">
                  {blockingCount} blocking issue{blockingCount === 1 ? '' : 's'}
                </StatusPill>
              ) : null}
              {issues.length ? (
                <div className="space-y-2">
                  {issues.map((issue) => (
                    <Notice
                      key={`${issue.code}:${issue.path ?? ''}`}
                      tone={issue.severity === 'blocking' ? 'warning' : 'info'}
                      title={issue.message}
                    />
                  ))}
                </div>
              ) : null}
              <div className="space-y-6" ref={editorRef} key={editorRevision}>
                <Editor tid={tid} timezone={timezone} drafts={drafts} onChange={onChange} />
              </div>
              <div className="flex justify-end">
                <FormActions
                  dirty={dirty}
                  saving={saving}
                  error={error ?? undefined}
                  cleanReason={saved ? 'Saved' : 'No changes'}
                  className="flex-wrap justify-end"
                  onDiscard={() => {
                    dirtyRef.current = false;
                    setDirtyKeys([]);
                    setSaved(false);
                    if (setup) adopt(setup);
                    setEditorRevision((value) => value + 1);
                    void load();
                  }}
                  onSave={() => void save()}
                  saveLabel="Save"
                />
              </div>
            </>
          ) : loading ? (
            <div className="rounded border border-border bg-card p-6 text-sm text-muted-foreground">Loading setup…</div>
          ) : error ? (
            <Notice tone="warning" title="Setup needs attention">{error}</Notice>
          ) : null}
        </div>
      </PageBody>
    </div>
  );
}

export { STATUS_LABELS };
