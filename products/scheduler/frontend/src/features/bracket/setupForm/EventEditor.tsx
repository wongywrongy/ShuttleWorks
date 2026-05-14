import type { ReactNode } from 'react';

import {
  type EventDraft,
  SAMPLE_8,
  SAMPLE_32,
  SAMPLE_DOUBLES,
} from './helpers';

/* ============================================================================
 * EventEditor — single-event row inside the SetupForm.
 *
 * Three small primitives co-located here because they're only used by this
 * editor: Field (labelled column) and NumInput (number-only input). If a
 * second consumer appears, lift them into the shared design-system package.
 * ========================================================================= */

interface EventEditorProps {
  value: EventDraft;
  onChange: (patch: Partial<EventDraft>) => void;
  onRemove?: () => void;
}

export function EventEditor({ value, onChange, onRemove }: EventEditorProps) {
  return (
    <div className="card border-ink-200 p-4 space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Event id">
          <input
            type="text"
            value={value.id}
            onChange={(e) => onChange({ id: e.target.value.trim() || 'E' })}
            className="w-24 rounded-sm border border-ink-300 bg-bg-elev px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </Field>
        <Field label="Discipline">
          <select
            value={value.discipline}
            onChange={(e) => onChange({ discipline: e.target.value })}
            className="rounded-sm border border-ink-300 bg-bg-elev px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {['MS', 'WS', 'MD', 'WD', 'XD', 'GEN'].map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Format">
          <div className="inline-flex rounded-sm border border-ink-300 overflow-hidden">
            {(['se', 'rr'] as const).map((f) => (
              <button
                key={f}
                onClick={() => onChange({ format: f })}
                className={
                  'px-3 py-1.5 text-sm ' +
                  (value.format === f
                    ? 'bg-ink text-bg'
                    : 'bg-bg-elev text-ink-muted hover:bg-rule-soft')
                }
              >
                {f === 'se' ? 'Single Elim' : 'Round Robin'}
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
        {value.format === 'rr' && (
          <Field label="RR cycles">
            <NumInput
              value={value.rrRounds}
              setValue={(v) => onChange({ rrRounds: v })}
              min={1}
              max={4}
            />
          </Field>
        )}
        {value.format === 'se' && (
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
          <button
            className="btn-ghost ml-auto text-status-blocked"
            onClick={onRemove}
          >
            Remove
          </button>
        )}
      </div>

      <Field label="Participants (one per line, in seed order — use 'A / B' for doubles)">
        <textarea
          value={value.participantsText}
          onChange={(e) => onChange({ participantsText: e.target.value })}
          rows={8}
          className="w-full font-mono text-sm rounded-sm border border-ink-300 bg-bg-elev px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
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

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-ink-muted">{label}</span>
      {children}
    </label>
  );
}

export function NumInput({
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
      className="w-28 rounded-sm border border-ink-300 bg-bg-elev px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
    />
  );
}
