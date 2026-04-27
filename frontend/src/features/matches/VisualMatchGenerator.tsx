import { useState } from 'react';
import { useRoster } from '../../hooks/useRoster';
import { useRosterGroups } from '../../hooks/useRosterGroups';
import { useTournament } from '../../hooks/useTournament';
import type { PlayerDTO, MatchDTO } from '../../api/dto';
import { v4 as uuidv4 } from 'uuid';

interface VisualMatchGeneratorProps {
  onSaveMatches: (matches: MatchDTO[]) => void;
  onCancel: () => void;
  matchType?: 'dual' | 'tri';
}

export function VisualMatchGenerator({ onSaveMatches, onCancel, matchType = 'dual' }: VisualMatchGeneratorProps) {
  const { players } = useRoster();
  const { groups } = useRosterGroups();
  const { config } = useTournament();
  const [selectedSchools, setSelectedSchools] = useState<string[]>([]);
  const [previewMatches, setPreviewMatches] = useState<Array<{ rank: string; schoolA: string; schoolB: string; schoolC?: string; playersA: PlayerDTO[]; playersB: PlayerDTO[]; playersC?: PlayerDTO[] }>>([]);

  const requiredSchools = matchType === 'tri' ? 3 : 2;

  // Get all unique ranks from config
  const allRanks = (() => {
    const rankCounts = config?.rankCounts || {};
    const ranks: string[] = [];
    Object.entries(rankCounts).forEach(([rankKey, count]) => {
      for (let i = 1; i <= count; i++) {
        ranks.push(`${rankKey}${i}`);
      }
    });
    return ranks.sort();
  })();

  const handleSchoolToggle = (schoolId: string) => {
    if (selectedSchools.includes(schoolId)) {
      setSelectedSchools(selectedSchools.filter(id => id !== schoolId));
    } else {
      if (selectedSchools.length < requiredSchools) {
        setSelectedSchools([...selectedSchools, schoolId]);
      } else {
        // Replace the oldest selection
        setSelectedSchools([...selectedSchools.slice(1), schoolId]);
      }
    }
    setPreviewMatches([]);
  };

  const handlePreview = () => {
    if (selectedSchools.length !== requiredSchools) return;

    const preview: typeof previewMatches = [];

    // For each rank, find players from each school
    allRanks.forEach(rank => {
      const schoolA = selectedSchools[0];
      const schoolB = selectedSchools[1];
      const schoolC = selectedSchools[2];

      const playersA = players.filter(p => p.groupId === schoolA && p.ranks?.includes(rank));
      const playersB = players.filter(p => p.groupId === schoolB && p.ranks?.includes(rank));
      const playersC = schoolC ? players.filter(p => p.groupId === schoolC && p.ranks?.includes(rank)) : [];

      // Only create match if at least 2 schools have players for this rank
      const hasPlayers = matchType === 'tri'
        ? playersA.length > 0 && playersB.length > 0 && playersC.length > 0
        : playersA.length > 0 && playersB.length > 0;

      if (hasPlayers) {
        preview.push({
          rank,
          schoolA: groups.find(g => g.id === schoolA)?.name || 'School A',
          schoolB: groups.find(g => g.id === schoolB)?.name || 'School B',
          schoolC: schoolC ? groups.find(g => g.id === schoolC)?.name || 'School C' : undefined,
          playersA,
          playersB,
          playersC: playersC.length > 0 ? playersC : undefined,
        });
      }
    });

    setPreviewMatches(preview);
  };

  const handleGenerate = () => {
    if (previewMatches.length === 0) return;

    const matches: MatchDTO[] = previewMatches.map(match => {
      const baseMatch = {
        id: uuidv4(),
        sideA: match.playersA.map(p => p.id),
        sideB: match.playersB.map(p => p.id),
        eventRank: match.rank,
        durationSlots: 1,
        tags: [match.rank, match.schoolA, match.schoolB],
      };

      if (matchType === 'tri' && match.playersC) {
        return {
          ...baseMatch,
          sideC: match.playersC.map(p => p.id),
          matchType: 'tri' as const,
          tags: [...(baseMatch.tags || []), match.schoolC!],
        };
      }

      return {
        ...baseMatch,
        matchType: 'dual' as const,
      };
    });

    onSaveMatches(matches);
  };

  return (
    <div className="bg-card p-4 rounded shadow max-w-7xl mx-auto">
      <h3 className="text-base font-semibold mb-3">
        Visual Match Generator - {matchType === 'tri' ? 'Tri-Meet' : 'Dual Meet'}
      </h3>

      <div className="mb-4">
        <label className="block text-sm font-medium text-foreground mb-2">
          Step 1: Select {requiredSchools} Schools
        </label>
        <p className="text-xs text-muted-foreground mb-3">
          Click on schools to select them for the {matchType === 'tri' ? 'tri-meet' : 'dual meet'}. Matches will be generated for ALL ranks automatically.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {groups.map((school) => {
            const isSelected = selectedSchools.includes(school.id);
            const selectionIndex = selectedSchools.indexOf(school.id);
            const playerCount = players.filter(p => p.groupId === school.id).length;

            return (
              <button
                key={school.id}
                type="button"
                onClick={() => handleSchoolToggle(school.id)}
                className={`p-3 rounded border-2 transition-all ${
                  isSelected
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-border bg-card hover:border-blue-400'
                }`}
              >
                <div className="font-medium text-foreground">{school.name}</div>
                <div className="text-xs text-muted-foreground mt-1">{playerCount} players</div>
                {isSelected && (
                  <div className="mt-2 inline-block px-2 py-0.5 bg-blue-600 text-white text-xs rounded">
                    {matchType === 'tri'
                      ? `School ${String.fromCharCode(65 + selectionIndex)}`
                      : `School ${selectionIndex + 1}`}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {selectedSchools.length === requiredSchools && (
        <div className="mb-4">
          <button
            onClick={handlePreview}
            className="w-full px-3 py-2 bg-green-600 text-white rounded-sm hover:bg-green-700 font-medium text-sm"
          >
            Step 2: Preview Matches for All Ranks
          </button>
        </div>
      )}

      {previewMatches.length > 0 && (
        <div className="mb-4">
          <h4 className="font-semibold text-foreground mb-2 text-sm">
            Preview: {previewMatches.length} Matches to be Created
          </h4>
          <div className="border border-border rounded-sm overflow-hidden">
            <div className="max-h-64 overflow-y-auto">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-muted/40 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Rank</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">
                      {groups.find(g => g.id === selectedSchools[0])?.name || 'School A'}
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">
                      {groups.find(g => g.id === selectedSchools[1])?.name || 'School B'}
                    </th>
                    {matchType === 'tri' && (
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">
                        {groups.find(g => g.id === selectedSchools[2])?.name || 'School C'}
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-card divide-y divide-border">
                  {previewMatches.map((match, idx) => {
                    const isDoublesRank = match.rank.startsWith('MD') || match.rank.startsWith('WD') || match.rank.startsWith('XD');
                    const hasIncompleteA = isDoublesRank && match.playersA.length === 1;
                    const hasIncompleteB = isDoublesRank && match.playersB.length === 1;
                    const hasIncompleteC = isDoublesRank && matchType === 'tri' && match.playersC && match.playersC.length === 1;

                    return (
                      <tr key={idx} className="hover:bg-muted/40">
                        <td className="px-3 py-2 text-sm font-medium text-foreground">
                          {match.rank}
                        </td>
                        <td className={`px-3 py-2 text-sm ${hasIncompleteA ? 'text-yellow-700 bg-yellow-50' : 'text-foreground'}`}>
                          {hasIncompleteA && <span className="inline-block w-2 h-2 rounded-full bg-yellow-500 mr-1.5" title="Incomplete doubles pair" />}
                          {match.playersA.map(p => p.name).join(', ') || '-'}
                        </td>
                        <td className={`px-3 py-2 text-sm ${hasIncompleteB ? 'text-yellow-700 bg-yellow-50' : 'text-foreground'}`}>
                          {hasIncompleteB && <span className="inline-block w-2 h-2 rounded-full bg-yellow-500 mr-1.5" title="Incomplete doubles pair" />}
                          {match.playersB.map(p => p.name).join(', ') || '-'}
                        </td>
                        {matchType === 'tri' && (
                          <td className={`px-3 py-2 text-sm ${hasIncompleteC ? 'text-yellow-700 bg-yellow-50' : 'text-foreground'}`}>
                            {hasIncompleteC && <span className="inline-block w-2 h-2 rounded-full bg-yellow-500 mr-1.5" title="Incomplete doubles pair" />}
                            {match.playersC?.map(p => p.name).join(', ') || '-'}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded-sm text-sm">
            <strong>Note:</strong> Only ranks where all selected schools have players are included.
            {previewMatches.length === 0 && ' No matches can be created - make sure schools have players assigned to ranks.'}
          </div>
        </div>
      )}

      <div className="flex gap-2 justify-end">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 bg-muted text-foreground rounded-sm text-sm hover:bg-accent hover:text-accent-foreground"
        >
          Cancel
        </button>
        {previewMatches.length > 0 && (
          <button
            onClick={handleGenerate}
            className="px-3 py-1.5 bg-blue-600 text-white rounded-sm text-sm hover:bg-blue-700 font-medium"
          >
            Generate {previewMatches.length} Matches
          </button>
        )}
      </div>
    </div>
  );
}
