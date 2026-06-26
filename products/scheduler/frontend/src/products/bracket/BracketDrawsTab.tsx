/**
 * Bracket Draws — the single surface for a bracket's draws.
 *
 * One row per event (an event *is* a draw): ID · Discipline · Format ·
 * Size · Participants · Status · Action · Open. It both lists and
 * manages — create a draw (in a layer, not a separate page), enter
 * participants (in-grid picker), generate / re-generate, and open a
 * draw's bracket visualization. This absorbed the former standalone
 * "Events" surface so creating a draw no longer teleports the operator
 * to another tab; "New draw" opens a layer right here.
 */
import { Fragment, useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, StatusPill } from '@scheduler/design-system';
import { useBracket } from '../../hooks/useBracket';
import { useBracketApi } from '../../api/bracketClient';
import { useTournamentId } from '../../hooks/useTournamentId';
import { useTournamentStore } from '../../store/tournamentStore';
import type { BracketEventStatus } from '../../api/bracketDto';
import { ActionsBar, EmptyState } from '../../components/control-plane';
import { Modal } from '../../components/common/Modal';
import { INTERACTIVE_BASE } from '../../lib/utils';
import { ParticipantPicker, type PickedSingle, type PickedPair } from './ParticipantPicker';
import { formatLabel, disciplineLabel } from './bracketLabels';

export function BracketDrawsTab() {
  const { data, setData, refresh } = useBracket();
  const api = useBracketApi();
  const tid = useTournamentId();
  const navigate = useNavigate();
  const players = useTournamentStore((s) => s.bracketPlayers);

  const [openPickerFor, setOpenPickerFor] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Legacy deep links (and the old "New draw" route) arrived with ?new=1
  // to auto-open the create flow. Honor it by opening the layer, then
  // consume the flag so a refresh doesn't reopen it.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setCreating(true);
      const next = new URLSearchParams(searchParams);
      next.delete('new');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

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

  // Open a draw's bracket visualization. The event id rides along as a
  // query param so the Draw view lands on the row the operator clicked
  // (not just whichever event happened to be selected).
  const openDraw = (eventId: string) =>
    navigate(`/tournaments/${tid}/bracket-draw?event=${encodeURIComponent(eventId)}`);

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <ActionsBar
        title="Draws"
        status={
          <span className="text-sm font-semibold text-foreground tabular-nums">
            {events.length} draw{events.length === 1 ? '' : 's'}
          </span>
        }
      >
        <button
          type="button"
          onClick={() => setCreating(true)}
          data-testid="bracket-new-draw"
          className={`${INTERACTIVE_BASE} inline-flex h-7 items-center gap-1 rounded-sm bg-primary px-2.5 text-xs font-medium text-primary-foreground transition-opacity duration-fast ease-brand hover:opacity-90`}
        >
          ＋ New draw
        </button>
      </ActionsBar>

      <div className="min-h-0 flex-1 overflow-auto">
        {events.length === 0 ? (
          <EmptyState
            title="No draws yet"
            body="A draw is one event's bracket. Create a draw, enter its participants, then generate — it’ll appear here and feed Matches and Operations."
            action={
              <button
                type="button"
                onClick={() => setCreating(true)}
                className={`${INTERACTIVE_BASE} inline-flex h-8 items-center gap-1 rounded-sm bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity duration-fast ease-brand hover:opacity-90`}
              >
                ＋ New draw
              </button>
            }
          />
        ) : (
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
                <th className="px-3 py-1.5 text-right font-semibold border-b border-border">Open</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => {
                const status: BracketEventStatus = ev.status ?? 'draft';
                const partCount = ev.participant_count ?? 0;
                const targetSize = ev.bracket_size ?? partCount;
                const pickerOpen = openPickerFor === ev.id;
                const isDoubles = ['MD', 'WD', 'XD'].includes(ev.discipline);
                const generated = status !== 'draft';
                return (
                  <Fragment key={ev.id}>
                    <tr className="border-b border-border/60 hover:bg-muted/30">
                      <td className="px-4 py-2 font-mono text-xs">{ev.id}</td>
                      <td className="px-3 py-2">{disciplineLabel(ev.discipline)}</td>
                      <td className="px-3 py-2">{formatLabel(ev.format)}</td>
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
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => openDraw(ev.id)}
                          disabled={!generated}
                          data-testid={`bracket-open-draw-${ev.id}`}
                          title={generated ? `Open the ${ev.id} draw` : 'Generate the draw first'}
                          className="text-xs text-muted-foreground hover:text-foreground hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Open →
                        </button>
                      </td>
                    </tr>
                    {pickerOpen && (
                      <tr>
                        <td colSpan={8} className="bg-bg-elev p-2">
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
            </tbody>
          </table>
        )}
      </div>

      {creating && (
        <NewDrawModal
          onClose={() => setCreating(false)}
          onCreate={async (body) => {
            try {
              const next = await api.eventUpsert(body.id, {
                discipline: body.discipline,
                format: body.format,
                duration_slots: 1,
                participants: [],
              });
              setData(next);
            } finally {
              setCreating(false);
            }
          }}
        />
      )}
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
      <Button variant="brand" size="sm" disabled={!eventReady} onClick={onGenerate}>
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

/**
 * Create-a-draw layer. Opens over the Draws surface so creation never
 * sends the operator to a separate page. Names the event (ID +
 * discipline) and picks the draw format; participants are entered
 * in-grid afterward, then the draw is generated.
 */
function NewDrawModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (body: { id: string; discipline: string; format: 'se' | 'rr' }) => void;
}) {
  const [id, setId] = useState('');
  const [discipline, setDiscipline] = useState('MS');
  const [format, setFormat] = useState<'se' | 'rr'>('se');
  const titleId = 'new-draw-title';

  const submit = () => {
    if (id.trim()) onCreate({ id: id.trim(), discipline, format });
  };

  return (
    <Modal onClose={onClose} titleId={titleId} widthClass="max-w-sm">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 id={titleId} className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          New draw
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-muted-foreground hover:text-foreground"
        >
          ✕
        </button>
      </div>

      <div className="space-y-3 px-4 py-4">
        <label className="block">
          <span className="mb-1 block text-2xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Event ID
          </span>
          <input
            type="text"
            value={id}
            autoFocus
            onChange={(e) => setId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="MS"
            className="w-full rounded-sm border border-border bg-bg-elev px-2 py-1.5 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-2xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Discipline
          </span>
          <input
            type="text"
            value={discipline}
            onChange={(e) => setDiscipline(e.target.value)}
            className="w-full rounded-sm border border-border bg-bg-elev px-2 py-1.5 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-2xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Format
          </span>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as 'se' | 'rr')}
            className="w-full rounded-sm border border-border bg-bg-elev px-2 py-1.5 text-sm"
          >
            <option value="se">Single elimination</option>
            <option value="rr">Round robin</option>
          </select>
        </label>
      </div>

      <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="brand" size="sm" disabled={!id.trim()} onClick={submit}>
          Create draw
        </Button>
      </div>
    </Modal>
  );
}
