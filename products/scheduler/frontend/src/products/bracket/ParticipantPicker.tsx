/**
 * In-grid participant picker. Renders below the active EventsTab row,
 * in flow (no popover). Singles = checkbox list, Doubles = 2-step
 * pair-select (commit pair as a TEAM participant).
 */
import { useState } from 'react';
import type { BracketPlayerDTO } from '../../api/dto';
import { Button } from '@scheduler/design-system';

export interface PickedSingle {
  id: string;
  name: string;
}

export interface PickedPair {
  id: string;
  name: string;
  members: [string, string];
}

interface Props {
  mode: 'singles' | 'doubles';
  eventId: string;
  players: BracketPlayerDTO[];
  initialIds: string[];
  onCommit: (picks: PickedSingle[] | PickedPair[]) => void;
  onCancel: () => void;
}

export function ParticipantPicker({
  mode,
  eventId,
  players,
  initialIds,
  onCommit,
  onCancel,
}: Props) {
  if (mode === 'singles') {
    return (
      <SinglesPicker
        players={players}
        initialIds={initialIds}
        onCommit={onCommit as (picks: PickedSingle[]) => void}
        onCancel={onCancel}
      />
    );
  }
  return (
    <DoublesPicker
      eventId={eventId}
      players={players}
      onCommit={onCommit as (picks: PickedPair[]) => void}
      onCancel={onCancel}
    />
  );
}

function SinglesPicker({
  players,
  initialIds,
  onCommit,
  onCancel,
}: {
  players: BracketPlayerDTO[];
  initialIds: string[];
  onCommit: (picks: PickedSingle[]) => void;
  onCancel: () => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set(initialIds));
  const toggle = (id: string) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <div className="border border-border bg-bg-elev p-3 space-y-2">
      <div className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        Pick participants ({picked.size})
      </div>
      <ul className="grid grid-cols-2 gap-1">
        {players.map((p) => (
          <li key={p.id}>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={picked.has(p.id)}
                onChange={() => toggle(p.id)}
              />
              {p.name}
            </label>
          </li>
        ))}
      </ul>
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button
          variant="brand"
          size="sm"
          onClick={() => {
            const ids = Array.from(picked);
            onCommit(
              ids
                .map((id) => players.find((p) => p.id === id))
                .filter((p): p is BracketPlayerDTO => p != null)
                .map((p) => ({ id: p.id, name: p.name })),
            );
          }}
        >
          Commit
        </Button>
      </div>
    </div>
  );
}

function DoublesPicker({
  eventId,
  players,
  onCommit,
  onCancel,
}: {
  eventId: string;
  players: BracketPlayerDTO[];
  onCommit: (picks: PickedPair[]) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<'A' | 'B'>('A');
  const [pickedA, setPickedA] = useState<BracketPlayerDTO | null>(null);
  const [pairs, setPairs] = useState<PickedPair[]>([]);

  return (
    <div className="border border-border bg-bg-elev p-3 space-y-2">
      <div className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {step === 'A'
          ? `Pick player A (pair ${pairs.length + 1})`
          : `Pick partner for ${pickedA?.name}`}
      </div>
      <ul className="grid grid-cols-2 gap-1">
        {players.map((p) => {
          const pairedIds = new Set(pairs.flatMap((pair) => pair.members));
          const isSelfPick = step === 'B' && p.id === pickedA?.id;
          const isAlreadyPaired = pairedIds.has(p.id);
          const isDisabled = isSelfPick || isAlreadyPaired;
          return (
            <li key={p.id}>
              <button
                type="button"
                disabled={isDisabled}
                className={
                  isDisabled
                    ? 'text-sm w-full text-left px-1 opacity-40 cursor-not-allowed'
                    : 'text-sm w-full text-left hover:bg-muted/30 px-1'
                }
                onClick={() => {
                  if (step === 'A') {
                    setPickedA(p);
                    setStep('B');
                  } else if (pickedA) {
                    const pairId = `${eventId}-T${pairs.length + 1}`;
                    setPairs((arr) => [
                      ...arr,
                      {
                        id: pairId,
                        name: `${pickedA.name} / ${p.name}`,
                        members: [pickedA.id, p.id],
                      },
                    ]);
                    setPickedA(null);
                    setStep('A');
                  }
                }}
              >
                {p.name}
              </button>
            </li>
          );
        })}
      </ul>
      {pairs.length > 0 && (
        <ul className="text-2xs font-mono space-y-0.5">
          {pairs.map((pair) => (
            <li key={pair.id}>{pair.name}</li>
          ))}
        </ul>
      )}
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button
          variant="brand"
          size="sm"
          disabled={pairs.length === 0 || step === 'B'}
          title={
            pairs.length === 0
              ? 'Form at least one pair to commit'
              : step === 'B'
                ? 'Finish the current pair first'
                : ''
          }
          onClick={() => onCommit(pairs)}
        >
          Commit pairs
        </Button>
      </div>
    </div>
  );
}
