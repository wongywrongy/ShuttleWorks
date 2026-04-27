/**
 * Delay Reason Dialog
 * Shows when delaying a match to capture the reason
 */
import { useState } from 'react';
import type { DelayReason } from '../../api/dto';

interface PlayerInfo {
  id: string;
  name: string;
}

interface DelayReasonDialogProps {
  matchName: string;
  players?: PlayerInfo[]; // Optional: list of players to select who caused the delay
  onSubmit: (reason: DelayReason, notes?: string, delayedPlayerId?: string) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

const DELAY_REASONS: { value: DelayReason; label: string; description: string }[] = [
  { value: 'player_not_present', label: 'Player Not Present', description: 'One or more players are not at the court' },
  { value: 'injury', label: 'Injury / Medical', description: 'Player injury or medical issue' },
  { value: 'court_issue', label: 'Court Issue', description: 'Problem with the court (equipment, surface, etc.)' },
  { value: 'other', label: 'Other', description: 'Other reason (specify in notes)' },
];

export function DelayReasonDialog({
  matchName,
  players,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: DelayReasonDialogProps) {
  const [selectedReason, setSelectedReason] = useState<DelayReason | null>(null);
  const [notes, setNotes] = useState('');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  const handleSubmit = () => {
    if (selectedReason) {
      onSubmit(selectedReason, notes || undefined, selectedPlayerId || undefined);
    }
  };

  // Show player selector for "player_not_present" if players are provided
  const showPlayerSelector = selectedReason === 'player_not_present' && players && players.length > 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-card rounded-lg shadow-xl p-4 w-80 max-w-[90vw]">
        <h3 className="text-lg font-semibold text-foreground mb-1">Delay Match</h3>
        <p className="text-sm text-muted-foreground mb-3">{matchName}</p>

        <div className="space-y-2 mb-3">
          {DELAY_REASONS.map((reason) => (
            <label
              key={reason.value}
              className={`flex items-start gap-2 p-2 rounded border cursor-pointer transition-colors ${
                selectedReason === reason.value
                  ? 'border-yellow-500 bg-yellow-50'
                  : 'border-border hover:border-border'
              }`}
            >
              <input
                type="radio"
                name="delayReason"
                value={reason.value}
                checked={selectedReason === reason.value}
                onChange={() => setSelectedReason(reason.value)}
                className="mt-0.5"
              />
              <div>
                <div className="text-sm font-medium text-foreground">{reason.label}</div>
                <div className="text-xs text-muted-foreground">{reason.description}</div>
              </div>
            </label>
          ))}
        </div>

        {selectedReason === 'other' && (
          <div className="mb-3">
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Specify reason..."
              className="w-full px-2 py-1.5 text-sm border border-border rounded focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 outline-none"
              autoFocus
            />
          </div>
        )}

        {showPlayerSelector && (
          <div className="mb-3">
            <div className="text-sm font-medium text-foreground mb-1.5">Which player is missing?</div>
            <div className="space-y-1.5">
              {players!.map((player) => (
                <label
                  key={player.id}
                  className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition-colors ${
                    selectedPlayerId === player.id
                      ? 'border-yellow-500 bg-yellow-50'
                      : 'border-border hover:border-border'
                  }`}
                >
                  <input
                    type="radio"
                    name="delayedPlayer"
                    value={player.id}
                    checked={selectedPlayerId === player.id}
                    onChange={() => setSelectedPlayerId(player.id)}
                  />
                  <span className="text-sm text-foreground">{player.name}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={onCancel}
            disabled={isSubmitting}
            className="flex-1 px-3 py-1.5 text-sm text-foreground bg-muted rounded hover:bg-muted disabled:bg-muted disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!selectedReason || isSubmitting}
            className="flex-1 px-3 py-1.5 text-sm text-white bg-yellow-500 rounded hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Delaying...' : 'Delay Match'}
          </button>
        </div>
      </div>
    </div>
  );
}
