interface MatchBulkActionsToolbarProps {
  selectedCount: number;
  onBulkDelete: () => void;
  onClearSelection: () => void;
}

/**
 * MatchBulkActionsToolbar Component
 *
 * Sticky bottom toolbar for bulk match operations.
 * Shows when matches are selected.
 */
export function MatchBulkActionsToolbar({
  selectedCount,
  onBulkDelete,
  onClearSelection,
}: MatchBulkActionsToolbarProps) {
  if (selectedCount === 0) return null;

  const handleDelete = () => {
    if (confirm(`Delete ${selectedCount} match${selectedCount !== 1 ? 'es' : ''}? This action cannot be undone.`)) {
      onBulkDelete();
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-modal bg-card border-t-2 border-primary shadow-lg animate-slide-up">
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          {/* Selection Count */}
          <div className="flex items-center gap-2">
            <svg
              className="w-5 h-5 text-blue-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span className="font-semibold text-foreground">
              {selectedCount} match{selectedCount !== 1 ? 'es' : ''} selected
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 flex-1 justify-end flex-wrap">
            {/* Delete Button */}
            <button
              onClick={handleDelete}
              className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
              Delete
            </button>

            {/* Clear Selection */}
            <button
              onClick={onClearSelection}
              className="inline-flex items-center gap-2 px-4 py-2 bg-muted text-foreground text-sm font-medium rounded-md hover:bg-muted/40 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              Clear Selection
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
