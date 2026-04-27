import { useState, type FormEvent, useEffect } from 'react';
import { useRoster } from '../../hooks/useRoster';
import { useRosterGroups } from '../../hooks/useRosterGroups';
import type { MatchDTO } from '../../api/dto';

interface MatchFormProps {
  match?: MatchDTO;
  onSave: (match: MatchDTO) => void;
  onCancel: () => void;
}

export function MatchForm({ match, onSave, onCancel }: MatchFormProps) {
  const { players } = useRoster();
  const { groups } = useRosterGroups();
  const [formData, setFormData] = useState<MatchDTO>({
    id: match?.id || '',
    sideA: match?.sideA || [],
    sideB: match?.sideB || [],
    sideC: match?.sideC,
    matchType: match?.matchType || 'dual',
    eventRank: match?.eventRank || null,
    durationSlots: match?.durationSlots || 1,
    preferredCourt: match?.preferredCourt || null,
    tags: match?.tags || [],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selectedSideA, setSelectedSideA] = useState<string[]>(match?.sideA || []);
  const [selectedSideB, setSelectedSideB] = useState<string[]>(match?.sideB || []);
  const [selectedSideC, setSelectedSideC] = useState<string[]>(match?.sideC || []);
  const [selectedGroupA, setSelectedGroupA] = useState<string>('');
  const [selectedGroupB, setSelectedGroupB] = useState<string>('');
  const [selectedGroupC, setSelectedGroupC] = useState<string>('');
  const [tagInput, setTagInput] = useState('');

  useEffect(() => {
    if (match) {
      setFormData(match);
      setSelectedSideA(match.sideA || []);
      setSelectedSideB(match.sideB || []);
      setSelectedSideC(match.sideC || []);
    }
  }, [match]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.id.trim()) {
      newErrors.id = 'ID is required';
    }
    if (selectedSideA.length === 0) {
      newErrors.sideA = 'At least one player required for Side A';
    }
    if (selectedSideB.length === 0) {
      newErrors.sideB = 'At least one player required for Side B';
    }
    if (formData.matchType === 'tri' && selectedSideC.length === 0) {
      newErrors.sideC = 'At least one player required for Side C';
    }
    if (formData.durationSlots < 1) {
      newErrors.durationSlots = 'Must be at least 1';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (validate()) {
      onSave({
        ...formData,
        sideA: selectedSideA,
        sideB: selectedSideB,
        sideC: formData.matchType === 'tri' ? selectedSideC : undefined,
      });
    }
  };

  const togglePlayer = (playerId: string, side: 'A' | 'B') => {
    if (side === 'A') {
      setSelectedSideA((prev) =>
        prev.includes(playerId) ? prev.filter((id) => id !== playerId) : [...prev, playerId]
      );
    } else {
      setSelectedSideB((prev) =>
        prev.includes(playerId) ? prev.filter((id) => id !== playerId) : [...prev, playerId]
      );
    }
  };

  const handleGroupSelect = (groupId: string, side: 'A' | 'B' | 'C') => {
    const groupPlayers = players.filter(p => p.groupId === groupId).map(p => p.id);
    if (side === 'A') {
      setSelectedGroupA(groupId);
      setSelectedSideA(groupPlayers);
    } else if (side === 'B') {
      setSelectedGroupB(groupId);
      setSelectedSideB(groupPlayers);
    } else {
      setSelectedGroupC(groupId);
      setSelectedSideC(groupPlayers);
    }
  };

  const addTag = () => {
    if (tagInput.trim() && !formData.tags?.includes(tagInput.trim())) {
      setFormData({ ...formData, tags: [...(formData.tags || []), tagInput.trim()] });
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    setFormData({ ...formData, tags: formData.tags?.filter((t) => t !== tag) || [] });
  };

  return (
    <form onSubmit={handleSubmit} className="bg-card p-3 rounded shadow-sm">
      <h3 className="text-base font-semibold mb-3">{match ? 'Edit Match' : 'Add Match'}</h3>

      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Match ID *
          </label>
          <input
            type="text"
            value={formData.id}
            onChange={(e) => setFormData({ ...formData, id: e.target.value })}
            className={`w-full px-2 py-1.5 border rounded-sm text-sm ${errors.id ? 'border-red-500' : 'border-border'}`}
            disabled={!!match}
          />
          {errors.id && <p className="text-red-500 text-sm mt-1">{errors.id}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Match Type
          </label>
          <select
            value={formData.matchType || 'dual'}
            onChange={(e) => {
              const newType = e.target.value as 'dual' | 'tri';
              setFormData({
                ...formData,
                matchType: newType,
                sideC: newType === 'tri' ? (formData.sideC || []) : undefined,
              });
            }}
            className="w-full px-3 py-2 border border-border rounded-md"
          >
            <option value="dual">Dual Meet (2 schools)</option>
            <option value="tri">Tri-Meet (3 schools)</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Event/Rank (optional)
          </label>
          <input
            type="text"
            value={formData.eventRank || ''}
            onChange={(e) => setFormData({ ...formData, eventRank: e.target.value || null })}
            className="w-full px-3 py-2 border border-border rounded-md"
            placeholder="MS1, WS1, MD1, etc."
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Side A (School A) *
            </label>
            <div className="mb-2">
              <select
                value={selectedGroupA}
                onChange={(e) => {
                  const groupId = e.target.value;
                  setSelectedGroupA(groupId);
                  if (groupId) {
                    handleGroupSelect(groupId, 'A');
                  } else {
                    setSelectedSideA([]);
                  }
                }}
                className="w-full px-3 py-2 border border-border rounded-md mb-2"
              >
                <option value="">Select school or choose players individually</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="border border-border rounded-sm p-2 max-h-32 overflow-y-auto">
              {players.map((player) => (
                <label key={player.id} className="flex items-center space-x-2 py-1">
                  <input
                    type="checkbox"
                    checked={selectedSideA.includes(player.id)}
                    onChange={() => {
                      togglePlayer(player.id, 'A');
                      setSelectedGroupA(''); // Clear group selection when manually selecting
                    }}
                    className="rounded"
                  />
                  <span className="text-sm">
                    {player.name} ({player.id})
                    {player.groupId && (
                      <span className="text-xs text-muted-foreground ml-1">
                        [{groups.find(g => g.id === player.groupId)?.name}]
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </div>
            {errors.sideA && <p className="text-red-500 text-sm mt-1">{errors.sideA}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Side B (School B) *
            </label>
            <div className="mb-2">
              <select
                value={selectedGroupB}
                onChange={(e) => {
                  const groupId = e.target.value;
                  setSelectedGroupB(groupId);
                  if (groupId) {
                    handleGroupSelect(groupId, 'B');
                  } else {
                    setSelectedSideB([]);
                  }
                }}
                className="w-full px-3 py-2 border border-border rounded-md mb-2"
              >
                <option value="">Select school or choose players individually</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="border border-border rounded-sm p-2 max-h-32 overflow-y-auto">
              {players.map((player) => (
                <label key={player.id} className="flex items-center space-x-2 py-1">
                  <input
                    type="checkbox"
                    checked={selectedSideB.includes(player.id)}
                    onChange={() => {
                      togglePlayer(player.id, 'B');
                      setSelectedGroupB(''); // Clear group selection when manually selecting
                    }}
                    className="rounded"
                  />
                  <span className="text-sm">
                    {player.name} ({player.id})
                    {player.groupId && (
                      <span className="text-xs text-muted-foreground ml-1">
                        [{groups.find(g => g.id === player.groupId)?.name}]
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </div>
            {errors.sideB && <p className="text-red-500 text-sm mt-1">{errors.sideB}</p>}
          </div>

          {formData.matchType === 'tri' && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Side C (School C) *
              </label>
              <div className="mb-2">
                <select
                  value={selectedGroupC || ''}
                  onChange={(e) => {
                    const groupId = e.target.value;
                    setSelectedGroupC(groupId);
                    if (groupId) {
                      const groupPlayers = players.filter(p => p.groupId === groupId).map(p => p.id);
                      setSelectedSideC(groupPlayers);
                    } else {
                      setSelectedSideC([]);
                    }
                  }}
                  className="w-full px-3 py-2 border border-border rounded-md mb-2"
                >
                  <option value="">Select school or choose players individually</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="border border-border rounded-sm p-2 max-h-32 overflow-y-auto">
                {players.map((player) => (
                  <label key={player.id} className="flex items-center space-x-2 py-1">
                    <input
                      type="checkbox"
                      checked={selectedSideC.includes(player.id)}
                      onChange={() => {
                        setSelectedSideC(prev =>
                          prev.includes(player.id) ? prev.filter(id => id !== player.id) : [...prev, player.id]
                        );
                        setSelectedGroupC('');
                      }}
                      className="rounded"
                    />
                    <span className="text-sm">
                      {player.name} ({player.id})
                      {player.groupId && (
                        <span className="text-xs text-muted-foreground ml-1">
                          [{groups.find(g => g.id === player.groupId)?.name}]
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Duration Slots *
          </label>
          <input
            type="number"
            value={formData.durationSlots}
            onChange={(e) => setFormData({ ...formData, durationSlots: parseInt(e.target.value) || 1 })}
            className={`w-full px-2 py-1.5 border rounded-sm text-sm ${errors.durationSlots ? 'border-red-500' : 'border-border'}`}
            min="1"
          />
          {errors.durationSlots && <p className="text-red-500 text-sm mt-1">{errors.durationSlots}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Preferred Court (optional)
          </label>
          <input
            type="number"
            value={formData.preferredCourt || ''}
            onChange={(e) =>
              setFormData({
                ...formData,
                preferredCourt: e.target.value ? parseInt(e.target.value) : null,
              })
            }
            className="w-full px-3 py-2 border border-border rounded-md"
            min="1"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Tags (e.g., finals, featured)
          </label>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addTag();
                }
              }}
              className="flex-1 px-3 py-2 border border-border rounded-md"
              placeholder="Enter tag and press Enter"
            />
            <button
              type="button"
              onClick={addTag}
              className="px-3 py-1.5 bg-muted text-foreground rounded-sm text-sm hover:bg-accent hover:text-accent-foreground"
            >
              Add
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {formData.tags?.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center px-2 py-0.5 rounded-sm text-sm bg-blue-100 text-blue-800"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="ml-2 text-blue-600 hover:text-blue-800"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 bg-muted text-foreground rounded-sm text-sm hover:bg-accent hover:text-accent-foreground"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-3 py-1.5 bg-blue-600 text-white rounded-sm text-sm hover:bg-blue-700"
          >
            Save
          </button>
        </div>
      </div>
    </form>
  );
}
