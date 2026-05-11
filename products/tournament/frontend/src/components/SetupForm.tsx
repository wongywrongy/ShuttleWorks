import { useState } from "react";
import { api } from "../api";
import type { CreateTournamentIn, EventIn, TournamentDTO } from "../types";

interface Props {
  disabled?: boolean;
  onCreated: (t: TournamentDTO) => void;
}

interface EventDraft {
  id: string;
  discipline: string;
  format: "se" | "rr";
  participantsText: string;
  rrRounds: number;
  durationSlots: number;
  bracketSize?: number;
  seededCount?: number;
}

const SAMPLE_8 = `Alice
Bob
Carla
Dani
Erin
Felix
Grace
Hugo`;

const SAMPLE_32 = Array.from({ length: 32 }, (_, i) => `Seed ${i + 1}`).join(
  "\n"
);

const SAMPLE_DOUBLES = `Alice / Anna
Bob / Brent
Carla / Cora
Dani / Drew`;

function emptyEvent(id: string, discipline = "MS"): EventDraft {
  return {
    id,
    discipline,
    format: "se",
    participantsText: SAMPLE_8,
    rrRounds: 1,
    durationSlots: 1,
  };
}

export function SetupForm({ disabled, onCreated }: Props) {
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

  return (
    <div className="card p-6 space-y-6">
      <div>
        <h2 className="text-base font-semibold">New tournament</h2>
        <p className="text-sm text-ink-500 mt-1">
          Configure one or more events. For doubles, write{" "}
          <code className="text-xs bg-ink-100 px-1 rounded">Name1 / Name2</code>{" "}
          per line.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Field label="Courts">
          <NumInput value={courts} setValue={setCourts} min={1} max={32} />
        </Field>
        <Field label="Total slots">
          <NumInput
            value={totalSlots}
            setValue={setTotalSlots}
            min={4}
            max={1024}
          />
        </Field>
        <Field label="Slot length (minutes)">
          <NumInput
            value={intervalMinutes}
            setValue={setIntervalMinutes}
            min={5}
            max={240}
          />
        </Field>
        <Field label="Rest between rounds">
          <NumInput
            value={restBetweenRounds}
            setValue={setRestBetweenRounds}
            min={0}
            max={32}
          />
        </Field>
        <Field label="Start time (local)">
          <input
            type="datetime-local"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="w-56 rounded-md border border-ink-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ink-400"
          />
        </Field>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-500">
            Events
          </h3>
          <button className="btn-outline" onClick={addEvent}>
            + Add event
          </button>
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

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-2 items-center">
        <label className="btn-ghost cursor-pointer">
          Import draw…
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
        <button
          className="btn-primary"
          disabled={disabled || submitting}
          onClick={submit}
        >
          {submitting ? "Creating…" : "Generate draws"}
        </button>
      </div>
    </div>
  );
}

function EventEditor({
  value,
  onChange,
  onRemove,
}: {
  value: EventDraft;
  onChange: (patch: Partial<EventDraft>) => void;
  onRemove?: () => void;
}) {
  return (
    <div className="card border-ink-200 p-4 space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Event id">
          <input
            type="text"
            value={value.id}
            onChange={(e) => onChange({ id: e.target.value.trim() || "E" })}
            className="w-24 rounded-md border border-ink-300 bg-white px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ink-400"
          />
        </Field>
        <Field label="Discipline">
          <select
            value={value.discipline}
            onChange={(e) => onChange({ discipline: e.target.value })}
            className="rounded-md border border-ink-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ink-400"
          >
            {["MS", "WS", "MD", "WD", "XD", "GEN"].map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Format">
          <div className="inline-flex rounded-md border border-ink-300 overflow-hidden">
            {(["se", "rr"] as const).map((f) => (
              <button
                key={f}
                onClick={() => onChange({ format: f })}
                className={
                  "px-3 py-1.5 text-sm " +
                  (value.format === f
                    ? "bg-ink-900 text-white"
                    : "bg-white text-ink-700 hover:bg-ink-100")
                }
              >
                {f === "se" ? "Single Elim" : "Round Robin"}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Match duration (slots)">
          <NumInput
            value={value.durationSlots}
            setValue={(v) => onChange({ durationSlots: v })}
            min={1}
            max={16}
          />
        </Field>
        {value.format === "rr" && (
          <Field label="RR cycles">
            <NumInput
              value={value.rrRounds}
              setValue={(v) => onChange({ rrRounds: v })}
              min={1}
              max={4}
            />
          </Field>
        )}
        {value.format === "se" && (
          <Field label="Seeded count">
            <NumInput
              value={value.seededCount ?? 0}
              setValue={(v) =>
                onChange({ seededCount: v > 0 ? v : undefined })
              }
              min={0}
              max={256}
            />
          </Field>
        )}
        {onRemove && (
          <button className="btn-ghost ml-auto text-red-600" onClick={onRemove}>
            Remove
          </button>
        )}
      </div>

      <Field label="Participants (one per line, in seed order — use 'A / B' for doubles)">
        <textarea
          value={value.participantsText}
          onChange={(e) => onChange({ participantsText: e.target.value })}
          rows={8}
          className="w-full font-mono text-sm rounded-md border border-ink-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ink-400"
          spellCheck={false}
        />
      </Field>

      <div className="flex gap-2 text-xs">
        <button
          className="btn-ghost text-xs"
          onClick={() => onChange({ participantsText: SAMPLE_8 })}
        >
          Sample 8 singles
        </button>
        <button
          className="btn-ghost text-xs"
          onClick={() => onChange({ participantsText: SAMPLE_32 })}
        >
          Sample 32 singles
        </button>
        <button
          className="btn-ghost text-xs"
          onClick={() => onChange({ participantsText: SAMPLE_DOUBLES })}
        >
          Sample 4 pairs
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-ink-600">{label}</span>
      {children}
    </label>
  );
}

function NumInput({
  value,
  setValue,
  min,
  max,
}: {
  value: number;
  setValue: (n: number) => void;
  min: number;
  max: number;
}) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      onChange={(e) => setValue(Number(e.target.value))}
      className="w-28 rounded-md border border-ink-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ink-400"
    />
  );
}

function playerSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `p-${slug || "player"}`;
}

function defaultStartTime(): string {
  const d = new Date();
  d.setHours(9, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}
