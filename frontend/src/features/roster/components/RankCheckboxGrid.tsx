interface RankOption {
  value: string;
  disabled: boolean;
  assignedTo?: string;
}

interface RankCategory {
  label: string;
  ranks: RankOption[];
}

interface RankCheckboxGridProps {
  selectedRanks: string[];
  availableRanks: Record<string, RankCategory>;
  onToggleRank: (rank: string) => void;
  onSelectAllInCategory: (categoryKey: string) => void;
  onReassignRank?: (rank: string, currentHolder: string) => void;
  showSelected?: boolean;
  defaultExpanded?: boolean;
}

/**
 * RankCheckboxGrid Component
 *
 * Compact rank selection grid.
 * Shows all ranks at once for faster selection.
 */
export function RankCheckboxGrid({
  selectedRanks,
  availableRanks,
  onToggleRank,
  onReassignRank,
  showSelected = true,
}: RankCheckboxGridProps) {
  if (Object.keys(availableRanks).length === 0) {
    return (
      <div className="p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800">
        All ranks for this school are already assigned.
      </div>
    );
  }

  const categoryOrder = ['MS', 'WS', 'MD', 'WD', 'XD'];
  const sortedCategories = Object.entries(availableRanks).sort(([a], [b]) => {
    return categoryOrder.indexOf(a) - categoryOrder.indexOf(b);
  });

  return (
    <div className="space-y-3">
      {/* Compact Grid - All categories visible */}
      <div className="grid grid-cols-5 gap-2">
        {sortedCategories.map(([categoryKey, category]) => {
          return (
            <div key={categoryKey} className="space-y-1">
              {/* Category Header */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-foreground">{categoryKey}</span>
              </div>

              {/* Rank buttons */}
              <div className="space-y-0.5">
                {category.ranks.map((rank) => {
                  const isSelected = selectedRanks.includes(rank.value);
                  const rankNum = rank.value.replace(/\D/g, '');
                  const isTaken = rank.disabled && rank.assignedTo;

                  const handleClick = () => {
                    if (isSelected) {
                      // Deselecting - always allow
                      onToggleRank(rank.value);
                    } else if (isTaken && onReassignRank) {
                      // Taken by someone else - ask for confirmation
                      onReassignRank(rank.value, rank.assignedTo!);
                    } else if (!rank.disabled) {
                      // Available - just select
                      onToggleRank(rank.value);
                    }
                  };

                  return (
                    <button
                      key={rank.value}
                      type="button"
                      onClick={handleClick}
                      className={`w-full px-2 py-1 text-xs text-left rounded border transition-colors ${
                        isSelected
                          ? 'bg-blue-600 text-white border-blue-600'
                          : isTaken
                          ? 'bg-amber-50 text-amber-700 border-amber-200 hover:border-amber-400'
                          : 'bg-card text-foreground border-border hover:border-blue-400'
                      }`}
                      title={rank.assignedTo ? `Assigned to ${rank.assignedTo}` : undefined}
                    >
                      {rankNum}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Selection Summary */}
      {showSelected && selectedRanks.length > 0 && (
        <div className="pt-2 border-t border-border">
          <div className="text-xs text-muted-foreground">
            <span className="font-medium">{selectedRanks.length}</span> selected: {selectedRanks.sort().join(', ')}
          </div>
        </div>
      )}
    </div>
  );
}
