import { Fragment, useState, useEffect } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { RankCheckboxGrid } from './RankCheckboxGrid';
import { useRankValidation } from '../hooks/useRankValidation';

interface RankBadgeEditorProps {
  currentRanks: string[];
  schoolId: string | null;
  playerId: string;
  onRanksChange: (ranks: string[]) => void;
  onRemoveRankFromPlayer?: (playerId: string, rank: string) => void;
  className?: string;
}

/**
 * RankBadgeEditor Component
 *
 * Inline popover editor for rank assignment.
 * Click the rank badges to open a popover with rank selection grid.
 *
 * Features:
 * - Accessible popover using Headless UI
 * - Shows current ranks as colored badges
 * - RankCheckboxGrid for selection
 * - Apply button to confirm changes
 * - Shows warning if no school assigned
 */
export function RankBadgeEditor({
  currentRanks,
  schoolId,
  playerId,
  onRanksChange,
  onRemoveRankFromPlayer,
  className = '',
}: RankBadgeEditorProps) {
  const [selectedRanks, setSelectedRanks] = useState<string[]>(currentRanks);
  const { availableRanks, getPlayersWithRank } = useRankValidation(schoolId, playerId);
  const [isOpen, setIsOpen] = useState(false);
  const [pendingReassign, setPendingReassign] = useState<{ rank: string; currentHolder: string } | null>(null);
  const [reassignedRanks, setReassignedRanks] = useState<Map<string, string[]>>(new Map());

  // Sync selectedRanks when currentRanks prop changes
  useEffect(() => {
    setSelectedRanks(currentRanks);
  }, [currentRanks]);

  const handleToggleRank = (rank: string) => {
    setSelectedRanks((prev) =>
      prev.includes(rank)
        ? prev.filter((r) => r !== rank)
        : [...prev, rank]
    );
  };

  const handleSelectAllInCategory = (categoryKey: string) => {
    const categoryRanks = availableRanks[categoryKey]?.ranks
      .filter(r => !r.disabled)
      .map(r => r.value) || [];
    const allSelected = categoryRanks.every(rank => selectedRanks.includes(rank));

    if (allSelected) {
      // Deselect all in category
      setSelectedRanks(prev => prev.filter(rank => !categoryRanks.includes(rank)));
    } else {
      // Select all in category
      setSelectedRanks(prev => [...new Set([...prev, ...categoryRanks])]);
    }
  };

  const handleReassignRank = (rank: string, currentHolder: string) => {
    setPendingReassign({ rank, currentHolder });
  };

  const confirmReassign = () => {
    if (pendingReassign) {
      setSelectedRanks(prev => [...prev, pendingReassign.rank]);
      // Track which player(s) had this rank so we can remove it on Apply
      const playersWithRank = getPlayersWithRank(pendingReassign.rank);
      if (playersWithRank.length > 0) {
        setReassignedRanks(prev => {
          const next = new Map(prev);
          next.set(pendingReassign.rank, playersWithRank.map(p => p.id));
          return next;
        });
      }
      setPendingReassign(null);
    }
  };

  const cancelReassign = () => {
    setPendingReassign(null);
  };

  const handleApply = () => {
    // First, remove reassigned ranks from original holders
    if (onRemoveRankFromPlayer) {
      reassignedRanks.forEach((playerIds, rank) => {
        playerIds.forEach(pid => {
          onRemoveRankFromPlayer(pid, rank);
        });
      });
    }
    // Then update current player's ranks
    onRanksChange(selectedRanks);
    setReassignedRanks(new Map());
    setIsOpen(false);
  };

  if (!schoolId) {
    return (
      <span className={`text-xs text-muted-foreground italic ${className}`}>
        Assign school first
      </span>
    );
  }

  return (
    <>
      <button
        onClick={() => {
          setReassignedRanks(new Map());
          setIsOpen(true);
        }}
        className={`text-xs focus:outline-none cursor-pointer ${
          currentRanks.length > 0
            ? 'text-foreground hover:text-foreground'
            : 'text-muted-foreground hover:text-muted-foreground'
        }`}
      >
        {currentRanks.length > 0 ? currentRanks.sort().join(', ') : '+ Events'}
      </button>

      <Transition appear show={isOpen} as={Fragment}>
        <Dialog as="div" className="relative z-modal" onClose={() => setIsOpen(false)}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-foreground/30 backdrop-blur-sm" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-lg bg-card p-6 shadow-xl transition-all">
                  <Dialog.Title as="h3" className="text-lg font-semibold text-foreground mb-4">
                    Select Ranks/Events
                  </Dialog.Title>

                  {Object.keys(availableRanks).length === 0 ? (
                    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
                      All ranks for this school are already assigned to other players.
                    </div>
                  ) : (
                    <div className="max-h-96 overflow-y-auto">
                      <RankCheckboxGrid
                        selectedRanks={selectedRanks}
                        availableRanks={availableRanks}
                        onToggleRank={handleToggleRank}
                        onSelectAllInCategory={handleSelectAllInCategory}
                        onReassignRank={handleReassignRank}
                        showSelected={false}
                      />
                    </div>
                  )}

                  {/* Reassignment Confirmation */}
                  {pendingReassign && (
                    <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
                      <p className="text-sm text-amber-800 mb-3">
                        <strong>{pendingReassign.rank}</strong> is currently assigned to <strong>{pendingReassign.currentHolder}</strong>.
                        Reassign to this player?
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={confirmReassign}
                          className="px-3 py-1.5 text-sm bg-amber-600 text-white rounded hover:bg-amber-700"
                        >
                          Yes, reassign
                        </button>
                        <button
                          type="button"
                          onClick={cancelReassign}
                          className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="mt-6 flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">
                      {selectedRanks.length} rank{selectedRanks.length !== 1 ? 's' : ''} selected
                    </span>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setIsOpen(false)}
                        className="px-4 py-2 text-sm text-foreground bg-muted hover:bg-muted/40 hover:text-foreground rounded-md"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleApply}
                        className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </>
  );
}
