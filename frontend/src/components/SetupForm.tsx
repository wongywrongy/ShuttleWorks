import { useState } from "react";
import { api } from "../api";
import type { CreateTournamentIn, TournamentDTO } from "../types";

interface Props {
  disabled?: boolean;
  onCreated: (t: TournamentDTO) => void;
}

export function SetupForm({ disabled, onCreated }: Props) {
  const [format, setFormat] = useState<"se" | "rr">("se");
  const [namesText, setNamesText] = useState(SAMPLE_NAMES_8);
  const [courts, setCourts] = useState(2);
  const [totalSlots, setTotalSlots] = useState(64);
  const [durationSlots, setDurationSlots] = useState(1);
  const [intervalMinutes, setIntervalMinutes] = useState(30);
  const [restBetweenRounds, setRestBetweenRounds] = useState(1);
  const [rrRounds, setRrRounds] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const names = namesText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      if (names.length < 2) {
        throw new Error("Need at least 2 participants");
      }
      const body: CreateTournamentIn = {
        format,
        participants: names.map((name, i) => ({
          id: `P${i + 1}`,
          name,
        })),
        courts,
        total_slots: totalSlots,
        duration_slots: durationSlots,
        rest_between_rounds: restBetweenRounds,
        rr_rounds: rrRounds,
        interval_minutes: intervalMinutes,
        time_limit_seconds: 5,
      };
      const t = await api.create(body);
      onCreated(t);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card p-6 space-y-5">
      <div>
        <h2 className="text-base font-semibold">New tournament</h2>
        <p className="text-sm text-ink-500">
          Pick a format, paste your participant list (one per line, in seed
          order for SE), set courts and slot length, then generate the draw.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Format">
          <div className="inline-flex rounded-md border border-ink-300 overflow-hidden">
            {(["se", "rr"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                className={
                  "px-3 py-1.5 text-sm " +
                  (format === f
                    ? "bg-ink-900 text-white"
                    : "bg-white text-ink-700 hover:bg-ink-100")
                }
              >
                {f === "se" ? "Single Elim" : "Round Robin"}
              </button>
            ))}
          </div>
        </Field>

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

        <Field label="Match duration (slots)">
          <NumInput
            value={durationSlots}
            setValue={setDurationSlots}
            min={1}
            max={16}
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

        {format === "rr" && (
          <Field label="Round-robin cycles">
            <NumInput
              value={rrRounds}
              setValue={setRrRounds}
              min={1}
              max={4}
            />
          </Field>
        )}
      </div>

      <Field label="Participants (one per line)">
        <textarea
          value={namesText}
          onChange={(e) => setNamesText(e.target.value)}
          rows={10}
          className="w-full font-mono text-sm rounded-md border border-ink-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ink-400"
          spellCheck={false}
        />
      </Field>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button
          className="btn-ghost"
          onClick={() => setNamesText(SAMPLE_NAMES_8)}
        >
          Sample 8
        </button>
        <button
          className="btn-ghost"
          onClick={() => setNamesText(SAMPLE_NAMES_32)}
        >
          Sample 32
        </button>
        <button
          className="btn-primary"
          disabled={disabled || submitting}
          onClick={submit}
        >
          {submitting ? "Creating…" : "Generate draw"}
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
      className="w-32 rounded-md border border-ink-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ink-400"
    />
  );
}

const SAMPLE_NAMES_8 = `Alice
Bob
Carla
Dani
Erin
Felix
Grace
Hugo`;

const SAMPLE_NAMES_32 = Array.from(
  { length: 32 },
  (_, i) => `Seed ${i + 1}`
).join("\n");
