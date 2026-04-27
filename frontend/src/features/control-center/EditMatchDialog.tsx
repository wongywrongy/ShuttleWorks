/**
 * Edit Match Dialog
 * Allows substituting or removing players from a match
 */
import { useId, useState } from 'react';
import { X } from 'lucide-react';
import { Modal } from '../../components/common/Modal';
import type { PlayerDTO } from '../../api/dto';

interface PlayerInMatch {
  id: string;
  name: string;
  side: 'A' | 'B';
}

interface EditMatchDialogProps {
  matchName: string;
  sideAPlayers: PlayerInMatch[];
  sideBPlayers: PlayerInMatch[];
  availablePlayers: PlayerDTO[];
  onSubstitute: (oldPlayerId: string, newPlayerId: string) => void;
  onRemovePlayer: (playerId: string) => void;
  onClose: () => void;
  isSubmitting?: boolean;
}

export function EditMatchDialog({
  matchName,
  sideAPlayers,
  sideBPlayers,
  availablePlayers,
  onSubstitute,
  onRemovePlayer,
  onClose,
  isSubmitting = false,
}: EditMatchDialogProps) {
  const titleId = useId();
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerInMatch | null>(null);
  const [mode, setMode] = useState<'replace' | 'remove' | null>(null);
  const [substituteId, setSubstituteId] = useState<string>('');

  // Filter out players already in this match
  const currentPlayerIds = new Set([
    ...sideAPlayers.map(p => p.id),
    ...sideBPlayers.map(p => p.id),
  ]);
  const availableForSub = availablePlayers.filter(
    p => !currentPlayerIds.has(p.id) && p.status !== 'withdrawn'
  );

  const handleReplace = () => {
    if (selectedPlayer && substituteId) {
      onSubstitute(selectedPlayer.id, substituteId);
      resetSelection();
    }
  };

  const handleRemove = () => {
    if (selectedPlayer) {
      onRemovePlayer(selectedPlayer.id);
      resetSelection();
    }
  };

  const resetSelection = () => {
    setSelectedPlayer(null);
    setMode(null);
    setSubstituteId('');
  };

  const renderPlayerRow = (player: PlayerInMatch) => {
    const isSelected = selectedPlayer?.id === player.id;

    return (
      <div key={player.id} className="mb-2">
        <div className="flex items-center justify-between p-2 bg-muted/40 rounded border border-border">
          <span className="text-sm text-foreground">{player.name}</span>
          <div className="flex gap-1">
            <button
              onClick={() => {
                setSelectedPlayer(player);
                setMode('replace');
              }}
              disabled={isSubmitting}
              className={`px-2 py-1 text-[10px] rounded ${
                isSelected && mode === 'replace'
                  ? 'bg-blue-600 text-white'
                  : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              Replace
            </button>
            <button
              onClick={() => {
                setSelectedPlayer(player);
                setMode('remove');
              }}
              disabled={isSubmitting}
              className={`px-2 py-1 text-[10px] rounded ${
                isSelected && mode === 'remove'
                  ? 'bg-red-600 text-white'
                  : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              Remove
            </button>
          </div>
        </div>

        {/* Replace UI */}
        {isSelected && mode === 'replace' && (
          <div className="mt-2 p-2 bg-blue-50 rounded border border-blue-200">
            <div className="text-[10px] text-blue-700 mb-1 font-medium">Replace with:</div>
            <select
              value={substituteId}
              onChange={(e) => setSubstituteId(e.target.value)}
              className="w-full px-2 py-1 text-sm border border-blue-300 rounded mb-2"
            >
              <option value="">Select player...</option>
              {availableForSub.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <div className="flex gap-1">
              <button
                onClick={handleReplace}
                disabled={!substituteId || isSubmitting}
                className="flex-1 px-2 py-1 text-[10px] bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                Confirm
              </button>
              <button
                onClick={resetSelection}
                className="px-2 py-1 text-[10px] bg-muted text-muted-foreground rounded hover:bg-accent hover:text-accent-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Remove UI - simple confirmation */}
        {isSelected && mode === 'remove' && (
          <div className="mt-2 p-2 bg-red-50 rounded border border-red-200">
            <div className="text-[10px] text-red-700 mb-2">Remove {player.name} from this match?</div>
            <div className="flex gap-1">
              <button
                onClick={handleRemove}
                disabled={isSubmitting}
                className="flex-1 px-2 py-1 text-[10px] bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
              >
                Confirm
              </button>
              <button
                onClick={resetSelection}
                className="px-2 py-1 text-[10px] bg-muted text-muted-foreground rounded hover:bg-accent hover:text-accent-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <Modal
      onClose={onClose}
      titleId={titleId}
      locked={isSubmitting}
      panelClassName="w-96 max-w-[90vw] max-h-[90vh] overflow-auto rounded-lg bg-card p-4 shadow-xl focus:outline-none"
    >
      <div className="flex justify-between items-center mb-3">
        <h3 id={titleId} className="text-sm font-semibold text-foreground">Edit {matchName}</h3>
        <button
          onClick={onClose}
          aria-label="Close edit dialog"
          className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-muted-foreground"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>

        {/* Side A */}
        <div className="mb-4">
          <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Side A
          </div>
          {sideAPlayers.map(renderPlayerRow)}
        </div>

        {/* Side B */}
        <div className="mb-4">
          <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Side B
          </div>
          {sideBPlayers.map(renderPlayerRow)}
        </div>

      {/* Close button */}
      <button
        onClick={onClose}
        className="w-full px-3 py-1.5 text-sm text-foreground bg-muted rounded hover:bg-muted"
      >
        Done
      </button>
    </Modal>
  );
}
