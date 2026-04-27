import { useState, type FormEvent, useEffect } from 'react';
import type { RosterGroupDTO } from '../../api/dto';
import { RosterTreeSelector } from '../../components/roster/RosterTreeSelector';

interface RosterGroupFormProps {
  group?: RosterGroupDTO;
  allGroups: RosterGroupDTO[];
  onSave: (group: RosterGroupDTO) => void;
  onCancel: () => void;
}

export function RosterGroupForm({ group, allGroups, onSave, onCancel }: RosterGroupFormProps) {
  const [formData, setFormData] = useState<RosterGroupDTO>({
    id: group?.id || '',
    name: group?.name || '',
    type: group?.type || 'roster',
    parentId: group?.parentId || null,
    children: group?.children || [],
    playerIds: group?.playerIds || [],
    metadata: group?.metadata || {},
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selectedParentId, setSelectedParentId] = useState<string | null>(group?.parentId || null);

  useEffect(() => {
    if (group) {
      setFormData(group);
      setSelectedParentId(group.parentId || null);
    }
  }, [group]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.id.trim()) {
      newErrors.id = 'ID is required';
    }
    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }
    if (formData.type === 'group' && (formData.playerIds?.length ?? 0) > 0) {
      newErrors.type = 'Groups cannot contain players directly. Use a roster type instead.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (validate()) {
      onSave({ ...formData, parentId: selectedParentId });
    }
  };

  // Filter out the current group and its descendants from parent selection
  const getAvailableParents = (): RosterGroupDTO[] => {
    if (!group) return allGroups;
    
    const excludeIds = new Set<string>([group.id]);
    const addDescendants = (groupId: string) => {
      allGroups.forEach(g => {
        if (g.parentId === groupId) {
          excludeIds.add(g.id);
          addDescendants(g.id);
        }
      });
    };
    addDescendants(group.id);

    return allGroups.filter(g => !excludeIds.has(g.id));
  };

  return (
    <form onSubmit={handleSubmit} className="bg-card p-3 rounded shadow-sm">
      <h3 className="text-base font-semibold mb-3">{group ? 'Edit Group' : 'Create Group'}</h3>

      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Group ID *
          </label>
          <input
            type="text"
            value={formData.id}
            onChange={(e) => setFormData({ ...formData, id: e.target.value })}
            className={`w-full px-2 py-1.5 border rounded-sm text-sm ${errors.id ? 'border-red-500' : 'border-border'}`}
            disabled={!!group}
          />
          {errors.id && <p className="text-red-500 text-sm mt-1">{errors.id}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Name *
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className={`w-full px-2 py-1.5 border rounded-sm text-sm ${errors.name ? 'border-red-500' : 'border-border'}`}
          />
          {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Type *
          </label>
          <select
            value={formData.type}
            onChange={(e) => setFormData({ ...formData, type: e.target.value as 'group' | 'roster' })}
            className={`w-full px-2 py-1.5 border rounded-sm text-sm ${errors.type ? 'border-red-500' : 'border-border'}`}
          >
            <option value="group">Group (contains other groups)</option>
            <option value="roster">Roster (contains players)</option>
          </select>
          <p className="text-xs text-muted-foreground mt-1">
            {formData.type === 'group' 
              ? 'Groups can contain other groups or rosters'
              : 'Rosters contain players directly'}
          </p>
          {errors.type && <p className="text-red-500 text-sm mt-1">{errors.type}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Parent Group
          </label>
          <RosterTreeSelector
            groups={getAvailableParents()}
            selectedId={selectedParentId}
            onSelect={setSelectedParentId}
            allowNone={true}
            filterType="both"
            searchPlaceholder="Search for parent group..."
          />
          <p className="text-xs text-muted-foreground mt-1">
            Select a parent group, or leave as root level
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Description (optional)
          </label>
          <textarea
            value={formData.metadata?.description || ''}
            onChange={(e) => setFormData({
              ...formData,
              metadata: { ...formData.metadata, description: e.target.value },
            })}
            className="w-full px-3 py-2 border border-border rounded-md"
            rows={2}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Color (optional)
          </label>
          <input
            type="color"
            value={formData.metadata?.color || '#3b82f6'}
            onChange={(e) => setFormData({
              ...formData,
              metadata: { ...formData.metadata, color: e.target.value },
            })}
            className="w-full h-10 border border-border rounded-md"
          />
          <p className="text-xs text-muted-foreground mt-1">Used for visual organization in the tree</p>
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
