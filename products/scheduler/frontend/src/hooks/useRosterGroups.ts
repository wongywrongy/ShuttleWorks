/**
 * Roster groups hook - uses Zustand store (no API calls)
 */
import { useAppStore } from '../store/appStore';
import type { RosterGroupDTO } from '../api/dto';

export function useRosterGroups() {
  const groups = useAppStore((state) => state.groups);
  const addGroup = useAppStore((state) => state.addGroup);
  const updateGroupStore = useAppStore((state) => state.updateGroup);
  const deleteGroupStore = useAppStore((state) => state.deleteGroup);

  const createGroup = async (group: RosterGroupDTO): Promise<RosterGroupDTO> => {
    addGroup(group);
    return group;
  };

  const updateGroup = async (groupId: string, updates: Partial<RosterGroupDTO>): Promise<RosterGroupDTO> => {
    updateGroupStore(groupId, updates);
    const updated = groups.find(g => g.id === groupId);
    return updated!;
  };

  const deleteGroup = async (groupId: string): Promise<void> => {
    deleteGroupStore(groupId);
  };

  return {
    groups,
    loading: false,
    error: null,
    createGroup,
    updateGroup,
    deleteGroup,
    refresh: () => {}, // No-op for local state
  };
}
