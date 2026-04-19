/**
 * Match Score Dialog Component
 * Simple, compact score entry dialog (used when scoringFormat is 'simple').
 */
import { useEffect, useId, useRef, useState } from 'react';
import { Modal } from '../../components/common/Modal';

interface MatchScoreDialogProps {
  matchName: string;
  sideAName: string;
  sideBName: string;
  onSubmit: (score: { sideA: number; sideB: number }, notes: string) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function MatchScoreDialog({
  matchName,
  sideAName,
  sideBName,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: MatchScoreDialogProps) {
  const titleId = useId();
  const [scoreA, setScoreA] = useState<string>('');
  const [scoreB, setScoreB] = useState<string>('');
  const inputARef = useRef<HTMLInputElement>(null);
  const inputBRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputARef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const sideAScore = parseInt(scoreA) || 0;
    const sideBScore = parseInt(scoreB) || 0;
    onSubmit({ sideA: sideAScore, sideB: sideBScore }, '');
  };

  const handleScoreAChange = (value: string) => {
    setScoreA(value);
    if (value.length >= 2) {
      inputBRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, field: 'A' | 'B') => {
    if (e.key === 'Enter' && field === 'A' && scoreA) {
      e.preventDefault();
      inputBRef.current?.focus();
    }
    // Escape close is handled by Modal.
  };

  const canSubmit = scoreA !== '' && scoreB !== '';

  return (
    <Modal
      onClose={onCancel}
      titleId={titleId}
      locked={isSubmitting}
      panelClassName="w-72 rounded-lg bg-white shadow-xl focus:outline-none"
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-200">
        <h3 id={titleId} className="text-sm font-semibold text-gray-900">{matchName}</h3>
      </div>

      {/* Score Entry */}
      <form onSubmit={handleSubmit} className="p-3">
        {/* Player names */}
        <div className="flex justify-between text-[10px] text-gray-500 mb-1 px-1">
          <span className="truncate max-w-[45%]">{sideAName}</span>
          <span className="truncate max-w-[45%] text-right">{sideBName}</span>
        </div>

        {/* Score inputs side by side */}
        <div className="flex items-center gap-2 mb-3">
          <input
            ref={inputARef}
            type="number"
            value={scoreA}
            onChange={(e) => handleScoreAChange(e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, 'A')}
            className="flex-1 px-2 py-2 text-center text-lg font-semibold border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="0"
            min="0"
            aria-label={`Score for ${sideAName || 'side A'}`}
          />
          <span className="text-gray-400 text-lg font-medium" aria-hidden="true">–</span>
          <input
            ref={inputBRef}
            type="number"
            value={scoreB}
            onChange={(e) => setScoreB(e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, 'B')}
            className="flex-1 px-2 py-2 text-center text-lg font-semibold border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="0"
            min="0"
            aria-label={`Score for ${sideBName || 'side B'}`}
          />
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="flex-1 px-3 py-1.5 text-sm text-gray-600 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting || !canSubmit}
            className="flex-1 px-3 py-1.5 text-sm text-white bg-blue-600 rounded hover:bg-blue-700 disabled:bg-gray-300 font-medium"
          >
            {isSubmitting ? 'Saving…' : 'Done'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
