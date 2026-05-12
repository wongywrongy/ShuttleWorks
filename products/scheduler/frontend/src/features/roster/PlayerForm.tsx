import { useState, type FormEvent, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useRosterGroups } from '../../hooks/useRosterGroups';
import { useRoster } from '../../hooks/useRoster';
import { useTournament } from '../../hooks/useTournament';
import type { PlayerDTO, AvailabilityWindow } from '../../api/dto';
import { isValidTime } from '../../lib/time';
import { RankCheckboxGrid } from './components/RankCheckboxGrid';

interface PlayerFormProps {
  player?: PlayerDTO;
  onSave: (player: PlayerDTO) => void;
  onCancel: () => void;
}

export function PlayerForm({ player, onSave, onCancel }: PlayerFormProps) {
  const { groups } = useRosterGroups();
  const { config } = useTournament();
  const { players } = useRoster();
  const [formData, setFormData] = useState<PlayerDTO>({
    id: player?.id || uuidv4(), // Auto-generate ID for new players
    name: player?.name || '',
    groupId: player?.groupId || (groups.length > 0 ? groups[0].id : ''), // Default to first school
    ranks: player?.ranks || [],
    availability: player?.availability || [],
    minRestMinutes: player?.minRestMinutes ?? null, // Leave empty to use tournament default
    notes: player?.notes || '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [availabilityWindows, setAvailabilityWindows] = useState<AvailabilityWindow[]>(
    player?.availability || []
  );

  // Group rank options by category for RankCheckboxGrid component
  const groupedRankOptions = () => {
    const rankCounts = config?.rankCounts || { MS: 3, WS: 3, MD: 2, WD: 2, XD: 2 };
    const groups: Record<string, { label: string; ranks: Array<{ value: string; disabled: boolean; assignedTo?: string }> }> = {};

    const rankLabels: Record<string, string> = {
      MS: "Men's Singles",
      WS: "Women's Singles",
      MD: "Men's Doubles",
      WD: "Women's Doubles",
      XD: "Mixed Doubles",
    };

    // Get ranks already assigned to OTHER players in the same school
    const assignedRanksMap = new Map<string, string>(); // rank -> player name
    players
      .filter(p => p.groupId === formData.groupId && p.id !== formData.id) // Same school, different player
      .forEach(p => {
        (p.ranks || []).forEach(rank => assignedRanksMap.set(rank, p.name));
      });

    Object.entries(rankCounts).forEach(([rankKey, count]) => {
      if (count > 0) {
        const ranks = [];
        for (let i = 1; i <= count; i++) {
          const rankValue = `${rankKey}${i}`;
          const isAssigned = assignedRanksMap.has(rankValue);
          const isCurrentlySelected = (formData.ranks || []).includes(rankValue);

          ranks.push({
            value: rankValue,
            disabled: isAssigned && !isCurrentlySelected,
            assignedTo: isAssigned ? assignedRanksMap.get(rankValue) : undefined,
          });
        }
        if (ranks.length > 0) {
          groups[rankKey] = {
            label: rankLabels[rankKey],
            ranks,
          };
        }
      }
    });

    return groups;
  };

  // Recalculate grouped ranks when school changes or players change
  const groupedRanks = groupedRankOptions();

  const selectAllInCategory = (category: string) => {
    const categoryRanks = groupedRanks[category]?.ranks.map(r => r.value) || [];
    const currentRanks = formData.ranks || [];
    const allSelected = categoryRanks.every(rank => currentRanks.includes(rank));

    if (allSelected) {
      // Deselect all in category
      setFormData({
        ...formData,
        ranks: currentRanks.filter(rank => !categoryRanks.includes(rank))
      });
    } else {
      // Select all in category
      const newRanks = [...new Set([...currentRanks, ...categoryRanks])];
      setFormData({ ...formData, ranks: newRanks });
    }
  };

  useEffect(() => {
    if (player) {
      setFormData(player);
      setAvailabilityWindows(player.availability || []);
    }
  }, [player]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }
    if (!formData.groupId || !formData.groupId.trim()) {
      newErrors.groupId = 'School is required';
    }
    if (formData.minRestMinutes !== null && formData.minRestMinutes !== undefined && formData.minRestMinutes < 0) {
      newErrors.minRestMinutes = 'Must be non-negative';
    }

    availabilityWindows.forEach((window, index) => {
      if (!isValidTime(window.start)) {
        newErrors[`avail_${index}_start`] = 'Invalid time format';
      }
      if (!isValidTime(window.end)) {
        newErrors[`avail_${index}_end`] = 'Invalid time format';
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (validate()) {
      onSave({ ...formData, availability: availabilityWindows });
    }
  };

  const addAvailabilityWindow = () => {
    setAvailabilityWindows([...availabilityWindows, { start: '09:00', end: '18:00' }]);
  };

  const removeAvailabilityWindow = (index: number) => {
    setAvailabilityWindows(availabilityWindows.filter((_, i) => i !== index));
  };

  const updateAvailabilityWindow = (index: number, field: 'start' | 'end', value: string) => {
    const updated = [...availabilityWindows];
    updated[index] = { ...updated[index], [field]: value };
    setAvailabilityWindows(updated);
  };

  const toggleRank = (rank: string) => {
    const currentRanks = formData.ranks || [];
    if (currentRanks.includes(rank)) {
      setFormData({ ...formData, ranks: currentRanks.filter(r => r !== rank) });
    } else {
      setFormData({ ...formData, ranks: [...currentRanks, rank] });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-card p-3 rounded shadow-sm">
      <h3 className="text-base font-semibold mb-2">
        {player ? 'Edit Player' : 'Add Player'}
      </h3>

      <div className="space-y-2">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Name *
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className={`w-full px-2 py-1 border rounded-sm text-sm ${errors.name ? 'border-red-500' : 'border-border'}`}
          />
          {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Minimum Rest Minutes (optional)
          </label>
          <input
            type="number"
            value={formData.minRestMinutes ?? ''}
            onChange={(e) => setFormData({ ...formData, minRestMinutes: e.target.value === '' ? null : parseInt(e.target.value) || 0 })}
            className={`w-full px-2 py-1 border rounded-sm text-sm ${errors.minRestMinutes ? 'border-red-500' : 'border-border'}`}
            min="0"
            placeholder="Uses tournament default if empty"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Leave empty to use tournament's default rest time. Override only if this player needs different rest requirements.
          </p>
          {errors.minRestMinutes && <p className="text-red-500 text-sm mt-1">{errors.minRestMinutes}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Notes
          </label>
          <textarea
            value={formData.notes || ''}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            className="w-full px-2 py-1 border border-border rounded-sm text-sm"
            rows={3}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            School *
          </label>
          <select
            value={formData.groupId}
            onChange={(e) => setFormData({ ...formData, groupId: e.target.value })}
            className={`w-full px-2 py-1 border rounded-sm text-sm ${errors.groupId ? 'border-red-500' : 'border-border'}`}
          >
            {groups.length === 0 && <option value="">No schools available - create one first</option>}
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
          {errors.groupId && <p className="text-red-500 text-sm mt-1">{errors.groupId}</p>}
          <p className="text-xs text-muted-foreground mt-1">
            Select which school this player belongs to. Create schools first if none are available.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Events/Ranks (optional)
          </label>
          <p className="text-xs text-muted-foreground mb-3">
            Select all ranks that apply to this player. Click category headers to expand/collapse. <strong>Each rank can only be assigned to one player per school.</strong>
          </p>
          {Object.keys(groupedRanks).length === 0 ? (
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
              {config?.rankCounts && Object.keys(config.rankCounts).length > 0
                ? 'All ranks for this school are already assigned to other players.'
                : 'No ranks configured. Go to Setup page to configure rank counts.'}
            </div>
          ) : (
            <RankCheckboxGrid
              selectedRanks={formData.ranks || []}
              availableRanks={groupedRanks}
              onToggleRank={toggleRank}
              onSelectAllInCategory={selectAllInCategory}
              showSelected={true}
              defaultExpanded={false}
            />
          )}
        </div>

        <div>
          <div className="flex justify-between items-center mb-2">
            <div>
              <label className="block text-sm font-medium text-foreground">
                Availability Windows
              </label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Leave empty for always available. Format: HH:mm (24-hour format)
              </p>
            </div>
            <button
              type="button"
              onClick={addAvailabilityWindow}
              className="text-xs px-2 py-0.5 bg-muted text-foreground rounded-sm hover:bg-muted/40 hover:text-foreground"
            >
              Add Window
            </button>
          </div>
          {availabilityWindows.length === 0 && (
            <div className="mb-2 p-2 bg-muted/40 border border-border rounded text-xs text-muted-foreground">
              No availability windows set. Player will be available all day.
            </div>
          )}
          <div className="space-y-2">
            {availabilityWindows.map((window, index) => (
              <div key={index} className="flex gap-2 items-center">
                <input
                  type="text"
                  value={window.start}
                  onChange={(e) => updateAvailabilityWindow(index, 'start', e.target.value)}
                  className={`flex-1 px-2 py-1 border rounded-sm text-sm ${errors[`avail_${index}_start`] ? 'border-red-500' : 'border-border'}`}
                  placeholder="09:00"
                  pattern="^([0-1][0-9]|2[0-3]):[0-5][0-9]$"
                  title="Time in HH:mm format (e.g., 09:00)"
                />
                <span className="text-muted-foreground font-medium">to</span>
                <input
                  type="text"
                  value={window.end}
                  onChange={(e) => updateAvailabilityWindow(index, 'end', e.target.value)}
                  className={`flex-1 px-2 py-1 border rounded-sm text-sm ${errors[`avail_${index}_end`] ? 'border-red-500' : 'border-border'}`}
                  placeholder="18:00"
                  pattern="^([0-1][0-9]|2[0-3]):[0-5][0-9]$"
                  title="Time in HH:mm format (e.g., 18:00)"
                />
                <button
                  type="button"
                  onClick={() => removeAvailabilityWindow(index)}
                  className="px-2 py-1 bg-red-100 text-red-700 rounded-sm hover:bg-red-200 text-xs"
                  title="Remove this availability window"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          {availabilityWindows.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              <strong>Example:</strong> 09:00 to 12:00 and 14:00 to 18:00 means player is available in the morning and afternoon, but not during lunch break.
            </p>
          )}
        </div>

        <div className="flex gap-1 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 bg-muted text-foreground rounded-sm text-sm hover:bg-muted/40 hover:text-foreground"
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
