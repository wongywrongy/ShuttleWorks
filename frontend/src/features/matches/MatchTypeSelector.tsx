import type { MatchType } from '../../api/dto';

interface MatchTypeSelectorProps {
  selectedType: MatchType;
  onSelect: (type: MatchType) => void;
}

export function MatchTypeSelector({ selectedType, onSelect }: MatchTypeSelectorProps) {
  const matchTypes: Array<{ value: MatchType; label: string; description: string }> = [
    {
      value: 'individual',
      label: 'Individual Match',
      description: 'Manually select players for each side',
    },
    {
      value: 'roster_vs_roster',
      label: 'Roster vs Roster',
      description: 'Select rosters and pick players from each',
    },
    {
      value: 'roster_match',
      label: 'Roster Match',
      description: 'Match between entire rosters (all players)',
    },
    {
      value: 'auto_generated',
      label: 'Auto-Generated',
      description: 'Generate multiple matches based on rules',
    },
  ];

  return (
    <div className="mb-6">
      <label className="block text-sm font-medium text-foreground mb-3">
        Match Type
      </label>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {matchTypes.map((type) => (
          <button
            key={type.value}
            type="button"
            onClick={() => onSelect(type.value)}
            className={`p-4 rounded-lg border-2 text-left transition-all ${
              selectedType === type.value
                ? 'border-blue-500 bg-blue-50'
                : 'border-border hover:border-border bg-card'
            }`}
          >
            <div className="font-semibold text-sm mb-1">{type.label}</div>
            <div className="text-xs text-muted-foreground">{type.description}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
