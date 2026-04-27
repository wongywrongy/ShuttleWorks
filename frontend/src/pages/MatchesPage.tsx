import { useState } from 'react';
import { useMatches } from '../hooks/useMatches';
import { useLockGuard } from '../hooks/useLockGuard';
import { MatchesList } from '../features/matches/MatchesList';
import { MatchForm } from '../features/matches/MatchForm';
import { VisualMatchGenerator } from '../features/matches/VisualMatchGenerator';
import { MatchBulkActionsToolbar } from '../features/matches/MatchBulkActionsToolbar';
import { ScheduleLockIndicator } from '../components/status/ScheduleLockIndicator';
import type { MatchDTO } from '../api/dto';

export function MatchesPage() {
  const { matches, loading, error, createMatch, updateMatch, deleteMatch } = useMatches();
  const { isLocked, confirmUnlock } = useLockGuard();
  const [showForm, setShowForm] = useState(false);
  const [showVisualGenerator, setShowVisualGenerator] = useState(false);
  const [matchType, setMatchType] = useState<'dual' | 'tri'>('dual');
  const [editingMatch, setEditingMatch] = useState<MatchDTO | null>(null);
  const [selectedMatchIds, setSelectedMatchIds] = useState<string[]>([]);

  const handleEdit = (match: MatchDTO) => {
    setEditingMatch(match);
    setShowForm(true);
  };

  const handleSave = async (match: MatchDTO) => {
    if (!confirmUnlock()) return;
    try {
      if (editingMatch) {
        await updateMatch(match.id, match);
      } else {
        await createMatch(match);
      }
      setShowForm(false);
      setEditingMatch(null);
    } catch (err) {
      // Error handled by hook
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingMatch(null);
  };

  const handleDelete = async (matchId: string) => {
    if (!confirmUnlock()) return;
    if (window.confirm('Are you sure you want to delete this match?')) {
      await deleteMatch(matchId);
    }
  };

  const handleAddMatch = () => {
    setEditingMatch(null);
    setShowForm(true);
  };

  const handleSaveGeneratedMatches = async (generatedMatches: MatchDTO[]) => {
    if (!confirmUnlock()) return;
    try {
      for (const match of generatedMatches) {
        await createMatch(match);
      }
      setShowVisualGenerator(false);
    } catch (err) {
      // Error handled by hook
    }
  };

  const handleBulkDelete = async () => {
    if (!confirmUnlock()) return;
    const count = selectedMatchIds.length;
    if (window.confirm(`Are you sure you want to delete ${count} match${count !== 1 ? 'es' : ''}?`)) {
      try {
        for (const matchId of selectedMatchIds) {
          await deleteMatch(matchId);
        }
        setSelectedMatchIds([]);
      } catch (err) {
        // Error handled by hook
      }
    }
  };

  const handleClearSelection = () => {
    setSelectedMatchIds([]);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-3">
      {/* Lock indicator */}
      {isLocked && (
        <ScheduleLockIndicator showUnlockHint className="mb-2" />
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">
          {error}
        </div>
      )}

      {showVisualGenerator && (
        <div className="mb-3">
          <VisualMatchGenerator
            matchType={matchType}
            onSaveMatches={handleSaveGeneratedMatches}
            onCancel={() => setShowVisualGenerator(false)}
          />
        </div>
      )}

      {showForm && !showVisualGenerator && (
        <div className="mb-3">
          <MatchForm
            match={editingMatch || undefined}
            onSave={handleSave}
            onCancel={handleCancel}
          />
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48 bg-card rounded border border-border">
          <div className="text-muted-foreground text-sm">Loading matches...</div>
        </div>
      ) : (
        <MatchesList
          matches={matches}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onSelectionChange={setSelectedMatchIds}
          onAddMatch={handleAddMatch}
          onVisualGeneratorDual={() => {
            setMatchType('dual');
            setShowVisualGenerator(true);
          }}
          onVisualGeneratorTri={() => {
            setMatchType('tri');
            setShowVisualGenerator(true);
          }}
        />
      )}

      <MatchBulkActionsToolbar
        selectedCount={selectedMatchIds.length}
        onBulkDelete={handleBulkDelete}
        onClearSelection={handleClearSelection}
      />
    </div>
  );
}
