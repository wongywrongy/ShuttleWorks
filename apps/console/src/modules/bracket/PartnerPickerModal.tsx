/**
 * PartnerPickerModal — the focused search-and-select surface for one doubles
 * pairing (D4 / D8, package O5).
 *
 * It replaces the inline native `<select>` that listed every eligible roster
 * name in one unsearchable list with no disambiguation and no preview of what
 * confirming would do. The rules it exists to keep visible:
 *
 *  - Selecting a result does NOT commit. The pair is proposed, previewed, and
 *    committed once by the explicit Assign/Change partner button.
 *  - A candidate the draw cannot take is SHOWN with the reason (already
 *    paired, self) rather than silently missing from the list.
 *  - Any consequence of confirming — dissolving the current pair, consuming a
 *    standalone entry — is stated before it is applied, not after.
 *  - Cancel closes without a write. The caller owns `query`/`selectedId`, so
 *    the draft survives dismissal and is still there on reopen.
 *
 * It performs no writes of its own: the owning surface routes the confirmed
 * pair through the canonical `commitBracketPairing` seam.
 */
import { Modal, TextField } from '@scheduler/design-system';
import { INTERACTIVE_BASE, ACCENT_PRESS, UTILITY_BUTTON } from '../../lib/utils';
import { formatPersonName } from '../../platform/domain/sides';

export interface PartnerCandidate {
  id: string;
  name: string;
  /** Disambiguation shown under the name: representation, club, entries. */
  detail?: string;
  /** Set when the candidate cannot be picked; rendered as the reason. */
  blockedReason?: string;
}

export function PartnerPickerModal({
  eventId,
  eventLabel,
  playerName,
  currentPartnerName,
  candidates,
  query,
  onQueryChange,
  selectedId,
  onSelect,
  effects,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  eventId: string;
  /** Human label for the draw, e.g. "Men's doubles". */
  eventLabel: string;
  playerName: string;
  /** The partner this player has in this draw today, when they have one. */
  currentPartnerName: string | null;
  candidates: PartnerCandidate[];
  query: string;
  onQueryChange: (next: string) => void;
  selectedId: string;
  onSelect: (id: string) => void;
  /** Consequences of confirming, stated before the write. */
  effects: string[];
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = `partner-picker-title-${eventId}`;
  const changing = currentPartnerName != null;
  const needle = query.trim().toLocaleLowerCase();
  const shown = needle
    ? candidates.filter(
        (c) =>
          c.name.toLocaleLowerCase().includes(needle) ||
          (c.detail ?? '').toLocaleLowerCase().includes(needle),
      )
    : candidates;
  const selected = candidates.find((c) => c.id === selectedId) ?? null;

  return (
    <Modal onClose={onCancel} titleId={titleId} widthClass="max-w-md" locked={busy}>
      <div className="flex flex-col" data-testid={`partner-picker-${eventId}`}>
        <div className="border-b border-border px-4 py-3">
          <h2 id={titleId} className="text-sm font-semibold text-card-foreground">
            {changing ? 'Change partner' : 'Choose partner'}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {eventLabel} · {formatPersonName(playerName)}
          </p>
        </div>

        <div className="border-b border-border px-4 py-2 text-xs">
          <span className="text-muted-foreground">Current pair: </span>
          <span className="font-medium text-foreground" data-testid={`partner-picker-current-${eventId}`}>
            {currentPartnerName
              ? `${formatPersonName(playerName)} / ${formatPersonName(currentPartnerName)}`
              : 'not paired yet'}
          </span>
        </div>

        <div className="px-4 py-3">
          <TextField
            label="Search players"
            size="sm"
            value={query}
            placeholder="Name…"
            onChange={(e) => onQueryChange(e.target.value)}
            data-testid={`partner-search-${eventId}`}
          />
        </div>

        <div className="max-h-64 overflow-y-auto border-y border-border">
          {shown.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-muted-foreground">
              No players match “{query}”.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {shown.map((c) => {
                const blocked = c.blockedReason != null;
                const isSelected = c.id === selectedId;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      disabled={blocked || busy}
                      aria-pressed={isSelected}
                      onClick={() => onSelect(c.id)}
                      data-testid={`partner-option-${c.id}`}
                      className={[
                        INTERACTIVE_BASE,
                        'flex w-full flex-col items-start gap-0.5 px-4 py-2 text-left',
                        'disabled:cursor-not-allowed disabled:opacity-60',
                        isSelected
                          ? 'bg-action-selected-bg text-action-selected-foreground'
                          : 'hover:bg-muted/40',
                      ].join(' ')}
                    >
                      <span className="text-sm font-medium">
                        {formatPersonName(c.name)}
                      </span>
                      {c.blockedReason ?? c.detail ? (
                        <span
                          className={`text-xs ${blocked ? 'text-status-warning' : 'text-muted-foreground'}`}
                        >
                          {c.blockedReason ?? c.detail}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="px-4 py-3 text-xs">
          <p data-testid={`partner-preview-${eventId}`}>
            <span className="text-muted-foreground">New pair: </span>
            <span className="font-medium text-foreground">
              {selected
                ? `${formatPersonName(playerName)} / ${formatPersonName(selected.name)}`
                : 'pick a player above'}
            </span>
          </p>
          {selected && effects.length > 0 ? (
            <ul className="mt-1.5 list-disc pl-4 text-muted-foreground">
              {effects.map((effect) => (
                <li key={effect}>{effect}</li>
              ))}
            </ul>
          ) : null}
          {error ? (
            <p role="alert" className="mt-1.5 font-medium text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-4 py-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            data-testid={`partner-cancel-${eventId}`}
            className={UTILITY_BUTTON}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!selected || busy}
            onClick={onConfirm}
            data-testid={`partner-confirm-${eventId}`}
            className={`${INTERACTIVE_BASE} inline-flex h-8 items-center rounded-sm bg-accent px-3 text-xs font-medium text-accent-ink ${ACCENT_PRESS} disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {busy ? 'Saving…' : changing ? 'Change partner' : 'Assign partner'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
