import { useState } from 'react';
import { useRoster } from '../hooks/useRoster';
import { useRosterGroups } from '../hooks/useRosterGroups';
import { useLockGuard } from '../hooks/useLockGuard';
import { PlayerFormDialog } from '../features/roster/components/PlayerFormDialog';
import { SchoolFormDialog } from '../features/roster/components/SchoolFormDialog';
import { RankCoverageDashboard } from '../features/roster/RankCoverageDashboard';
import { PlayerListView } from '../features/roster/components/PlayerListView';
import { BulkActionsToolbar } from '../features/roster/components/BulkActionsToolbar';
import { BulkSchoolAssignDialog } from '../features/roster/components/BulkSchoolAssignDialog';
import { BulkRankAssignDialog } from '../features/roster/components/BulkRankAssignDialog';
import { PlayerImportDialog } from '../features/roster/components/PlayerImportDialog';
import { ScheduleLockIndicator } from '../components/status/ScheduleLockIndicator';
import { useBulkOperations } from '../features/roster/hooks/useBulkOperations';
import type { PlayerDTO, RosterGroupDTO } from '../api/dto';
import { v4 as uuidv4 } from 'uuid';

export function RosterPage() {
  const { players, loading, error, createPlayer, updatePlayer, deletePlayer } = useRoster();
  const { groups, createGroup, updateGroup, deleteGroup } = useRosterGroups();
  const { bulkAssignSchool, bulkAssignRanks, bulkDeletePlayers } = useBulkOperations();
  const { isLocked, confirmUnlock } = useLockGuard();

  const [showPlayerForm, setShowPlayerForm] = useState(false);
  const [showSchoolDialog, setShowSchoolDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<PlayerDTO | null>(null);
  const [editingSchool, setEditingSchool] = useState<RosterGroupDTO | null>(null);

  // Bulk operations state
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [showBulkSchoolDialog, setShowBulkSchoolDialog] = useState(false);
  const [showBulkRankDialog, setShowBulkRankDialog] = useState(false);
  const [pendingSchoolId, setPendingSchoolId] = useState<string | null>(null);

  const handlePlayerClick = (player: PlayerDTO) => {
    setEditingPlayer(player);
    setShowPlayerForm(true);
  };

  const handlePlayerSave = async (player: PlayerDTO) => {
    if (!confirmUnlock()) return;
    try {
      if (editingPlayer) {
        await updatePlayer(editingPlayer.id, player);
      } else {
        await createPlayer(player);
      }
      setShowPlayerForm(false);
      setEditingPlayer(null);
    } catch (err) {
      // Error handled by hook
    }
  };

  const handlePlayerCancel = () => {
    setShowPlayerForm(false);
    setEditingPlayer(null);
  };

  const handlePlayerDelete = async (playerId: string) => {
    if (!confirmUnlock()) return;
    if (confirm('Are you sure you want to delete this player?')) {
      try {
        await deletePlayer(playerId);
      } catch (err) {
        // Error handled by hook
      }
    }
  };

  const handleAddPlayer = () => {
    setEditingPlayer(null);
    setShowPlayerForm(true);
  };

  const handleAddSchool = () => {
    setEditingSchool(null);
    setShowSchoolDialog(true);
  };

  const handleEditSchool = (school: RosterGroupDTO) => {
    setEditingSchool(school);
    setShowSchoolDialog(true);
  };

  const handleSchoolSave = async (data: { name: string; color: string }) => {
    if (!confirmUnlock()) return;
    try {
      if (editingSchool) {
        await updateGroup(editingSchool.id, {
          name: data.name,
          metadata: { color: data.color },
        });
      } else {
        await createGroup({
          id: uuidv4(),
          name: data.name,
          metadata: { color: data.color },
        });
      }
      setShowSchoolDialog(false);
      setEditingSchool(null);
    } catch (err) {
      // Error handled by hook
    }
  };

  const handleSchoolDelete = async () => {
    if (!confirmUnlock()) return;
    if (editingSchool && confirm('Are you sure you want to delete this school? Players in this school will be ungrouped.')) {
      try {
        await deleteGroup(editingSchool.id);
        setShowSchoolDialog(false);
        setEditingSchool(null);
      } catch (err) {
        // Error handled by hook
      }
    }
  };

  // Bulk operation handlers
  const handleBulkSchoolAssign = (schoolId: string) => {
    setPendingSchoolId(schoolId);
    setShowBulkSchoolDialog(true);
  };

  const handleBulkSchoolConfirm = (clearConflictingRanks: boolean) => {
    if (!confirmUnlock()) return;
    if (pendingSchoolId) {
      bulkAssignSchool(selectedPlayerIds, pendingSchoolId, clearConflictingRanks);
      setSelectedPlayerIds([]);
      setPendingSchoolId(null);
    }
  };

  const handleBulkRankAssign = () => {
    setShowBulkRankDialog(true);
  };

  const handleBulkRankConfirm = (ranks: string[], mode: 'add' | 'set' | 'remove') => {
    if (!confirmUnlock()) return;
    bulkAssignRanks(selectedPlayerIds, ranks, mode, true);
    setSelectedPlayerIds([]);
  };

  const handleBulkDelete = () => {
    if (!confirmUnlock()) return;
    bulkDeletePlayers(selectedPlayerIds);
    setSelectedPlayerIds([]);
  };

  const handleImport = async (importedPlayers: PlayerDTO[], newGroups: RosterGroupDTO[]) => {
    if (!confirmUnlock()) return;
    try {
      // Create new groups first
      for (const group of newGroups) {
        await createGroup(group);
      }

      // Then create all players
      for (const player of importedPlayers) {
        await createPlayer(player);
      }

      setShowImportDialog(false);
    } catch (err) {
      // Error handled by hooks
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-3">
      {/* Lock indicator */}
      {isLocked && (
        <ScheduleLockIndicator showUnlockHint className="mb-2" />
      )}

      {/* Rank Coverage Dashboard */}
      <RankCoverageDashboard onEditSchool={handleEditSchool} />

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">
          {error}
        </div>
      )}

      <PlayerFormDialog
        isOpen={showPlayerForm}
        player={editingPlayer || undefined}
        onClose={handlePlayerCancel}
        onSave={handlePlayerSave}
      />

      <SchoolFormDialog
        isOpen={showSchoolDialog}
        school={editingSchool || undefined}
        onClose={() => {
          setShowSchoolDialog(false);
          setEditingSchool(null);
        }}
        onSave={handleSchoolSave}
        onDelete={editingSchool ? handleSchoolDelete : undefined}
      />

      {loading ? (
        <div className="flex items-center justify-center h-48 bg-white rounded border border-border">
          <div className="text-muted-foreground text-sm">Loading players...</div>
        </div>
      ) : (
        <PlayerListView
          players={players}
          schools={groups}
          onSchoolChange={(playerId, schoolId) => updatePlayer(playerId, { groupId: schoolId })}
          onRanksChange={(playerId, ranks) => updatePlayer(playerId, { ranks })}
          onRemoveRankFromPlayer={(playerId, rank) => {
            const player = players.find(p => p.id === playerId);
            if (player) {
              updatePlayer(playerId, { ranks: (player.ranks || []).filter(r => r !== rank) });
            }
          }}
          onEdit={handlePlayerClick}
          onDelete={handlePlayerDelete}
          onSelectionChange={setSelectedPlayerIds}
          onAddPlayer={handleAddPlayer}
          onAddSchool={handleAddSchool}
          onImportCSV={() => setShowImportDialog(true)}
        />
      )}

      {/* Bulk Actions Toolbar */}
      <BulkActionsToolbar
        selectedCount={selectedPlayerIds.length}
        schools={groups}
        onClearSelection={() => setSelectedPlayerIds([])}
        onBulkSchoolAssign={handleBulkSchoolAssign}
        onBulkRankAssign={handleBulkRankAssign}
        onBulkDelete={handleBulkDelete}
      />

      {/* Bulk School Assign Dialog */}
      {pendingSchoolId && (
        <BulkSchoolAssignDialog
          isOpen={showBulkSchoolDialog}
          selectedPlayerIds={selectedPlayerIds}
          targetSchoolId={pendingSchoolId}
          targetSchoolName={groups.find(g => g.id === pendingSchoolId)?.name || ''}
          onClose={() => {
            setShowBulkSchoolDialog(false);
            setPendingSchoolId(null);
          }}
          onConfirm={handleBulkSchoolConfirm}
        />
      )}

      {/* Bulk Rank Assign Dialog */}
      <BulkRankAssignDialog
        isOpen={showBulkRankDialog}
        selectedPlayerIds={selectedPlayerIds}
        onClose={() => setShowBulkRankDialog(false)}
        onConfirm={handleBulkRankConfirm}
      />

      <PlayerImportDialog
        isOpen={showImportDialog}
        onClose={() => setShowImportDialog(false)}
        onImport={handleImport}
        existingGroups={groups}
      />
    </div>
  );
}
