/**
 * Events tab — full-width spreadsheet. One row per bracket event.
 * Cells: ID · Discipline · Format · Size · Participants · Status · Action.
 *
 * Inline editing is provided for new-event rows (NewEventRow). Existing
 * rows render the saved values; editing flows through the ParticipantPicker
 * for participants and the per-row Action button for generation.
 *
 * Implements Decision 9 (per-field auto-save on blur) for the add-event
 * flow. Implements Decision 10 (in-grid picker). Implements Decision 3
 * (status read from bracket_events.status).
 */
import { Fragment, useState, useCallback } from 'react';
import { useBracket } from '../../hooks/useBracket';
import { useBracketApi } from '../../api/bracketClient';
import { useTournamentStore } from '../../store/tournamentStore';
import type { BracketEventStatus } from '../../api/bracketDto';
import { Button, StatusPill } from '@scheduler/design-system';
import { INTERACTIVE_BASE } from '../../lib/utils';
import { ActionsBar } from '../../components/control-plane';
import { ParticipantPicker, type PickedSingle, type PickedPair } from './ParticipantPicker';
import { BracketEmptyState } from './BracketEmptyState';

export function EventsTab() {
  const { data, setData, refresh } = useBracket();
  const api = useBracketApi();
  const players = useTournamentStore((s) => s.bracketPlayers);

  const [openPickerFor, setOpenPickerFor] = useState<string | null>(null);
  const [addingRow, setAddingRow] = useState(false);

  const events = data?.events ?? [];

  const handleGenerate = useCallback(
    async (eventId: string, wipe: boolean) => {
      try {
        const next = await api.eventGenerate(eventId, { wipe });
        setData(next);
      } catch {
        // Interceptor surfaces toast; nothing more here.
        await refresh();
      }
    },
    [api, setData, refresh],
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <ActionsBar
        title="Events"
        status={
          <span className="text-sm font-semibold text-foreground tabular-nums">
            {events.length} event{events.length === 1 ? '' : 's'}
          </span>
        }
      >
        <button
          type="button"
          aria-label="+ Add event"
          onClick={() => setAddingRow(true)}
          className={`${INTERACTIVE_BASE} inline-flex h-7 items-center gap-1 rounded-sm bg-primary px-2.5 text-xs font-medium text-primary-foreground transition-opacity duration-fast ease-brand hover:opacity-90`}
        >
          ＋ Add event
        </button>
      </ActionsBar>
      <div className="min-h-0 flex-1 overflow-auto">
      {events.length === 0 && !addingRow ? (
        <BracketEmptyState
          eyebrow="Events"
          title="No bracket events yet"
          body="Add the first event, choose the draw format, then enter participants before generating the draw."
          actionLabel="Add event"
          onAction={() => setAddingRow(true)}
        />
      ) : null}
      <table className="w-full border-collapse text-sm">
        <thead className="bg-muted/40">
          <tr className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <th className="px-4 py-1.5 text-left font-semibold border-b border-border">ID</th>
            <th className="px-3 py-1.5 text-left font-semibold border-b border-border">Discipline</th>
            <th className="px-3 py-1.5 text-left font-semibold border-b border-border">Format</th>
            <th className="px-3 py-1.5 text-left font-semibold border-b border-border">Size</th>
            <th className="px-3 py-1.5 text-left font-semibold border-b border-border">Participants</th>
            <th className="px-3 py-1.5 text-left font-semibold border-b border-border">Status</th>
            <th className="px-3 py-1.5 text-left font-semibold border-b border-border">Action</th>
          </tr>
        </thead>
          <tbody>
            {events.map((ev) => {
              const status: BracketEventStatus = ev.status ?? 'draft';
              const partCount = ev.participant_count ?? 0;
              const targetSize = ev.bracket_size ?? partCount;
              const pickerOpen = openPickerFor === ev.id;
              const isDoubles = ['MD', 'WD', 'XD'].includes(ev.discipline);
              return (
                <Fragment key={ev.id}>
                  <tr className="border-b border-border/60 hover:bg-muted/30">
                    <td className="px-4 py-2 font-mono text-xs">{ev.id}</td>
                    <td className="px-3 py-2">{ev.discipline}</td>
                    <td className="px-3 py-2">{ev.format.toUpperCase()}</td>
                    <td className="px-3 py-2">{targetSize}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => setOpenPickerFor(pickerOpen ? null : ev.id)}
                        className="text-xs hover:underline"
                      >
                        {partCount} entered
                      </button>
                    </td>
                    <td className="px-3 py-2"><StatusPillFor status={status} /></td>
                    <td className="px-3 py-2">
                      <ActionCell
                        status={status}
                        eventReady={partCount > 0 && partCount === targetSize}
                        onGenerate={() => handleGenerate(ev.id, false)}
                        onRegenerate={() => handleGenerate(ev.id, true)}
                      />
                    </td>
                  </tr>
                  {pickerOpen && (
                    <tr>
                      <td colSpan={7} className="bg-bg-elev p-2">
                        <ParticipantPicker
                          mode={isDoubles ? 'doubles' : 'singles'}
                          eventId={ev.id}
                          players={players}
                          initialIds={[]}
                          onCommit={async (picks) => {
                            const participants = isDoubles
                              ? (picks as PickedPair[]).map((p) => ({
                                  id: p.id, name: p.name, members: p.members,
                                }))
                              : (picks as PickedSingle[]).map((p) => ({
                                  id: p.id, name: p.name,
                                }));
                            try {
                              const next = await api.eventUpsert(ev.id, {
                                discipline: ev.discipline,
                                format: ev.format,
                                bracket_size: ev.bracket_size,
                                duration_slots: 1,
                                participants,
                              });
                              setData(next);
                            } finally {
                              setOpenPickerFor(null);
                            }
                          }}
                          onCancel={() => setOpenPickerFor(null)}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {addingRow && (
              <NewEventRow
                onCommit={async (body) => {
                  try {
                    const next = await api.eventUpsert(body.id, {
                      discipline: body.discipline,
                      format: body.format,
                      duration_slots: 1,
                      participants: [],
                    });
                    setData(next);
                  } finally {
                    setAddingRow(false);
                  }
                }}
                onCancel={() => setAddingRow(false)}
              />
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusPillFor({ status }: { status: BracketEventStatus }) {
  if (status === 'draft') {
    return (
      <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        ○ Draft
      </span>
    );
  }
  if (status === 'generated') {
    return <StatusPill tone="amber">● Generated</StatusPill>;
  }
  return <StatusPill tone="green">● Started</StatusPill>;
}

function ActionCell({
  status,
  eventReady,
  onGenerate,
  onRegenerate,
}: {
  status: BracketEventStatus;
  eventReady: boolean;
  onGenerate: () => void;
  onRegenerate: () => void;
}) {
  if (status === 'draft') {
    return (
      <Button
        variant="brand"
        size="sm"
        disabled={!eventReady}
        onClick={onGenerate}
      >
        Generate
      </Button>
    );
  }
  if (status === 'generated') {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          if (window.confirm('This will discard the existing draws. Re-generate?')) {
            onRegenerate();
          }
        }}
      >
        Re-generate
      </Button>
    );
  }
  return (
    <span
      className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground"
      title="Event is in progress; reset bracket to re-generate."
    >
      — (locked)
    </span>
  );
}

function NewEventRow({
  onCommit,
  onCancel,
}: {
  onCommit: (body: { id: string; discipline: string; format: 'se' | 'rr' }) => void;
  onCancel: () => void;
}) {
  const [id, setId] = useState('');
  const [discipline, setDiscipline] = useState('MS');
  const [format, setFormat] = useState<'se' | 'rr'>('se');
  return (
    <tr className="border-b border-border/60 bg-bg-elev">
      <td className="px-3 py-2">
        <input
          type="text"
          value={id}
          onChange={(e) => setId(e.target.value)}
          placeholder="MS"
          className="w-12 rounded-sm border border-border bg-bg-elev px-2 py-1 text-xs"
        />
      </td>
      <td className="px-3 py-2">
        <input
          type="text"
          value={discipline}
          onChange={(e) => setDiscipline(e.target.value)}
          className="w-full rounded-sm border border-border bg-bg-elev px-2 py-1 text-xs"
        />
      </td>
      <td className="px-3 py-2">
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value as 'se' | 'rr')}
          className="rounded-sm border border-border bg-bg-elev px-2 py-1 text-xs"
        >
          <option value="se">SE</option>
          <option value="rr">RR</option>
        </select>
      </td>
      <td className="px-3 py-2">—</td>
      <td className="px-3 py-2">—</td>
      <td className="px-3 py-2"><StatusPillFor status="draft" /></td>
      <td className="px-3 py-2">
        <Button
          variant="brand"
          size="sm"
          disabled={!id.trim()}
          onClick={() => onCommit({ id: id.trim(), discipline, format })}
        >
          Save
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel} className="ml-2">
          Cancel
        </Button>
      </td>
    </tr>
  );
}
