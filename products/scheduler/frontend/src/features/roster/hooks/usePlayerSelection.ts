import { useState, useCallback } from 'react';

/**
 * usePlayerSelection Hook
 *
 * Manages multi-select state for player list.
 *
 * Features:
 * - Select/deselect individual players
 * - Select all / clear all
 * - Check if player is selected
 * - Get selected IDs as array
 */
export function usePlayerSelection() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const selectPlayer = useCallback((id: string) => {
    setSelectedIds(prev => new Set(prev).add(id));
  }, []);

  const deselectPlayer = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const togglePlayer = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback((playerIds: string[]) => {
    setSelectedIds(new Set(playerIds));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const isSelected = useCallback((id: string) => {
    return selectedIds.has(id);
  }, [selectedIds]);

  const getSelectedIds = useCallback(() => {
    return Array.from(selectedIds);
  }, [selectedIds]);

  const selectedCount = selectedIds.size;

  const hasSelection = selectedCount > 0;

  return {
    selectedIds,
    selectedCount,
    hasSelection,
    selectPlayer,
    deselectPlayer,
    togglePlayer,
    selectAll,
    clearSelection,
    isSelected,
    getSelectedIds,
  };
}
