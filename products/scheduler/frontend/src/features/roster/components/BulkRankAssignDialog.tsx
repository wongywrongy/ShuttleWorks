import { Fragment, useState } from 'react';
import { Dialog, Transition, RadioGroup } from '@headlessui/react';
import { RankCheckboxGrid } from './RankCheckboxGrid';
import { useRankValidation } from '../hooks/useRankValidation';
import { useAppStore } from '../../../store/appStore';

interface BulkRankAssignDialogProps {
  isOpen: boolean;
  selectedPlayerIds: string[];
  onClose: () => void;
  onConfirm: (ranks: string[], mode: 'add' | 'set' | 'remove') => void;
}

const MODES = [
  { value: 'add', label: 'Add Ranks', description: 'Add these ranks to existing ranks' },
  { value: 'set', label: 'Set Ranks', description: 'Replace existing ranks with these' },
  { value: 'remove', label: 'Remove Ranks', description: 'Remove these ranks from players' },
] as const;

/**
 * BulkRankAssignDialog Component
 *
 * Modal for bulk rank assignment with mode selection.
 *
 * Features:
 * - Mode selection (Add/Set/Remove)
 * - Rank selection grid
 * - Handles mixed schools (shows all ranks, validates per-player)
 */
export function BulkRankAssignDialog({
  isOpen,
  selectedPlayerIds,
  onClose,
  onConfirm,
}: BulkRankAssignDialogProps) {
  const players = useAppStore((s) => s.players);
  const config = useAppStore((s) => s.config);
  const [selectedRanks, setSelectedRanks] = useState<string[]>([]);
  const [mode, setMode] = useState<'add' | 'set' | 'remove'>('add');

  // Check if all selected players are from the same school
  const selectedPlayers = players.filter(p => selectedPlayerIds.includes(p.id));
  const schools = new Set(selectedPlayers.map(p => p.groupId).filter(Boolean));
  const singleSchool = schools.size === 1 ? Array.from(schools)[0] : null;

  // For mixed schools, we'll show all ranks but validate per-player
  // For single school, use the useRankValidation hook
  const { availableRanks } = useRankValidation(singleSchool, '');

  // Build rank options for all ranks (for mixed schools)
  const getAllRankOptions = () => {
    if (singleSchool) return availableRanks;

    const rankCounts = config?.rankCounts || {};
    const groups: Record<string, any> = {};

    const rankLabels: Record<string, string> = {
      MS: "Men's Singles",
      WS: "Women's Singles",
      MD: "Men's Doubles",
      WD: "Women's Doubles",
      XD: "Mixed Doubles",
    };

    Object.entries(rankCounts).forEach(([rankKey, count]) => {
      const ranks = [];
      for (let i = 1; i <= count; i++) {
        ranks.push({
          value: `${rankKey}${i}`,
          disabled: false,
        });
      }
      if (ranks.length > 0) {
        groups[rankKey] = {
          label: rankLabels[rankKey],
          ranks,
        };
      }
    });

    return groups;
  };

  const rankOptions = getAllRankOptions();

  const handleToggleRank = (rank: string) => {
    setSelectedRanks(prev =>
      prev.includes(rank) ? prev.filter(r => r !== rank) : [...prev, rank]
    );
  };

  const handleSelectAllInCategory = (categoryKey: string) => {
    const categoryRanks = rankOptions[categoryKey]?.ranks.map((r: any) => r.value) || [];
    const allSelected = categoryRanks.every((rank: string) => selectedRanks.includes(rank));

    if (allSelected) {
      setSelectedRanks(prev => prev.filter(rank => !categoryRanks.includes(rank)));
    } else {
      setSelectedRanks(prev => [...new Set([...prev, ...categoryRanks])]);
    }
  };

  const handleConfirm = () => {
    if (selectedRanks.length === 0 && mode !== 'remove') {
      alert('Please select at least one rank');
      return;
    }
    onConfirm(selectedRanks, mode);
    setSelectedRanks([]);
    onClose();
  };

  const playersWithoutSchool = selectedPlayers.filter(p => !p.groupId);

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-modal" onClose={onClose}>
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
              <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded bg-card p-4 text-left align-middle shadow transition-all">
                <Dialog.Title
                  as="h3"
                  className="text-lg font-medium leading-6 text-foreground"
                >
                  Assign Ranks to {selectedPlayerIds.length} Player{selectedPlayerIds.length !== 1 ? 's' : ''}
                </Dialog.Title>

                <div className="mt-3">
                  {/* Mode Selection */}
                  <RadioGroup value={mode} onChange={setMode}>
                    <RadioGroup.Label className="text-sm font-medium text-foreground">
                      Mode:
                    </RadioGroup.Label>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      {MODES.map((m) => (
                        <RadioGroup.Option
                          key={m.value}
                          value={m.value}
                          className={({ active, checked }) =>
                            `${active ? 'ring-2 ring-blue-500 ring-offset-2' : ''}
                            ${checked ? 'bg-blue-600 text-white' : 'bg-card text-foreground'}
                            relative flex cursor-pointer rounded-sm border border-border px-2 py-1.5 shadow-sm focus:outline-none`
                          }
                        >
                          {({ checked }) => (
                            <div className="flex w-full items-center justify-between">
                              <div className="flex items-center">
                                <div className="text-sm">
                                  <RadioGroup.Label
                                    as="p"
                                    className={`font-medium ${checked ? 'text-white' : 'text-foreground'}`}
                                  >
                                    {m.label}
                                  </RadioGroup.Label>
                                  <RadioGroup.Description
                                    as="span"
                                    className={`inline text-xs ${checked ? 'text-blue-100' : 'text-muted-foreground'}`}
                                  >
                                    {m.description}
                                  </RadioGroup.Description>
                                </div>
                              </div>
                            </div>
                          )}
                        </RadioGroup.Option>
                      ))}
                    </div>
                  </RadioGroup>

                  {/* Warnings */}
                  {playersWithoutSchool.length > 0 && (
                    <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded-sm text-sm text-yellow-800 flex items-start gap-2">
                      <span className="w-2 h-2 rounded-full bg-yellow-500 mt-1 flex-shrink-0" />
                      {playersWithoutSchool.length} player{playersWithoutSchool.length !== 1 ? 's have' : ' has'} no school and will be skipped.
                    </div>
                  )}

                  {!singleSchool && schools.size > 1 && (
                    <div className="mt-3 p-2 bg-blue-50 border border-blue-200 rounded-sm text-sm text-blue-800 flex items-start gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-500 mt-1 flex-shrink-0" />
                      Selected players are from {schools.size} different schools. Conflicts will be checked per-school.
                    </div>
                  )}

                  {/* Rank Selection */}
                  <div className="mt-3">
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Select Ranks:
                    </label>
                    <div className="max-h-96 overflow-y-auto">
                      <RankCheckboxGrid
                        selectedRanks={selectedRanks}
                        availableRanks={rankOptions}
                        onToggleRank={handleToggleRank}
                        onSelectAllInCategory={handleSelectAllInCategory}
                        showSelected={false}
                      />
                    </div>
                    {selectedRanks.length > 0 && (
                      <p className="mt-2 text-sm text-muted-foreground">
                        {selectedRanks.length} rank{selectedRanks.length !== 1 ? 's' : ''} selected: {selectedRanks.join(', ')}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-4 flex gap-2 justify-end">
                  <button
                    type="button"
                    className="inline-flex justify-center rounded-sm border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    onClick={onClose}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="inline-flex justify-center rounded-sm border border-transparent bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
                    onClick={handleConfirm}
                  >
                    Apply
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
