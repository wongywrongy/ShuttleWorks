/**
 * Court Selection Dialog
 * Shown when starting a match to confirm/change the court
 */
import { useId, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Modal } from '../../components/common/Modal';
import { INTERACTIVE_BASE } from '../../lib/utils';

interface CourtSelectDialogProps {
  matchName: string;
  scheduledCourt: number;
  courtCount: number;
  occupiedCourts: number[]; // Courts with in-progress matches
  onConfirm: (courtId: number) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function CourtSelectDialog({
  matchName,
  scheduledCourt,
  courtCount,
  occupiedCourts,
  onConfirm,
  onCancel,
  isSubmitting = false,
}: CourtSelectDialogProps) {
  const titleId = useId();
  const [selectedCourt, setSelectedCourt] = useState(scheduledCourt);

  const isOccupied = occupiedCourts.includes(selectedCourt);
  const courts = Array.from({ length: courtCount }, (_, i) => i + 1);

  return (
    <Modal
      onClose={onCancel}
      titleId={titleId}
      locked={isSubmitting}
      panelClassName="w-64 rounded-lg bg-white shadow-xl focus:outline-none"
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-200">
        <h3 id={titleId} className="text-sm font-semibold text-gray-900">Start {matchName}</h3>
      </div>

        {/* Court Selection */}
        <div className="p-3">
          <div className="text-xs text-gray-500 mb-2">Select court:</div>

          <div className="grid grid-cols-4 gap-1 mb-3">
            {courts.map((court) => {
              const isSelected = selectedCourt === court;
              const courtOccupied = occupiedCourts.includes(court);

              return (
                <button
                  key={court}
                  onClick={() => setSelectedCourt(court)}
                  className={`px-2 py-1.5 text-sm font-medium rounded border transition-colors ${
                    isSelected
                      ? 'bg-green-600 text-white border-green-600'
                      : courtOccupied
                        ? 'bg-yellow-50 text-yellow-700 border-yellow-300 hover:bg-yellow-100'
                        : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  {court}
                </button>
              );
            })}
          </div>

          {/* Warning if occupied */}
          {isOccupied && (
            <div className="px-2 py-1.5 bg-yellow-50 border border-yellow-200 rounded text-[10px] text-yellow-700 mb-3">
              Court {selectedCourt} has a match in progress
            </div>
          )}

          {/* Different from scheduled */}
          {selectedCourt !== scheduledCourt && (
            <div className="text-[10px] text-gray-500 mb-3">
              Originally scheduled: Court {scheduledCourt}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              disabled={isSubmitting}
              className={`${INTERACTIVE_BASE} flex-1 rounded bg-gray-100 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-200`}
            >
              Cancel
            </button>
            <button
              onClick={() => onConfirm(selectedCourt)}
              disabled={isSubmitting}
              aria-busy={isSubmitting}
              className={`${INTERACTIVE_BASE} inline-flex flex-1 items-center justify-center gap-1.5 rounded bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700`}
            >
              {isSubmitting && <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />}
              {isSubmitting ? 'Starting…' : 'Start'}
            </button>
          </div>
        </div>
    </Modal>
  );
}
