import { useState } from "react";
import { Sliders, ListBullets, Lightning } from '@phosphor-icons/react';
import { Button } from '@scheduler/design-system';
import { useBracketApi } from "../../api/bracketClient";
import type {
  CreateTournamentIn,
  EventIn,
  TournamentDTO,
} from "../../api/bracketDto";
import {
  type EventDraft,
  emptyEvent,
  playerSlug,
  defaultStartTime,
} from "./setupForm/helpers";
import { EventEditor, Field, NumInput } from "./setupForm/EventEditor";
import { SettingsShell, type SettingsSectionDef } from '../settings/SettingsShell';

interface Props {
  disabled?: boolean;
  onCreated: (t: TournamentDTO) => void;
}

export function SetupForm({ disabled, onCreated }: Props) {
  const api = useBracketApi();
  const [events, setEvents] = useState<EventDraft[]>([emptyEvent("MS", "MS")]);
  const [courts, setCourts] = useState(2);
  const [totalSlots, setTotalSlots] = useState(64);
  const [intervalMinutes, setIntervalMinutes] = useState(30);
  const [restBetweenRounds, setRestBetweenRounds] = useState(1);
  const [startTime, setStartTime] = useState(defaultStartTime());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const updateEvent = (i: number, patch: Partial<EventDraft>) => {
    setEvents((evs) => evs.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  };

  const addEvent = () => {
    const taken = new Set(events.map((e) => e.id));
    const fallback = ["WS", "MD", "WD", "XD", "E2", "E3", "E4"].find(
      (id) => !taken.has(id)
    );
    setEvents((evs) => [...evs, emptyEvent(fallback ?? `E${evs.length + 1}`)]);
  };

  const removeEvent = (i: number) => {
    setEvents((evs) => evs.filter((_, idx) => idx !== i));
  };

  const submit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const eventsIn: EventIn[] = events.map((ev) => {
        const names = ev.participantsText
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean);
        if (names.length < 2) {
          throw new Error(`Event ${ev.id}: need at least 2 participants`);
        }
        const seenIds = new Set<string>();
        const participants = names.map((line, i) => {
          const seed = i + 1;
          if (line.includes("/")) {
            const parts = line.split("/").map((s) => s.trim()).filter(Boolean);
            if (parts.length < 2) {
              throw new Error(`Event ${ev.id}: malformed pair "${line}"`);
            }
            // Team id is event-scoped (a doubles pair only exists in
            // one event). Member ids are GLOBAL slugs — so the same
            // player name in MS singles and an MD pair becomes the
            // same engine player id, and cross-event player no-
            // overlap fires correctly.
            const teamId = `${ev.id}-T${i + 1}`;
            const memberIds = parts.map(playerSlug);
            return {
              id: teamId,
              name: parts.join(" / "),
              members: memberIds,
              seed,
            };
          }
          // Singles: the participant *is* the player. Use a global
          // slug id so cross-event matches share the player.
          const id = playerSlug(line);
          if (seenIds.has(id)) {
            throw new Error(
              `Event ${ev.id}: duplicate participant "${line}" (slug ${id}). ` +
                `Use distinct names — e.g. "Alex M" vs "Alex W".`
            );
          }
          seenIds.add(id);
          return { id, name: line, seed };
        });
        return {
          id: ev.id,
          discipline: ev.discipline,
          format: ev.format,
          participants,
          rr_rounds: ev.rrRounds,
          duration_slots: ev.durationSlots,
          bracket_size: ev.bracketSize ?? null,
          seeded_count: ev.seededCount ?? null,
        };
      });

      const body: CreateTournamentIn = {
        courts,
        total_slots: totalSlots,
        interval_minutes: intervalMinutes,
        rest_between_rounds: restBetweenRounds,
        time_limit_seconds: 5,
        start_time: startTime || null,
        events: eventsIn,
      };
      const t = await api.create(body);
      onCreated(t);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleImport = async (file: File) => {
    setError(null);
    setSubmitting(true);
    try {
      const text = await file.text();
      let result: TournamentDTO;
      if (file.name.endsWith(".csv") || file.type === "text/csv") {
        result = await api.importCsv(text, {
          courts,
          total_slots: totalSlots,
          interval_minutes: intervalMinutes,
          rest_between_rounds: restBetweenRounds,
          start_time: startTime || undefined,
        });
      } else {
        result = await api.importJson(JSON.parse(text));
      }
      onCreated(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const sections: SettingsSectionDef[] = [
    {
      id: 'configuration',
      label: 'Configuration',
      icon: Sliders,
      render: () => (
        <div className="space-y-6 py-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Courts">
              <NumInput value={courts} setValue={setCourts} min={1} max={32} />
            </Field>
            <Field label="Total slots">
              <NumInput value={totalSlots} setValue={setTotalSlots} min={4} max={1024} />
            </Field>
            <Field label="Slot length (minutes)">
              <NumInput value={intervalMinutes} setValue={setIntervalMinutes} min={5} max={240} />
            </Field>
            <Field label="Rest between rounds">
              <NumInput value={restBetweenRounds} setValue={setRestBetweenRounds} min={0} max={32} />
            </Field>
            <Field label="Start time (local)">
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full rounded-sm border border-border bg-bg-elev px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </Field>
          </div>
        </div>
      ),
    },
    {
      id: 'events',
      label: 'Events',
      icon: ListBullets,
      render: () => (
        <div className="space-y-3 py-6">
          <div className="flex items-center justify-between">
            <h3 className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Events ({events.length})
            </h3>
            <Button variant="outline" size="sm" onClick={addEvent}>+ Add event</Button>
          </div>
          {events.map((ev, i) => (
            <EventEditor
              key={i}
              value={ev}
              onChange={(patch) => updateEvent(i, patch)}
              onRemove={events.length > 1 ? () => removeEvent(i) : undefined}
            />
          ))}
        </div>
      ),
    },
    {
      id: 'generate',
      label: 'Generate',
      icon: Lightning,
      render: () => {
        const participantCount = events.reduce(
          (sum, e) => sum + e.participantsText.split('\n').filter((s) => s.trim()).length,
          0,
        );
        return (
          <div className="space-y-6 py-6">
            <div className="text-sm text-muted-foreground">
              <p>
                {events.length} event{events.length === 1 ? '' : 's'} ·{' '}
                {participantCount} participant{participantCount === 1 ? '' : 's'} ·{' '}
                {totalSlots} slots × {intervalMinutes} min
              </p>
            </div>
            {error && (
              <div className="text-sm text-status-blocked bg-status-blocked-bg border border-status-blocked/40 rounded-sm px-3 py-2">
                {error}
              </div>
            )}
            <div className="flex flex-wrap justify-end gap-2 items-center">
              <label className="cursor-pointer">
                <Button variant="ghost" asChild>
                  <span>Import draw…</span>
                </Button>
                <input
                  type="file"
                  accept=".json,.csv,application/json,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleImport(f);
                  }}
                />
              </label>
              <Button
                variant="brand"
                disabled={disabled || submitting}
                onClick={submit}
              >
                {submitting ? 'Creating…' : 'Generate draws'}
              </Button>
            </div>
          </div>
        );
      },
    },
  ];

  return (
    <SettingsShell
      sections={sections}
      defaultSectionId="configuration"
      eyebrow="NEW BRACKET"
    />
  );
}

