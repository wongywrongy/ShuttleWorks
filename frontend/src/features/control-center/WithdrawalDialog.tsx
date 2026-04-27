/**
 * Withdrawal Dialog
 * Shows when withdrawing a player from the tournament
 */
import { useState } from 'react';
import type { WithdrawalReason } from '../../api/dto';

interface PlayerInfo {
  id: string;
  name: string;
}

interface WithdrawalDialogProps {
  players: PlayerInfo[];
  onSubmit: (playerId: string, reason: WithdrawalReason, notes?: string) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

const WITHDRAWAL_REASONS: { value: WithdrawalReason; label: string; description: string }[] = [
  { value: 'injury', label: 'Injury', description: 'Player injured and cannot continue' },
  { value: 'no_show', label: 'No Show', description: 'Player did not show up to the tournament' },
  { value: 'disqualification', label: 'Disqualification', description: 'Player disqualified from tournament' },
  { value: 'personal', label: 'Personal', description: 'Personal reasons' },
  { value: 'other', label: 'Other', description: 'Other reason (specify in notes)' },
];

export function WithdrawalDialog({
  players,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: WithdrawalDialogProps) {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [selectedReason, setSelectedReason] = useState<WithdrawalReason | null>(null);
  const [notes, setNotes] = useState('');

  const handleSubmit = () => {
    if (selectedPlayerId && selectedReason) {
      onSubmit(selectedPlayerId, selectedReason, notes || undefined);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-card rounded-lg shadow-xl p-4 w-96 max-w-[90vw] max-h-[90vh] overflow-auto">
        <h3 className="text-lg font-semibold text-foreground mb-1">Withdraw Player</h3>
        <p className="text-sm text-muted-foreground mb-4">This will remove the player from all remaining matches.</p>

        {/* Player selection */}
        <div className="mb-4">
          <div className="text-sm font-medium text-foreground mb-2">Select Player</div>
          <div className="space-y-1.5">
            {players.map((player) => (
              <label
                key={player.id}
                className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition-colors ${
                  selectedPlayerId === player.id
                    ? 'border-red-500 bg-red-50'
                    : 'border-border hover:border-border'
                }`}
              >
                <input
                  type="radio"
                  name="withdrawPlayer"
                  value={player.id}
                  checked={selectedPlayerId === player.id}
                  onChange={() => setSelectedPlayerId(player.id)}
                />
                <span className="text-sm text-foreground">{player.name}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Reason selection */}
        {selectedPlayerId && (
          <div className="mb-4">
            <div className="text-sm font-medium text-foreground mb-2">Reason for Withdrawal</div>
            <div className="space-y-1.5">
              {WITHDRAWAL_REASONS.map((reason) => (
                <label
                  key={reason.value}
                  className={`flex items-start gap-2 p-2 rounded border cursor-pointer transition-colors ${
                    selectedReason === reason.value
                      ? 'border-red-500 bg-red-50'
                      : 'border-border hover:border-border'
                  }`}
                >
                  <input
                    type="radio"
                    name="withdrawReason"
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
          </div>
        )}

        {/* Notes for "other" reason */}
        {selectedReason === 'other' && (
          <div className="mb-4">
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Specify reason..."
              className="w-full px-2 py-1.5 text-sm border border-border rounded focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none"
              autoFocus
            />
          </div>
        )}

        {/* Action buttons */}
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
            disabled={!selectedPlayerId || !selectedReason || isSubmitting}
            className="flex-1 px-3 py-1.5 text-sm text-white bg-red-500 rounded hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Withdrawing...' : 'Withdraw Player'}
          </button>
        </div>
      </div>
    </div>
  );
}
