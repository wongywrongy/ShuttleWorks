import { Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { useBulkOperations } from '../hooks/useBulkOperations';

interface BulkSchoolAssignDialogProps {
  isOpen: boolean;
  selectedPlayerIds: string[];
  targetSchoolId: string;
  targetSchoolName: string;
  onClose: () => void;
  onConfirm: (clearConflictingRanks: boolean) => void;
}

/**
 * BulkSchoolAssignDialog Component
 *
 * Modal for confirming bulk school assignment with conflict resolution.
 *
 * Shows:
 * - Number of players to be assigned
 * - Any rank conflicts that will occur
 * - Options to resolve conflicts
 */
export function BulkSchoolAssignDialog({
  isOpen,
  selectedPlayerIds,
  targetSchoolId,
  targetSchoolName,
  onClose,
  onConfirm,
}: BulkSchoolAssignDialogProps) {
  const { validateBulkSchoolAssignment } = useBulkOperations();

  const conflicts = validateBulkSchoolAssignment(selectedPlayerIds, targetSchoolId);
  const hasConflicts = conflicts.length > 0;

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-25" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded bg-white p-4 text-left align-middle shadow transition-all">
                <Dialog.Title
                  as="h3"
                  className="text-lg font-medium leading-6 text-foreground"
                >
                  Assign to {targetSchoolName}
                </Dialog.Title>
                <div className="mt-2">
                  <p className="text-sm text-muted-foreground">
                    You are about to assign {selectedPlayerIds.length} player{selectedPlayerIds.length !== 1 ? 's' : ''} to <strong>{targetSchoolName}</strong>.
                  </p>

                  {hasConflicts && (
                    <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-sm">
                      <h4 className="text-sm font-semibold text-yellow-900 mb-2 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-yellow-500" />
                        Rank Conflicts Detected
                      </h4>
                      <p className="text-sm text-yellow-800 mb-3">
                        {conflicts.length} player{conflicts.length !== 1 ? 's have' : ' has'} ranks already assigned in {targetSchoolName}:
                      </p>
                      <div className="max-h-32 overflow-y-auto space-y-2">
                        {conflicts.map(conflict => (
                          <div key={conflict.playerId} className="text-xs text-yellow-700">
                            <strong>{conflict.playerName}:</strong> {conflict.conflictingRanks.join(', ')}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-4 flex gap-2 justify-end">
                  <button
                    type="button"
                    className="inline-flex justify-center rounded-sm border border-border bg-white px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    onClick={onClose}
                  >
                    Cancel
                  </button>

                  {hasConflicts && (
                    <button
                      type="button"
                      className="inline-flex justify-center rounded-sm border border-transparent bg-yellow-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                      onClick={() => {
                        onConfirm(true);
                        onClose();
                      }}
                    >
                      Assign & Clear Ranks
                    </button>
                  )}

                  <button
                    type="button"
                    className="inline-flex justify-center rounded-sm border border-transparent bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    onClick={() => {
                      onConfirm(false);
                      onClose();
                    }}
                  >
                    {hasConflicts ? 'Skip Conflicts' : 'Confirm'}
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
